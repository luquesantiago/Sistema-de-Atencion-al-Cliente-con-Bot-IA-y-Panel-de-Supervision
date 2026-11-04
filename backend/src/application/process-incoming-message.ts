import { agencyInfoAnswer, type AgencyInfoAnswer, type AgencyInfoSource } from '../domain/agency-info.js'
import type { AiClient, ContextMessage, CustomerStatus, DataChangeExtraction } from '../domain/ai-client.js'
import { balanceTemplate } from '../domain/balance.js'
import {
  caseForMessage,
  isQueryType,
  endByDeactivation,
  endByInactivity,
  endByRestart,
  freshGreeting,
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
import { routeDataChange, type DataChangeRoute, type DataChangeTargetField } from '../domain/data-change.js'
import { findDni, maskDni } from '../domain/dni.js'
import { describeHandoffReason, type HandoffReason } from '../domain/handoff.js'
import { actionForIntent, clarificationStep, type AnswerTemplate, type Intent } from '../domain/intent.js'
import type { IncomingWhatsAppMessage } from '../domain/message.js'
import { checkRewrite } from '../domain/rewrite-check.js'
import { handoffRiskLevel, queryTypeRiskLevel, type RiskLevel, type Urgency } from '../domain/risk-level.js'
import {
  approvalNotice,
  anotherQueryQuestion,
  assistanceMessage,
  clarificationRequestFor,
  customerStatusQuestion,
  customerStatusRetryQuestion,
  courtesyTemplate,
  customerDataTemplate,
  customerPoliciesTemplate,
  dataChangeFieldQuestion,
  dataChangeValueQuestion,
  existingCustomerDniRequest,
  expirationsTemplate,
  firstDniRequest,
  handoffMessage,
  newCustomerDniRequest,
  newCustomerNameRequest,
  newCustomerNoDataAndOffer,
  newCustomerNoDataNotice,
  newCustomerPhotoRequest,
  newCustomerPhotoRetryRequest,
  newCustomerQueryOffer,
  notIdentifiedDataNotice,
  notIdentifiedPoliciesNotice,
  notInsuranceAndNewCustomerOffer,
  notInsuranceMessage,
  paymentMethodsMessage,
  phoneChangePendingMessage,
  phoneChangeStillPendingMessage,
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
  // El DNI coincidió desde un número no vinculado: hasta que se apruebe el cambio de
  // teléfono, el número no identifica al cliente (decisión de Santiago del 29/10/2026).
  | { stage: 'awaiting_phone_change'; customerId: number }
  // notUnderstood: repreguntas seguidas por «no se entiende» (change asistente-informacion-general).
  // revalidated: la identificación se hizo con el cliente inactivo (por DNI después de la
  // baja): no se vuelve a reiniciar la sesión en cada mensaje.
  | { stage: 'identified'; customerId: number; notUnderstood: number; revalidated: boolean }
  // Pidiendo los datos de un cambio de nombre o apellido (change cambio-datos-cliente).
  // pendingField: el dato que se pidió, null si todavía no se sabe cuál; notUnderstood:
  // repreguntas seguidas; revalidated, lo mismo que en identified.
  | { stage: 'data_change_requested'; customerId: number; pendingField: DataChangeTargetField | null; notUnderstood: number; revalidated: boolean }

type IdentifiedStage = Extract<Stage, { stage: 'identified' }>

export type ProcessResult =
  | { status: 'CUSTOMER_STATUS_REQUESTED'; responseSent: true }
  | { status: 'CUSTOMER_STATUS_REASKED'; responseSent: true }
  | { status: 'DNI_REQUESTED'; responseSent: true }
  | { status: 'NAME_REQUESTED'; responseSent: true }
  | { status: 'NEW_CUSTOMER_OFFER_SENT'; responseSent: true }
  | { status: 'NEW_CUSTOMER_DNI_REQUESTED'; responseSent: true }
  | { status: 'PHOTO_REQUESTED'; responseSent: true }
  | { status: 'PROSPECT_HANDED_OFF'; responseSent: true }
  // answer: lo que se hizo con la consulta escrita antes de identificarse, si se respondió.
  | { status: 'PHONE_CHANGE_PENDING'; answer?: ProcessResult['status']; responseSent: true }
  | { status: 'PHONE_CHANGE_STILL_PENDING'; responseSent: true }
  | { status: 'NEW_PHONE_REQUESTED'; intent: Intent; responseSent: true }
  | { status: 'CUSTOMER_DATA_SENT'; intent: Intent; responseSent: true }
  | { status: 'CUSTOMER_POLICIES_SENT'; intent: Intent; responseSent: true }
  | { status: 'NEW_CUSTOMER_NO_DATA'; responseSent: true }
  | { status: 'IDENTIFICATION_REQUIRED'; responseSent: true }
  | { status: 'WELCOME_SENT'; responseSent: true }
  | { status: 'ANSWER_SENT'; intent: Intent; responseSent: true }
  | { status: 'CLARIFICATION_REQUESTED'; responseSent: true }
  | { status: 'AGENCY_INFO_SENT'; responseSent: true }
  // Los medios de pago antes de identificarse o en la oferta al cliente nuevo, con la
  // pregunta pendiente en el mismo turno (change configuracion-agencia).
  | { status: 'PAYMENT_METHODS_SENT'; responseSent: true }
  | { status: 'APPROVAL_NOTICE_SENT'; intent: Intent; responseSent: true }
// Pregunta del flujo de cambio de datos enviada (campo o valor que falta).
  | { status: 'DATA_CHANGE_REQUESTED'; responseSent: true }
  // Solicitud de cambio de datos creada en Trámites, con el aviso al cliente (sin derivar).
  | { status: 'DATA_CHANGE_NOTICE_SENT'; responseSent: true }
  | { status: 'HANDOFF_SENT'; reason: string; responseSent: boolean }
  | { status: 'NOT_INSURANCE_REPLIED'; responseSent: true }
  | { status: 'IGNORED_MEDIA'; responseSent: false }
  | { status: 'SILENCED'; responseSent: false }
  | { status: 'BLOCKED'; responseSent: false }
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
    // Si con lo que se está charlando todavía corresponde saludar con «Hola» (freshGreeting).
    public readonly greetingFresh: boolean = true,
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
    // Número bloqueado desde la bandeja: si lo está, el mensaje no se procesa ni se guarda.
    private readonly phoneBlocked: (phone: string) => Promise<boolean> = async () => false,
  ) {}

  public async execute(message: IncomingWhatsAppMessage): Promise<ProcessResult> {
    if (await this.phoneBlocked(message.phone)) {
      console.log('[asistente] número bloqueado: mensaje ignorado')
      return { status: 'BLOCKED', responseSent: false }
    }
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
    // El «Hola» se decide con la conversación abierta o, si esta termina por inactividad o
    // reinicio, con la que terminó: la charla reciente no vuelve a saludar.
    const greetingFresh = freshGreeting(open, at)

    const threatDetected = await this.checkThreat(message)
    if (threatDetected) {
      const turn = new Turn(open, message.phone, at, messageTextForCase(message), undefined, greetingFresh)
      turn.keepImageRef(message)
      const ref = turn.caseFor(open?.suspended ? { kind: 'suspended' } : { kind: 'identifying' })
      turn.receiveIn(ref)
      turn.changes.blockPhone = true
      turn.changes.threatDetected = ref
      if (!open?.cases.some((item) => item.handedOff && item.closedAt === null)) {
        turn.changes.handoff = handoffOf(ref, { kind: 'threat-detected' })
      }
      await this.conversations.save(turn.changes, async () => {})
      return { status: 'HANDOFF_SENT', reason: 'mensaje sospechoso: posible intento de manipulación o exfiltración', responseSent: false }
    }

    if (open?.suspended) {
      const turn = new Turn(open, message.phone, at, messageTextForCase(message), undefined, greetingFresh)
      turn.keepImageRef(message)
      turn.receiveIn(turn.caseFor({ kind: 'suspended' }))
      await this.conversations.save(turn.changes, async () => {})
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

    // Baja del cliente con la sesión identificada abierta: la sesión se invalida y el mismo
    // mensaje empieza un chat nuevo, que vuelve a pedir la identificación. Si la etapa ya se
    // revalidó (DNI después de la baja) o el cliente está activo, se reutiliza la lectura.
    let known: Customer | undefined
    if (conversation && (stage?.stage === 'identified' || stage?.stage === 'data_change_requested') && !stage.revalidated) {
      const current = await this.customers.findById(stage.customerId)
      if (current && !current.active) {
        closePrevious = { conversationId: conversation.id, ...endByDeactivation(conversation, at) }
        conversation = null
        stage = undefined
      } else {
        known = current ?? undefined
      }
    }

    const text = message.media === 'image' ? prospectPhotoText : message.text
    const turn = new Turn(conversation, message.phone, at, text, closePrevious, greetingFresh)
    turn.keepImageRef(message)
    const result = await this.decide(turn, stage, message, settings, known)
    if (!turn.hasIncomingCase) turn.receiveIn(turn.caseFor({ kind: 'identifying' }))

    const saved = await this.conversations.save(turn.changes, async () => {
      for (const reply of turn.changes.replies) await this.whatsapp.sendText(message.phone, reply.text)
    })

    if (closePrevious) this.stages.delete(closePrevious.conversationId)
    if (turn.nextStage) this.stages.set(saved.conversationId, turn.nextStage(saved))
    return result
  }

  private async decide(
    turn: Turn,
    stage: Stage | undefined,
    message: IncomingWhatsAppMessage,
    settings: Settings,
    known?: Customer,
  ): Promise<ProcessResult> {
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
      case 'awaiting_phone_change':
        return this.whilePhoneChangePending(turn, stage.customerId, text, settings)
      case 'identified':
        // El número pudo desvincularse durante la conversación: sin el vínculo, el mensaje se
        // atiende como el primero de una conversación nueva (decisión de Santiago del
        // 29/10/2026). isPhoneLinkedTo no mira la baja: esa ya la resolvió process.
        if (!(await this.customers.isPhoneLinkedTo(turn.changes.phone, stage.customerId))) {
          return this.start(turn, text, settings)
        }
        return this.answerIdentified(turn, stage, text, known)
      case 'data_change_requested':
        return this.continueDataChange(turn, stage, text, known)
    }
  }

  // Con el cambio de teléfono pendiente, solo se responde la información de la agencia y se
  // deriva lo urgente; lo demás recibe el aviso de que sigue pendiente. Cuando se decide, el
  // mensaje se atiende como el primero de una conversación nueva: aprobado, el número ya
  // identifica al cliente; rechazado, se vuelve a preguntar si ya es cliente.
  private async whilePhoneChangePending(turn: Turn, customerId: number, text: string, settings: Settings): Promise<ProcessResult> {
    const { phone } = turn.changes
    const linkedIds = await this.customers.linkedCustomerIds(phone)
    if (linkedIds.length > 0 || !(await this.conversations.hasPendingPhoneChange(phone, customerId))) {
      return this.start(turn, text, settings)
    }
    turn.nextStage = () => ({ stage: 'awaiting_phone_change', customerId })
    const answered = await this.answerWhilePhoneChangePending(turn, { answers: 'incoming', text })
    if ('result' in answered) return answered.result
    const ref = turn.caseFor(answered.intent ? { kind: 'intent', intent: answered.intent } : { kind: 'identifying' })
    turn.receiveIn(ref)
    turn.reply(ref, phoneChangeStillPendingMessage)
    return { status: 'PHONE_CHANGE_STILL_PENDING', responseSent: true }
  }

  // La información de la agencia y los medios de pago no son de ningún cliente (RF-ATE-06) y
  // el siniestro, el reclamo y la grúa no esperan a la aprobación: se derivan. Con otra
  // intención no responde nada y devuelve la intención; si el proveedor de IA falla, devuelve null.
  private async answerWhilePhoneChangePending(
    turn: Turn,
    query: PendingQuery,
  ): Promise<{ result: ProcessResult } | { intent: Intent | null }> {
    const question = maskDni(query.text)
    const existing = query.answers === 'incoming' ? undefined : query.answers.existing
    let intent: Intent
    let urgency: Urgency | null
    try {
      ({ intent, urgency } = await this.ai.classifyIntent(question, intentContext(turn.conversation, existing)))
    } catch {
      return { intent: null }
    }
    if (!['información de la agencia', 'medios de pago', 'asistencia mecánica', 'siniestro', 'reclamo'].includes(intent)) {
      return { intent }
    }

    const caseId = existing === undefined ? undefined : turn.caseOfMessage(existing)
    const ref = turn.caseFor({ kind: 'intent', intent, ...(caseId === undefined ? {} : { caseId }) })
    if (query.answers === 'incoming' && !turn.hasIncomingCase) turn.receiveIn(ref)
    if (intent === 'información de la agencia') {
      return { result: await this.sendAgencyInfo(turn, ref, question, query.answers, intent) }
    }
    if (intent === 'medios de pago') return { result: await this.sendPaymentMethods(turn, ref, query.answers, intent) }
    if (intent === 'asistencia mecánica') return { result: await this.handoffAssistance(turn, ref, query.answers, intent, urgency) }
    return { result: this.handoffIn(turn, ref, { kind: 'intent', intent }, query.answers, { intent, urgency }) }
  }

  // Primer mensaje de la conversación (reglas 1 y 2 de AGENTS.md).
  private async start(turn: Turn, text: string, settings: Settings): Promise<ProcessResult> {
    const linkedIds = await this.customers.linkedCustomerIds(turn.changes.phone)
    const pending: PendingQuery | null = containsQuestionOutsideDni(text) ? { answers: 'incoming', text } : null

    if (linkedIds.length === 1 && linkedIds[0] !== undefined) {
      const customer = await this.customers.findById(linkedIds[0])
      if (customer) {
        turn.changes.customerId = customer.id
        return this.answerIdentified(
          turn,
          { stage: 'identified', customerId: customer.id, notUnderstood: 0, revalidated: false },
          text,
          customer,
        )
      }
    }

    if (linkedIds.length > 1) {
      const identification: Identification = { linkedIds, pending, unrecognizedDnis: 0 }
      if (findDni(text)) return this.identifyByDni(turn, identification, text, settings)
      const info = await this.replyBeforeIdentifying(
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
    const info = await this.replyBeforeIdentifying(
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
    const info = await this.replyBeforeIdentifying(
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
      return this.clarifyNewCustomer(turn, stage, { kind: 'provider-failure', step: 'intent' })
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
      case 'medios de pago': {
        const ref = turn.caseFor({ kind: 'identifying' })
        turn.receiveIn(ref)
        const result = await this.sendPaymentMethods(turn, ref, 'incoming', intent)
        if (result.status !== 'ANSWER_SENT') {
          turn.nextStage = () => ({ stage: 'unidentified' })
          return result
        }
        turn.reply(ref, newCustomerQueryOffer)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_query', notUnderstood: 0, ...identification })
        return { status: 'PAYMENT_METHODS_SENT', responseSent: true }
      }
      case 'asistencia mecánica': {
        // Quien pide una grúa no espera a ser cliente: recibe el teléfono y se deriva.
        const ref = turn.caseFor({ kind: 'identifying' })
        turn.receiveIn(ref)
        turn.nextStage = () => ({ stage: 'unidentified' })
        return this.handoffAssistance(turn, ref, 'incoming', intent, null)
      }
      case 'no es de seguros':
        this.replyIdentifying(turn, notInsuranceAndNewCustomerOffer)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_query', notUnderstood: 0, ...identification })
        return { status: 'NOT_INSURANCE_REPLIED', responseSent: true }
      case 'saludo':
        this.replyIdentifying(turn, newCustomerQueryOffer)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_query', notUnderstood: 0, ...identification })
        return { status: 'NEW_CUSTOMER_OFFER_SENT', responseSent: true }
      case 'mis datos':
      case 'mis pólizas':
        // Todavía no es cliente: no tiene datos ni pólizas que mostrar, y se vuelve a
        // ofrecer en el mismo mensaje, sin mandar dos envíos seguidos.
        this.replyIdentifying(turn, newCustomerNoDataAndOffer)
        turn.nextStage = () => ({ stage: 'awaiting_new_customer_query', notUnderstood: 0, ...identification })
        return { status: 'NEW_CUSTOMER_NO_DATA', responseSent: true }
      case 'no se entiende':
        return this.clarifyNewCustomer(turn, stage, { kind: 'not-understood' })
      default:
        // Una consulta que necesita un cliente identificado: al no ser cliente, no tiene
        // pólizas ni datos. Se vuelve a preguntar si ya es cliente.
        this.replyIdentifying(turn, newCustomerNoDataNotice)
        this.replyIdentifying(turn, customerStatusQuestion)
        turn.nextStage = () => ({ stage: 'awaiting_customer_status', ...identification })
        return { status: 'CUSTOMER_STATUS_REQUESTED', responseSent: true }
    }
  }

  // No se pudo decidir el mensaje (no se entendió o falló el proveedor de IA): se repregunta con
  // una redacción distinta por intento, sin derivar de entrada. Recién con las repreguntas
  // agotadas se deriva con `reason`.
  private clarifyNewCustomer(
    turn: Turn,
    stage: Identification & { notUnderstood: number },
    reason: HandoffReason,
  ): ProcessResult {
    const step = clarificationStep(stage.notUnderstood)
    if (step.kind === 'handoff') return this.handoffIdentifying(turn, reason)
    this.replyIdentifying(turn, clarificationRequestFor(step.notUnderstood))
    turn.nextStage = () => ({
      stage: 'awaiting_new_customer_query',
      notUnderstood: step.notUnderstood,
      ...identificationOf(stage),
    })
    return { status: 'CLARIFICATION_REQUESTED', responseSent: true }
  }

  private async identifyByDni(turn: Turn, stage: Identification, text: string, settings: Settings): Promise<ProcessResult> {
    const identification = identificationOf(stage)
    const dni = findDni(text)
    if (!dni) {
      const info = await this.replyBeforeIdentifying(
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

  // El DNI es de un cliente de la cartera: si el número está vinculado a ese cliente (aunque
  // esté inactivo) se identifica; si el número está vinculado a otros, es el DNI de otra
  // persona; si no está vinculado a nadie, se pide el cambio de teléfono (regla 9).
  private async recognized(turn: Turn, identification: Identification, customer: Customer): Promise<ProcessResult> {
    const linkedHere = await this.customers.isPhoneLinkedTo(turn.changes.phone, customer.id)
    if (!linkedHere && identification.linkedIds.length > 0) {
      return this.handoffIdentifying(turn, { kind: 'dni-other-person' })
    }
    turn.changes.customerId = customer.id
    if (!linkedHere) {
      const ref = turn.caseFor({ kind: 'phone-change-request' })
      turn.receiveIn(ref)
      turn.changes.phoneChangeRequest = { case: ref, customerId: customer.id, riskLevel: queryTypeRiskLevel('cambio de teléfono') ?? 'bajo' }
      turn.reply(ref, phoneChangePendingMessage)
      turn.nextStage = () => ({ stage: 'awaiting_phone_change', customerId: customer.id })
      // La consulta escrita antes de identificarse solo se responde si se respondería con el
      // cambio pendiente; si no, el aviso ya dice que se responderá al aprobarse.
      const answered = identification.pending ? await this.answerWhilePhoneChangePending(turn, identification.pending) : null
      return {
        status: 'PHONE_CHANGE_PENDING',
        ...(answered && 'result' in answered ? { answer: answered.result.status } : {}),
        responseSent: true,
      }
    }
    // Con la consulta en este mismo mensaje, el mensaje va al caso de la consulta.
    if (identification.pending?.answers === 'incoming') {
      return this.answerAfterIdentifying(turn, customer, identification.pending, null)
    }
    const ref = turn.caseFor({ kind: 'identifying' })
    turn.receiveIn(ref)
    return this.answerAfterIdentifying(turn, customer, identification.pending, ref)
  }

  private async answerAfterIdentifying(
    turn: Turn,
    customer: Customer,
    pending: PendingQuery | null,
    welcomeCase: CaseRef | null,
  ): Promise<ProcessResult> {
    // Si se identificó con el cliente inactivo (DNI después de la baja), la etapa queda
    // revalidada: no se vuelve a reiniciar la sesión en cada mensaje.
    turn.nextStage = () => ({
      stage: 'identified',
      customerId: customer.id,
      notUnderstood: 0,
      revalidated: !customer.active,
    })
    if (!pending) {
      turn.reply(welcomeCase ?? turn.caseFor({ kind: 'identifying' }), welcomeMessage(customer, turn.greetingFresh))
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
    stage: IdentifiedStage,
    text: string,
    known?: Customer,
  ): Promise<ProcessResult> {
    const customer = known ?? await this.customers.findById(stage.customerId)
    if (!customer) {
      // La fila ya no existe: se deriva. La baja lógica no llega acá (reinicia la sesión).
      turn.nextStage = () => ({ ...stage, notUnderstood: 0 })
      return this.handoffUntyped(turn, { kind: 'customer-missing' })
    }
    // revalidated se recalcula contra el estado actual: si el cliente está inactivo y la
    // etapa no lo estaba, la sesión ya se habría reiniciado antes de llegar acá.
    turn.nextStage = () => ({
      stage: 'identified',
      customerId: stage.customerId,
      notUnderstood: 0,
      revalidated: !customer.active,
    })
    const dni = findDni(text)
    if (dni && dni !== customer.dni) return this.handoffUntyped(turn, { kind: 'dni-other-person' })
    return this.answerQuery(turn, customer, { text, answers: 'incoming' }, false, stage.notUnderstood)
  }

  private async answerQuery(
    turn: Turn,
    customer: Customer,
    query: { text: string; answers: QueryRef; caseId?: number },
    welcomeIfUnrelated: boolean,
    notUnderstood: number,
    // La intención ya elegida (el flujo de cambio de datos que salió de su estado): si
    // viene, no se vuelve a clasificar el mensaje.
    classified: { intent: Intent; urgency: Urgency | null } | null = null,
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
    if (classified) {
      ({ intent, urgency } = classified)
    } else {
      try {
        ({ intent, urgency } = await this.ai.classifyIntent(question, context))
      } catch {
        // No se pudo decidir la intención: se repregunta como si no se entendiera, sin derivar de
        // entrada. Recién con las repreguntas agotadas se deriva por falla del proveedor.
        const step = clarificationStep(notUnderstood)
        const ref = caseFor('otra consulta')
        if (step.kind === 'handoff') return this.handoffIn(turn, ref, { kind: 'provider-failure', step: 'intent' }, query.answers)
        turn.reply(ref, clarificationRequestFor(step.notUnderstood), query.answers)
        turn.nextStage = () => ({
          stage: 'identified',
          customerId: customer.id,
          notUnderstood: step.notUnderstood,
          revalidated: !customer.active,
        })
        return { status: 'CLARIFICATION_REQUESTED', responseSent: true }
      }
    }

    const action = actionForIntent(intent)
    const ref = caseFor(intent)
    switch (action.kind) {
      case 'unrelated':
        // La consulta guardada antes de identificarse recibe la bienvenida; un mensaje del
        // cliente identificado, el texto fijo, sin redacción ni derivación.
        if (welcomeIfUnrelated) {
          turn.reply(ref, welcomeMessage(customer, turn.greetingFresh), query.answers)
          return { status: 'WELCOME_SENT', responseSent: true }
        }
        turn.reply(ref, notInsuranceMessage, query.answers)
        return { status: 'NOT_INSURANCE_REPLIED', responseSent: true }
      case 'handoff':
        return this.handoffIn(turn, ref, { kind: 'intent', intent }, query.answers, { intent, urgency })
      case 'register':
        // Un cliente identificado que pide contratar: ya es cliente, no hay alta que hacer.
        return this.handoffIn(turn, ref, { kind: 'intent', intent }, query.answers, { intent, urgency })
      case 'assistance':
        return this.handoffAssistance(turn, ref, query.answers, intent, urgency)
      case 'payment-methods':
        return this.sendPaymentMethods(turn, ref, query.answers, intent)
      case 'my-data': {
        // Los datos personales salen de la cartera y no pasan por la redacción del
        // proveedor de IA: tienen que llegar tal cual. Al final, en el mismo mensaje, se
        // le pregunta si tiene alguna otra consulta.
        const detail = await this.customers.findCustomerDetail(customer.id)
        const phones = detail?.phones.map((phone) => phone.number) ?? []
        turn.reply(ref, `${customerDataTemplate(customer, phones)}\n\n${anotherQueryQuestion}`, query.answers)
        return { status: 'CUSTOMER_DATA_SENT', intent, responseSent: true }
      }
      case 'my-policies': {
        // El listado de pólizas tampoco pasa por la redacción del proveedor de IA, y sin
        // pólizas se le avisa en vez de derivar por dato faltante. Al final, en el mismo
        // mensaje, se le pregunta si tiene alguna otra consulta.
        turn.reply(ref, `${customerPoliciesTemplate(customer, this.clock())}\n\n${anotherQueryQuestion}`, query.answers)
        return { status: 'CUSTOMER_POLICIES_SENT', intent, responseSent: true }
      }
      case 'clarify': {
        // La repregunta no pasa por la redacción del proveedor de IA, y cada intento usa una
        // redacción distinta para no repetir el mismo mensaje.
        const step = clarificationStep(notUnderstood)
        if (step.kind === 'handoff') return this.handoffIn(turn, ref, { kind: 'not-understood' }, query.answers, { intent })
        turn.reply(ref, clarificationRequestFor(step.notUnderstood), query.answers)
        turn.nextStage = () => ({
          stage: 'identified',
          customerId: customer.id,
          notUnderstood: step.notUnderstood,
          revalidated: !customer.active,
        })
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
      case 'data-change':
        // Quiere cambiar un dato personal: el modelo extrae campo y valor y el código
        // decide el destino (change cambio-datos-cliente).
        return this.startDataChange(turn, ref, customer, question, query.answers, context)
      case 'answer':
        return this.sendRewrittenAnswer(turn, ref, customer, question, query.answers, intent, action.template)
    }
  }

  // Arranca un pedido de cambio de nombre o apellido: el modelo solo extrae campo y valor,
  // y el código decide si pide el dato que falta, si es un teléfono (regla 9) o si arma la
  // solicitud de Trámites (change cambio-datos-cliente).
  private async startDataChange(
    turn: Turn,
    ref: CaseRef,
    customer: Customer,
    question: string,
    answers: QueryRef,
    context: readonly ContextMessage[],
  ): Promise<ProcessResult> {
    let route: DataChangeRoute
    try {
      route = routeDataChange(await this.ai.extractDataChange(question, context))
    } catch {
      // Falla del proveedor al extraer: se pide el dato como si se hubiera entendido la
      // consulta, sin mencionar la falla; si vuelve a fallar, se deriva desde el estado.
      route = { kind: 'ask-field' }
    }
    return this.applyDataChange(turn, ref, customer, route, null, 0, answers)
  }

  // El asistente ya preguntó qué dato o qué valor hace falta y el cliente volvió a escribir.
  private async continueDataChange(
    turn: Turn,
    stage: Extract<Stage, { stage: 'data_change_requested' }>,
    text: string,
    known?: Customer,
  ): Promise<ProcessResult> {
    const customer = known ?? await this.customers.findById(stage.customerId)
    if (!customer) {
      // La fila ya no existe: se deriva, como en la sesión identificada. La baja lógica no
      // llega acá (reinicia la sesión).
      turn.nextStage = () => ({ ...stage, notUnderstood: 0 })
      return this.handoffUntyped(turn, { kind: 'customer-missing' })
    }
    // Por defecto la sesión vuelve a la identificada: los caminos que siguen en el flujo lo
    // pisan con dataChangeStage.
    turn.nextStage = () => identifiedStageOf(customer)
    const question = maskDni(text)
    const ref = turn.caseFor({ kind: 'intent', intent: 'cambio de datos' })
    if (!turn.hasIncomingCase) turn.receiveIn(ref)
    const context = intentContext(turn.conversation)

    let extraction: DataChangeExtraction
    try {
      extraction = await this.ai.extractDataChange(question, context, stage.pendingField)
    } catch {
      return this.reaskDataChange(turn, ref, customer, stage.pendingField, stage.notUnderstood, { kind: 'provider-failure', step: 'intent' }, 'incoming')
    }

    const route = routeDataChange(extraction)
    if (route.kind !== 'ask-field') return this.applyDataChange(turn, ref, customer, route, stage.pendingField, stage.notUnderstood, 'incoming')

    // No se pudo extraer el campo: ¿sigue siendo un cambio de datos o es otra consulta?
    let intent: Intent
    let urgency: Urgency | null
    try {
      ({ intent, urgency } = await this.ai.classifyIntent(question, context))
    } catch {
      return this.reaskDataChange(turn, ref, customer, stage.pendingField, stage.notUnderstood, { kind: 'provider-failure', step: 'intent' }, 'incoming')
    }
    if (intent !== 'cambio de datos') {
      // Otra consulta: se sale del estado y se procesa con la clasificación ya hecha.
      return this.answerQuery(turn, customer, { text, answers: 'incoming' }, false, stage.notUnderstood, { intent, urgency })
    }
    return this.reaskDataChange(turn, ref, customer, stage.pendingField, stage.notUnderstood, { kind: 'not-understood' }, 'incoming')
  }

  // Aplica el ruteo de un pedido de cambio de datos: crea la solicitud, pide el dato que
  // falta o usa la lógica del cambio de teléfono (regla 9).
  private applyDataChange(
    turn: Turn,
    ref: CaseRef,
    customer: Customer,
    route: DataChangeRoute,
    pendingField: DataChangeTargetField | null,
    notUnderstood: number,
    answers: QueryRef,
  ): ProcessResult {
    switch (route.kind) {
      case 'phone':
        // Un teléfono no se cambia por este flujo: se pide escribir desde el número nuevo
        // y no se registra ninguna solicitud (regla 9).
        turn.reply(ref, useNewPhoneRequest, answers)
        turn.nextStage = () => identifiedStageOf(customer)
        return { status: 'NEW_PHONE_REQUESTED', intent: 'cambio de teléfono', responseSent: true }
      case 'create':
        // La solicitud queda en el caso de la consulta, sin derivar ni silenciar la
        // conversación: el aviso es el de todo trámite pendiente.
        turn.changes.dataChangeRequest = {
          case: ref,
          customerId: customer.id,
          field: route.field,
          value: route.value,
          riskLevel: queryTypeRiskLevel('cambio de datos') ?? 'bajo',
        }
        turn.reply(ref, approvalNotice, answers)
        turn.nextStage = () => identifiedStageOf(customer)
        return { status: 'DATA_CHANGE_NOTICE_SENT', responseSent: true }
      case 'ask-value':
        if (pendingField !== null) {
          // Ya se pidió un dato y la respuesta vino sin el valor: se repregunta.
          return this.reaskDataChange(turn, ref, customer, route.field, notUnderstood, { kind: 'not-understood' }, answers)
        }
        // Progreso: se sabe el campo y se pide el valor, sin contar un intento de más.
        turn.reply(ref, dataChangeValueQuestion(route.field, 0), answers)
        turn.nextStage = () => dataChangeStage(customer, route.field, notUnderstood)
        return { status: 'DATA_CHANGE_REQUESTED', responseSent: true }
      case 'ask-field':
        turn.reply(ref, dataChangeFieldQuestion(0), answers)
        turn.nextStage = () => dataChangeStage(customer, null, notUnderstood)
        return { status: 'DATA_CHANGE_REQUESTED', responseSent: true }
    }
  }

  // Repregunta el dato que falta con una redacción distinta por intento; con las
  // repreguntas agotadas se deriva con `reason`, sin que el cliente vea la falla.
  private reaskDataChange(
    turn: Turn,
    ref: CaseRef,
    customer: Customer,
    missing: DataChangeTargetField | null,
    notUnderstood: number,
    reason: HandoffReason,
    answers: QueryRef,
  ): ProcessResult {
    const step = clarificationStep(notUnderstood)
    if (step.kind === 'handoff') return this.handoffIn(turn, ref, reason, answers, { intent: 'cambio de datos' })
    const question = missing === null
      ? dataChangeFieldQuestion(step.notUnderstood)
      : dataChangeValueQuestion(missing, step.notUnderstood)
    turn.reply(ref, question, answers)
    turn.nextStage = () => dataChangeStage(customer, missing, step.notUnderstood)
    return { status: 'DATA_CHANGE_REQUESTED', responseSent: true }
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
    const template = this.fillTemplate(turn, customer, templateKind)
    return this.sendRewritten(turn, ref, { template, literals: [] }, question, answers, intent)
  }

  // La información de la agencia, que no es de ningún cliente (RF-ATE-06). Si falta un dato,
  // se deriva (RF-ATE-02).
  private async sendAgencyInfo(turn: Turn, ref: CaseRef, question: string, answers: QueryRef, intent: Intent): Promise<ProcessResult> {
    const answer = agencyInfoAnswer(await this.agency.read())
    if (!answer) return this.handoffIn(turn, ref, { kind: 'missing-data', data: 'agency-info' }, answers, { intent })
    return this.sendRewritten(turn, ref, answer, question, answers, intent)
  }

  // Los medios de pago que cargó el administrador, en un texto fijo y sin derivar (change
  // configuracion-agencia). Sin cargar, se deriva por dato ausente.
  private async sendPaymentMethods(turn: Turn, ref: CaseRef, answers: QueryRef, intent: Intent): Promise<ProcessResult> {
    const { paymentMethods } = await this.agency.read()
    if (!paymentMethods) return this.handoffIn(turn, ref, { kind: 'missing-data', data: 'payment-methods' }, answers, { intent })
    turn.reply(ref, paymentMethodsMessage(paymentMethods), answers)
    return { status: 'ANSWER_SENT', intent, responseSent: true }
  }

  // Pedido de grúa o asistencia: siempre se deriva para el seguimiento. Con el teléfono
  // cargado, el mensaje de la derivación es el texto fijo con ese teléfono; sin cargar, el
  // mensaje de derivación habitual (change configuracion-agencia).
  private async handoffAssistance(
    turn: Turn,
    ref: CaseRef,
    answers: QueryRef,
    intent: Intent,
    urgency: Urgency | null,
  ): Promise<ProcessResult> {
    const { assistancePhone } = await this.agency.read()
    if (!assistancePhone) {
      return this.handoffIn(turn, ref, { kind: 'missing-data', data: 'assistance-phone' }, answers, { intent, urgency })
    }
    return this.handoffIn(turn, ref, { kind: 'intent', intent }, answers, { intent, urgency }, assistanceMessage(assistancePhone))
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
    let check = checkRewrite(filled.template, draft, filled.literals, ordered)
    if (!check.ok) {
      // Un solo reintento con el motivo del control (texto fijo del checker, sin contenido
      // del cliente): si vuelve a fallar, se deriva como hasta ahora.
      try {
        draft = await this.ai.rewrite({ template: filled.template, question, rejection: check.reason })
        check = checkRewrite(filled.template, draft, filled.literals, ordered)
      } catch {
        // El borrador rechazado por el control sigue siendo una respuesta no enviada.
        turn.changes.rejectedDraft = { text: draft, answers }
        return this.handoffIn(turn, ref, { kind: 'provider-failure', step: 'rewrite' }, answers, { intent })
      }
      if (!check.ok) {
        turn.changes.rejectedDraft = { text: draft, answers }
        return this.handoffIn(turn, ref, { kind: 'rewrite-rejected', detail: check.reason }, answers, { intent })
      }
    }

    turn.reply(ref, draft, answers)
    return { status: 'ANSWER_SENT', intent, responseSent: true }
  }

  private fillTemplate(turn: Turn, customer: Customer, templateKind: Exclude<AnswerTemplate, 'agency' | 'balance'>): string {
    switch (templateKind) {
      case 'expirations':
        return expirationsTemplate(customer, this.clock())
      case 'statuses':
        return statusesTemplate(customer, this.clock())
      case 'courtesy':
        return courtesyTemplate(customer, turn.greetingFresh)
    }
  }

  // Antes de identificarse, un mensaje sin DNI puede pedir la información de la agencia o los
  // medios de pago, que no son de ningún cliente (RF-ATE-06), o sus propios datos o sus
  // pólizas, de los que todavía no hay ningunos porque no se identificó: en los primeros se
  // responde la información y en los otros dos se avisa que no se identificó, siempre junto
  // con la pregunta pendiente, sin cambiar la etapa ni contar un intento de DNI. Un pedido de
  // grúa no espera a la identificación: recibe el teléfono y se deriva. Con otra intención, o
  // si el proveedor de IA falla, devuelve null y la identificación sigue igual.
  private async replyBeforeIdentifying(turn: Turn, text: string, followUp: string, stay: Stage): Promise<ProcessResult | null> {
    if (findDni(text)) return null
    const question = maskDni(text)
    let intent: Intent
    try {
      // La urgencia solo sirve para el nivel de una derivación: acá no se deriva.
      intent = (await this.ai.classifyIntent(question, intentContext(turn.conversation))).intent
    } catch {
      return null
    }
    if (intent === 'mis datos' || intent === 'mis pólizas') {
      const ref = turn.caseFor({ kind: 'identifying' })
      turn.receiveIn(ref)
      const notice = intent === 'mis pólizas' ? notIdentifiedPoliciesNotice : notIdentifiedDataNotice
      turn.reply(ref, `${notice} ${followUp}`)
      turn.nextStage = () => stay
      return { status: 'IDENTIFICATION_REQUIRED', responseSent: true }
    }
    if (intent === 'asistencia mecánica') {
      const ref = turn.caseFor({ kind: 'identifying' })
      turn.receiveIn(ref)
      turn.nextStage = () => ({ stage: 'unidentified' })
      return this.handoffAssistance(turn, ref, 'incoming', intent, null)
    }
    if (intent !== 'información de la agencia' && intent !== 'medios de pago') return null

    const ref = turn.caseFor({ kind: 'identifying' })
    turn.receiveIn(ref)
    const result = intent === 'medios de pago'
      ? await this.sendPaymentMethods(turn, ref, 'incoming', intent)
      : await this.sendAgencyInfo(turn, ref, question, 'incoming', intent)
    if (result.status !== 'ANSWER_SENT') {
      // Se derivó: al volver a atender, la identificación empieza de nuevo.
      turn.nextStage = () => ({ stage: 'unidentified' })
      return result
    }
    turn.reply(ref, followUp)
    turn.nextStage = () => stay
    return { status: intent === 'medios de pago' ? 'PAYMENT_METHODS_SENT' : 'AGENCY_INFO_SENT', responseSent: true }
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
  // text: el mensaje de la derivación; el de la grúa suma el teléfono de asistencia.
  private handoffIn(
    turn: Turn,
    ref: CaseRef,
    reason: HandoffReason,
    answers: QueryRef = 'incoming',
    query: ClassifiedQuery | null = null,
    text: string = handoffMessage,
  ): ProcessResult {
    const handoff = handoffOf(ref, reason, query)
    turn.changes.handoff = handoff
    turn.reply(ref, text, answers)
    return { status: 'HANDOFF_SENT', reason: handoff.reason, responseSent: true }
  }

  private async checkThreat(message: IncomingWhatsAppMessage): Promise<boolean> {
    const text = message.media === 'image' ? '' : String(message.text ?? '').trim()
    if (!text) return false
    try {
      return await this.ai.isThreat(text)
    } catch {
      // Ante falla del proveedor, no bloqueamos el flujo: la regla de riesgo exige derivar solo
      // con un ataque positivo. Si la IA no responde, se sigue con la lógica normal.
      return false
    }
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

// La sesión del flujo de cambio de datos, con el dato que se pidió (change cambio-datos-cliente).
function dataChangeStage(customer: Customer, pendingField: DataChangeTargetField | null, notUnderstood: number): Stage {
  return { stage: 'data_change_requested', customerId: customer.id, pendingField, notUnderstood, revalidated: !customer.active }
}

// La sesión identificada que retoma después de un pedido de cambio de datos.
function identifiedStageOf(customer: Customer): Stage {
  return { stage: 'identified', customerId: customer.id, notUnderstood: 0, revalidated: !customer.active }
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
