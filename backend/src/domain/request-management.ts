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

// El dato que se quiere cambiar y el valor nuevo, leídos del detalle de la solicitud
// (formato fijo de dataChangeDetalle). currentValue es lo que vale hoy en la cartera, para
// que el operador compare antes de decidir.
export type PendingDataChange = {
  id: number
  caseId: number
  customerName: string
  customerDni: string
  /** Número de WhatsApp de la conversación, a donde sale el aviso de la decisión. */
  phone: string
  field: 'nombre' | 'apellido'
  currentValue: string
  value: string
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

// El dato y el valor salen del detalle de la solicitud: la decisión solo aprueba o rechaza.
export type DataChangeDecisionInput = {
  id: number
  decision: RequestDecision
  fundamento: string
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

export type DataChangeDecisionResult = DecisionResult & {
  phone: string
}

export type PhoneChangeNotification = {
  id: number
  phone: string
  decision: RequestDecision
}

// El aviso de una decisión de Trámites al cliente por WhatsApp, de cualquier trámite.
export type DecisionNotification = PhoneChangeNotification

export interface RequestManagementRepository {
  listPendingProspects(page: PageRequest): Promise<PendingProspect[]>
  listPendingPhoneChanges(page: PageRequest): Promise<PendingPhoneChange[]>
  listPendingDataChanges(page: PageRequest): Promise<PendingDataChange[]>
  decideProspect(input: ProspectDecisionInput, actor: DecisionActor): Promise<ProspectDecisionResult>
  decidePhoneChange(input: PhoneChangeDecisionInput, actor: DecisionActor): Promise<PhoneChangeDecisionResult>
  decideDataChange(input: DataChangeDecisionInput, actor: DecisionActor): Promise<DataChangeDecisionResult>
  getPhoneChangeNotification(id: number): Promise<PhoneChangeNotification>
  recordPhoneChangeNotification(id: number, text: string, sentAt: Date): Promise<void>
  getDataChangeNotification(id: number): Promise<DecisionNotification>
  recordDataChangeNotification(id: number, text: string, sentAt: Date): Promise<void>
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
