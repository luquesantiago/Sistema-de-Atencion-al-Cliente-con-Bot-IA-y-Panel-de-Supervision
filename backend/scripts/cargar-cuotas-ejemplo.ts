// Carga cuotas de ejemplo para mostrar el saldo, siguiendo docs/migracion.md («Cuotas de
// ejemplo»). Son datos ficticios: la planilla no registra cuotas ni pagos.
//
// Uso: docker compose exec backend npm run cargar-cuotas-ejemplo
//
// Se corre después de migrar-planilla. No escribe nada si la tabla cuota ya tiene filas, si
// falta POL-00123 o POL-00124, o si una póliza elegida no tiene prima; si no, carga todo en
// una transacción. No imprime DNI ni teléfonos: solo números de póliza y conteos.
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { exampleInstallments, type ExampleInstallment } from './cuotas-ejemplo.js'

const company = 'Seguros Castaño'

// Decisión de Santiago del 13/10/2026: todas las pólizas del titular de POL-00123 (Juan
// García) con las dos últimas cuotas sin pagar, y las de la titular de POL-00124 (María del
// Carmen López) con todo pago. Los dos tienen número vinculado.
const holders = [
  { policyNumber: 'POL-00123', unpaid: 2 },
  { policyNumber: 'POL-00124', unpaid: 0 },
] as const

interface PlannedPolicy {
  id: number
  number: string
  installments: ExampleInstallment[]
}

async function main(): Promise<void> {
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
    await failIfInstallmentsExist(prisma)
    const planned = await plan(prisma)
    await prisma.$transaction(async (tx) => {
      // Se vuelve a controlar dentro de la transacción, por si otra carga se adelantó.
      await failIfInstallmentsExist(tx)
      for (const policy of planned) {
        await tx.cuota.createMany({ data: policy.installments.map((installment) => ({ id_poliza: policy.id, ...installment })) })
      }
    })
    printReport(planned)
  } finally {
    await prisma.$disconnect()
  }
}

async function failIfInstallmentsExist(prisma: Pick<PrismaClient, 'cuota'>): Promise<void> {
  const count = await prisma.cuota.count()
  if (count > 0) {
    throw new Error(`La tabla cuota no está vacía (${count} filas): no se cargan cuotas de ejemplo. Ver docs/migracion.md.`)
  }
}

// Arma todas las cuotas antes de escribir: si falta una póliza o una prima, no escribe nada.
async function plan(prisma: PrismaClient): Promise<PlannedPolicy[]> {
  const errors: string[] = []
  const planned: PlannedPolicy[] = []
  for (const holder of holders) {
    const reference = await prisma.poliza.findFirst({
      where: { numero_poliza: holder.policyNumber, compania_aseguradora: { nombre: company } },
      select: { id_cliente: true },
    })
    if (!reference) {
      errors.push(`No está ${holder.policyNumber}: corré antes la migración de la planilla.`)
      continue
    }
    const policies = await prisma.poliza.findMany({
      where: { id_cliente: reference.id_cliente, activo: true },
      orderBy: { numero_poliza: 'asc' },
    })
    for (const policy of policies) {
      try {
        const installments = exampleInstallments(
          {
            number: policy.numero_poliza,
            startDate: policy.fecha_inicio,
            endDate: policy.fecha_vencimiento,
            monthlyPremium: policy.prima_mensual?.toFixed(2) ?? null,
          },
          holder.unpaid,
        )
        planned.push({ id: policy.id_poliza, number: policy.numero_poliza, installments })
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
  }
  if (errors.length > 0) throw new Error(['No se cargó ninguna cuota:', ...errors.map((error) => `  ${error}`)].join('\n'))
  return planned
}

function printReport(planned: PlannedPolicy[]): void {
  console.log('Carga terminada. Cuotas de ejemplo por póliza (total / sin pagar):')
  for (const policy of planned) {
    const unpaid = policy.installments.filter((installment) => installment.fecha_pago === null).length
    console.log(`  ${policy.number.padEnd(12)} ${policy.installments.length} / ${unpaid}`)
  }
  console.log('Son datos ficticios, no de la agencia (docs/migracion.md).')
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
