import {
  isCurrency,
  isPolicyStatus,
  isRamo,
  type Currency,
  type PolicyStatus,
  type Ramo,
} from './customer.js'
import { RequestManagementError } from './request-management.js'

// Ediciones de cartera desde el panel de supervisión (RF-CAR-01, RF-CAR-02,
// RF-CAR-03): alta, edición y baja de clientes, vínculos de teléfono, alta y
// edición de pólizas con su bien asegurado y sus coberturas. El DNI no se
// modifica nunca: es el identificador del cliente (RF-ATE-03). Estas
// mutaciones las hace el operador o el administrador desde el panel, no el
// asistente: los pedidos que llegan por WhatsApp siguen el flujo de
// solicitud y aprobación (RF-APR-01). El alta de pólizas es carga de cartera
// (ABM), no emisión ni cotización, que siguen fuera de alcance. La auditoría
// de estas ediciones queda para el MVP 2.

const maxId = 4_294_967_295
const maxCoverages = 50
const maxObservationsLength = 2_000
// DECIMAL(12,2) para prima e importe de cuota; DECIMAL(14,2) para suma
// asegurada. En centavos enteros, para escribir sin punto decimal.
const maxPremiumCents = 99_999_999_999_99
const maxInsuredSumCents = 999_999_999_999_99

export type CreateCustomerInput =
  | { kind: 'persona'; dni: string; lastName: string; firstName: string; phone?: string }
  | { kind: 'empresa'; cuit: string; razonSocial: string; phone?: string }

export type UpdateCustomerInput = {
  id: number
  // Persona: apellido y nombre. Empresa: CUIT y razón social. El DNI no
  // cambia y el tipo de cliente (persona o empresa) tampoco.
  changes:
    | { kind: 'persona'; lastName: string; firstName: string }
    | { kind: 'empresa'; cuit: string; razonSocial: string }
}

export type LinkPhoneInput = { customerId: number; phone: string }
export type UnlinkPhoneInput = { customerId: number; phoneId: number }

export type InsuredItemInput = {
  description: string
  plate: string | null
  address: string | null
  brand: string | null
  model: string | null
  year: number | null
}

export type UpdatePolicyInput = {
  id: number
  number?: string
  companyId?: number
  ramo?: Ramo
  status?: PolicyStatus
  currency?: Currency
  // Fechas sin hora, aaaa-mm-dd.
  startDate?: string
  expirationDate?: string
  premiumCents?: number | null
  observations?: string | null
  // null desconecta el bien; objeto lo crea o lo actualiza.
  insuredItem?: InsuredItemInput | null
}

export type CoverageInput = {
  id?: number
  planId: number
  description: string | null
  insuredSumCents: number | null
}

export type ReplaceCoveragesInput = { policyId: number; coverages: CoverageInput[] }

// Alta de una póliza de un cliente que ya existe, desde el panel. Es carga
// de cartera (ABM), no emisión ni cotización: esos siguen fuera de alcance.
export type CreatePolicyInput = {
  customerId: number
  number: string
  companyId: number
  ramo: Ramo
  status: PolicyStatus
  currency: Currency
  // Fechas sin hora, aaaa-mm-dd. La vigencia siempre cierra.
  startDate: string
  expirationDate: string
  premiumCents?: number | null
  observations?: string | null
  // null o ausente: la póliza no asegura un bien (por ejemplo, vida).
  insuredItem?: InsuredItemInput | null
  // Set completo de coberturas de la póliza; vacía si no tiene.
  coverages: CoverageInput[]
}

export type CatalogOption = { id: number; name: string }

export type Catalogs = {
  ramoNames: string[]
  policyStatusNames: string[]
  currencies: Array<{ code: string; name: string }>
  companies: CatalogOption[]
  plans: CatalogOption[]
}

// Cada operación se aplica en una transacción: o se hace entera o no se hace.
// Devuelve el id del cliente para que el caso de uso recargue la ficha.
export interface CustomerEditRepository {
  createCustomer(input: CreateCustomerInput): Promise<number>
  updateCustomer(input: UpdateCustomerInput): Promise<void>
  deactivateCustomer(id: number): Promise<void>
  linkPhone(input: LinkPhoneInput): Promise<void>
  unlinkPhone(input: UnlinkPhoneInput): Promise<void>
  createPolicy(input: CreatePolicyInput): Promise<number>
  updatePolicy(input: UpdatePolicyInput): Promise<number>
  replaceCoverages(input: ReplaceCoveragesInput): Promise<number>
  listCatalogs(): Promise<Catalogs>
}

// Los parsers validan la forma del cuerpo JSON y devuelven la entrada ya
// normalizada del dominio. Lanzan RequestManagementError con 400.

export function parseCreateCustomer(value: unknown): CreateCustomerInput {
  const body = parseBody(value, ['kind', 'dni', 'lastName', 'firstName', 'cuit', 'razonSocial', 'phone'])
  const phone = body.phone === undefined || body.phone === null ? undefined : parsePhone(body.phone, 'phone')
  if (body.kind === 'persona') {
    if (body.cuit !== undefined || body.razonSocial !== undefined) {
      throw validationError('Un cliente persona no tiene CUIT ni razón social.')
    }
    const input = {
      kind: 'persona' as const,
      dni: parseDni(body.dni),
      lastName: parseName(body.lastName, 'lastName', 100),
      firstName: parseName(body.firstName, 'firstName', 100),
      ...(phone === undefined ? {} : { phone }),
    }
    return input
  }
  if (body.kind === 'empresa') {
    if (body.dni !== undefined || body.lastName !== undefined || body.firstName !== undefined) {
      throw validationError('Un cliente empresa no tiene DNI ni nombre de persona.')
    }
    const input = {
      kind: 'empresa' as const,
      cuit: parseCuit(body.cuit),
      razonSocial: parseName(body.razonSocial, 'razonSocial', 200),
      ...(phone === undefined ? {} : { phone }),
    }
    return input
  }
  throw validationError('kind debe ser persona o empresa.')
}

export function parseUpdateCustomer(id: number, value: unknown): UpdateCustomerInput {
  const body = parseBody(value, ['lastName', 'firstName', 'cuit', 'razonSocial'])
  const keys = Object.keys(body)
  if (keys.length === 0) {
    throw validationError('La edición no tiene campos para cambiar.')
  }
  const isEmpresa = keys.includes('cuit') || keys.includes('razonSocial')
  const isPersona = keys.includes('lastName') || keys.includes('firstName')
  if (isEmpresa && isPersona) {
    throw validationError('No se pueden editar datos de persona y de empresa juntos.')
  }
  if (isEmpresa) {
    return {
      id,
      changes: {
        kind: 'empresa',
        cuit: parseCuit(body.cuit),
        razonSocial: parseName(body.razonSocial, 'razonSocial', 200),
      },
    }
  }
  return {
    id,
    changes: {
      kind: 'persona',
      lastName: parseName(body.lastName, 'lastName', 100),
      firstName: parseName(body.firstName, 'firstName', 100),
    },
  }
}

export function parseLinkPhone(customerId: number, value: unknown): LinkPhoneInput {
  const body = parseBody(value, ['phone'])
  return { customerId, phone: parsePhone(body.phone, 'phone') }
}

export function parseUnlinkPhone(customerId: number, phoneId: number): UnlinkPhoneInput {
  return { customerId, phoneId }
}

// Alta de una póliza para un cliente que ya existe. Todos los campos del
// contrato son obligatorios: sin ellos no hay póliza que guardar.
export function parseCreatePolicy(customerId: number, value: unknown): CreatePolicyInput {
  const body = parseBody(value, [
    'number', 'companyId', 'ramo', 'status', 'currency',
    'startDate', 'expirationDate', 'premiumCents', 'observations', 'insuredItem', 'coverages',
  ])
  const ramo = body.ramo
  if (!isRamo(ramo)) throw validationError('ramo no está en el catálogo.')
  const status = body.status
  if (!isPolicyStatus(status)) throw validationError('status no está en el catálogo.')
  const currency = body.currency
  if (!isCurrency(currency)) throw validationError('currency no está en el catálogo.')
  const startDate = parseDateOnly(body.startDate, 'startDate')
  const expirationDate = parseDateOnly(body.expirationDate, 'expirationDate')
  assertPolicyWindow(startDate, expirationDate)
  const coverages = body.coverages === undefined ? [] : parseCoveragesList(body.coverages)
  // En un alta las coberturas no existen todavía: un id en la lista sería un
  // resto de la edición y se descarta en la validación, no en el repositorio.
  if (coverages.some((coverage) => coverage.id !== undefined)) {
    throw validationError('Las coberturas de una póliza nueva no pueden tener id.')
  }
  const input: CreatePolicyInput = {
    customerId,
    number: parseName(body.number, 'number', 50),
    companyId: parseRecordId(body.companyId, 'companyId'),
    ramo,
    status,
    currency,
    startDate,
    expirationDate,
    coverages,
  }
  if (body.premiumCents !== undefined && body.premiumCents !== null) {
    input.premiumCents = parseCents(body.premiumCents, 'premiumCents', maxPremiumCents)
  }
  if (body.observations !== undefined && body.observations !== null) {
    input.observations = parseName(body.observations, 'observations', maxObservationsLength)
  }
  if (body.insuredItem !== undefined && body.insuredItem !== null) {
    input.insuredItem = parseInsuredItem(body.insuredItem)
  }
  return input
}

export function parseUpdatePolicy(id: number, value: unknown): UpdatePolicyInput {
  const body = parseBody(value, [
    'number', 'companyId', 'ramo', 'status', 'currency',
    'startDate', 'expirationDate', 'premiumCents', 'observations', 'insuredItem',
  ])
  if (Object.keys(body).length === 0) {
    throw validationError('La edición no tiene campos para cambiar.')
  }
  const input: UpdatePolicyInput = { id }
  if (body.number !== undefined) {
    input.number = parseName(body.number, 'number', 50)
  }
  if (body.companyId !== undefined && body.companyId !== null) {
    input.companyId = parseRecordId(body.companyId, 'companyId')
  }
  if (body.ramo !== undefined && body.ramo !== null) {
    if (!isRamo(body.ramo)) throw validationError('ramo no está en el catálogo.')
    input.ramo = body.ramo
  }
  if (body.status !== undefined && body.status !== null) {
    if (!isPolicyStatus(body.status)) throw validationError('status no está en el catálogo.')
    input.status = body.status
  }
  if (body.currency !== undefined && body.currency !== null) {
    if (!isCurrency(body.currency)) throw validationError('currency no está en el catálogo.')
    input.currency = body.currency
  }
  if (body.startDate !== undefined && body.startDate !== null) {
    input.startDate = parseDateOnly(body.startDate, 'startDate')
  }
  if (body.expirationDate !== undefined && body.expirationDate !== null) {
    input.expirationDate = parseDateOnly(body.expirationDate, 'expirationDate')
  }
  if (body.premiumCents !== undefined) {
    input.premiumCents = body.premiumCents === null
      ? null
      : parseCents(body.premiumCents, 'premiumCents', maxPremiumCents)
  }
  if (body.observations !== undefined) {
    input.observations = body.observations === null
      ? null
      : parseName(body.observations, 'observations', maxObservationsLength)
  }
  if (body.insuredItem !== undefined) {
    input.insuredItem = body.insuredItem === null ? null : parseInsuredItem(body.insuredItem)
  }
  return input
}

export function parseReplaceCoverages(policyId: number, value: unknown): ReplaceCoveragesInput {
  const body = parseBody(value, ['coverages'])
  return {
    policyId,
    coverages: parseCoveragesList(body.coverages),
  }
}

// El set completo de coberturas de una póliza: vacío si no tiene, hasta
// maxCoverages si las tiene todas cargadas.
function parseCoveragesList(value: unknown): CoverageInput[] {
  if (!Array.isArray(value)) {
    throw validationError('coverages debe ser una lista.')
  }
  if (value.length > maxCoverages) {
    throw validationError(`Una póliza puede tener hasta ${maxCoverages} coberturas.`)
  }
  return value.map((entry, index) => parseCoverage(entry, `coverages[${index}]`))
}

// Comprueba que la vigencia cerrada tenga sentido. Se llama con las fechas
// finales, después de combinar lo guardado con lo editado.
export function assertPolicyWindow(startDate: string, expirationDate: string): void {
  if (expirationDate < startDate) {
    throw validationError('La fecha de vencimiento no puede ser anterior a la de inicio.')
  }
}

function parseCoverage(value: unknown, path: string): CoverageInput {
  if (!isRecord(value)) throw validationError(`${path} debe ser un objeto.`)
  const unknownKeys = Object.keys(value).filter((key) => !['id', 'planId', 'description', 'insuredSumCents'].includes(key))
  if (unknownKeys.length > 0) throw validationError(`${path} contiene campos no permitidos.`)
  const coverage: CoverageInput = {
    planId: parseRecordId(value.planId, `${path}.planId`),
    description: value.description === undefined || value.description === null
      ? null
      : parseName(value.description, `${path}.description`, 255),
    insuredSumCents: value.insuredSumCents === undefined || value.insuredSumCents === null
      ? null
      : parseCents(value.insuredSumCents, `${path}.insuredSumCents`, maxInsuredSumCents),
  }
  if (value.id !== undefined && value.id !== null) {
    coverage.id = parseRecordId(value.id, `${path}.id`)
  }
  return coverage
}

function parseInsuredItem(value: unknown): InsuredItemInput {
  if (!isRecord(value)) throw validationError('insuredItem debe ser un objeto o null.')
  const body = parseBody(value, ['description', 'plate', 'address', 'brand', 'model', 'year'])
  const year = body.year === undefined || body.year === null ? null : parseYear(body.year)
  if (year === null && typeof body.description !== 'string') {
    throw validationError('El bien asegurado necesita una descripción.')
  }
  return {
    description: parseName(body.description, 'description', 255),
    plate: body.plate === undefined || body.plate === null ? null : parseName(body.plate, 'plate', 20),
    address: body.address === undefined || body.address === null ? null : parseName(body.address, 'address', 255),
    brand: body.brand === undefined || body.brand === null ? null : parseName(body.brand, 'brand', 100),
    model: body.model === undefined || body.model === null ? null : parseName(body.model, 'model', 100),
    year,
  }
}

function parseBody(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!isRecord(value)) throw validationError('El cuerpo debe ser un objeto JSON.')
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw validationError('El cuerpo contiene campos no permitidos.')
  }
  return value
}

// DNI y CUIT llegan normalizados: solo dígitos. Se aceptan con puntos o
// guiones porque el operador puede pegarlos como los tiene anotados.
function parseDni(value: unknown): string {
  const digits = onlyDigits(value, 'dni')
  if (!/^\d{7,8}$/.test(digits)) {
    throw validationError('El DNI debe tener 7 u 8 dígitos.')
  }
  return digits
}

function parseCuit(value: unknown): string {
  const digits = onlyDigits(value, 'cuit')
  if (!/^\d{11}$/.test(digits)) {
    throw validationError('El CUIT debe tener 11 dígitos.')
  }
  return digits
}

function parsePhone(value: unknown, field: string): string {
  const digits = onlyDigits(value, field)
  // La base controla de 10 a 15 dígitos con código de país (E.164 sin «+»).
  if (!/^\d{10,15}$/.test(digits)) {
    throw validationError(`El número de ${field} debe tener entre 10 y 15 dígitos.`)
  }
  return digits
}

function onlyDigits(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw validationError(`${field} debe ser texto.`)
  }
  return value.replace(/\D/g, '')
}

function parseName(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw validationError(`${field} debe ser texto.`)
  }
  const text = value.trim()
  if (!text) {
    throw validationError(`${field} no puede quedar vacío.`)
  }
  if (text.length > max) {
    throw validationError(`${field} debe tener hasta ${max} caracteres.`)
  }
  return text
}

// Columna DATE: aaaa-mm-dd y que sea un día real del calendario.
function parseDateOnly(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${field} debe ser una fecha aaaa-mm-dd.`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw validationError(`${field} no es una fecha válida.`)
  }
  return value
}

function parseCents(value: unknown, field: string, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw validationError(`${field} debe ser un importe en centavos dentro del rango permitido.`)
  }
  return value
}

function parseYear(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1885 || value > 2100) {
    throw validationError('year debe ser un año entre 1885 y 2100.')
  }
  return value
}

function parseRecordId(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maxId) {
    throw validationError(`${field} debe ser un identificador válido.`)
  }
  return value
}

function validationError(message: string): RequestManagementError {
  return new RequestManagementError(400, 'VALIDATION_ERROR', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
