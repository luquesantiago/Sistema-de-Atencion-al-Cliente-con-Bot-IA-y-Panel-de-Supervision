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
  assignee: { name: string } | null
  hasPendingProspect: boolean
  // Fecha de la solicitud de cambio de teléfono pendiente del caso, si tiene.
  pendingPhoneChangeAt: Date | null
  lastMessage: InboxLastMessage | null
}

export type InboxMessage = { id: number; caseId: number; origin: MessageOrigin; text: string; at: Date }

export type InboxConversation = { entry: InboxEntry; messages: InboxMessage[] }

export type InboxPage = { entries: InboxEntry[]; total: number }

export interface InboxRepository {
  // La página ya ordenada: gravedad (sin nivel al final), sin tomar primero, mayor espera e id.
  listPage(page: PageRequest): Promise<InboxPage>
  // null si el caso no existe o no está en la bandeja.
  findConversation(caseId: number): Promise<InboxConversation | null>
}

export type InboxLabel = 'alta-pendiente' | 'pedido-pendiente' | 'cambio-telefono-pendiente'

// Lo que el caso tiene pendiente de decidir y dónde se decide.
export function inboxLabel(entry: InboxEntry): InboxLabel | null {
  if (entry.hasPendingProspect) return 'alta-pendiente'
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
