import type { AiClient } from '../domain/ai-client.js'
import type { Customer, CustomerRepository } from '../domain/customer.js'
import { findDni, maskDni, parseYesNo } from '../domain/dni.js'
import { actionForIntent, type AnswerTemplate, type Intent } from '../domain/intent.js'
import type { IncomingWhatsAppMessage } from '../domain/message.js'
import { checkRewrite } from '../domain/rewrite-check.js'
import {
  approvalNotice,
  courtesyTemplate,
  dniRetryRequest,
  expirationsTemplate,
  firstDniRequest,
  handoffMessage,
  newCustomerNameRequest,
  newCustomerQuestion,
  repeatedDniRequest,
  statusesTemplate,
  welcomeMessage,
  type Clock,
} from '../domain/templates.js'
import type { WhatsAppClient } from '../domain/whatsapp-client.js'

// Al 4.º DNI no reconocido se deriva (regla 2 de AGENTS.md, RF-ATE-03).
const maxUnrecognizedDnis = 4

// Estado de cada número, en memoria hasta que se reinicia el backend (provisional, sin base).
type ConversationState =
  | { stage: 'awaiting_dni'; pendingQuestion: string | null; unrecognizedDnis: number }
  | { stage: 'awaiting_new_customer_answer'; pendingQuestion: string | null; unrecognizedDnis: number }
  | { stage: 'awaiting_name' }
  | { stage: 'identified'; customerId: string }
  | { stage: 'silenced' }

export type ProcessResult =
  | { status: 'DNI_REQUESTED'; responseSent: true }
  | { status: 'NEW_CUSTOMER_ASKED'; responseSent: true }
  | { status: 'NAME_REQUESTED'; responseSent: true }
  | { status: 'WELCOME_SENT'; responseSent: true }
  | { status: 'ANSWER_SENT'; intent: Intent; responseSent: true }
  | { status: 'APPROVAL_NOTICE_SENT'; intent: Intent; responseSent: true }
  | { status: 'HANDOFF_SENT'; reason: string; responseSent: true }
  | { status: 'IGNORED_NOT_INSURANCE'; responseSent: false }
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
    // Si el proceso falla (en la práctica, el envío por WhatsApp), el canal vuelve a mandar
    // el mensaje: se deshace lo que dejó en memoria para que el reintento arranque igual.
    const stateBefore = this.states.get(message.phone)
    try {
      return await this.process(message)
    } catch (error) {
      this.processedMessageIds.delete(message.messageId)
      if (stateBefore) this.states.set(message.phone, stateBefore)
      else this.states.delete(message.phone)
      throw error
    }
  }

  private async process({ phone, text }: IncomingWhatsAppMessage): Promise<ProcessResult> {
    const state = this.states.get(phone)

    // Después de derivar o de mandar a aprobar, el asistente no responde más (RF-DER-03).
    if (state?.stage === 'silenced') return { status: 'SILENCED', responseSent: false }
    if (state?.stage === 'awaiting_name') return this.handoff(phone, 'cliente nuevo')

    if (state?.stage === 'identified') {
      const customer = await this.customers.findById(state.customerId)
      if (!customer) return this.handoff(phone, 'cliente identificado inexistente')
      return this.answerQuery(phone, customer, text, false)
    }

    const pendingQuestion = state?.pendingQuestion ?? null
    const unrecognizedDnis = state?.unrecognizedDnis ?? 0

    const dni = findDni(text)
    if (dni) {
      const customer = await this.customers.findByDni(dni)
      if (customer) {
        this.states.set(phone, { stage: 'identified', customerId: customer.id })
        if (pendingQuestion) return this.answerQuery(phone, customer, pendingQuestion, true)
        return this.sendWelcome(phone, customer)
      }
      const attempts = unrecognizedDnis + 1
      if (attempts >= maxUnrecognizedDnis) return this.handoff(phone, 'DNI no reconocido')
      if (attempts === 1) {
        this.states.set(phone, { stage: 'awaiting_new_customer_answer', pendingQuestion, unrecognizedDnis: attempts })
        await this.whatsapp.sendText(phone, newCustomerQuestion)
        return { status: 'NEW_CUSTOMER_ASKED', responseSent: true }
      }
      this.states.set(phone, { stage: 'awaiting_dni', pendingQuestion, unrecognizedDnis: attempts })
      await this.whatsapp.sendText(phone, dniRetryRequest)
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    // La respuesta a «¿Es usted cliente nuevo?» la resuelve el código: antes de
    // identificar al cliente no sale nada al proveedor de IA.
    if (state?.stage === 'awaiting_new_customer_answer') {
      if (parseYesNo(text) === 'yes') {
        this.states.set(phone, { stage: 'awaiting_name' })
        await this.whatsapp.sendText(phone, newCustomerNameRequest)
        return { status: 'NAME_REQUESTED', responseSent: true }
      }
      this.states.set(phone, { stage: 'awaiting_dni', pendingQuestion, unrecognizedDnis })
      await this.whatsapp.sendText(phone, dniRetryRequest)
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    // Sin DNI: se pide, y se guarda el primer mensaje para responderlo después.
    this.states.set(phone, { stage: 'awaiting_dni', pendingQuestion: pendingQuestion ?? text, unrecognizedDnis })
    await this.whatsapp.sendText(phone, state ? repeatedDniRequest : firstDniRequest)
    return { status: 'DNI_REQUESTED', responseSent: true }
  }

  // Atiende una consulta del cliente identificado. Si es la guardada antes del DNI y no es
  // de seguros, en lugar de ignorarla se le pregunta en qué se lo puede ayudar.
  private async answerQuery(phone: string, customer: Customer, text: string, welcomeIfIgnored: boolean): Promise<ProcessResult> {
    // El DNI nunca sale al proveedor de IA, aunque el cliente lo haya escrito.
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
        this.states.set(phone, { stage: 'silenced' })
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
    // La redacción no puede cambiar ni agregar datos (RF-ATE-02): si no pasa, se deriva.
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
        return courtesyTemplate(customer)
    }
  }

  private async sendWelcome(phone: string, customer: Customer): Promise<ProcessResult> {
    await this.whatsapp.sendText(phone, welcomeMessage(customer))
    return { status: 'WELCOME_SENT', responseSent: true }
  }

  // El número queda en silencio antes de enviar: si el envío falla, execute lo restaura.
  private async handoff(phone: string, reason: string): Promise<ProcessResult> {
    this.states.set(phone, { stage: 'silenced' })
    await this.whatsapp.sendText(phone, handoffMessage)
    console.log(`[asistente] derivación: ${reason}`)
    return { status: 'HANDOFF_SENT', reason, responseSent: true }
  }
}
