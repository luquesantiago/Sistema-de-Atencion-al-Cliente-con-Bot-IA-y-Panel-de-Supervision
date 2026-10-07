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
  decideProspect(input: ProspectDecisionInput): Promise<DecisionResult>
  decidePhoneChange(input: PhoneChangeDecisionInput): Promise<PhoneChangeDecisionResult>
  getPhoneChangeNotification(id: number): Promise<PhoneChangeNotification>
}

export class RequestManagementError extends Error {
  public constructor(
    public readonly statusCode: 400 | 404 | 409,
    public readonly code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message)
    this.name = 'RequestManagementError'
  }
}
