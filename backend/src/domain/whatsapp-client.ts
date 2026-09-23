export interface WhatsAppClient {
  sendText(phone: string, text: string): Promise<void>
}