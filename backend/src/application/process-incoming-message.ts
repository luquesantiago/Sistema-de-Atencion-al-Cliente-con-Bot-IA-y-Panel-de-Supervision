import { agencyInfoAnswer, type AgencyInfoAnswer, type AgencyInfoSource } from '../domain/agency-info.js'
import type { AiClient, CustomerStatus } from '../domain/ai-client.js'
import { balanceTemplate } from '../domain/balance.js'
import {
  caseForMessage,
  isQueryType,
  endByInactivity,
  endByRestart,
  intentContext,
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
import { describeHandoffReason, type HandoffReason } from '../domain/handoff.js'
import { actionForIntent, clarificationStep, type AnswerTemplate, type Intent } from '../domain/intent.js'
import type { IncomingWhatsAppMessage } from '../domain/message.js'
import { checkRewrite } from '../domain/rewrite-check.js'
import { handoffRiskLevel, queryTypeRiskLevel, type RiskLevel, type Urgency } from '../domain/risk-level.js'
import {
  approvalNotice,
  clarificationRequestFor,
  customerStatusQuestion,
  customerStatusRetryQuestion,
  courtesyTemplate,
  existingCustomerDniRequest,
  expirationsTemplate,
  firstDniRequest,
  handoffMessage,
  newCustomerDniRequest,
  newCustomerNameRequest,
  newCustomerNoDataNotice,
  newCustomerPhotoRequest,
  newCustomerPhotoRetryRequest,
  newCustomerQueryOffer,
  notInsuranceMessage,
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
  // Quien dijo ser cliente nuevo todavía no pidió el alta: se le ofrece resolver consultas o
  // darle datos de la empresa. notUnderstood: repreguntas seguidas por «no se entiende».
  | ({ stage: 'awaiting_new_customer_query'; notUnderstood: number } & Identification)
  | ({ stage: 'awaiting_new_customer_dni'; name: string } & Identification)
  | ({ stage: 'awaiting_new_customer_photo'; name: string; dni: string } & Identification)
  // notUnderstood: repreguntas seguidas por «no se entiende» (change asistente-informacion-general).
  | { stage: 'identified'; customerId: number; notUnderstood: number }

export type ProcessResult =
  | { status: 'CUSTOMER_STATUS_REQUESTED'; responseSent: true }
  | { status: 'CUSTOMER_STATUS_REASKED'; responseSent: true }
  | { status: 'DNI_REQUESTED'; responseSent: true }
  | { status: 'NAME_REQUESTED'; responseSent: true }
  | { status: 'NEW_CUSTOMER_OFFER_SENT'; responseSent: true }
  | { status: 'NEW_CUSTOMER_DNI_REQUESTED'; responseSent: true }
  | { status: 'PHOTO_REQUESTED'; responseSent: true }
  | { status: 'PROSPECT_HANDED_OFF'; responseSent: true }
  | { status: 'PHONE_CHANGE_PENDING'; answer: ProcessResult['status']; responseSent: true }
  | { status: 'NEW_PHONE_REQUESTED'; intent: Intent; responseSent: true }
  | { status: 'WELCOME_SENT'; responseSent: true }
  | { status: 'ANSWER_SENT'; intent: Intent; responseSent: true }
  | { status: 'CLARIFICATION_REQUESTED'; responseSent: true }
  | { status: 'AGENCY_INFO_SENT'; responseSent: true }
  | { status: 'APPROVAL_NOTICE_SENT'; intent: Intent; responseSent: true }
  | { status: 'HANDOFF_SENT'; reason: string; responseSent: true }
  | { status: 'NOT_INSURANCE_REPLIED'; responseSent: true }
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

  // Solo llegan acá las imágenes que el flujo procesa: la foto del DNI y la que llega en silencio.
  public keepImageRef(message: IncomingWhatsAppMessage): void {
    const ref = imageRefOf(message)
    if (ref) this.changes.incoming.imageRef = ref
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
    private readonly agency: AgencyInfoSource,
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
      turn.keepImageRef(message)
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
    turn.keepImageRef(message)
    const result = await this.decide(turn, stage, message, settings)
    if (!turn.hasIncomingCase) turn.receiveIn(turn.caseFor({ kind: 'identifying' }))

    const saved = await this.conversations.save(turn.changes, async () => {
      for (const reply of turn.changes.replies) await this.whatsapp.sendText(message.phone, reply.text)
    })

    if (closePrevious) this.stages.delete(closePrevious.conversationId)
    if (turn.nextStage) this.stages.set(saved.conversationId, turn.nextStage(saved))
    if (turn.changes.handoff) console.log(`[asistente] derivación: ${turn.changes.handoff.reason}`)
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
      case 'awaiting_new_customer_query':
        return this.answerNewCustomerQuery(turn, stage, text)
      case 'awaiting_new_customer_name':
        return this.collectNewCustomerName(turn, stage, text)
      case 'awaiting_new_customer_dni':
        return this.collectNewCustomerDni(turn, stage, text)
      case 'awaiting_new_customer_photo':
        return this.collectNewCustomerPhoto(turn, stage, message)
      case 'identified':
        return this.answerIdentified(turn, stage.customerId, stage.notUnderstood, text)
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
        return this.answerIdentified(turn, customer.id, 0, text, customer)
      }
    }

    if (linkedIds.length > 1) {
      const identification: Identification = { linkedIds, pending, unrecognizedDnis: 0 }
      if (findDni(text)) return this.identifyByDni(turn, identification, text, settings)
      const info = await this.agencyInfoBeforeIdentifying(
        turn,
        text,
        repeatedDniRequest,
        { stage: 'awaiting_dni', ...identification, pending: null },
      )
      if (info) return info
      const ref = turn.caseFor({ kind: 'identifying' })
      turn.receiveIn(ref)
      turn.reply(ref, firstDniRequest)
      turn.nextStage = (saved) => ({ stage: 'awaiting_dni', ...resolvePending(identification, saved) })
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    const identification: Identification = { linkedIds: [], pending, unrecognizedDnis: 0 }
    const info = await this.agencyInfoBeforeIdentifying(
      turn,
      text,
      customerStatusQuestion,
      { stage: 'awaiting_customer_status', ...identification, pending: null },
    )
    if (info) return info
    this.replyIdentifying(turn, customerStatusQuestion)
    turn.nextStage = (saved) => ({ stage: 'awaiting_customer_status', ...resolvePending(identification, saved) })
    return { status: 'CUSTOMER_STATUS_REQUESTED', responseSent: true }
  }

  private async classifyCustomerStatus(turn: Turn, stage: Identification, reply: string): Promise<ProcessResult> {
    const identification = identificationOf(stage)
    const info = await this.agencyInfoBeforeIdentifying(
      turn,
      reply,
      customerStatusQuestion,
      { stage: 'awaiting_customer_status', ...identification },
    )
    if (info) return info

    let status: CustomerStatus
    try {
      status = await this.ai.classifyCustomerStatus(maskDni(reply))
    } catch {
      return this.handoffIdentifying(turn, { kind: 'provider-failure', step: 'customer-status' })
    }

    switch (status) {
      case 'NEW_CUSTOMER':
        // El alta no empieza sola: primero se le ofrece resolver consultas o darle datos de
        // la empresa. Recién si pide contratar se le piden los documentos (RF-ATE-05).
        this.replyIdentifying(turn, newCustomerQueryOffer)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_query', notUnderstood: 0, ...identification })
        return { status: 'NEW_CUSTOMER_OFFER_SENT', responseSent: true }
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

  // Quien dijo ser cliente nuevo todavía no pidió el alta: se le ofrece resolver consultas o
  // darle datos de la empresa. Solo si pide contratar se le piden los documentos; una consulta
  // que necesita un cliente identificado vuelve a la pregunta de si ya es cliente.
  private async answerNewCustomerQuery(
    turn: Turn,
    stage: Identification & { notUnderstood: number },
    text: string,
  ): Promise<ProcessResult> {
    const identification = identificationOf(stage)
    const question = maskDni(text)
    let intent: Intent
    try {
      ;({ intent } = await this.ai.classifyIntent(question, intentContext(turn.conversation)))
    } catch {
      return this.handoffIdentifying(turn, { kind: 'provider-failure', step: 'intent' })
    }

    switch (intent) {
      case 'contratar':
        this.replyIdentifying(turn, newCustomerNameRequest)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_name', ...identification })
        return { status: 'NAME_REQUESTED', responseSent: true }
      case 'información de la agencia': {
        const ref = turn.caseFor({ kind: 'identifying' })
        turn.receiveIn(ref)
        const result = await this.sendAgencyInfo(turn, ref, question, 'incoming', intent)
        if (result.status !== 'ANSWER_SENT') {
          turn.nextStage = () => ({ stage: 'unidentified' })
          return result
        }
        turn.reply(ref, newCustomerQueryOffer)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_query', notUnderstood: 0, ...identification })
        return { status: 'AGENCY_INFO_SENT', responseSent: true }
      }
      case 'no es de seguros':
        this.replyIdentifying(turn, notInsuranceMessage)
        this.replyIdentifying(turn, newCustomerQueryOffer)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_query', notUnderstood: 0, ...identification })
        return { status: 'NOT_INSURANCE_REPLIED', responseSent: true }
      case 'saludo':
        this.replyIdentifying(turn, newCustomerQueryOffer)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_query', notUnderstood: 0, ...identification })
        return { status: 'NEW_CUSTOMER_OFFER_SENT', responseSent: true }
      case 'no se entiende': {
        const step = clarificationStep(stage.notUnderstood)
        if (step.kind === 'handoff') return this.handoffIdentifying(turn, { kind: 'not-understood' })
        this.replyIdentifying(turn, clarificationRequestFor(step.notUnderstood))
        turn.nextStage = () => ({
          stage: 'awaiting_new_customer_query',
          notUnderstood: step.notUnderstood,
          ...identification,
        })
        return { status: 'CLARIFICATION_REQUESTED', responseSent: true }
      }
      default:
        // Una consulta que necesita un cliente identificado: al no ser cliente, no tiene
        // pólizas ni datos. Se vuelve a preguntar si ya es cliente.
        this.replyIdentifying(turn, newCustomerNoDataNotice)
        this.replyIdentifying(turn, customerStatusQuestion)
        turn.nextStage = () => ({ stage: 'awaiting_customer_status', ...identification })
        return { status: 'CUSTOMER_STATUS_REQUESTED', responseSent: true }
    }
  }

  private async identifyByDni(turn: Turn, stage: Identification, text: string, settings: Settings): Promise<ProcessResult> {
    const identification = identificationOf(stage)
    const dni = findDni(text)
    if (!dni) {
      const info = await this.agencyInfoBeforeIdentifying(
        turn,
        text,
        repeatedDniRequest,
        { stage: 'awaiting_dni', ...identification },
      )
      if (info) return info
      this.replyIdentifying(turn, repeatedDniRequest)
      turn.nextStage = (saved) => ({ stage: 'awaiting_dni', ...resolvePending(identification, saved) })
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    const customer = await this.customers.findByDni(dni)
    if (customer) return this.recognized(turn, identification, customer)

    const unrecognizedDnis = identification.unrecognizedDnis + 1
    if (unrecognizedDnis > settings.maxDniRetries) return this.handoffIdentifying(turn, { kind: 'dni-unrecognized' })
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
        return this.handoffIdentifying(turn, { kind: 'dni-other-person' })
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
    turn.changes.phoneChangeRequest = { case: ref, customerId: customer.id, riskLevel: queryTypeRiskLevel('cambio de teléfono') ?? 'bajo' }
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
    turn.nextStage = () => ({ stage: 'identified', customerId: customer.id, notUnderstood: 0 })
    if (!pending) {
      turn.reply(welcomeCase ?? turn.caseFor({ kind: 'identifying' }), welcomeMessage(customer))
      return { status: 'WELCOME_SENT', responseSent: true }
    }
    const caseId = pending.answers === 'incoming' ? undefined : turn.caseOfMessage(pending.answers.existing)
    return this.answerQuery(turn, customer, { text: pending.text, answers: pending.answers, caseId }, true, 0)
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
    turn.changes.handoff = handoffOf(ref, { kind: 'new-customer' })
    turn.reply(ref, prospectHandoffMessage)
    turn.nextStage = () => ({ stage: 'unidentified' })
    return { status: 'PROSPECT_HANDED_OFF', responseSent: true }
  }

  private async answerIdentified(
    turn: Turn,
    customerId: number,
    notUnderstood: number,
    text: string,
    known?: Customer,
  ): Promise<ProcessResult> {
    turn.nextStage = () => ({ stage: 'identified', customerId, notUnderstood: 0 })
    const customer = known ?? await this.customers.findById(customerId)
    if (!customer) return this.handoffUntyped(turn, { kind: 'customer-missing' })
    const dni = findDni(text)
    if (dni && dni !== customer.dni) return this.handoffUntyped(turn, { kind: 'dni-other-person' })
    return this.answerQuery(turn, customer, { text, answers: 'incoming' }, false, notUnderstood)
  }

  private async answerQuery(
    turn: Turn,
    customer: Customer,
    query: { text: string; answers: QueryRef; caseId?: number },
    welcomeIfUnrelated: boolean,
    notUnderstood: number,
  ): Promise<ProcessResult> {
    const question = maskDni(query.text)
    const caseFor = (intent: Intent): CaseRef => {
      const ref = turn.caseFor({ kind: 'intent', intent, ...(query.caseId === undefined ? {} : { caseId: query.caseId }) })
      if (query.answers === 'incoming' && !turn.hasIncomingCase) turn.receiveIn(ref)
      return ref
    }

    // El contexto son los mensajes anteriores al que se responde: para la consulta guardada,
    // los anteriores a ella, no el intercambio de la identificación.
    const context = intentContext(turn.conversation, query.answers === 'incoming' ? undefined : query.answers.existing)
    let intent: Intent
    let urgency: Urgency | null
    try {
      ({ intent, urgency } = await this.ai.classifyIntent(question, context))
    } catch {
      return this.handoffIn(turn, caseFor('otra consulta'), { kind: 'provider-failure', step: 'intent' })
    }

    const action = actionForIntent(intent)
    const ref = caseFor(intent)
    switch (action.kind) {
      case 'unrelated':
        // La consulta guardada antes de identificarse recibe la bienvenida; un mensaje del
        // cliente identificado, el texto fijo, sin redacción ni derivación.
        if (welcomeIfUnrelated) {
          turn.reply(ref, welcomeMessage(customer), query.answers)
          return { status: 'WELCOME_SENT', responseSent: true }
        }
        turn.reply(ref, notInsuranceMessage, query.answers)
        return { status: 'NOT_INSURANCE_REPLIED', responseSent: true }
      case 'handoff':
        return this.handoffIn(turn, ref, { kind: 'intent', intent }, query.answers, { intent, urgency })
      case 'register':
        // Un cliente identificado que pide contratar: ya es cliente, no hay alta que hacer.
        return this.handoffIn(turn, ref, { kind: 'intent', intent }, query.answers, { intent, urgency })
      case 'clarify': {
        // La repregunta no pasa por la redacción del proveedor de IA, y cada intento usa una
        // redacción distinta para no repetir el mismo mensaje.
        const step = clarificationStep(notUnderstood)
        if (step.kind === 'handoff') return this.handoffIn(turn, ref, { kind: 'not-understood' }, query.answers, { intent })
        turn.reply(ref, clarificationRequestFor(step.notUnderstood), query.answers)
        turn.nextStage = () => ({ stage: 'identified', customerId: customer.id, notUnderstood: step.notUnderstood })
        return { status: 'CLARIFICATION_REQUESTED', responseSent: true }
      }
      case 'approval':
        if (intent === 'cambio de teléfono') {
          turn.reply(ref, useNewPhoneRequest, query.answers)
          return { status: 'NEW_PHONE_REQUESTED', intent, responseSent: true }
        }
        turn.changes.handoff = handoffOf(ref, { kind: 'approval', intent }, { intent })
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
    if (templateKind === 'agency') return this.sendAgencyInfo(turn, ref, question, answers, intent)
    // Sin pólizas no hay dato para vencimientos, estados ni saldo (RF-ATE-02).
    if (templateKind !== 'courtesy' && customer.policies.length === 0) {
      return this.handoffIn(turn, ref, { kind: 'missing-data', data: 'policies' }, answers, { intent })
    }
    if (templateKind === 'balance') {
      // Sin cuotas registradas no hay saldo: se deriva sin pedir la redacción (RF-ATE-02). La
      // redacción se controla en orden, para que no cambie cuotas vencidas por por vencer.
      const template = balanceTemplate(customer, this.clock())
      if (!template) return this.handoffIn(turn, ref, { kind: 'missing-data', data: 'installments' }, answers, { intent })
      return this.sendRewritten(turn, ref, { template, literals: [] }, question, answers, intent, true)
    }
    const template = this.fillTemplate(customer, templateKind)
    return this.sendRewritten(turn, ref, { template, literals: [] }, question, answers, intent)
  }

  // La información de la agencia, que no es de ningún cliente (RF-ATE-06). Si falta un dato,
  // se deriva (RF-ATE-02).
  private async sendAgencyInfo(turn: Turn, ref: CaseRef, question: string, answers: QueryRef, intent: Intent): Promise<ProcessResult> {
    const answer = agencyInfoAnswer(await this.agency.read())
    if (!answer) return this.handoffIn(turn, ref, { kind: 'missing-data', data: 'agency-info' }, answers, { intent })
    return this.sendRewritten(turn, ref, answer, question, answers, intent)
  }

  private async sendRewritten(
    turn: Turn,
    ref: CaseRef,
    filled: AgencyInfoAnswer,
    question: string,
    answers: QueryRef,
    intent: Intent,
    ordered = false,
  ): Promise<ProcessResult> {
    let draft: string
    try {
      draft = await this.ai.rewrite({ template: filled.template, question })
    } catch {
      return this.handoffIn(turn, ref, { kind: 'provider-failure', step: 'rewrite' }, answers, { intent })
    }
    const check = checkRewrite(filled.template, draft, filled.literals, ordered)
    if (!check.ok) {
      turn.changes.rejectedDraft = { text: draft, answers }
      return this.handoffIn(turn, ref, { kind: 'rewrite-rejected', detail: check.reason }, answers, { intent })
    }

    turn.reply(ref, draft, answers)
    return { status: 'ANSWER_SENT', intent, responseSent: true }
  }

  private fillTemplate(customer: Customer, templateKind: Exclude<AnswerTemplate, 'agency' | 'balance'>): string {
    switch (templateKind) {
      case 'expirations':
        return expirationsTemplate(customer, this.clock())
      case 'statuses':
        return statusesTemplate(customer, this.clock())
      case 'courtesy':
        return courtesyTemplate(customer)
    }
  }

  // Antes de identificarse, un mensaje sin DNI puede pedir la información de la agencia,
  // que no es de ningún cliente (RF-ATE-06): se responde en el caso de la identificación y se
  // repite la pregunta pendiente, sin cambiar la etapa ni contar un intento de DNI. Con otra
  // intención, o si el proveedor de IA falla, devuelve null y la identificación sigue igual.
  private async agencyInfoBeforeIdentifying(turn: Turn, text: string, followUp: string, stay: Stage): Promise<ProcessResult | null> {
    if (findDni(text)) return null
    const question = maskDni(text)
    let intent: Intent
    try {
      // La urgencia solo sirve para el nivel de una derivación: acá no se deriva.
      intent = (await this.ai.classifyIntent(question, intentContext(turn.conversation))).intent
    } catch {
      return null
    }
    if (intent !== 'información de la agencia') return null

    const ref = turn.caseFor({ kind: 'identifying' })
    turn.receiveIn(ref)
    const result = await this.sendAgencyInfo(turn, ref, question, 'incoming', intent)
    if (result.status !== 'ANSWER_SENT') {
      // Se derivó: al volver a atender, la identificación empieza de nuevo.
      turn.nextStage = () => ({ stage: 'unidentified' })
      return result
    }
    turn.reply(ref, followUp)
    turn.nextStage = () => stay
    return { status: 'AGENCY_INFO_SENT', responseSent: true }
  }

  // Respuesta mientras la persona se identifica: va al caso actual, con el mensaje.
  private replyIdentifying(turn: Turn, text: string): void {
    const ref = turn.caseFor({ kind: 'identifying' })
    turn.receiveIn(ref)
    turn.reply(ref, text)
  }

  // Al volver a atender después del silencio, la identificación empieza de nuevo.
  private handoffIdentifying(turn: Turn, reason: HandoffReason): ProcessResult {
    const ref = turn.caseFor({ kind: 'identifying' })
    turn.receiveIn(ref)
    turn.nextStage = () => ({ stage: 'unidentified' })
    return this.handoffIn(turn, ref, reason)
  }

  private handoffUntyped(turn: Turn, reason: HandoffReason): ProcessResult {
    const ref = turn.caseFor({ kind: 'untyped-handoff' })
    turn.receiveIn(ref)
    return this.handoffIn(turn, ref, reason)
  }

  // query: la consulta que se deriva, con la intención elegida y, si hubo, la urgencia.
  private handoffIn(
    turn: Turn,
    ref: CaseRef,
    reason: HandoffReason,
    answers: QueryRef = 'incoming',
    query: ClassifiedQuery | null = null,
  ): ProcessResult {
    const handoff = handoffOf(ref, reason, query)
    turn.changes.handoff = handoff
    turn.reply(ref, handoffMessage, answers)
    return { status: 'HANDOFF_SENT', reason: handoff.reason, responseSent: true }
  }
}

type ClassifiedQuery = { intent: Intent; urgency?: Urgency | null }

// El motivo que se guarda y el nivel de riesgo del caso derivado (change bandeja-atencion-lectura):
// el tipo de la consulta es la intención si es un tipo del catálogo.
function handoffOf(ref: CaseRef, reason: HandoffReason, query: ClassifiedQuery | null = null): { case: CaseRef; reason: string; riskLevel: RiskLevel } {
  const caseType = query && isQueryType(query.intent) ? query.intent : null
  const riskLevel = handoffRiskLevel({ reason, caseType, urgency: query?.urgency ?? null })
  return { case: ref, reason: describeHandoffReason(reason), riskLevel }
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

// El id del mensaje de WhatsApp de una imagen, si entra en la columna (VARCHAR(255)).
export function imageRefOf(message: IncomingWhatsAppMessage): string | null {
  if (message.media !== 'image') return null
  const ref = message.messageId.trim()
  return ref.length > 0 && ref.length <= 255 ? ref : null
}

function messageTextForCase(message: IncomingWhatsAppMessage): string {
  if (message.media === 'image') return silencedImageText
  return message.text
}

function containsQuestionOutsideDni(text: string): boolean {
  return maskDni(text).replace(/\[DNI\]/g, '').replace(/[^\p{L}]/gu, '').trim().length > 0
}
