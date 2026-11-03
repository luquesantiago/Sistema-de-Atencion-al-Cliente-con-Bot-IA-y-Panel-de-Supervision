export type PageRequest = {
  limit: number
  offset: number
}

export type PendingProspect = {
  id: number
  caseId: number
  name: string | null
  dni: string | null
  phone: string
  registeredAt: string
}

export type PendingPhoneChange = {
  id: number
  caseId: number
  customerName: string
  customerDni: string
  requestedPhone: string
  currentPhones: Array<{ id: number; number: string }>
  requestedAt: string
}

export type RequestDecision = 'aprobar' | 'rechazar'

// Quién decide: el usuario con la sesión iniciada en el panel, nunca un dato del cuerpo del
// pedido (RF-SUP-07, RF-APR-03).
export type DecisionActor = {
  userId: number
  username: string
}

type ProspectDecisionBase = {
  id: number
  fundamento: string
}

export type ProspectDecisionInput = ProspectDecisionBase & (
  | { decision: 'aprobar'; nombre: string; apellido: string }
  | { decision: 'rechazar' }
)

export type PhoneChangeDecisionInput = {
  id: number
  decision: RequestDecision
  fundamento: string
  telefonosADesvincular: number[]
}

export type DecisionResult = {
  id: number
  decision: RequestDecision
  clienteId?: number
}

// casoId: el caso del alta, para abrirlo en la bandeja después de rechazarla.
// phone: el número de la conversación, al que se avisa el alta aprobada.
export type ProspectDecisionResult = DecisionResult & { casoId: number; phone: string }

// El aviso de un alta aprobada, para reintentarlo (RF-ATE-05).
export type ProspectNotification = {
  id: number
  phone: string
}

export type PhoneChangeDecisionResult = DecisionResult & {
  phone: string
}

export type PhoneChangeNotification = {
  id: number
  phone: string
  decision: RequestDecision
}

export interface RequestManagementRepository {
  listPendingProspects(page: PageRequest): Promise<PendingProspect[]>
  listPendingPhoneChanges(page: PageRequest): Promise<PendingPhoneChange[]>
  decideProspect(input: ProspectDecisionInput, actor: DecisionActor): Promise<ProspectDecisionResult>
  decidePhoneChange(input: PhoneChangeDecisionInput, actor: DecisionActor): Promise<PhoneChangeDecisionResult>
  getPhoneChangeNotification(id: number): Promise<PhoneChangeNotification>
  recordPhoneChangeNotification(id: number, text: string, sentAt: Date): Promise<void>
  // 404 si el prospecto no existe y 409 si no está confirmado: solo el alta aprobada se avisa.
  getProspectNotification(id: number): Promise<ProspectNotification>
  recordProspectNotification(id: number, text: string, sentAt: Date): Promise<void>
}

export class RequestManagementError extends Error {
  public constructor(
    public readonly statusCode: 400 | 401 | 403 | 404 | 409 | 429 | 502,
    // WHATSAPP_ERROR e IMAGE_UNAVAILABLE: la Bandeja de Atención (change bandeja-atender-casos).
    // UNAUTHORIZED, FORBIDDEN, INVALID_CREDENTIALS y TOO_MANY_ATTEMPTS: la sesión del panel (change acceso-por-rol).
    public readonly code:
      | 'VALIDATION_ERROR'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'WHATSAPP_ERROR'
      | 'IMAGE_UNAVAILABLE'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'INVALID_CREDENTIALS'
      | 'TOO_MANY_ATTEMPTS',
    message: string,
  ) {
    super(message)
    this.name = 'RequestManagementError'
  }
}
