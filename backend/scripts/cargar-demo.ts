// Carga los clientes ficticios de la demo, siguiendo docs/migracion.md («Datos de
// demostración»). BORRA la cartera y las conversaciones (también los datos históricos de la
// planilla) y deja los catálogos, los parámetros, el horario y los usuarios.
//
// Uso:
//   docker compose exec -e DEMO_TELEFONO_CLIENTE=549... -e DEMO_TELEFONO_COMPARTIDO=549... \
//     backend npm run cargar-demo -- --confirmar
//
// Sin --confirmar solo informa qué borraría. Valida todo antes de borrar y hace el borrado y
// la carga en una sola transacción: si algo falla, la base queda como estaba. No imprime DNI
// ni números completos.
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js'
import { argentinaToday } from '../src/domain/templates.js'
import {
  demoCustomers,
  demoObservation,
  fallbackPhones,
  maskPhone,
  type DemoCustomer,
  type DemoPhones,
} from './datos-demo.js'

const company = 'Seguros Castaño'

type Transaction = Prisma.TransactionClient

async function main(): Promise<void> {
  const confirmed = process.argv.slice(2).includes('--confirmar')
  const phones = demoPhones()
  // Arma y valida los datos antes de tocar la base: un número inválido no borra nada.
  const customers = demoCustomers(argentinaToday(new Date()), phones.values)

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb({
      host: requiredEnvironment('DATABASE_HOST'),
      port: Number(requiredEnvironment('DATABASE_PORT')),
      user: requiredEnvironment('DATABASE_USER'),
      password: requiredEnvironment('DATABASE_PASSWORD'),
      database: requiredEnvironment('DATABASE_NAME'),
      // Solo para desarrollo: MySQL 8.4 sin TLS (skill backend-datos).
      allowPublicKeyRetrieval: true,
    }),
  })
  try {
    if (!confirmed) {
      await printDryRun(prisma)
      return
    }
    await prisma.$transaction(async (tx) => {
      await wipe(tx)
      await load(tx, customers)
    }, { timeout: 60_000 })
    printReport(customers, phones)
  } finally {
    await prisma.$disconnect()
  }
}

function demoPhones(): { values: DemoPhones; fallbacks: string[] } {
  const fallbacks: string[] = []
  const read = (name: string, fallback: string) => {
    const value = process.env[name]?.trim()
    if (value) return value
    fallbacks.push(name)
    return fallback
  }
  return {
    values: {
      customer: read('DEMO_TELEFONO_CLIENTE', fallbackPhones.customer),
      shared: read('DEMO_TELEFONO_COMPARTIDO', fallbackPhones.shared),
    },
    fallbacks,
  }
}

// De los hijos a los padres, para no chocar con las FK. Los AUTO_INCREMENT no se reinician:
// los ids nuevos no se cruzan con estados que el backend tenga en memoria.
async function wipe(tx: Transaction): Promise<void> {
  await tx.verificacion.deleteMany()
  await tx.alerta.deleteMany()
  // Las correcciones apuntan a la respuesta que corrigen: se sueltan antes de borrar.
  await tx.respuesta.updateMany({ data: { id_respuesta_origen: null } })
  await tx.respuesta.deleteMany()
  await tx.mensaje.deleteMany()
  await tx.solicitud_accion.deleteMany()
  await tx.prospecto.deleteMany()
  await tx.caso.deleteMany()
  await tx.conversacion.deleteMany()
  await tx.cuota.deleteMany()
  await tx.cobertura.deleteMany()
  await tx.beneficiario.deleteMany()
  await tx.poliza_conductor.deleteMany()
  await tx.conductor.deleteMany()
  await tx.siniestro.deleteMany()
  await tx.poliza.deleteMany()
  await tx.bien_asegurado.deleteMany()
  await tx.cliente_telefono.deleteMany()
  await tx.telefono.deleteMany()
  await tx.cliente.deleteMany()
}

async function load(tx: Transaction, customers: DemoCustomer[]): Promise<void> {
  const companyRow = await tx.compania_aseguradora.findUnique({ where: { nombre: company }, select: { id_compania: true } })
  if (!companyRow) throw new Error(`Falta la compañía ${company}: no se cargó nada.`)
  const phoneIds = new Map<string, number>()

  for (const customer of customers) {
    const created = await tx.cliente.create({
      data: { dni: customer.dni, nombre: customer.firstName, apellido: customer.lastName, activo: customer.active },
      select: { id_cliente: true },
    })
    for (const phone of customer.phones) {
      let phoneId = phoneIds.get(phone)
      if (phoneId === undefined) {
        phoneId = (await tx.telefono.create({ data: { numero: phone }, select: { id_telefono: true } })).id_telefono
        phoneIds.set(phone, phoneId)
      }
      await tx.cliente_telefono.create({ data: { id_cliente: created.id_cliente, id_telefono: phoneId } })
    }
    for (const policy of customer.policies) {
      const [ramo, status, currency] = await Promise.all([
        tx.ramo.findUnique({ where: { nombre: policy.ramo }, select: { id_ramo: true } }),
        tx.estado_poliza.findUnique({ where: { nombre: policy.status }, select: { id_estado_poliza: true } }),
        tx.moneda.findUnique({ where: { codigo: policy.currency }, select: { id_moneda: true } }),
      ])
      if (!ramo || !status || !currency) throw new Error(`Falta un catálogo para ${policy.number}: no se cargó nada.`)
      const item = policy.insuredItem === null
        ? null
        : await tx.bien_asegurado.create({
            data: { descripcion: policy.insuredItem.description, patente_matricula: policy.insuredItem.plate, direccion: policy.insuredItem.address },
            select: { id_bien: true },
          })
      const createdPolicy = await tx.poliza.create({
        data: {
          numero_poliza: policy.number,
          id_cliente: created.id_cliente,
          id_compania: companyRow.id_compania,
          id_ramo: ramo.id_ramo,
          id_bien: item?.id_bien ?? null,
          id_estado_poliza: status.id_estado_poliza,
          id_moneda: currency.id_moneda,
          fecha_inicio: dateOf(policy.startDate),
          fecha_vencimiento: dateOf(policy.endDate),
          prima_mensual: policy.premiumCents === null ? null : decimalOf(policy.premiumCents),
          observaciones: demoObservation,
        },
        select: { id_poliza: true },
      })
      if (policy.installments.length > 0) {
        await tx.cuota.createMany({
          data: policy.installments.map((installment) => ({
            id_poliza: createdPolicy.id_poliza,
            numero_cuota: installment.number,
            fecha_vencimiento: dateOf(installment.dueDate),
            importe: decimalOf(installment.amountCents),
            fecha_pago: installment.paid ? dateOf(installment.dueDate) : null,
          })),
        })
      }
    }
  }
}

async function printDryRun(prisma: PrismaClient): Promise<void> {
  const [clientes, polizas, conversaciones, casos] = await Promise.all([
    prisma.cliente.count(),
    prisma.poliza.count(),
    prisma.conversacion.count(),
    prisma.caso.count(),
  ])
  console.log('No se borró ni se cargó nada. La carga de la demo borraría:')
  console.log(`  ${clientes} clientes, ${polizas} pólizas, ${conversaciones} conversaciones y ${casos} casos,`)
  console.log('  con sus teléfonos, cuotas, prospectos, mensajes, respuestas, solicitudes y alertas.')
  console.log('Quedan los catálogos, los parámetros, el horario y los usuarios.')
  console.log('Para confirmar: docker compose exec backend npm run cargar-demo -- --confirmar')
  console.log('Para volver a la planilla después, ver docs/migracion.md («Datos de demostración»).')
}

function printReport(customers: DemoCustomer[], phones: { values: DemoPhones; fallbacks: string[] }): void {
  const policies = customers.flatMap((customer) => customer.policies)
  const installments = policies.reduce((total, policy) => total + policy.installments.length, 0)
  console.log(`Carga de la demo terminada: ${customers.length} clientes, ${policies.length} pólizas y ${installments} cuotas.`)
  console.log('Clientes y caso límite que prueba cada uno:')
  for (const customer of customers) {
    const phoneText = customer.phones.length === 0 ? 'sin teléfono' : customer.phones.map(maskPhone).join(', ')
    console.log(`  ${customer.firstName} ${customer.lastName} (${phoneText}): ${customer.edgeCase}`)
  }
  console.log(`Número del cliente: terminado en ${maskPhone(phones.values.customer)}. Número compartido: terminado en ${maskPhone(phones.values.shared)}.`)
  for (const name of phones.fallbacks) {
    console.log(`Aviso: ${name} no está definido; quedó un número ficticio que no corresponde a ningún WhatsApp.`)
  }
  console.log('El cliente nuevo de la demo escribe desde cualquier otro número.')
  console.log('Son datos ficticios (docs/migracion.md). Reiniciá el backend: docker compose restart backend')
}

function dateOf(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`)
}

function decimalOf(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents).dividedBy(100)
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
