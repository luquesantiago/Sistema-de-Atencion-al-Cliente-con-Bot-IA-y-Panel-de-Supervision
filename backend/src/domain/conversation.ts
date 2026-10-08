import type { ContextMessage } from './ai-client.js'
import { maskDni } from './dni.js'
import type { Intent } from './intent.js'

// Conversación por WhatsApp guardada en la base (design.md, decisiones 3, 6 y 7). Son
// tipos y funciones puras: la base y el envío quedan en el ConversationStore.

// Intenciones que son un valor del catálogo tipo_consulta: todas menos tres.
export type QueryType = Exclude<Intent, 'no es de seguros' | 'otra consulta' | 'no se entiende'>

export function isQueryType(intent: Intent): intent is QueryType {
  return intent !== 'no es de seguros' && intent !== 'otra consulta' && intent !== 'no se entiende'
}

export type MessageOrigin = 'cliente' | 'asistente' | 'operador'

export type ConversationCase = {
  id: number
  type: QueryType | null
  // Tiene fecha_derivacion.
  handedOff: boolean
  closedAt: Date | null
  // Una alerta sin atender o una solicitud pendiente: la inactividad no lo cierra.
  hasPending: boolean
}

export type ConversationMessage = {
  id: number
  caseId: number
  origin: MessageOrigin
  text: string
  sentAt: Date
}

export type OpenConversation = {
  id: number
  customerId: number | null
  suspended: boolean
  startedAt: Date
  // En orden de apertura.
  cases: ConversationCase[]
  // En orden: fecha y hora, después id.
  messages: ConversationMessage[]
}

export type Settings = {
  // Reintentos de DNI antes de derivar (max_intentos_dni).
  maxDniRetries: number
  // Minutos sin mensajes que terminan la conversación (minutos_inactividad_sesion).
  inactivityMinutes: number
}

// Un caso de la conversación: uno que ya existe o uno de los que crea el mismo guardado
// (índice en ConversationChanges.newCases).
export type CaseRef = { existing: number } | { created: number }

// El mensaje que responde una respuesta: el que llega ahora o uno guardado antes (la
// consulta escrita antes de identificarse).
export type QueryRef = 'incoming' | { existing: number }

export type AssistantMessage = {
  case: CaseRef
  text: string
  answers: QueryRef
}

// Lo que el flujo decidió para un mensaje del cliente. ConversationStore.save lo aplica
// todo junto, con el envío al final.
export type ConversationChanges = {
  phone: string
  at: Date
  // La conversación abierta que termina antes de este mensaje (decisión 6).
  closePrevious?: { conversationId: number; endedAt: Date; caseIds: number[] }
  // La conversación del mensaje. Para una existente, la marca de silencio que se leyó:
  // si cambió antes de guardar, el guardado lanza.
  conversation: { existing: number; suspended: boolean } | { create: true }
  customerId?: number
  newCases: Array<{ type: QueryType | null }>
  caseTypes: Array<{ case: CaseRef; type: QueryType }>
  incoming: { case: CaseRef; text: string }
  // Redacción que rechazó el control: queda como respuesta no enviada.
  rejectedDraft?: { text: string; answers: QueryRef }
  // Se envían en este orden.
  replies: AssistantMessage[]
  handoff?: { case: CaseRef; reason: string }
  prospect?: { case: CaseRef; name: string; dni: string }
  // Se crea solo si el cliente no tiene ya una solicitud pendiente para ese número.
  phoneChangeRequest?: { case: CaseRef; customerId: number }
}

export type SavedConversation = {
  conversationId: number
  incomingMessageId: number
}

export interface ConversationStore {
  findOpen(phone: string): Promise<OpenConversation | null>
  settings(): Promise<Settings>
  // send corre después de las escrituras: si lanza, no queda nada guardado.
  save(changes: ConversationChanges, send: () => Promise<void>): Promise<SavedConversation>
}

// El caso actual: el no cerrado más reciente.
export function currentCase(conversation: OpenConversation | null): ConversationCase | null {
  return conversation?.cases.findLast((item) => item.closedAt === null) ?? null
}

export type CaseChoice =
  | { kind: 'existing'; caseId: number; setType: QueryType | null }
  | { kind: 'new'; type: QueryType | null }

export type MessageSituation =
  // La conversación está en silencio.
  | { kind: 'suspended' }
  // Antes de identificarse: la pregunta de si ya es cliente, el DNI o los datos del cliente nuevo.
  | { kind: 'identifying' }
  // El DNI que crea la solicitud de cambio de teléfono.
  | { kind: 'phone-change-request' }
  // Identificado, con la intención que eligió el modelo. caseId es el caso de la consulta
  // guardada cuando se responde al identificarse; si no, se usa el caso actual.
  | { kind: 'intent'; intent: Intent; caseId?: number }
  // Identificado y se deriva sin intención del catálogo: falla del proveedor al decidir,
  // cliente que ya no está en la cartera u otro DNI.
  | { kind: 'untyped-handoff' }

const newUntyped: CaseChoice = { kind: 'new', type: null }

function keep(item: ConversationCase): CaseChoice {
  return { kind: 'existing', caseId: item.id, setType: null }
}

// El caso de cada mensaje, un caso por consulta (design.md, decisión 7).
export function caseForMessage(conversation: OpenConversation | null, situation: MessageSituation): CaseChoice {
  const current = currentCase(conversation)
  switch (situation.kind) {
    case 'suspended': {
      const handedOff = conversation?.cases.findLast((item) => item.handedOff && item.closedAt === null)
      if (handedOff) return keep(handedOff)
      return current ? keep(current) : newUntyped
    }
    case 'identifying':
      return current ? keep(current) : newUntyped
    case 'phone-change-request':
      return { kind: 'new', type: 'cambio de teléfono' }
    case 'untyped-handoff':
      return current && current.type === null ? keep(current) : newUntyped
    case 'intent': {
      const target = situation.caseId === undefined
        ? current
        : conversation?.cases.find((item) => item.id === situation.caseId) ?? null
      const { intent } = situation
      if (intent === 'no es de seguros') return target ? keep(target) : newUntyped
      // «otra consulta» y «no se entiende» van al caso actual solo si no tiene tipo: así una
      // derivación nunca cae en un caso con tipo, como el del cambio de teléfono.
      if (!isQueryType(intent)) return target && target.type === null ? keep(target) : newUntyped
      if (!target || target.handedOff) return { kind: 'new', type: intent }
      if (target.type === null) return { kind: 'existing', caseId: target.id, setType: intent }
      if (target.type === intent) return keep(target)
      return { kind: 'new', type: intent }
    }
  }
}

// Mensajes anteriores que van como contexto para elegir la intención.
export const contextSize = 4

// El contexto para elegir la intención: los últimos mensajes del cliente y del asistente
// de la conversación abierta, en orden y con el DNI tapado. Los del operador no van.
// Con beforeId (la consulta guardada que se responde al identificarse), solo los
// anteriores a ese mensaje.
export function intentContext(conversation: OpenConversation | null, beforeId?: number): ContextMessage[] {
  const messages = conversation?.messages ?? []
  const end = beforeId === undefined ? messages.length : messages.findIndex((message) => message.id === beforeId)
  return messages
    .slice(0, Math.max(end, 0))
    .flatMap((message) => (message.origin === 'operador' ? [] : [{ from: message.origin, text: maskDni(message.text) }]))
    .slice(-contextSize)
}

export type ConversationEnd = {
  endedAt: Date
  // Los casos que se cierran con la conversación, sin responsable.
  caseIds: number[]
}

function lastActivity(conversation: OpenConversation): Date {
  return conversation.messages.at(-1)?.sentAt ?? conversation.startedAt
}

// fecha_fin nunca queda antes del cierre de un caso de la conversación.
function notBeforeClosedCases(conversation: OpenConversation, endedAt: Date): Date {
  const latest = Math.max(endedAt.getTime(), ...conversation.cases.map((item) => item.closedAt?.getTime() ?? 0))
  return new Date(latest)
}

// Los casos no derivados, no cerrados y sin nada pendiente.
export function casesClosedWithConversation(conversation: OpenConversation): number[] {
  return conversation.cases
    .filter((item) => !item.handedOff && item.closedAt === null && !item.hasPending)
    .map((item) => item.id)
}

function hasOpenHandoff(conversation: OpenConversation): boolean {
  return conversation.cases.some((item) => item.handedOff && item.closedAt === null)
}

// Inactividad (E23): pasaron más minutos que los de la configuración desde el último
// mensaje, y la conversación no está en silencio ni tiene un caso derivado sin cerrar.
// Termina cuando se cumplió el plazo o, si un caso se cerró después, a la hora del cierre.
export function endByInactivity(conversation: OpenConversation, now: Date, inactivityMinutes: number): ConversationEnd | null {
  if (conversation.suspended || hasOpenHandoff(conversation)) return null
  const deadline = new Date(lastActivity(conversation).getTime() + inactivityMinutes * 60_000)
  if (now.getTime() <= deadline.getTime()) return null
  return { endedAt: notBeforeClosedCases(conversation, deadline), caseIds: casesClosedWithConversation(conversation) }
}

// Reinicio del backend (decisión 4): termina a la hora del último mensaje o, si un caso se
// cerró después, a la hora del cierre.
export function endByRestart(conversation: OpenConversation): ConversationEnd {
  return {
    endedAt: notBeforeClosedCases(conversation, lastActivity(conversation)),
    caseIds: casesClosedWithConversation(conversation),
  }
}

const settingKeys = {
  maxDniRetries: 'max_intentos_dni',
  inactivityMinutes: 'minutos_inactividad_sesion',
} as const

// Lee los parámetros de parametro_configuracion: tienen que ser enteros positivos.
export function parseSettings(rows: ReadonlyArray<{ clave: string; valor: string }>): Settings {
  const read = (key: string): number => {
    const value = rows.find((row) => row.clave === key)?.valor.trim()
    if (value === undefined) throw new Error(`Falta el parámetro de configuración ${key}`)
    const number = /^\d+$/.test(value) ? Number(value) : Number.NaN
    if (!Number.isSafeInteger(number) || number <= 0) {
      throw new Error(`El parámetro de configuración ${key} tiene que ser un entero positivo`)
    }
    return number
  }
  return {
    maxDniRetries: read(settingKeys.maxDniRetries),
    inactivityMinutes: read(settingKeys.inactivityMinutes),
  }
}

export const settingKeyList: readonly string[] = Object.values(settingKeys)
