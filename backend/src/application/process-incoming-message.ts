import type { AiClient, CustomerStatus } from '../domain/ai-client.js'
import {
  caseForMessage,
  endByInactivity,
  endByRestart,
  type CaseChoice,
  type CaseRef,
  type ConversationChanges,
  type ConversationStore,
  type MessageSituation,
  type OpenConversation,
  type QueryRef,
  type SavedConversation,
  type Settings,
} from '../domain/conversation.js'
import type { Customer, CustomerRepository } from '../domain/customer.js'
import { findDni, maskDni } from '../domain/dni.js'
import { actionForIntent, type AnswerTemplate, type Intent } from '../domain/intent.js'
import type { IncomingWhatsAppMessage } from '../domain/message.js'
import { checkRewrite } from '../domain/rewrite-check.js'
import {
  approvalNotice,
  customerStatusQuestion,
  customerStatusRetryQuestion,
  existingCustomerDniRequest,
  expirationsTemplate,
  firstDniRequest,
  handoffMessage,
  newCustomerDniRequest,
  newCustomerNameRequest,
  newCustomerPhotoRequest,
  newCustomerPhotoRetryRequest,
  phoneChangePendingMessage,
  prospectHandoffMessage,
  repeatedDniRequest,
  statusesTemplate,
  useNewPhoneRequest,
  welcomeMessage,
  type Clock,
} from '../domain/templates.js'
import type { WhatsAppClient } from '../domain/whatsapp-client.js'

// La consulta que el cliente escribió antes de identificarse: se responde al identificarse.
type PendingQuery = { answers: QueryRef; text: string }

// Lo que se sabe de quien escribe mientras se identifica. linkedIds son los clientes
// vinculados al número: vacío si el número no está vinculado.
type Identification = {
  linkedIds: number[]
  pending: PendingQuery | null
  unrecognizedDnis: number
}

// Etapa de la conversación, en memoria por id de conversación (design.md, decisión 4). El
// silencio no es una etapa: sale de asistente_suspendido.
type Stage =
  | { stage: 'unidentified' }
  | ({ stage: 'awaiting_customer_status' } & Identification)
  | ({ stage: 'awaiting_dni' } & Identification)
  | ({ stage: 'awaiting_new_customer_name' } & Identification)
  | ({ stage: 'awaiting_new_customer_dni'; name: string } & Identification)
  | ({ stage: 'awaiting_new_customer_photo'; name: string; dni: string } & Identification)
  | { stage: 'identified'; customerId: number }

export type ProcessResult =
  | { status: 'CUSTOMER_STATUS_REQUESTED'; responseSent: true }
  | { status: 'CUSTOMER_STATUS_REASKED'; responseSent: true }
  | { status: 'DNI_REQUESTED'; responseSent: true }
  | { status: 'NAME_REQUESTED'; responseSent: true }
  | { status: 'NEW_CUSTOMER_DNI_REQUESTED'; responseSent: true }
  | { status: 'PHOTO_REQUESTED'; responseSent: true }
  | { status: 'PROSPECT_HANDED_OFF'; responseSent: true }
  | { status: 'PHONE_CHANGE_PENDING'; answer: ProcessResult['status']; responseSent: true }
  | { status: 'NEW_PHONE_REQUESTED'; intent: Intent; responseSent: true }
  | { status: 'WELCOME_SENT'; responseSent: true }
  | { status: 'ANSWER_SENT'; intent: Intent; responseSent: true }
  | { status: 'APPROVAL_NOTICE_SENT'; intent: Intent; responseSent: true }
  | { status: 'HANDOFF_SENT'; reason: string; responseSent: true }
  | { status: 'IGNORED_NOT_INSURANCE'; responseSent: false }
  | { status: 'IGNORED_MEDIA'; responseSent: false }
  | { status: 'SILENCED'; responseSent: false }
  | { status: 'DUPLICATE_IGNORED'; responseSent: false }

const prospectPhotoText = 'El cliente envió una foto de su DNI por WhatsApp. La imagen no se almacena en el sistema.'
const silencedImageText = 'El cliente envió una imagen por WhatsApp; el archivo no se almacena en el sistema.'

// Lo que se decide para un mensaje: los cambios que se guardan, la etapa que queda y el
// resultado. Nada se guarda ni se envía hasta ConversationStore.save.
class Turn {
  public readonly changes: ConversationChanges
  public nextStage: ((saved: SavedConversation) => Stage) | null = null
  private incomingPlaced = false

  public constructor(
    public readonly conversation: OpenConversation | null,
    phone: string,
    at: Date,
    text: string,
    closePrevious: ConversationChanges['closePrevious'],
  ) {
    this.changes = {
      phone,
      at,
      conversation: conversation ? { existing: conversation.id, suspended: conversation.suspended } : { create: true },
      newCases: [],
      caseTypes: [],
      incoming: { case: { created: -1 }, text },
      replies: [],
      ...(closePrevious ? { closePrevious } : {}),
    }
  }

  public caseFor(situation: MessageSituation): CaseRef {
    return this.ref(caseForMessage(this.conversation, situation))
  }

  public ref(choice: CaseChoice): CaseRef {
    if (choice.kind === 'new') {
      this.changes.newCases.push({ type: choice.type })
      return { created: this.changes.newCases.length - 1 }
    }
    if (choice.setType) this.changes.caseTypes.push({ case: { existing: choice.caseId }, type: choice.setType })
    return { existing: choice.caseId }
  }

  public receiveIn(ref: CaseRef): void {
    this.changes.incoming.case = ref
    this.incomingPlaced = true
  }

  public get hasIncomingCase(): boolean {
    return this.incomingPlaced
  }

  public reply(ref: CaseRef, text: string, answers: QueryRef = 'incoming'): void {
    this.changes.replies.push({ case: ref, text, answers })
  }

  // El caso del mensaje guardado que responde una consulta: el de la consulta guardada.
  public caseOfMessage(messageId: number): number | undefined {
    return this.conversation?.messages.find((message) => message.id === messageId)?.caseId
  }
}

export class ProcessIncomingMessage {
  private readonly stages = new Map<number, Stage>()
  private readonly processedMessageIds = new Set<string>()

  public constructor(
    private readonly customers: CustomerRepository,
    private readonly conversations: ConversationStore,
    private readonly ai: AiClient,
    private readonly whatsapp: WhatsAppClient,
    private readonly clock: Clock = () => new Date(),
  ) {}

  public async execute(message: IncomingWhatsAppMessage): Promise<ProcessResult> {
    if (this.processedMessageIds.has(message.messageId)) {
      return { status: 'DUPLICATE_IGNORED', responseSent: false }
    }
    this.processedMessageIds.add(message.messageId)
    try {
      return await this.process(message)
    } catch (error) {
      this.processedMessageIds.delete(message.messageId)
      throw error
    }
  }

  // Orden de cada mensaje (design.md, decisión 11): leer, decidir (con las llamadas al
  // proveedor de IA), guardar con el envío al final y, con lo guardado, actualizar la etapa.
  private async process(message: IncomingWhatsAppMessage): Promise<ProcessResult> {
    const at = this.clock()
    const open = await this.conversations.findOpen(message.phone)

    if (open?.suspended) {
      const turn = new Turn(open, message.phone, at, messageTextForCase(message), undefined)
      turn.receiveIn(turn.caseFor({ kind: 'suspended' }))
      await this.conversations.save(turn.changes, async () => {})
      console.log('[asistente] conversación en silencio: mensaje guardado sin respuesta')
      return { status: 'SILENCED', responseSent: false }
    }

    const settings = await this.conversations.settings()
    let conversation = open
    let closePrevious: ConversationChanges['closePrevious']
    let stage: Stage | undefined
    if (open) {
      stage = this.stages.get(open.id)
      const end = stage ? endByInactivity(open, at, settings.inactivityMinutes) : endByRestart(open)
      if (end) {
        closePrevious = { conversationId: open.id, ...end }
        conversation = null
        stage = undefined
      }
    }

    if (message.media === 'image' && stage?.stage !== 'awaiting_new_customer_photo') {
      return { status: 'IGNORED_MEDIA', responseSent: false }
    }

    const text = message.media === 'image' ? prospectPhotoText : message.text
    const turn = new Turn(conversation, message.phone, at, text, closePrevious)
    const result = await this.decide(turn, stage, message, settings)
    if (!turn.hasIncomingCase) turn.receiveIn(turn.caseFor({ kind: 'identifying' }))

    const saved = await this.conversations.save(turn.changes, async () => {
      for (const reply of turn.changes.replies) await this.whatsapp.sendText(message.phone, reply.text)
    })

    if (closePrevious) this.stages.delete(closePrevious.conversationId)
    if (turn.nextStage) this.stages.set(saved.conversationId, turn.nextStage(saved))
    if (turn.changes.handoff) console.log(`[asistente] derivación: ${turn.changes.handoff.reason}`)
    if (result.status === 'IGNORED_NOT_INSURANCE') console.log('[asistente] mensaje que no es de seguros: sin respuesta')
    return result
  }

  private async decide(turn: Turn, stage: Stage | undefined, message: IncomingWhatsAppMessage, settings: Settings): Promise<ProcessResult> {
    const { text } = message
    if (!stage || stage.stage === 'unidentified') return this.start(turn, text, settings)
    switch (stage.stage) {
      case 'awaiting_customer_status':
        return this.classifyCustomerStatus(turn, stage, text)
      case 'awaiting_dni':
        return this.identifyByDni(turn, stage, text, settings)
      case 'awaiting_new_customer_name':
        return this.collectNewCustomerName(turn, stage, text)
      case 'awaiting_new_customer_dni':
        return this.collectNewCustomerDni(turn, stage, text)
      case 'awaiting_new_customer_photo':
        return this.collectNewCustomerPhoto(turn, stage, message)
      case 'identified':
        return this.answerIdentified(turn, stage.customerId, text)
    }
  }

  // Primer mensaje de la conversación (reglas 1 y 2 de AGENTS.md).
  private async start(turn: Turn, text: string, settings: Settings): Promise<ProcessResult> {
    const linkedIds = await this.customers.linkedCustomerIds(turn.changes.phone)
    const pending: PendingQuery | null = containsQuestionOutsideDni(text) ? { answers: 'incoming', text } : null

    if (linkedIds.length === 1 && linkedIds[0] !== undefined) {
      const customer = await this.customers.findById(linkedIds[0])
      if (customer) {
        turn.changes.customerId = customer.id
        return this.answerIdentified(turn, customer.id, text, customer)
      }
    }

    if (linkedIds.length > 1) {
      const identification: Identification = { linkedIds, pending, unrecognizedDnis: 0 }
      if (findDni(text)) return this.identifyByDni(turn, identification, text, settings)
      const ref = turn.caseFor({ kind: 'identifying' })
      turn.receiveIn(ref)
      turn.reply(ref, firstDniRequest)
      turn.nextStage = (saved) => ({ stage: 'awaiting_dni', ...resolvePending(identification, saved) })
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    const identification: Identification = { linkedIds: [], pending, unrecognizedDnis: 0 }
    this.replyIdentifying(turn, customerStatusQuestion)
    turn.nextStage = (saved) => ({ stage: 'awaiting_customer_status', ...resolvePending(identification, saved) })
    return { status: 'CUSTOMER_STATUS_REQUESTED', responseSent: true }
  }

  private async classifyCustomerStatus(turn: Turn, stage: Identification, reply: string): Promise<ProcessResult> {
    let status: CustomerStatus
    try {
      status = await this.ai.classifyCustomerStatus(maskDni(reply))
    } catch {
      return this.handoffIdentifying(turn, 'falla del proveedor al identificar el tipo de cliente')
    }

    const identification = identificationOf(stage)
    switch (status) {
      case 'NEW_CUSTOMER':
        this.replyIdentifying(turn, newCustomerNameRequest)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_name', ...identification })
        return { status: 'NAME_REQUESTED', responseSent: true }
      case 'EXISTING_CUSTOMER':
        this.replyIdentifying(turn, identification.linkedIds.length > 0 ? repeatedDniRequest : existingCustomerDniRequest)
        turn.nextStage = () => ({ stage: 'awaiting_dni', ...identification })
        return { status: 'DNI_REQUESTED', responseSent: true }
      case 'UNRELATED':
        this.replyIdentifying(turn, customerStatusRetryQuestion)
        turn.nextStage = () => ({ stage: 'awaiting_customer_status', ...identification })
        return { status: 'CUSTOMER_STATUS_REASKED', responseSent: true }
    }
  }

  private async identifyByDni(turn: Turn, stage: Identification, text: string, settings: Settings): Promise<ProcessResult> {
    const identification = identificationOf(stage)
    const dni = findDni(text)
    if (!dni) {
      this.replyIdentifying(turn, repeatedDniRequest)
      turn.nextStage = (saved) => ({ stage: 'awaiting_dni', ...resolvePending(identification, saved) })
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    const customer = await this.customers.findByDni(dni)
    if (customer) return this.recognized(turn, identification, customer)

    const unrecognizedDnis = identification.unrecognizedDnis + 1
    if (unrecognizedDnis > settings.maxDniRetries) return this.handoffIdentifying(turn, 'DNI no reconocido')
    this.replyIdentifying(turn, customerStatusQuestion)
    turn.nextStage = (saved) => ({
      stage: 'awaiting_customer_status',
      ...resolvePending({ ...identification, unrecognizedDnis }, saved),
    })
    return { status: 'CUSTOMER_STATUS_REQUESTED', responseSent: true }
  }

  // El DNI es de un cliente de la cartera: desde un número vinculado tiene que ser uno de
  // los vinculados; desde uno no vinculado, se pide el cambio de teléfono (regla 9).
  private async recognized(turn: Turn, identification: Identification, customer: Customer): Promise<ProcessResult> {
    if (identification.linkedIds.length > 0) {
      if (!identification.linkedIds.includes(customer.id)) {
        return this.handoffIdentifying(turn, 'DNI de otra persona')
      }
      turn.changes.customerId = customer.id
      // Con la consulta en este mismo mensaje, el mensaje va al caso de la consulta.
      if (identification.pending?.answers === 'incoming') {
        return this.answerAfterIdentifying(turn, customer, identification.pending, null)
      }
      const ref = turn.caseFor({ kind: 'identifying' })
      turn.receiveIn(ref)
      return this.answerAfterIdentifying(turn, customer, identification.pending, ref)
    }

    turn.changes.customerId = customer.id
    const ref = turn.caseFor({ kind: 'phone-change-request' })
    turn.receiveIn(ref)
    turn.changes.phoneChangeRequest = { case: ref, customerId: customer.id }
    turn.reply(ref, phoneChangePendingMessage)
    const answer = await this.answerAfterIdentifying(turn, customer, identification.pending, ref)
    return { status: 'PHONE_CHANGE_PENDING', answer: answer.status, responseSent: true }
  }

  private async answerAfterIdentifying(
    turn: Turn,
    customer: Customer,
    pending: PendingQuery | null,
    welcomeCase: CaseRef | null,
  ): Promise<ProcessResult> {
    turn.nextStage = () => ({ stage: 'identified', customerId: customer.id })
    if (!pending) {
      turn.reply(welcomeCase ?? turn.caseFor({ kind: 'identifying' }), welcomeMessage(customer))
      return { status: 'WELCOME_SENT', responseSent: true }
    }
    const caseId = pending.answers === 'incoming' ? undefined : turn.caseOfMessage(pending.answers.existing)
    return this.answerQuery(turn, customer, { text: pending.text, answers: pending.answers, caseId }, true)
  }

  private collectNewCustomerName(turn: Turn, stage: Identification, text: string): ProcessResult {
    const identification = identificationOf(stage)
    const name = text.trim()
    if (!name) {
      this.replyIdentifying(turn, newCustomerNameRequest)
      turn.nextStage = () => ({ stage: 'awaiting_new_customer_name', ...identification })
      return { status: 'NAME_REQUESTED', responseSent: true }
    }
    this.replyIdentifying(turn, newCustomerDniRequest)
    turn.nextStage = () => ({ stage: 'awaiting_new_customer_dni', name, ...identification })
    return { status: 'NEW_CUSTOMER_DNI_REQUESTED', responseSent: true }
  }

  private async collectNewCustomerDni(turn: Turn, stage: Identification & { name: string }, text: string): Promise<ProcessResult> {
    const identification = identificationOf(stage)
    const { name } = stage
    const dni = findDni(text)
    if (!dni) {
      this.replyIdentifying(turn, newCustomerDniRequest)
      turn.nextStage = () => ({ stage: 'awaiting_new_customer_dni', name, ...identification })
      return { status: 'NEW_CUSTOMER_DNI_REQUESTED', responseSent: true }
    }
    // Si el DNI ya es de un cliente, no hay prospecto: sigue como cliente existente.
    const customer = await this.customers.findByDni(dni)
    if (customer) return this.recognized(turn, identification, customer)
    this.replyIdentifying(turn, newCustomerPhotoRequest)
    turn.nextStage = () => ({ stage: 'awaiting_new_customer_photo', name, dni, ...identification })
    return { status: 'PHOTO_REQUESTED', responseSent: true }
  }

  private collectNewCustomerPhoto(
    turn: Turn,
    stage: Identification & { name: string; dni: string },
    message: IncomingWhatsAppMessage,
  ): ProcessResult {
    const identification = identificationOf(stage)
    const { name, dni } = stage
    if (message.media !== 'image') {
      this.replyIdentifying(turn, newCustomerPhotoRetryRequest)
      turn.nextStage = () => ({ stage: 'awaiting_new_customer_photo', name, dni, ...identification })
      return { status: 'PHOTO_REQUESTED', responseSent: true }
    }
    const ref = turn.caseFor({ kind: 'identifying' })
    turn.receiveIn(ref)
    turn.changes.prospect = { case: ref, name, dni }
    turn.changes.handoff = { case: ref, reason: 'cliente nuevo' }
    turn.reply(ref, prospectHandoffMessage)
    turn.nextStage = () => ({ stage: 'unidentified' })
    return { status: 'PROSPECT_HANDED_OFF', responseSent: true }
  }

  private async answerIdentified(turn: Turn, customerId: number, text: string, known?: Customer): Promise<ProcessResult> {
    turn.nextStage = () => ({ stage: 'identified', customerId })
    const customer = known ?? await this.customers.findById(customerId)
    if (!customer) return this.handoffUntyped(turn, 'cliente identificado inexistente')
    const dni = findDni(text)
    if (dni && dni !== customer.dni) return this.handoffUntyped(turn, 'DNI de otra persona')
    return this.answerQuery(turn, customer, { text, answers: 'incoming' }, false)
  }

  private async answerQuery(
    turn: Turn,
    customer: Customer,
    query: { text: string; answers: QueryRef; caseId?: number },
    welcomeIfIgnored: boolean,
  ): Promise<ProcessResult> {
    const question = maskDni(query.text)
    const caseFor = (intent: Intent): CaseRef => {
      const ref = turn.caseFor({ kind: 'intent', intent, ...(query.caseId === undefined ? {} : { caseId: query.caseId }) })
      if (query.answers === 'incoming' && !turn.hasIncomingCase) turn.receiveIn(ref)
      return ref
    }

    let intent: Intent
    try {
      intent = await this.ai.classifyIntent(question)
    } catch {
      return this.handoffIn(turn, caseFor('no sé'), 'falla del proveedor al decidir')
    }

    const action = actionForIntent(intent)
    const ref = caseFor(intent)
    switch (action.kind) {
      case 'ignore':
        if (welcomeIfIgnored) {
          turn.reply(ref, welcomeMessage(customer), query.answers)
          return { status: 'WELCOME_SENT', responseSent: true }
        }
        return { status: 'IGNORED_NOT_INSURANCE', responseSent: false }
      case 'handoff':
        return this.handoffIn(turn, ref, `intención: ${intent}`, query.answers)
      case 'approval':
        if (intent === 'cambio de teléfono') {
          turn.reply(ref, useNewPhoneRequest, query.answers)
          return { status: 'NEW_PHONE_REQUESTED', intent, responseSent: true }
        }
        turn.changes.handoff = { case: ref, reason: `pedido para aprobar: ${intent}` }
        turn.reply(ref, approvalNotice, query.answers)
        return { status: 'APPROVAL_NOTICE_SENT', intent, responseSent: true }
      case 'answer':
        return this.sendRewrittenAnswer(turn, ref, customer, question, query.answers, intent, action.template)
    }
  }

  private async sendRewrittenAnswer(
    turn: Turn,
    ref: CaseRef,
    customer: Customer,
    question: string,
    answers: QueryRef,
    intent: Intent,
    templateKind: AnswerTemplate,
  ): Promise<ProcessResult> {
    if (templateKind !== 'courtesy' && customer.policies.length === 0) {
      return this.handoffIn(turn, ref, 'cliente sin pólizas', answers)
    }
    const template = this.fillTemplate(customer, templateKind)

    let draft: string
    try {
      draft = await this.ai.rewrite({ template, question })
    } catch {
      return this.handoffIn(turn, ref, 'falla de la redacción', answers)
    }
    const check = checkRewrite(template, draft)
    if (!check.ok) {
      turn.changes.rejectedDraft = { text: draft, answers }
      return this.handoffIn(turn, ref, `redacción rechazada: ${check.reason}`, answers)
    }

    turn.reply(ref, draft, answers)
    return { status: 'ANSWER_SENT', intent, responseSent: true }
  }

  private fillTemplate(customer: Customer, templateKind: AnswerTemplate): string {
    switch (templateKind) {
      case 'expirations':
        return expirationsTemplate(customer, this.clock())
      case 'statuses':
        return statusesTemplate(customer, this.clock())
      case 'courtesy':
        return `Gracias por escribirnos, ${customer.firstName}. ¿En qué lo puedo ayudar?`
    }
  }

  // Respuesta mientras la persona se identifica: va al caso actual, con el mensaje.
  private replyIdentifying(turn: Turn, text: string): void {
    const ref = turn.caseFor({ kind: 'identifying' })
    turn.receiveIn(ref)
    turn.reply(ref, text)
  }

  // Al volver a atender después del silencio, la identificación empieza de nuevo.
  private handoffIdentifying(turn: Turn, reason: string): ProcessResult {
    const ref = turn.caseFor({ kind: 'identifying' })
    turn.receiveIn(ref)
    turn.nextStage = () => ({ stage: 'unidentified' })
    return this.handoffIn(turn, ref, reason)
  }

  private handoffUntyped(turn: Turn, reason: string): ProcessResult {
    const ref = turn.caseFor({ kind: 'untyped-handoff' })
    turn.receiveIn(ref)
    return this.handoffIn(turn, ref, reason)
  }

  private handoffIn(turn: Turn, ref: CaseRef, reason: string, answers: QueryRef = 'incoming'): ProcessResult {
    turn.changes.handoff = { case: ref, reason }
    turn.reply(ref, handoffMessage, answers)
    return { status: 'HANDOFF_SENT', reason, responseSent: true }
  }
}

function identificationOf(stage: Identification): Identification {
  return { linkedIds: stage.linkedIds, pending: stage.pending, unrecognizedDnis: stage.unrecognizedDnis }
}

// La consulta guardada en este mismo mensaje pasa a ser el mensaje que se guardó.
function resolvePending(identification: Identification, saved: SavedConversation): Identification {
  const { pending } = identification
  if (pending?.answers !== 'incoming') return identification
  return { ...identification, pending: { answers: { existing: saved.incomingMessageId }, text: pending.text } }
}

function messageTextForCase(message: IncomingWhatsAppMessage): string {
  if (message.media === 'image') return silencedImageText
  return message.text
}

function containsQuestionOutsideDni(text: string): boolean {
  return maskDni(text).replace(/\[DNI\]/g, '').replace(/[^\p{L}]/gu, '').trim().length > 0
}
