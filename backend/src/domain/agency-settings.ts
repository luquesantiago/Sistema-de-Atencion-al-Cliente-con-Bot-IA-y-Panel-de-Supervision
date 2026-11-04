import { agencyInfoAnswer, type AgencyInfo, type OpeningHours } from './agency-info.js'
import { RequestManagementError } from './request-management.js'
import { assistanceMessage, paymentMethodsMessage } from './templates.js'

// Configuración de la información de la agencia desde el panel, solo para el administrador
// (RF-SUP-07, RF-ATE-06; change configuracion-agencia, decisiones 1 y 2). Valida y normaliza
// lo que manda el panel antes de guardarlo todo junto.

// Los textos de contacto, con las claves de parametro_configuracion que les corresponden.
export const agencyTextFields = ['address', 'phone', 'assistancePhone', 'email', 'web', 'paymentMethods'] as const

export type AgencyTextField = (typeof agencyTextFields)[number]

export type AgencySettings = {
  address: string
  phone: string
  // null: sin cargar. El asistente deriva la grúa y los medios de pago, y no menciona el
  // email ni la web.
  assistancePhone: string | null
  email: string | null
  web: string | null
  paymentMethods: string | null
  // Los días con atención; los que no están, no se atiende.
  hours: OpeningHours[]
  // Los ramos y los planes que quedan activos: los demás se desactivan.
  activeRamoIds: number[]
  activePlanIds: number[]
}

// La marca del dato: de ejemplo (la agencia no informó el real) o sin cargar.
export type SettingMark = 'example' | 'missing' | null

// Un ramo o un plan del catálogo, activo o no.
export type CatalogItem = { id: number; name: string; active: boolean }

// Lo guardado: cada texto con su descripción (de ahí sale la marca), el horario y los catálogos.
export type StoredAgencySettings = {
  texts: Record<AgencyTextField, { value: string | null; description: string | null }>
  hours: OpeningHours[]
  ramos: CatalogItem[]
  plans: CatalogItem[]
}

export interface AgencySettingsRepository {
  readSettings(): Promise<StoredAgencySettings>
  // Todo junto o nada, en una transacción.
  saveSettings(settings: AgencySettings): Promise<void>
}

// Lo que va a contestar el asistente con estos datos, sin la redacción del proveedor de IA.
// null: con estos datos no lo contesta (deriva).
export type AgencyPreview = {
  agencyInfo: string | null
  assistance: string | null
  paymentMethods: string | null
}

export function agencyPreview(info: AgencyInfo): AgencyPreview {
  return {
    agencyInfo: agencyInfoAnswer(info)?.template ?? null,
    assistance: info.assistancePhone ? assistanceMessage(info.assistancePhone) : null,
    paymentMethods: info.paymentMethods ? paymentMethodsMessage(info.paymentMethods) : null,
  }
}

// La información de la agencia que quedaría con estos datos: los nombres de los ramos y los
// planes activos salen del catálogo, en el orden de su id, como los lee el asistente.
export function agencyInfoFromSettings(settings: AgencySettings, ramos: CatalogItem[], plans: CatalogItem[]): AgencyInfo {
  const activeNames = (items: CatalogItem[], ids: number[]) =>
    [...items].sort((a, b) => a.id - b.id).filter((item) => ids.includes(item.id)).map((item) => item.name)
  return {
    ramos: activeNames(ramos, settings.activeRamoIds),
    plans: activeNames(plans, settings.activePlanIds),
    address: settings.address,
    phone: settings.phone,
    assistancePhone: settings.assistancePhone,
    email: settings.email,
    web: settings.web,
    paymentMethods: settings.paymentMethods,
    hours: settings.hours,
  }
}

// Lo que dice la columna descripcion de cada parámetro (migraciones 20261007235643 y
// 20261103180000). Al guardar un valor nuevo pasa a la descripción definitiva.
const examplePrefix = 'Dato de ejemplo'
const missingPrefix = 'Sin informar'

const definitiveDescriptions: Record<AgencyTextField, string> = {
  address: 'Dirección de Seguros Castaño que informa el asistente',
  phone: 'Teléfono de Seguros Castaño que informa el asistente',
  assistancePhone: 'Teléfono de grúa o asistencia que informa el asistente',
  email: 'Email de Seguros Castaño que informa el asistente',
  web: 'Web de Seguros Castaño que informa el asistente',
  paymentMethods: 'Medios de pago que informa el asistente',
}

const missingDescriptions: Record<AgencyTextField, string> = {
  address: `${missingPrefix} por la agencia: dirección de Seguros Castaño que informa el asistente`,
  phone: `${missingPrefix} por la agencia: teléfono de Seguros Castaño que informa el asistente`,
  assistancePhone: `${missingPrefix} por la agencia: teléfono de grúa o asistencia que informa el asistente`,
  email: `${missingPrefix} por la agencia: email de Seguros Castaño que informa el asistente`,
  web: `${missingPrefix} por la agencia: web de Seguros Castaño que informa el asistente`,
  paymentMethods: `${missingPrefix} por la agencia: medios de pago que informa el asistente`,
}

export const fieldLabels: Record<AgencyTextField, string> = {
  address: 'La dirección',
  phone: 'El teléfono',
  assistancePhone: 'El teléfono de grúa o asistencia',
  email: 'El email',
  web: 'La web',
  paymentMethods: 'Los medios de pago',
}

const maxTextLength = 255
const maxPhoneLength = 50
const phonePattern = /^[0-9+\-() ]+$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export function settingMark(value: string | null, description: string | null): SettingMark {
  if (!value) return 'missing'
  if (description?.startsWith(examplePrefix)) return 'example'
  if (description?.startsWith(missingPrefix)) return 'missing'
  return null
}

// La descripción que queda al guardar: cambia solo si cambió el valor, así un dato de ejemplo
// sigue marcado mientras el administrador no lo reemplace.
export function settingDescription(
  field: AgencyTextField,
  previous: { value: string | null; description: string | null },
  next: string | null,
): string | null {
  if (!next) return missingDescriptions[field]
  if (next === previous.value) return previous.description
  return definitiveDescriptions[field]
}

export function parseAgencySettings(value: unknown): AgencySettings {
  if (!isRecord(value)) throw validationError('El cuerpo debe ser un objeto JSON.')
  const allowed = [...agencyTextFields, 'hours', 'activeRamoIds', 'activePlanIds']
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw validationError('El cuerpo contiene campos no permitidos.')
  }
  const address = requiredText(value.address, 'address')
  const phone = requiredText(value.phone, 'phone')
  checkPhone(phone, 'phone')
  const assistancePhone = optionalText(value.assistancePhone, 'assistancePhone')
  if (assistancePhone !== null) checkPhone(assistancePhone, 'assistancePhone')
  const email = optionalText(value.email, 'email')
  if (email !== null && !emailPattern.test(email)) {
    throw validationError('El email no tiene un formato válido, por ejemplo contacto@ejemplo.com.')
  }
  const web = optionalText(value.web, 'web')
  if (web !== null && !isWebAddress(web)) {
    throw validationError('La web tiene que empezar con http:// o https://, por ejemplo https://ejemplo.com.')
  }
  return {
    address,
    phone,
    assistancePhone,
    email,
    web,
    paymentMethods: optionalText(value.paymentMethods, 'paymentMethods', { multiline: true }),
    hours: parseHours(value.hours),
    activeRamoIds: parseIds(value.activeRamoIds, 'Los ramos activos', 'Tiene que quedar al menos un ramo activo.'),
    activePlanIds: parseIds(value.activePlanIds, 'Los planes activos', 'Tiene que quedar al menos un plan activo.'),
  }
}

function requiredText(value: unknown, field: AgencyTextField): string {
  const text = optionalText(value, field)
  if (text === null) throw validationError(`${fieldLabels[field]} es obligatorio y no puede quedar vacío.`)
  return text
}

// Sin espacios de más; vacío o null es «sin cargar». Los medios de pago pueden tener
// renglones: se recorta cada uno y se sacan los vacíos.
function optionalText(value: unknown, field: AgencyTextField, options: { multiline?: boolean } = {}): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw validationError(`${fieldLabels[field]} tiene que ser un texto.`)
  const text = options.multiline
    ? value.split('\n').map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n')
    : value.trim().replace(/\s+/g, ' ')
  if (!text) return null
  if (text.length > maxTextLength) {
    throw validationError(`${fieldLabels[field]} puede tener hasta ${maxTextLength} caracteres.`)
  }
  return text
}

function checkPhone(phone: string, field: AgencyTextField): void {
  if (phone.length > maxPhoneLength || !phonePattern.test(phone) || !/\d/.test(phone)) {
    throw validationError(
      `${fieldLabels[field]} solo puede tener números, espacios, +, - o paréntesis, hasta ${maxPhoneLength} caracteres.`,
    )
  }
}

function isWebAddress(text: string): boolean {
  if (!/^https?:\/\/\S+$/.test(text)) return false
  try {
    return new URL(text).hostname.includes('.')
  } catch {
    return false
  }
}

const dayNames = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

function parseHours(value: unknown): OpeningHours[] {
  if (!Array.isArray(value)) throw validationError('El horario tiene que ser una lista de días.')
  const hours = value.map((item): OpeningHours => {
    if (!isRecord(item) || typeof item.day !== 'number' || !Number.isInteger(item.day) || item.day < 1 || item.day > 7) {
      throw validationError('Cada día del horario tiene que ser un número del 1 (lunes) al 7 (domingo).')
    }
    const name = dayNames[item.day - 1]
    if (typeof item.opens !== 'string' || typeof item.closes !== 'string' ||
      !timePattern.test(item.opens) || !timePattern.test(item.closes)) {
      throw validationError(`El horario del ${name} tiene que tener la apertura y el cierre en HH:MM.`)
    }
    if (item.closes <= item.opens) {
      throw validationError(`En el horario del ${name}, el cierre tiene que ser posterior a la apertura.`)
    }
    return { day: item.day, opens: item.opens, closes: item.closes }
  })
  if (hours.length === 0) throw validationError('Tiene que quedar al menos un día con atención.')
  if (new Set(hours.map((day) => day.day)).size !== hours.length) {
    throw validationError('Un día no puede aparecer dos veces en el horario.')
  }
  return hours.sort((a, b) => a.day - b.day)
}

function parseIds(value: unknown, label: string, emptyMessage: string): number[] {
  const isId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id >= 1
  if (!Array.isArray(value) || !value.every(isId)) {
    throw validationError(`${label} tienen que ser una lista de identificadores.`)
  }
  const ids = [...new Set(value.filter(isId))]
  if (ids.length === 0) throw validationError(emptyMessage)
  return ids
}

function validationError(message: string): RequestManagementError {
  return new RequestManagementError(400, 'VALIDATION_ERROR', message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
