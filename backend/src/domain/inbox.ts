import type { CaseActionState, CloseError, CloseInput, PanelActor, ProspectState } from './case-actions.js'
import { isQueryType, type MessageOrigin, type QueryType } from './conversation.js'
import { intents } from './intent.js'
import type { PageRequest } from './request-management.js'
import { queryTypeRiskLevel, type RiskLevel } from './risk-level.js'

// Bandeja de Atención de solo lectura (RF-SUP-01, RF-SUP-02, RF-DER-02; change
// bandeja-atencion-lectura). Entran los casos sin cerrar que están derivados o que tienen
// pendiente un prospecto o una solicitud de cambio de teléfono. El orden lo resuelve la base
// (decisión 4): acá quedan las reglas que no necesita la consulta.

// El cliente de la conversación, nunca uno adivinado por el teléfono. name es el nombre y
// apellido de una persona o la razón social de una empresa, y document su DNI o su CUIT; un
// dato que falta queda null, sin inventarlo.
export type InboxCustomer = { id: number; name: string | null; document: string | null }

export type InboxLastMessage = { text: string; origin: MessageOrigin; at: Date }

export type InboxEntry = {
  caseId: number
  conversationId: number
  // La más grave entre el nivel del caso, sus alertas sin atender y el de su tipo de
  // consulta; null es «Sin nivel».
  severity: RiskLevel | null
  customer: InboxCustomer | null
  phone: string
  queryType: QueryType | null
  handoffReason: string | null
  handedOffAt: Date | null
  takenAt: Date | null
  assignee: { id: number; name: string } | null
  // El prospecto del caso: pendiente de decidir o descartado (alta rechazada que sigue abierta).
  prospectState: ProspectState | null
  // Fecha de la solicitud de cambio de teléfono pendiente del caso, si tiene.
  pendingPhoneChangeAt: Date | null
  lastMessage: InboxLastMessage | null
}

// hasImage: el mensaje guarda la referencia a una imagen del cliente; la referencia no sale del
// backend. author: el empleado que escribió un mensaje de origen operador.
export type InboxMessage = {
  id: number
  caseId: number
  origin: MessageOrigin
  text: string
  at: Date
  hasImage: boolean
  author: { name: string } | null
}

export type InboxAlert = { type: string; level: RiskLevel }

// alerts: las alertas sin atender del caso, que hay que revisar para cerrarlo (RF-SUP-04).
export type InboxConversation = { entry: InboxEntry; messages: InboxMessage[]; alerts: InboxAlert[] }

export type InboxPage = { entries: InboxEntry[]; total: number }

// El estado que necesitan las reglas de tomar, contestar y cerrar, más lo que piden las
// escrituras (change bandeja-atender-casos, decisión 3).
export type InboxActionState = CaseActionState & { phone: string; takenAt: Date | null }

// changed: otro pedido cerró o reasignó el caso mientras tanto.
export type CloseOutcome = { ok: true; closedAt: Date } | { ok: false; error: CloseError | 'changed' }

// La referencia a la imagen y el teléfono de la conversación, para pedirla a WhatsApp.
export type InboxImageRef = { ref: string; phone: string }

export interface InboxRepository {
  // La página ya ordenada: gravedad (sin nivel al final), sin tomar primero, mayor espera e id.
  listPage(page: PageRequest): Promise<InboxPage>
  // null si el caso no existe o no está en la bandeja.
  findConversation(caseId: number): Promise<InboxConversation | null>
  // null si el caso no existe.
  findActionState(caseId: number): Promise<InboxActionState | null>
  // false si el responsable ya no es expectedAssigneeId o el caso se cerró.
  take(caseId: number, actor: PanelActor, expectedAssigneeId: number | null, at: Date): Promise<boolean>
  // false si el responsable ya no es expectedAssigneeId o el caso se cerró.
  release(caseId: number, expectedAssigneeId: number, resumeAssistant: boolean): Promise<boolean>
  // Decide con decideClose dentro de la misma transacción que escribe.
  close(caseId: number, actor: PanelActor, input: CloseInput, at: Date): Promise<CloseOutcome>
  // Guarda lo que ya salió por WhatsApp; toma el caso solo si sigue sin responsable.
  recordOperatorReply(caseId: number, actor: PanelActor, text: string, sentAt: Date, takeIfUnassigned: boolean): Promise<{ messageId: number }>
  // null si el caso no está en la bandeja o el mensaje no es una imagen de su conversación.
  findImage(caseId: number, messageId: number): Promise<InboxImageRef | null>
}

export type InboxLabel = 'alta-pendiente' | 'alta-rechazada' | 'pedido-pendiente' | 'cambio-telefono-pendiente'

// Lo que el caso tiene pendiente de decidir y dónde se decide.
export function inboxLabel(entry: InboxEntry): InboxLabel | null {
  if (entry.prospectState === 'pendiente') return 'alta-pendiente'
  // El rechazo deja el caso abierto para avisarle al cliente (change bandeja-atender-casos, decisión 6).
  if (entry.handedOffAt !== null && entry.prospectState === 'descartado') return 'alta-rechazada'
  // Desvío provisional del Parcial 1: la baja y la modificación se derivan sin registrar la
  // solicitud, así que el pedido se reconoce por el tipo del caso derivado.
  if (entry.handedOffAt !== null && (entry.queryType === 'baja' || entry.queryType === 'modificación')) {
    return 'pedido-pendiente'
  }
  if (entry.pendingPhoneChangeAt !== null) return 'cambio-telefono-pendiente'
  return null
}

// Desde cuándo espera: la derivación o, si el caso no se derivó, la solicitud pendiente.
export function waitingSince(entry: InboxEntry): Date | null {
  return entry.handedOffAt ?? entry.pendingPhoneChangeAt
}

// Los tipos de consulta que tienen nivel propio, para que la consulta de la bandeja calcule
// la gravedad sin copiar la tabla de risk-level.ts.
export function queryTypeRiskLevels(): Array<{ type: QueryType; level: RiskLevel }> {
  return intents.filter(isQueryType).flatMap((type) => {
    const level = queryTypeRiskLevel(type)
    return level === null ? [] : [{ type, level }]
  })
}
