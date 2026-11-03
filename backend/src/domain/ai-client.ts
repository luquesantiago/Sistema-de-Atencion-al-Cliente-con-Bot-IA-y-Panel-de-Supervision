import type { Intent } from './intent.js'
import type { Urgency } from './risk-level.js'

export type CustomerStatus = 'NEW_CUSTOMER' | 'EXISTING_CUSTOMER' | 'UNRELATED'

// Un mensaje anterior de la conversación que va como contexto para elegir la intención,
// con el DNI tapado.
export type ContextMessage = { from: 'cliente' | 'asistente'; text: string }

// La intención y, para un siniestro, si es grave. urgency es null si el modelo no devolvió
// un valor de la lista: el nivel queda en el piso (change bandeja-atencion-lectura, decisión 3).
export type IntentClassification = { intent: Intent; urgency: Urgency | null }

// El dato personal que el cliente quiere cambiar y el valor nuevo, si lo trae en el mismo
// mensaje. field null: no se pudo saber qué dato quiere cambiar; value null: falta el valor.
export type DataChangeField = 'nombre' | 'apellido' | 'telefono'

export type DataChangeExtraction = { field: DataChangeField | null; value: string | null }

export type RewriteInput = {
  // Plantilla ya completada con los datos del cliente identificado.
  template: string
  // Pregunta del cliente, con el DNI tapado. null si no hay.
  question: string | null
  // Motivo por el que el control rechazó la redacción anterior (solo en el reintento):
  // texto del propio control, nunca contenido del cliente.
  rejection?: string
}

// Motor que decide y redacta. El modelo elige de una lista cerrada y nunca redacta
// para decidir: la acción la decide el código. Cualquier falla se lanza como excepción.
export interface AiClient {
  classifyCustomerStatus(reply: string): Promise<CustomerStatus>
  // context: los mensajes anteriores de la conversación, como dato (intentContext).
  classifyIntent(text: string, context: readonly ContextMessage[]): Promise<IntentClassification>
  // Extrae el campo a cambiar y el valor nuevo del mensaje (o del contexto, si el cliente
  // responde a la pregunta del asistente). pendingField es el dato que el asistente está
  // pidiendo, si ya preguntó: le sirve al modelo para interpretar una respuesta corta
  // («Juan»). No decide qué hacer con eso: lo decide el código.
  extractDataChange(text: string, context: readonly ContextMessage[], pendingField?: DataChangeField | null): Promise<DataChangeExtraction>
  rewrite(input: RewriteInput): Promise<string>
}
