// Carga los datos históricos de la agencia desde el Excel limpio
// (Caso8_seguros_bot_datos_limpios.xlsx), siguiendo docs/migracion.md.
//
// Uso: docker compose exec backend npm run migrar-planilla [-- <ruta del Excel>]
//
// El Excel no está en el repo: se copia a backend/planilla/ (ignorada por Git).
// Se corre sobre una base vacía: valida toda la planilla antes de escribir y
// carga todo en una transacción, así que si algo falla la base queda como estaba.
// No imprime DNI, teléfonos ni textos de los mensajes: solo ids de la planilla y conteos.
import { existsSync } from 'node:fs'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import bcrypt from 'bcryptjs'
import { readSheet } from 'read-excel-file/node'
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js'

const defaultPath = 'planilla/Caso8_seguros_bot_datos_limpios.xlsx'

// Decisión del equipo (06/10/2026): Roberto y Graciela quedan activos con esta
// contraseña. El repo es público: antes de producción se cambia (docs/migracion.md).
const historicalPassword = 'seguros1234'
const bcryptCost = 10

// Argentina es UTC−3 todo el año, sin horario de verano.
const argentinaOffsetHours = 3

const company = 'Seguros Castaño'

const historicalUsers = {
  Roberto: { username: 'roberto', firstName: 'Roberto', lastName: 'Castaño', role: 'administrador' },
  Graciela: { username: 'graciela', firstName: 'Graciela', lastName: 'Castaño', role: 'operador' },
} as const

type Employee = keyof typeof historicalUsers
const employees: Employee[] = ['Roberto', 'Graciela']
type SheetRow = Map<string, unknown>

interface CustomerRow {
  dni: string
  lastName: string
  firstName: string
}

interface InsuredItem {
  description: string
  plate: string | null
  address: string | null
  brand: string | null
  model: string | null
  year: number | null
}

interface PolicyRow {
  number: string
  holderDni: string
  ramo: string
  item: InsuredItem | null
  currency: string
  monthlyPremium: number | null
  startDate: Date
  endDate: Date
  status: string
  notes: string | null
}

interface CaseRow {
  id: string
  openedAt: Date
  closedAt: Date | null
  phone: string
  customerMessage: string
  botAnswer: string
  queryType: string | null
  alertType: string | null
  employee: Employee
  policyNumber: string | null
}

interface SkippedRow {
  sheet: string
  id: string
  reason: string
}

interface Spreadsheet {
  customers: CustomerRow[]
  policies: PolicyRow[]
  cases: CaseRow[]
  skipped: SkippedRow[]
}

class SpreadsheetErrors {
  public readonly messages: string[] = []

  public add(sheet: string, id: string, message: string): void {
    this.messages.push(`${sheet} ${id}: ${message}`)
  }
}

async function main(): Promise<void> {
  const path = process.argv[2] ?? defaultPath
  if (!existsSync(path)) {
    throw new Error(`No se encontró el Excel en ${path}. Copialo a backend/planilla/ (ver docs/migracion.md).`)
  }

  const errors = new SpreadsheetErrors()
  const spreadsheet = await readSpreadsheet(path, errors)
  failIfErrors(errors)

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
    await failIfAlreadyLoaded(prisma)
    const catalogs = await loadCatalogs(prisma)
    validateCatalogNames(spreadsheet, catalogs, errors)
    failIfErrors(errors)

    const passwordHash = await bcrypt.hash(historicalPassword, bcryptCost)
    const counts = await prisma.$transaction((tx) => load(tx, spreadsheet, catalogs, passwordHash), {
      timeout: 60_000,
    })
    printReport(counts, spreadsheet.skipped)
  } finally {
    await prisma.$disconnect()
  }
}

// ---------------------------------------------------------------------------
// Lectura y validación del Excel
// ---------------------------------------------------------------------------

async function readSpreadsheet(path: string, errors: SpreadsheetErrors): Promise<Spreadsheet> {
  const skipped: SkippedRow[] = []
  const customers = (await readRows(path, 'Clientes')).map((row, index) =>
    parseCustomer(row, `fila ${index + 2}`, errors),
  )
  const policies: PolicyRow[] = []
  for (const row of await readRows(path, 'Pólizas')) {
    const number = text(row, 'numero_poliza') ?? '(sin número)'
    if (isSkipped(row, 'Pólizas', number, skipped, errors)) continue
    policies.push(parsePolicy(row, number, errors))
  }
  const cases: CaseRow[] = []
  for (const row of await readRows(path, 'Consultas')) {
    const id = text(row, 'caso_id') ?? '(sin caso_id)'
    if (isSkipped(row, 'Consultas', id, skipped, errors)) continue
    cases.push(parseCase(row, id, errors))
  }
  validateReferences({ customers, policies, cases, skipped }, errors)
  return { customers, policies, cases, skipped }
}

// La fila 1 son los encabezados: cada fila queda como columna → valor.
async function readRows(path: string, sheet: string): Promise<SheetRow[]> {
  const [header, ...rows] = await readSheet(path, sheet)
  if (!header) throw new Error(`La hoja ${sheet} está vacía`)
  const columns = header.map((value) => (typeof value === 'string' ? value.trim() : ''))
  return rows
    .filter((row) => row.some((value) => value !== null && value !== ''))
    .map((row) => new Map(columns.map((column, index) => [column, row[index] ?? null])))
}

function isSkipped(row: SheetRow, sheet: string, id: string, skipped: SkippedRow[], errors: SpreadsheetErrors): boolean {
  const migrate = text(row, 'migrar')
  if (migrate === 'Sí') return false
  if (migrate === 'No') {
    skipped.push({ sheet, id, reason: text(row, 'motivo_no_migra') ?? '(sin motivo)' })
    return true
  }
  errors.add(sheet, id, '«migrar» tiene que ser «Sí» o «No»')
  return true
}

function parseCustomer(row: SheetRow, id: string, errors: SpreadsheetErrors): CustomerRow {
  const dni = required(row, 'dni', 'Clientes', id, errors)
  if (!/^\d{7,8}$/.test(dni)) errors.add('Clientes', id, 'el DNI tiene que tener 7 u 8 dígitos')
  return {
    dni,
    lastName: required(row, 'apellido', 'Clientes', id, errors),
    firstName: required(row, 'nombre', 'Clientes', id, errors),
  }
}

function parsePolicy(row: SheetRow, number: string, errors: SpreadsheetErrors): PolicyRow {
  const sheet = 'Pólizas'
  const startDate = dateCell(row, 'fecha_inicio')
  const endDate = dateCell(row, 'fecha_vencimiento')
  if (!startDate) errors.add(sheet, number, 'falta fecha_inicio')
  if (!endDate) errors.add(sheet, number, 'falta fecha_vencimiento')
  if (startDate && endDate && endDate < startDate) errors.add(sheet, number, 'vence antes de empezar')
  const status = required(row, 'estado_poliza', sheet, number, errors)
  const monthlyPremium = numberCell(row, 'prima_mensual', sheet, number, errors)
  if (monthlyPremium !== null && monthlyPremium < 0) errors.add(sheet, number, 'la prima no puede ser negativa')
  return {
    number,
    holderDni: required(row, 'dni_titular', sheet, number, errors),
    ramo: required(row, 'ramo', sheet, number, errors),
    item: parseInsuredItem(row, number, errors),
    currency: required(row, 'moneda', sheet, number, errors),
    monthlyPremium,
    startDate: startDate ?? new Date(0),
    endDate: endDate ?? new Date(0),
    // «Vencida» no es un estado: se calcula con la fecha de vencimiento (docs/migracion.md).
    status: status === 'vencida' ? 'activa' : status,
    notes: text(row, 'observaciones'),
  }
}

// Las pólizas de vida no aseguran un bien: no traen bien_descripcion.
function parseInsuredItem(row: SheetRow, number: string, errors: SpreadsheetErrors): InsuredItem | null {
  const description = text(row, 'bien_descripcion')
  if (!description) return null
  const plate = text(row, 'patente')?.toUpperCase().replace(/[\s-]/g, '') ?? null
  if (plate !== null && !/^[A-Z0-9]+$/.test(plate)) errors.add('Pólizas', number, 'la patente tiene caracteres no válidos')
  const year = numberCell(row, 'anio', 'Pólizas', number, errors)
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
    errors.add('Pólizas', number, 'el año del bien tiene que estar entre 1900 y 2100')
  }
  return {
    description,
    plate,
    address: text(row, 'direccion'),
    brand: text(row, 'marca'),
    model: text(row, 'modelo'),
    year,
  }
}

function parseCase(row: SheetRow, id: string, errors: SpreadsheetErrors): CaseRow {
  const sheet = 'Consultas'
  const phone = required(row, 'telefono', sheet, id, errors)
  if (!/^\d{10,15}$/.test(phone)) errors.add(sheet, id, 'el teléfono tiene que tener de 10 a 15 dígitos')
  const openedAt = argentinaToUtc(dateCell(row, 'fecha'), dateCell(row, 'hora'))
  if (!openedAt) errors.add(sheet, id, 'faltan fecha u hora de apertura')
  const resolutionDate = dateCell(row, 'fecha_resolucion')
  const closedAt = argentinaToUtc(resolutionDate, dateCell(row, 'hora_resolucion'))
  if (resolutionDate && !closedAt) errors.add(sheet, id, 'falta hora_resolucion')
  if (openedAt && closedAt && closedAt < openedAt) errors.add(sheet, id, 'cierra antes de abrir')
  const employee = text(row, 'funcionario_asignado')
  if (employee !== 'Roberto' && employee !== 'Graciela') {
    errors.add(sheet, id, '«funcionario_asignado» tiene que ser «Roberto» o «Graciela»')
  }
  return {
    id,
    openedAt: openedAt ?? new Date(0),
    closedAt,
    phone,
    customerMessage: required(row, 'mensaje_usuario', sheet, id, errors),
    botAnswer: required(row, 'respuesta_bot_ia', sheet, id, errors),
    queryType: text(row, 'tipo_consulta'),
    alertType: text(row, 'tipo_alerta'),
    employee: employee === 'Graciela' ? 'Graciela' : 'Roberto',
    policyNumber: text(row, 'poliza'),
  }
}

function validateReferences(spreadsheet: Spreadsheet, errors: SpreadsheetErrors): void {
  const dnis = new Set<string>()
  for (const customer of spreadsheet.customers) {
    if (dnis.has(customer.dni)) errors.add('Clientes', customer.dni, 'el DNI está repetido')
    dnis.add(customer.dni)
  }
  const policyNumbers = new Set<string>()
  const plates = new Set<string>()
  for (const policy of spreadsheet.policies) {
    if (policyNumbers.has(policy.number)) errors.add('Pólizas', policy.number, 'el número de póliza está repetido')
    policyNumbers.add(policy.number)
    if (!dnis.has(policy.holderDni)) errors.add('Pólizas', policy.number, 'el dni_titular no está en la hoja Clientes')
    const plate = policy.item?.plate
    if (plate) {
      if (plates.has(plate)) errors.add('Pólizas', policy.number, 'la patente está repetida en otra póliza')
      plates.add(plate)
    }
  }
  const caseIds = new Set<string>()
  for (const caseRow of spreadsheet.cases) {
    if (caseIds.has(caseRow.id)) errors.add('Consultas', caseRow.id, 'el caso_id está repetido')
    caseIds.add(caseRow.id)
    if (caseRow.policyNumber && !policyNumbers.has(caseRow.policyNumber)) {
      errors.add('Consultas', caseRow.id, 'la póliza del caso no está entre las pólizas que se migran')
    }
  }
}

function failIfErrors(errors: SpreadsheetErrors): void {
  if (errors.messages.length === 0) return
  throw new Error(
    `La planilla tiene ${errors.messages.length} problema(s); no se cargó nada:\n` +
      errors.messages.map((message) => `  - ${message}`).join('\n'),
  )
}

// ---------------------------------------------------------------------------
// Celdas
// ---------------------------------------------------------------------------

function text(row: SheetRow, column: string): string | null {
  const value = row.get(column)
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function required(row: SheetRow, column: string, sheet: string, id: string, errors: SpreadsheetErrors): string {
  const value = text(row, column)
  if (value === null) errors.add(sheet, id, `falta ${column}`)
  return value ?? ''
}

function numberCell(row: SheetRow, column: string, sheet: string, id: string, errors: SpreadsheetErrors): number | null {
  const value = row.get(column)
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  errors.add(sheet, id, `${column} no es un número`)
  return null
}

function dateCell(row: SheetRow, column: string): Date | null {
  const value: unknown = row.get(column)
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null
}

// Las celdas de fecha llegan a las 00:00 UTC del día y las de hora como una
// fecha del 30/12/1899 con la hora en UTC. Las dos son hora argentina.
function argentinaToUtc(date: Date | null, time: Date | null): Date | null {
  if (!date || !time) return null
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      time.getUTCHours() + argentinaOffsetHours,
      time.getUTCMinutes(),
      time.getUTCSeconds(),
    ),
  )
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value
}

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

async function failIfAlreadyLoaded(prisma: PrismaClient): Promise<void> {
  const customers = await prisma.cliente.count()
  const users = await prisma.usuario.count({
    where: { nombre_usuario: { in: Object.values(historicalUsers).map((user) => user.username) } },
  })
  if (customers > 0 || users > 0) {
    throw new Error(
      'La base ya tiene clientes o los usuarios roberto o graciela: no se cargó nada. ' +
        'Para recargar, recreá la base con `docker compose down -v` y `docker compose up -d --build`.',
    )
  }
}

interface Catalogs {
  companyId: number
  roles: Map<string, number>
  ramos: Map<string, number>
  policyStatuses: Map<string, number>
  currencies: Map<string, number>
  queryTypes: Map<string, number>
  alertTypes: Map<string, { id: number; defaultRiskLevelId: number }>
  messageOrigins: Map<string, number>
}

async function loadCatalogs(prisma: PrismaClient): Promise<Catalogs> {
  const companyRow = await prisma.compania_aseguradora.findUnique({ where: { nombre: company } })
  if (!companyRow) throw new Error(`Falta la compañía «${company}» en el catálogo`)
  return {
    companyId: companyRow.id_compania,
    roles: new Map((await prisma.rol.findMany()).map((row) => [row.nombre, row.id_rol])),
    ramos: new Map((await prisma.ramo.findMany()).map((row) => [row.nombre, row.id_ramo])),
    policyStatuses: new Map((await prisma.estado_poliza.findMany()).map((row) => [row.nombre, row.id_estado_poliza])),
    currencies: new Map((await prisma.moneda.findMany()).map((row) => [row.codigo, row.id_moneda])),
    queryTypes: new Map((await prisma.tipo_consulta.findMany()).map((row) => [row.nombre, row.id_tipo_consulta])),
    alertTypes: new Map(
      (await prisma.tipo_alerta.findMany()).map((row) => [
        row.nombre,
        { id: row.id_tipo_alerta, defaultRiskLevelId: row.id_nivel_riesgo_default },
      ]),
    ),
    messageOrigins: new Map((await prisma.origen_mensaje.findMany()).map((row) => [row.nombre, row.id_origen_mensaje])),
  }
}

function validateCatalogNames(spreadsheet: Spreadsheet, catalogs: Catalogs, errors: SpreadsheetErrors): void {
  for (const user of Object.values(historicalUsers)) {
    if (!catalogs.roles.has(user.role)) errors.add('rol', user.role, 'no está en el catálogo')
  }
  for (const origin of ['cliente', 'asistente']) {
    if (!catalogs.messageOrigins.has(origin)) errors.add('origen_mensaje', origin, 'no está en el catálogo')
  }
  for (const policy of spreadsheet.policies) {
    if (!catalogs.ramos.has(policy.ramo)) errors.add('Pólizas', policy.number, `el ramo «${policy.ramo}» no está en el catálogo`)
    if (!catalogs.policyStatuses.has(policy.status)) {
      errors.add('Pólizas', policy.number, `el estado «${policy.status}» no está en el catálogo`)
    }
    if (!catalogs.currencies.has(policy.currency)) {
      errors.add('Pólizas', policy.number, `la moneda «${policy.currency}» no está en el catálogo`)
    }
  }
  for (const caseRow of spreadsheet.cases) {
    if (caseRow.queryType && !catalogs.queryTypes.has(caseRow.queryType)) {
      errors.add('Consultas', caseRow.id, `el tipo «${caseRow.queryType}» no está en el catálogo`)
    }
    if (caseRow.alertType && !catalogs.alertTypes.has(caseRow.alertType)) {
      errors.add('Consultas', caseRow.id, `la alerta «${caseRow.alertType}» no está en el catálogo`)
    }
  }
}

interface Counts {
  usuario: number
  cliente: number
  bien_asegurado: number
  poliza: number
  telefono: number
  cliente_telefono: number
  conversacion: number
  caso: number
  mensaje: number
  respuesta: number
  alerta: number
}

// Los ids de los catálogos ya se validaron: si alguno falta, `lookup` corta la transacción.
async function load(
  tx: Prisma.TransactionClient,
  spreadsheet: Spreadsheet,
  catalogs: Catalogs,
  passwordHash: string,
): Promise<Counts> {
  const counts: Counts = {
    usuario: 0,
    cliente: 0,
    bien_asegurado: 0,
    poliza: 0,
    telefono: 0,
    cliente_telefono: 0,
    conversacion: 0,
    caso: 0,
    mensaje: 0,
    respuesta: 0,
    alerta: 0,
  }

  const userIds = new Map<Employee, number>()
  for (const employee of employees) {
    const user = historicalUsers[employee]
    const created = await tx.usuario.create({
      data: {
        id_rol: lookup(catalogs.roles, user.role),
        nombre_usuario: user.username,
        contrasena_hash: passwordHash,
        nombre: user.firstName,
        apellido: user.lastName,
        activo: true,
      },
    })
    userIds.set(employee, created.id_usuario)
    counts.usuario++
  }

  const customerIds = new Map<string, number>()
  for (const customer of spreadsheet.customers) {
    const created = await tx.cliente.create({
      data: { dni: customer.dni, apellido: customer.lastName, nombre: customer.firstName },
    })
    customerIds.set(customer.dni, created.id_cliente)
    counts.cliente++
  }

  // Póliza → id y titular, para la póliza del caso y la conversación.
  const policies = new Map<string, { id: number; holderId: number }>()
  for (const policy of spreadsheet.policies) {
    let itemId: number | null = null
    if (policy.item) {
      const item = await tx.bien_asegurado.create({
        data: {
          descripcion: policy.item.description,
          patente_matricula: policy.item.plate,
          direccion: policy.item.address,
          marca: policy.item.brand,
          modelo: policy.item.model,
          anio: policy.item.year,
        },
      })
      itemId = item.id_bien
      counts.bien_asegurado++
    }
    const holderId = lookup(customerIds, policy.holderDni)
    const created = await tx.poliza.create({
      data: {
        numero_poliza: policy.number,
        id_cliente: holderId,
        id_compania: catalogs.companyId,
        id_ramo: lookup(catalogs.ramos, policy.ramo),
        id_bien: itemId,
        id_estado_poliza: lookup(catalogs.policyStatuses, policy.status),
        id_moneda: lookup(catalogs.currencies, policy.currency),
        // Columnas DATE: van tal como están en la planilla, sin pasar por hora argentina.
        fecha_inicio: policy.startDate,
        fecha_vencimiento: policy.endDate,
        prima_mensual: policy.monthlyPremium,
        observaciones: policy.notes,
      },
    })
    policies.set(policy.number, { id: created.id_poliza, holderId })
    counts.poliza++
  }

  const phoneIds = new Map<string, number>()
  const links = new Set<string>()
  const customerOrigin = lookup(catalogs.messageOrigins, 'cliente')
  const assistantOrigin = lookup(catalogs.messageOrigins, 'asistente')
  for (const caseRow of spreadsheet.cases) {
    let phoneId = phoneIds.get(caseRow.phone)
    if (phoneId === undefined) {
      phoneId = (await tx.telefono.create({ data: { numero: caseRow.phone } })).id_telefono
      phoneIds.set(caseRow.phone, phoneId)
      counts.telefono++
    }

    // Si el caso tiene póliza, la conversación es del titular y su número se le
    // vincula. Si no, queda sin cliente, aunque el número esté vinculado por otro caso.
    const policy = caseRow.policyNumber ? lookup(policies, caseRow.policyNumber) : null
    if (policy && !links.has(`${policy.holderId}:${phoneId}`)) {
      await tx.cliente_telefono.create({ data: { id_cliente: policy.holderId, id_telefono: phoneId } })
      links.add(`${policy.holderId}:${phoneId}`)
      counts.cliente_telefono++
    }

    const conversation = await tx.conversacion.create({
      data: {
        id_telefono: phoneId,
        id_cliente: policy?.holderId ?? null,
        fecha_inicio: caseRow.openedAt,
        fecha_fin: caseRow.closedAt,
        // Una conversación abierta tiene su caso derivado sin cerrar: el asistente no la
        // atiende hasta que un operador lo cierre (RF-DER-03, change asistente-con-base).
        asistente_suspendido: caseRow.closedAt === null,
      },
    })
    counts.conversacion++

    // Derivado y tomado a la hora de apertura, sin motivo ni nivel (docs/migracion.md).
    const employeeId = lookup(userIds, caseRow.employee)
    const createdCase = await tx.caso.create({
      data: {
        id_conversacion: conversation.id_conversacion,
        id_tipo_consulta: caseRow.queryType ? lookup(catalogs.queryTypes, caseRow.queryType) : null,
        id_poliza: policy?.id ?? null,
        id_usuario_asignado: employeeId,
        fecha_apertura: caseRow.openedAt,
        fecha_derivacion: caseRow.openedAt,
        fecha_toma: caseRow.openedAt,
        fecha_cierre: caseRow.closedAt,
      },
    })
    counts.caso++

    // El bot contesta 1 s después: respuesta.fecha_hora no guarda milisegundos.
    const answeredAt = new Date(caseRow.openedAt.getTime() + 1000)
    const customerMessage = await tx.mensaje.create({
      data: {
        id_caso: createdCase.id_caso,
        id_origen_mensaje: customerOrigin,
        contenido: caseRow.customerMessage,
        fecha_hora: caseRow.openedAt,
      },
    })
    const assistantMessage = await tx.mensaje.create({
      data: {
        id_caso: createdCase.id_caso,
        id_origen_mensaje: assistantOrigin,
        contenido: caseRow.botAnswer,
        fecha_hora: answeredAt,
      },
    })
    counts.mensaje += 2

    // La respuesta del bot no se corrige ni se verifica: es la evidencia del fallo.
    await tx.respuesta.create({
      data: {
        id_mensaje_consulta: customerMessage.id_mensaje,
        id_mensaje_enviado: assistantMessage.id_mensaje,
        contenido: caseRow.botAnswer,
        fecha_hora: answeredAt,
      },
    })
    counts.respuesta++

    // Atendida por el responsable a la hora de la toma. Es por lo que pidió el
    // cliente, no por una respuesta puntual: va sin id_respuesta.
    if (caseRow.alertType) {
      const alertType = lookup(catalogs.alertTypes, caseRow.alertType)
      await tx.alerta.create({
        data: {
          id_caso: createdCase.id_caso,
          id_tipo_alerta: alertType.id,
          id_nivel_riesgo: alertType.defaultRiskLevelId,
          id_usuario_atencion: employeeId,
          fecha_hora: caseRow.openedAt,
          fecha_atencion: caseRow.openedAt,
        },
      })
      counts.alerta++
    }
  }

  return counts
}

function lookup<Key, Value>(map: Map<Key, Value>, key: Key): Value {
  const value = map.get(key)
  if (value === undefined) throw new Error(`No se encontró «${String(key)}» al cargar`)
  return value
}

function printReport(counts: Counts, skipped: SkippedRow[]): void {
  console.log('Carga terminada. Registros cargados por tabla:')
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table.padEnd(18)} ${count}`)
  console.log(`Filas salteadas (migrar = «No»): ${skipped.length}`)
  for (const row of skipped) console.log(`  ${row.sheet} ${row.id}: ${row.reason}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
