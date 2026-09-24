import type { AiClient } from '../domain/ai-client.js'
import type { Customer, CustomerRepository } from '../domain/customer.js'
import { handoffMessage, type Classification, type IncomingWhatsAppMessage, unrelatedMessage } from '../domain/message.js'
import type { WhatsAppClient } from '../domain/whatsapp-client.js'

type PendingQuestion = { message: IncomingWhatsAppMessage }

export type ProcessResult =
  | { status: 'DNI_REQUESTED'; responseSent: true }
  | { status: 'CUSTOMER_NOT_FOUND'; responseSent: false }
  | { status: 'ANSWER_SENT'; category: Classification['category']; responseSent: true }
  | { status: 'HANDOFF_SENT'; category: 'HUMAN_HANDOFF'; responseSent: true }
  | { status: 'DUPLICATE_IGNORED'; responseSent: false }

export class ProcessIncomingMessage {
  private readonly pendingQuestions = new Map<string, PendingQuestion>()
  private readonly processedMessageIds = new Set<string>()

  public constructor(
    private readonly customers: CustomerRepository,
    private readonly ai: AiClient,
    private readonly whatsapp: WhatsAppClient,
  ) {}

  public async execute(message: IncomingWhatsAppMessage): Promise<ProcessResult> {
    if (this.processedMessageIds.has(message.messageId)) {
      return { status: 'DUPLICATE_IGNORED', responseSent: false }
    }
    this.processedMessageIds.add(message.messageId)

    const dni = normalizeDni(message.dni ?? message.text)
    const pendingQuestion = this.pendingQuestions.get(message.phone)
    if (!dni) {
      this.pendingQuestions.set(message.phone, { message })
      await this.whatsapp.sendText(message.phone, 'Para poder ayudarte, por favor indicá tu número de DNI.')
      return { status: 'DNI_REQUESTED', responseSent: true }
    }

    const customer = await this.customers.findByDni(dni)
    if (!customer) {
      this.pendingQuestions.delete(message.phone)
      return { status: 'CUSTOMER_NOT_FOUND', responseSent: false }
    }

    const question = pendingQuestion?.message.text ?? message.text
    this.pendingQuestions.delete(message.phone)
    const classification = await this.ai.classify({ customer, question })
    if (classification.category === 'UNRELATED') {
      await this.whatsapp.sendText(message.phone, unrelatedMessage)
      return { status: 'ANSWER_SENT', category: classification.category, responseSent: true }
    }
    if (classification.category === 'HUMAN_HANDOFF') {
      await this.whatsapp.sendText(message.phone, handoffMessage)
      return { status: 'HANDOFF_SENT', category: classification.category, responseSent: true }
    }

    try {
      const draft = await this.ai.generateResponse({ customer, question, intent: classification.intent })
      verifyDraft(draft.text, customer)
      await this.whatsapp.sendText(message.phone, draft.text)
      return { status: 'ANSWER_SENT', category: classification.category, responseSent: true }
    } catch {
      await this.whatsapp.sendText(message.phone, handoffMessage)
      return { status: 'HANDOFF_SENT', category: 'HUMAN_HANDOFF', responseSent: true }
    }
  }
}

function normalizeDni(value: string): string | null {
  const normalized = value.replace(/\D/g, '')
  return /^\d{7,8}$/.test(normalized) ? normalized : null
}

function verifyDraft(text: string, customer: Customer): void {
  if (!text.trim() || /dar de baja|cotización|siniestro|modificar la póliza/i.test(text)) {
    throw new Error('Generated response is not safe to send')
  }
  for (const mention of text.match(/POL[-\s]?\d+/gi) ?? []) {
    const normalized = mention.replace(/\s/g, '').toUpperCase()
    if (!customer.policies.some((policy) => policy.number.toUpperCase() === normalized)) {
      throw new Error('Generated response mentions an unknown policy')
    }
  }
}
