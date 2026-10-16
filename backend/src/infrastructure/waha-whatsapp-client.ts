import type { WhatsAppClient, WhatsAppImage } from '../domain/whatsapp-client.js'

// Sesión de WAHA vinculada al WhatsApp de la agencia. docker-compose.yml la arranca con el
// mismo nombre (WHATSAPP_START_SESSION); los mensajes que no responden a un aviso también salen por acá.
export const wahaSession = 'seguros-castano'

// Un chat individual de WhatsApp: el número internacional sin "+" (de 10 a 15 dígitos, como pide el DER),
// a veces con el sufijo de dispositivo (":3") cuando viene crudo del motor.
const individualChatIdPattern = /^(\d{10,15})(?:[.:]\d+)*@(?:c\.us|s\.whatsapp\.net)$/

export function phoneFromChatId(chatId: string): string | null {
  return individualChatIdPattern.exec(chatId)?.[1] ?? null
}

// Imágenes que el panel muestra (change bandeja-atender-casos, decisión 7).
export const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const
export const maxImageBytes = 10 * 1024 * 1024

export class WahaWhatsAppClient implements WhatsAppClient {
  public constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  public async sendText(phone: string, text: string): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl()}/api/sendText`, {
      method: 'POST',
      headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: wahaSession, chatId: `${phone}@c.us`, text }),
    })
    if (!response.ok) throw new Error(`WhatsApp provider returned HTTP ${response.status}`)
  }

  // Número que WhatsApp oculta detrás de un @lid, o null si WAHA no lo conoce (por ejemplo, si no está en los contactos).
  public async findPhoneByLid(lid: string): Promise<string | null> {
    const response = await this.fetchImpl(`${this.baseUrl()}/api/${wahaSession}/lids/${encodeURIComponent(lid)}`, {
      headers: { 'X-Api-Key': this.apiKey },
    })
    if (!response.ok) throw new Error(`WhatsApp provider returned HTTP ${response.status}`)
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object' || !('pn' in payload) || typeof payload.pn !== 'string') return null
    return phoneFromChatId(payload.pn)
  }

  // WAHA baja la imagen de WhatsApp a su /tmp (la borra a los WHATSAPP_FILES_LIFETIME segundos) y
  // devuelve media.url; acá se lee en memoria y no se escribe en ningún lado.
  public async downloadImage(ref: string, phone: string): Promise<WhatsAppImage | null> {
    const chatId = encodeURIComponent(`${phone}@c.us`)
    const response = await this.fetchImpl(
      `${this.baseUrl()}/api/${wahaSession}/chats/${chatId}/messages/${encodeURIComponent(ref)}?downloadMedia=true`,
      { headers: { 'X-Api-Key': this.apiKey } },
    )
    if (response.status === 404) return null
    if (!response.ok) {
      // GOWS responde 500 con «not found» cuando el mensaje ya no está (comprobado el 15/10/2026).
      if (isGoneError(await response.text())) return null
      throw new Error(`WhatsApp provider returned HTTP ${response.status}`)
    }
    const path = mediaPath(await response.json())
    if (!path) return null

    // media.url trae el host que WAHA cree tener (localhost:3000): se usa solo el camino.
    const file = await this.fetchImpl(`${this.baseUrl()}${path}`, { headers: { 'X-Api-Key': this.apiKey } })
    if (file.status === 404) return null
    if (!file.ok) throw new Error(`WhatsApp provider returned HTTP ${file.status}`)
    const mimeType = (file.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
    if (!isAcceptedImageType(mimeType)) return null
    const declared = Number(file.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > maxImageBytes) return null
    const data = new Uint8Array(await file.arrayBuffer())
    if (data.length === 0 || data.length > maxImageBytes) return null
    return { mimeType, data }
  }

  private baseUrl(): string {
    return this.apiUrl.replace(/\/$/, '')
  }
}

function isGoneError(body: string): boolean {
  return /not found|expired|\b(404|410)\b/i.test(body)
}

function isAcceptedImageType(value: string): boolean {
  return acceptedImageTypes.some((type) => type === value)
}

// El camino de media.url (/api/files/...), o null si el mensaje no trae una imagen descargada.
function mediaPath(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('media' in payload)) return null
  const media = payload.media
  if (!media || typeof media !== 'object' || !('url' in media) || typeof media.url !== 'string') return null
  try {
    const { pathname } = new URL(media.url)
    return pathname.startsWith('/api/files/') ? pathname : null
  } catch {
    return null
  }
}
