import type { WhatsAppClient } from '../domain/whatsapp-client.js'

type MetaWhatsAppResponse = {
  error?: { message?: string }
}

export class MetaWhatsAppClient implements WhatsAppClient {
  public constructor(
    private readonly apiUrl: string,
    private readonly token: string,
    private readonly phoneNumberId: string,
  ) {}

  public async sendText(phone: string, text: string): Promise<void> {
    const response = await fetch(
      `${this.apiUrl.replace(/\/$/, '')}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: text },
        }),
      },
    )

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null)
      const message = getMetaErrorMessage(payload)
      throw new Error(`WhatsApp provider returned HTTP ${response.status}: ${message}`)
    }
  }
}

function getMetaErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'unknown error'
  const error = (payload as MetaWhatsAppResponse).error
  return error?.message ?? 'unknown error'
}