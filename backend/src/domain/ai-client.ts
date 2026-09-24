import type { Customer } from './customer.js'
import type { Classification } from './message.js'

export type ResponseDraft = {
  text: string
  claims: string[]
}

export type ClassificationContext = {
  customer: Pick<Customer, 'name' | 'policies'>
  question: string
}

export interface AiClient {
  classify(context: ClassificationContext): Promise<Classification>
  generateResponse(context: ClassificationContext & { intent: string }): Promise<ResponseDraft>
}