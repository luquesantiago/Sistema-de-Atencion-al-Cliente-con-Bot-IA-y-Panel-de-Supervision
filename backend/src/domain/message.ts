export type IncomingWhatsAppMessage = {
  messageId: string
  phone: string
  text: string
  media?: 'image'
  receivedAt?: string
}
