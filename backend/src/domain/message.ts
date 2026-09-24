export const messageCategories = [
  'UNRELATED',
  'AUTOMATIC_RESPONSE',
  'HUMAN_HANDOFF',
] as const

export type MessageCategory = (typeof messageCategories)[number]

export type Classification = {
  category: MessageCategory
  intent: string
  confidence: number
  reason: string
}

export type IncomingWhatsAppMessage = {
  messageId: string
  phone: string
  text: string
  receivedAt?: string
  dni?: string
}

export const handoffMessage =
  'Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle.'

export const unrelatedMessage =
  'Podemos ayudarte con consultas relacionadas con tus seguros y la atención de la agencia. Por favor, enviá una pregunta sobre tu póliza o cobertura.'