// Tomar, contestar y cerrar un caso desde la Bandeja de Atención (RF-DER-02, RF-DER-03,
// RF-SUP-04; change bandeja-atender-casos, decisión 2). Reglas puras: el repositorio lee el
// estado del caso y aplica el plan que sale de acá.

// Quién actúa desde el panel. Mientras no haya autenticación, el usuario de prueba operador.
export type PanelActor = { userId: number }

export type ProspectState = 'pendiente' | 'descartado'

export type CaseActionState = {
  caseId: number
  // Cumple el filtro de la bandeja: sin cerrar y derivado o con algo pendiente de decidir.
  inInbox: boolean
  handedOff: boolean
  assigneeId: number | null
  // El prospecto del caso (alta de un cliente nuevo), si tiene.
  prospectState: ProspectState | null
  unattendedAlerts: number
  hasCustomerMessage: boolean
}

export const maxReplyLength = 4096
export const minReasonLength = 3
export const maxReasonLength = 2000

export type TakeError = 'not-in-inbox'
export type ReleaseError = 'not-in-inbox' | 'not-assignee'
export type ReplyError = 'invalid-text' | 'not-in-inbox' | 'not-handed-off' | 'taken-by-other' | 'no-customer-message'
export type CloseError =
  | 'not-in-inbox'
  | 'not-handed-off'
  | 'not-assignee'
  | 'reason-required'
  | 'invalid-reason'
  | 'alerts-not-reviewed'

export type TakeDecision = { ok: true } | { ok: false; error: TakeError }
export type ReleaseDecision =
  | { ok: true; resumeAssistant: boolean }
  | { ok: false; error: ReleaseError }

// take: el caso no tiene responsable y queda tomado por quien contesta.
export type ReplyDecision = { ok: true; take: boolean; text: string } | { ok: false; error: ReplyError }

// reason: el motivo recortado, solo en los casos de alta (pendiente o rechazada).
export type ClosePlan = {
  discardProspect: boolean
  noteOnProspect: boolean
  attendAlerts: boolean
  reason: string | null
}

export type CloseDecision = ({ ok: true } & ClosePlan) | { ok: false; error: CloseError }

export type CloseInput = { reason?: string | null; alertsReviewed?: boolean }

// Se puede tomar cualquier caso de la bandeja, tenga o no responsable.
export function decideTake(state: CaseActionState): TakeDecision {
  return state.inInbox ? { ok: true } : { ok: false, error: 'not-in-inbox' }
}

export function decideRelease(state: CaseActionState, actor: PanelActor): ReleaseDecision {
  if (!state.inInbox) return { ok: false, error: 'not-in-inbox' }
  if (state.assigneeId !== actor.userId) return { ok: false, error: 'not-assignee' }
  return { ok: true, resumeAssistant: state.handedOff }
}

// Solo en casos derivados: en los demás el asistente sigue atendiendo la conversación.
export function decideReply(state: CaseActionState, actor: PanelActor, text: string): ReplyDecision {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (trimmed.length === 0 || trimmed.length > maxReplyLength) return { ok: false, error: 'invalid-text' }
  if (!state.inInbox) return { ok: false, error: 'not-in-inbox' }
  if (!state.handedOff) return { ok: false, error: 'not-handed-off' }
  if (state.assigneeId !== null && state.assigneeId !== actor.userId) return { ok: false, error: 'taken-by-other' }
  // La respuesta queda enlazada al último mensaje del cliente del caso (respuesta.id_mensaje_consulta).
  if (!state.hasCustomerMessage) return { ok: false, error: 'no-customer-message' }
  return { ok: true, take: state.assigneeId === null, text: trimmed }
}

// Solo cierra el responsable de un caso derivado. El caso de un alta pide un motivo; con
// alertas sin atender hace falta confirmar que se revisaron (RF-SUP-04).
export function decideClose(state: CaseActionState, actor: PanelActor, input: CloseInput): CloseDecision {
  if (!state.inInbox) return { ok: false, error: 'not-in-inbox' }
  if (!state.handedOff) return { ok: false, error: 'not-handed-off' }
  if (state.assigneeId !== actor.userId) return { ok: false, error: 'not-assignee' }

  let reason: string | null = null
  if (state.prospectState !== null) {
    const trimmed = typeof input.reason === 'string' ? input.reason.trim() : ''
    if (trimmed.length === 0) return { ok: false, error: 'reason-required' }
    if (trimmed.length < minReasonLength || trimmed.length > maxReasonLength) return { ok: false, error: 'invalid-reason' }
    reason = trimmed
  }

  if (state.unattendedAlerts > 0 && input.alertsReviewed !== true) return { ok: false, error: 'alerts-not-reviewed' }

  return {
    ok: true,
    discardProspect: state.prospectState === 'pendiente',
    noteOnProspect: state.prospectState !== null,
    attendAlerts: state.unattendedAlerts > 0,
    reason,
  }
}
