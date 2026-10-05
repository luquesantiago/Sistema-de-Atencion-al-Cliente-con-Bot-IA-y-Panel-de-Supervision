import type { WhatsAppClient } from '../domain/whatsapp-client.js'

// Sesión de WAHA vinculada al WhatsApp de la agencia. docker-compose.yml la arranca con el
// mismo nombre (WHATSAPP_START_SESSION); los mensajes que no responden a un aviso también salen por acá.
export const wahaSession = 'seguros-castano'

// Un chat individual de WhatsApp: el número internacional sin "+" (de 10 a 15 dígitos, como pide el DER),
// a veces con el sufijo de dispositivo (":3") cuando viene crudo del motor.
const individualChatIdPattern = /^(\d{10,15})(?:[.:]\d+)*@(?:c\.us|s\.whatsapp\.net)$/

export function phoneFromChatId(chatId: string): string | null {
  return individualChatIdPattern.exec(chatId)?.[1] ?? null
}

export class WahaWhatsAppClient implements WhatsAppClient {
  public constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  public async sendText(phone: string, text: string): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/api/sendText`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: wahaSession, chatId: `${phone}@c.us`, text }),
    })
    if (!response.ok) throw new Error(`WhatsApp provider returned HTTP ${response.status}`)
  }

  // Número que WhatsApp oculta detrás de un @lid, o null si WAHA no lo conoce (por ejemplo, si no está en los contactos).
  public async findPhoneByLid(lid: string): Promise<string | null> {
    const response = await fetch(`${this.baseUrl()}/api/${wahaSession}/lids/${encodeURIComponent(lid)}`, {
      headers: { 'X-Api-Key': this.apiKey },
    })
    if (!response.ok) throw new Error(`WhatsApp provider returned HTTP ${response.status}`)
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || !('pn' in payload) || typeof payload.pn !== 'string') return null
    return phoneFromChatId(payload.pn)
  }

  private baseUrl(): string {
    return this.apiUrl.replace(/\/$/, '')
  }
}
