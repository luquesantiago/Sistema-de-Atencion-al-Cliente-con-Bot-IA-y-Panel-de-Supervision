import type { Intent } from './intent.js'

export type CustomerStatus = 'NEW_CUSTOMER' | 'EXISTING_CUSTOMER' | 'UNRELATED'

// Un mensaje anterior de la conversación que va como contexto para elegir la intención,
// con el DNI tapado.
export type ContextMessage = { from: 'cliente' | 'asistente'; text: string }

export type RewriteInput = {
  // Plantilla ya completada con los datos del cliente identificado.
  template: string
  // Pregunta del cliente, con el DNI tapado. null si no hay.
  question: string | null
}

// Motor que decide y redacta. El modelo elige de una lista cerrada y nunca redacta
// para decidir: la acción la decide el código. Cualquier falla se lanza como excepción.
export interface AiClient {
  classifyCustomerStatus(reply: string): Promise<CustomerStatus>
  // context: los mensajes anteriores de la conversación, como dato (intentContext).
  classifyIntent(text: string, context: readonly ContextMessage[]): Promise<Intent>
  rewrite(input: RewriteInput): Promise<string>
}
