import type {
  CaseRef,
  ConversationChanges,
  ConversationStore,
  MessageOrigin,
  OpenConversation,
  QueryRef,
  QueryType,
  SavedConversation,
  Settings,
} from '../domain/conversation.js'

// Doble de prueba del almacén de conversaciones (design.md, decisión 3). Aplica los cambios
// sobre una copia y la conserva solo si send no lanza, como la transacción de la base.

export type StoredConversation = {
  id: number
  phone: string
  customerId: number | null
  suspended: boolean
  startedAt: Date
  endedAt: Date | null
}

export type StoredCase = {
  id: number
  conversationId: number
  type: QueryType | null
  openedAt: Date
  handedOffAt: Date | null
  handoffReason: string | null
  closedAt: Date | null
  unattendedAlert: boolean
}

export type StoredMessage = { id: number; caseId: number; origin: MessageOrigin; text: string; sentAt: Date }
export type StoredReply = { id: number; queryMessageId: number; sentMessageId: number | null; text: string; at: Date }
export type StoredProspect = { id: number; caseId: number; name: string; dni: string; status: 'pendiente' | 'confirmado' | 'descartado' }
export type StoredPhoneChange = {
  id: number
  caseId: number
  customerId: number
  phone: string
  status: 'pendiente' | 'aprobada' | 'rechazada'
}

export type ConversationState = {
  nextId: number
  conversations: StoredConversation[]
  cases: StoredCase[]
  messages: StoredMessage[]
  replies: StoredReply[]
  prospects: StoredProspect[]
  phoneChanges: StoredPhoneChange[]
}

export class InMemoryConversationStore implements ConversationStore {
  private state: ConversationState = {
    nextId: 1,
    conversations: [],
    cases: [],
    messages: [],
    replies: [],
    prospects: [],
    phoneChanges: [],
  }
  public failNextRead = false
  public failNextSave = false

  public constructor(private readonly currentSettings: Settings = { maxDniRetries: 3, inactivityMinutes: 30 }) {}

  public async findOpen(phone: string): Promise<OpenConversation | null> {
    if (this.failNextRead) {
      this.failNextRead = false
      throw new Error('La base no respondió')
    }
    const conversation = this.state.conversations.findLast((item) => item.phone === phone && item.endedAt === null)
    if (!conversation) return null
    const cases = this.state.cases.filter((item) => item.conversationId === conversation.id)
    const caseIds = new Set(cases.map((item) => item.id))
    return structuredClone({
      id: conversation.id,
      customerId: conversation.customerId,
      suspended: conversation.suspended,
      startedAt: conversation.startedAt,
      cases: cases.map((item) => ({
        id: item.id,
        type: item.type,
        handedOff: item.handedOffAt !== null,
        closedAt: item.closedAt,
        hasPending: item.unattendedAlert ||
          this.state.phoneChanges.some((request) => request.caseId === item.id && request.status === 'pendiente'),
      })),
      messages: this.state.messages
        .filter((message) => caseIds.has(message.caseId))
        .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime() || a.id - b.id)
        .map(({ id, caseId, origin, text, sentAt }) => ({ id, caseId, origin, text, sentAt })),
    })
  }

  public async settings(): Promise<Settings> {
    return { ...this.currentSettings }
  }

  public async save(changes: ConversationChanges, send: () => Promise<void>): Promise<SavedConversation> {
    if (this.failNextSave) {
      this.failNextSave = false
      throw new Error('La base no respondió')
    }
    const draft = structuredClone(this.state)
    const saved = apply(draft, changes)
    await send()
    this.state = draft
    return saved
  }

  // Lo guardado, para las pruebas.
  public snapshot(): ConversationState {
    return structuredClone(this.state)
  }

  // Lo que hace la decisión de un trámite o el cierre desde la bandeja: cierra el caso con
  // responsable y, si no queda otro caso derivado sin cerrar, saca la marca de silencio.
  public closeCase(caseId: number, at: Date): void {
    const closed = this.state.cases.find((item) => item.id === caseId)
    if (!closed) throw new Error(`No existe el caso ${caseId}`)
    closed.closedAt = at
    for (const request of this.state.phoneChanges) {
      if (request.caseId === caseId && request.status === 'pendiente') request.status = 'aprobada'
    }
    const conversation = this.state.conversations.find((item) => item.id === closed.conversationId)
    const otherHandoff = this.state.cases.some((item) =>
      item.conversationId === closed.conversationId && item.handedOffAt !== null && item.closedAt === null)
    if (conversation && conversation.endedAt === null && !otherHandoff) conversation.suspended = false
  }

  // Una conversación abierta con un caso derivado sin cerrar, como las migradas de la planilla.
  public seedConversation(conversation: Omit<StoredConversation, 'id'>, cases: Array<Omit<StoredCase, 'id' | 'conversationId'>>): number {
    const id = this.state.nextId++
    this.state.conversations.push({ ...conversation, id })
    for (const item of cases) this.state.cases.push({ ...item, id: this.state.nextId++, conversationId: id })
    return id
  }

  public markUnattendedAlert(caseId: number): void {
    const target = this.state.cases.find((item) => item.id === caseId)
    if (target) target.unattendedAlert = true
  }
}

function apply(state: ConversationState, changes: ConversationChanges): SavedConversation {
  const newId = () => state.nextId++
  const { at } = changes

  if (changes.closePrevious) {
    const { conversationId, endedAt, caseIds } = changes.closePrevious
    const previous = state.conversations.find((item) => item.id === conversationId && item.endedAt === null)
    if (!previous) throw new Error('La conversación a cerrar ya no está abierta')
    previous.endedAt = endedAt
    for (const item of state.cases) {
      if (caseIds.includes(item.id) && item.conversationId === conversationId &&
        item.closedAt === null && item.handedOffAt === null) item.closedAt = endedAt
    }
  }

  let conversation: StoredConversation
  if ('existing' in changes.conversation) {
    const { existing, suspended } = changes.conversation
    const found = state.conversations.find((item) => item.id === existing)
    if (!found || found.endedAt !== null || found.suspended !== suspended) {
      throw new Error('La conversación cambió desde que se leyó')
    }
    conversation = found
  } else {
    if (state.conversations.some((item) => item.phone === changes.phone && item.endedAt === null)) {
      throw new Error('El número ya tiene una conversación abierta')
    }
    conversation = { id: newId(), phone: changes.phone, customerId: null, suspended: false, startedAt: at, endedAt: null }
    state.conversations.push(conversation)
  }
  if (changes.customerId !== undefined) conversation.customerId = changes.customerId

  const created = changes.newCases.map((item) => {
    const stored: StoredCase = {
      id: newId(),
      conversationId: conversation.id,
      type: item.type,
      openedAt: at,
      handedOffAt: null,
      handoffReason: null,
      closedAt: null,
      unattendedAlert: false,
    }
    state.cases.push(stored)
    return stored
  })
  const caseOf = (ref: CaseRef): StoredCase => {
    const found = 'created' in ref
      ? created[ref.created]
      : state.cases.find((item) => item.id === ref.existing && item.conversationId === conversation.id)
    if (!found) throw new Error('El caso no es de la conversación')
    return found
  }

  for (const { case: ref, type } of changes.caseTypes) {
    const target = caseOf(ref)
    if (target.type === null) target.type = type
  }

  const incoming: StoredMessage = { id: newId(), caseId: caseOf(changes.incoming.case).id, origin: 'cliente', text: changes.incoming.text, sentAt: at }
  state.messages.push(incoming)
  const queryId = (ref: QueryRef) => (ref === 'incoming' ? incoming.id : ref.existing)

  if (changes.rejectedDraft) {
    state.replies.push({ id: newId(), queryMessageId: queryId(changes.rejectedDraft.answers), sentMessageId: null, text: changes.rejectedDraft.text, at })
  }
  for (const reply of changes.replies) {
    const sent: StoredMessage = { id: newId(), caseId: caseOf(reply.case).id, origin: 'asistente', text: reply.text, sentAt: at }
    state.messages.push(sent)
    state.replies.push({ id: newId(), queryMessageId: queryId(reply.answers), sentMessageId: sent.id, text: reply.text, at })
  }

  if (changes.handoff) {
    const target = caseOf(changes.handoff.case)
    target.handedOffAt = at
    target.handoffReason = changes.handoff.reason.slice(0, 255)
    conversation.suspended = true
  }
  if (changes.prospect) {
    const { case: ref, name, dni } = changes.prospect
    state.prospects.push({ id: newId(), caseId: caseOf(ref).id, name: name.slice(0, 200), dni, status: 'pendiente' })
  }
  if (changes.phoneChangeRequest) {
    const { case: ref, customerId } = changes.phoneChangeRequest
    const pending = state.phoneChanges.some((request) =>
      request.customerId === customerId && request.phone === changes.phone && request.status === 'pendiente')
    if (!pending) {
      state.phoneChanges.push({ id: newId(), caseId: caseOf(ref).id, customerId, phone: changes.phone, status: 'pendiente' })
    }
  }

  return { conversationId: conversation.id, incomingMessageId: incoming.id }
}
