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
export type ProspectDecisionResult = DecisionResult & { casoId: number }

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
  decideProspect(input: ProspectDecisionInput): Promise<ProspectDecisionResult>
  decidePhoneChange(input: PhoneChangeDecisionInput): Promise<PhoneChangeDecisionResult>
  decideDataChange(input: DataChangeDecisionInput): Promise<DataChangeDecisionResult>
  getPhoneChangeNotification(id: number): Promise<PhoneChangeNotification>
  recordPhoneChangeNotification(id: number, text: string, sentAt: Date): Promise<void>
  getDataChangeNotification(id: number): Promise<DecisionNotification>
  recordDataChangeNotification(id: number, text: string, sentAt: Date): Promise<void>
}

export class RequestManagementError extends Error {
  public constructor(
    public readonly statusCode: 400 | 404 | 409 | 502,
    // WHATSAPP_ERROR e IMAGE_UNAVAILABLE: la Bandeja de Atención (change bandeja-atender-casos).
    public readonly code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'WHATSAPP_ERROR' | 'IMAGE_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'RequestManagementError'
  }
}
