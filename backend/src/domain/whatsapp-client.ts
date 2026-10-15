// Una imagen que mandó el cliente, traída de WhatsApp al momento y nunca guardada
// (change bandeja-atender-casos, decisión 7).
export type WhatsAppImage = { mimeType: string; data: Uint8Array }

export interface WhatsAppClient {
  sendText(phone: string, text: string): Promise<void>
  // null si WhatsApp ya no entrega la imagen o no es una imagen aceptada; lanza ante otras fallas.
  downloadImage(ref: string, phone: string): Promise<WhatsAppImage | null>
}
