import type { AiClient, CustomerStatus } from '../domain/ai-client.js'
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

const maxUnrecognizedDnis = 4

type DniFlow = {
  stage: 'awaiting_dni'
  origin: 'known_phone' | 'existing_customer'
  pendingQuestion: string | null
  unrecognizedDnis: number
}

type CustomerStatusFlow = {
  stage: 'awaiting_customer_status'
  dniOrigin: DniFlow['origin']
  pendingQuestion: string | null
  unrecognizedDnis: number
}

type ConversationState =
  | CustomerStatusFlow
  | DniFlow
  | { stage: 'awaiting_new_customer_name' }
  | { stage: 'awaiting_new_customer_dni'; name: string }
  | { stage: 'awaiting_new_customer_photo'; name: string; dni: string }
  | { stage: 'identified'; customerId: string }
  | { stage: 'silenced'; persistent: boolean }

export type ProcessResult =
  | { status: 'CUSTOMER_STATUS_REQUESTED'; responseSent: true }
  | { status: 'CUSTOMER_STATUS_REASKED'; responseSent: true }
  | { status: 'DNI_REQUESTED'; responseSent: true }
  | { status: 'NAME_REQUESTED'; responseSent: true }
  | { status: 'NEW_CUSTOMER_DNI_REQUESTED'; responseSent: true }
  | { status: 'PHOTO_REQUESTED'; responseSent: true }
  | { status: 'PROSPECT_HANDED_OFF'; responseSent: true }
  | { status: 'PHONE_CHANGE_PENDING'; responseSent: true }
  | { status: 'NEW_PHONE_REQUESTED'; intent: Intent; responseSent: true }
  | { status: 'WELCOME_SENT'; responseSent: true }
  | { status: 'ANSWER_SENT'; intent: Intent; responseSent: true }
  | { status: 'APPROVAL_NOTICE_SENT'; intent: Intent; responseSent: true }
  | { status: 'HANDOFF_SENT'; reason: string; responseSent: true }
  | { status: 'IGNORED_NOT_INSURANCE'; responseSent: false }
  | { status: 'IGNORED_MEDIA'; responseSent: false }
  | { status: 'SILENCED'; responseSent: false }
  | { status: 'DUPLICATE_IGNORED'; responseSent: false }

export class ProcessIncomingMessage {
  private readonly states = new Map<string, ConversationState>()
  private readonly processedMessageIds = new Set<string>()

  public constructor(
    private readonly customers: CustomerRepository,
    private readonly ai: AiClient,
    private readonly whatsapp: WhatsAppClient,
    private readonly clock: Clock = () => new Date(),
  ) {}

  public async execute(message: IncomingWhatsAppMessage): Promise<ProcessResult> {
    if (this.processedMessageIds.has(message.messageId)) {
      return { status: 'DUPLICATE_IGNORED', responseSent: false }
    }
    this.processedMessageIds.add(message.messageId)
    const stateBefore = this.states.get(message.phone)
    try {
      await this.customers.recordIncomingPhone(message.phone)
      return await this.process(message)
    } catch (error) {
      this.processedMessageIds.delete(message.messageId)
      if (stateBefore) this.states.set(message.phone, stateBefore)
      else this.states.delete(message.phone)
      throw error
    }
  }

  private async process(message: IncomingWhatsAppMessage): Promise<ProcessResult> {
    const { phone, text } = message
    const state = this.states.get(phone)

    if (state?.stage === 'silenced') {
      if (!state.persistent) return { status: 'SILENCED', responseSent: false }
      if (await this.customers.hasOpenHandoff(phone)) {
        await this.customers.recordMessageForOpenHandoff(phone, messageTextForCase(message))
        return { status: 'SILENCED', responseSent: false }
      }
      this.states.delete(phone)
      return this.process(message)
    }
    if (!state && await this.customers.hasOpenHandoff(phone)) {
      await this.customers.recordMessageForOpenHandoff(phone, messageTextForCase(message))
      this.states.set(phone, { stage: 'silenced', persistent: true })
      return { status: 'SILENCED', responseSent: false }
    }
    if (message.media === 'image' && state?.stage !== 'awaiting_new_customer_photo') {
      return { status: 'IGNORED_MEDIA', responseSent: false }
    }
    if (state?.stage === 'awaiting_customer_status') return this.classifyCustomerStatus(phone, state, text)
    if (state?.stage === 'awaiting_new_customer_name') return this.collectNewCustomerName(phone, text)
    if (state?.stage === 'awaiting_new_customer_dni') {
      return this.collectNewCustomerDni(phone, state.name, text)
    }
    if (state?.stage === 'awaiting_new_customer_photo') {
      return this.collectNewCustomerPhoto(phone, state.name, state.dni, message)
    }
    if (state?.stage === 'awaiting_dni') return this.identifyCustomer(phone, state, text)

    if (state?.stage === 'identified') {
      const customer = await this.customers.findById(state.customerId)
      if (!customer) return this.handoff(phone, 'cliente identificado inexistente')
      return this.answerQuery(phone, customer, text, false)
    }

    if (await this.customers.hasLinkedPhone(phone)) {
      const dniFlow: DniFlow = {
        stage: 'awaiting_dni',
        origin: 'known_phone',
        pendingQuestion: containsQuestionOutsideDni(text) ? text : null,
        unrecognizedDnis: 0,
      }
      this.states.set(phone, dniFlow)
      if (findDni(text)) return this.identifyCustomer(phone, dniFlow, text)
      await this.whatsapp.sendText(phone, firstDniRequest)
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    this.states.set(phone, {
      stage: 'awaiting_customer_status',
      dniOrigin: 'existing_customer',
      pendingQuestion: null,
      unrecognizedDnis: 0,
    })
    await this.whatsapp.sendText(phone, customerStatusQuestion)
    return { status: 'CUSTOMER_STATUS_REQUESTED', responseSent: true }
  }

  private async classifyCustomerStatus(
    phone: string,
    state: CustomerStatusFlow,
    reply: string,
  ): Promise<ProcessResult> {
    let status: CustomerStatus
    try {
      status = await this.ai.classifyCustomerStatus(maskDni(reply))
    } catch {
      return this.handoff(phone, 'falla del proveedor al identificar el tipo de cliente')
    }

    switch (status) {
      case 'NEW_CUSTOMER':
        this.states.set(phone, { stage: 'awaiting_new_customer_name' })
        await this.whatsapp.sendText(phone, newCustomerNameRequest)
        return { status: 'NAME_REQUESTED', responseSent: true }
      case 'EXISTING_CUSTOMER':
        this.states.set(phone, {
          stage: 'awaiting_dni',
          origin: state.dniOrigin,
          pendingQuestion: state.pendingQuestion,
          unrecognizedDnis: state.unrecognizedDnis,
        })
        await this.whatsapp.sendText(phone, existingCustomerDniRequest)
        return { status: 'DNI_REQUESTED', responseSent: true }
      case 'UNRELATED':
        await this.whatsapp.sendText(phone, customerStatusRetryQuestion)
        return { status: 'CUSTOMER_STATUS_REASKED', responseSent: true }
    }
  }

  private async collectNewCustomerName(phone: string, text: string): Promise<ProcessResult> {
    const name = text.trim()
    if (!name) {
      await this.whatsapp.sendText(phone, newCustomerNameRequest)
      return { status: 'NAME_REQUESTED', responseSent: true }
    }
    this.states.set(phone, { stage: 'awaiting_new_customer_dni', name })
    await this.whatsapp.sendText(phone, newCustomerDniRequest)
    return { status: 'NEW_CUSTOMER_DNI_REQUESTED', responseSent: true }
  }

  private async collectNewCustomerDni(phone: string, name: string, text: string): Promise<ProcessResult> {
    const dni = findDni(text)
    if (!dni) {
      await this.whatsapp.sendText(phone, newCustomerDniRequest)
      return { status: 'NEW_CUSTOMER_DNI_REQUESTED', responseSent: true }
    }
    const existingCustomer = await this.customers.findByDni(dni)
    if (existingCustomer) {
      await this.customers.createPhoneChangeRequest({ phone, customerId: existingCustomer.id })
      this.states.set(phone, { stage: 'silenced', persistent: true })
      await this.whatsapp.sendText(phone, phoneChangePendingMessage)
      return { status: 'PHONE_CHANGE_PENDING', responseSent: true }
    }
    this.states.set(phone, { stage: 'awaiting_new_customer_photo', name, dni })
    await this.whatsapp.sendText(phone, newCustomerPhotoRequest)
    return { status: 'PHOTO_REQUESTED', responseSent: true }
  }

  private async collectNewCustomerPhoto(
    phone: string,
    name: string,
    dni: string,
    message: IncomingWhatsAppMessage,
  ): Promise<ProcessResult> {
    if (message.media !== 'image') {
      await this.whatsapp.sendText(phone, newCustomerPhotoRetryRequest)
      return { status: 'PHOTO_REQUESTED', responseSent: true }
    }
    await this.customers.createProspect({ phone, name, dni })
    this.states.set(phone, { stage: 'silenced', persistent: true })
    await this.whatsapp.sendText(phone, prospectHandoffMessage)
    return { status: 'PROSPECT_HANDED_OFF', responseSent: true }
  }

  private async identifyCustomer(phone: string, state: DniFlow, text: string): Promise<ProcessResult> {
    const dni = findDni(text)
    if (!dni) {
      await this.whatsapp.sendText(phone, repeatedDniRequest)
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    const customer = await this.customers.findByDni(dni)
    if (customer) {
      if (state.origin === 'existing_customer') {
        await this.customers.createPhoneChangeRequest({ phone, customerId: customer.id })
        this.states.set(phone, { stage: 'silenced', persistent: true })
        await this.whatsapp.sendText(phone, phoneChangePendingMessage)
        return { status: 'PHONE_CHANGE_PENDING', responseSent: true }
      }
      this.states.set(phone, { stage: 'identified', customerId: customer.id })
      if (state.pendingQuestion) return this.answerQuery(phone, customer, state.pendingQuestion, true)
      return this.sendWelcome(phone, customer)
    }

    const attempts = state.unrecognizedDnis + 1
    if (attempts >= maxUnrecognizedDnis) return this.handoff(phone, 'DNI no reconocido')
    this.states.set(phone, {
      stage: 'awaiting_customer_status',
      dniOrigin: state.origin,
      pendingQuestion: state.pendingQuestion,
      unrecognizedDnis: attempts,
    })
    await this.whatsapp.sendText(phone, customerStatusQuestion)
    return { status: 'CUSTOMER_STATUS_REQUESTED', responseSent: true }
  }

  private async answerQuery(
    phone: string,
    customer: Customer,
    text: string,
    welcomeIfIgnored: boolean,
  ): Promise<ProcessResult> {
    const question = maskDni(text)
    let intent: Intent
    try {
      intent = await this.ai.classifyIntent(question)
    } catch {
      return this.handoff(phone, 'falla del proveedor al decidir')
    }

    const action = actionForIntent(intent)
    switch (action.kind) {
      case 'ignore':
        if (welcomeIfIgnored) return this.sendWelcome(phone, customer)
        return { status: 'IGNORED_NOT_INSURANCE', responseSent: false }
      case 'handoff':
        return this.handoff(phone, `intención: ${intent}`)
      case 'approval':
        if (intent === 'cambio de teléfono') {
          await this.whatsapp.sendText(phone, useNewPhoneRequest)
          return { status: 'NEW_PHONE_REQUESTED', intent, responseSent: true }
        }
        this.states.set(phone, { stage: 'silenced', persistent: false })
        await this.whatsapp.sendText(phone, approvalNotice)
        return { status: 'APPROVAL_NOTICE_SENT', intent, responseSent: true }
      case 'answer':
        return this.sendRewrittenAnswer(phone, customer, question, intent, action.template)
    }
  }

  private async sendRewrittenAnswer(
    phone: string,
    customer: Customer,
    question: string,
    intent: Intent,
    templateKind: AnswerTemplate,
  ): Promise<ProcessResult> {
    if (templateKind !== 'courtesy' && customer.policies.length === 0) {
      return this.handoff(phone, 'cliente sin pólizas')
    }
    const template = this.fillTemplate(customer, templateKind)

    let draft: string
    try {
      draft = await this.ai.rewrite({ template, question })
    } catch {
      return this.handoff(phone, 'falla de la redacción')
    }
    const check = checkRewrite(template, draft)
    if (!check.ok) return this.handoff(phone, `redacción rechazada: ${check.reason}`)

    await this.whatsapp.sendText(phone, draft)
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

  private async sendWelcome(phone: string, customer: Customer): Promise<ProcessResult> {
    await this.whatsapp.sendText(phone, welcomeMessage(customer))
    return { status: 'WELCOME_SENT', responseSent: true }
  }

  private async handoff(phone: string, reason: string): Promise<ProcessResult> {
    this.states.set(phone, { stage: 'silenced', persistent: false })
    await this.whatsapp.sendText(phone, handoffMessage)
    console.log(`[asistente] derivación: ${reason}`)
    return { status: 'HANDOFF_SENT', reason, responseSent: true }
  }
}

function messageTextForCase(message: IncomingWhatsAppMessage): string {
  if (message.media === 'image') return 'El cliente envió una imagen por WhatsApp; el archivo no se almacena en el sistema.'
  return message.text
}

function containsQuestionOutsideDni(text: string): boolean {
  return maskDni(text).replace(/\[DNI\]/g, '').replace(/[^\p{L}]/gu, '').trim().length > 0
}
