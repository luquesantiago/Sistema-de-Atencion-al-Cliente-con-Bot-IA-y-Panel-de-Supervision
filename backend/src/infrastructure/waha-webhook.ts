import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingWhatsAppMessage } from '../domain/message.js'
import { phoneFromChatId } from './waha-whatsapp-client.js'

export type IgnoredReason =
  | 'otro evento'
  | 'mensaje propio'
  | 'sin texto'
  | 'formato inesperado'
  | 'no es un chat individual'
  | 'sin número válido'

export type WahaWebhookContent =
  // Listo para el asistente. `from` es el chat tal como lo manda WAHA: identifica al remitente en la cola.
  | { kind: 'message'; from: string; message: IncomingWhatsAppMessage }
  // Llegó con un @lid y sin el número a mano: hay que pedírselo a WAHA.
  | { kind: 'lid'; from: string; message: Omit<IncomingWhatsAppMessage, 'phone'> }
  | { kind: 'ignored'; messageId: string | null; reason: IgnoredReason }

// Tiempo constante: se comparan los sha256, que miden siempre lo mismo, así no se filtra ni el largo del secreto.
export function isValidWebhookSecret(received: string | undefined, expected: string): boolean {
  return received !== undefined && timingSafeEqual(sha256(received), sha256(expected))
}

// Traduce el aviso de WAHA (evento `message`, motor GOWS) al mensaje que procesa el asistente.
export function parseWahaWebhook(body: unknown): WahaWebhookContent {
  if (!isRecord(body) || !isRecord(body.payload)) return ignored(null, 'formato inesperado')
  const payload = body.payload
  const messageId = typeof payload.id === 'string' && payload.id ? payload.id : null
  if (body.event !== 'message') return ignored(messageId, 'otro evento')

  const from = payload.from
  const content = payload.body
  if (!messageId || typeof from !== 'string' || typeof payload.fromMe !== 'boolean') {
    return ignored(messageId, 'formato inesperado')
  }
  if (payload.fromMe) return ignored(messageId, 'mensaje propio')
  if (content !== undefined && content !== null && typeof content !== 'string') {
    return ignored(messageId, 'formato inesperado')
  }
  const text = typeof content === 'string' ? content : ''
  const media = isImageMessage(payload) ? 'image' : undefined
  if (!text.trim() && !media) return ignored(messageId, 'sin texto')

  const receivedAt = typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp)
    ? new Date(payload.timestamp * 1000).toISOString()
    : undefined

  if (from.endsWith('@lid')) {
    // GOWS deja el número del remitente en _data.Info.SenderAlt; si no viene, se le pregunta a WAHA.
    const phone = senderAltPhone(payload._data)
    if (phone) return { kind: 'message', from, message: { messageId, phone, text, media, receivedAt } }
    return { kind: 'lid', from, message: { messageId, text, media, receivedAt } }
  }
  if (!from.endsWith('@c.us') && !from.endsWith('@s.whatsapp.net')) return ignored(messageId, 'no es un chat individual')
  const phone = phoneFromChatId(from)
  if (!phone) return ignored(messageId, 'sin número válido')
  return { kind: 'message', from, message: { messageId, phone, text, media, receivedAt } }
}

// Para los logs: el id de WAHA incluye el chat (y con él el número), así que se muestra solo el id propio de WhatsApp.
export function messageKeyForLog(messageId: string | null): string {
  return messageId?.split('_').at(-1) ?? 'sin id'
}

export function maskPhoneForLog(phone: string): string {
  return `…${phone.slice(-4)}`
}

function senderAltPhone(data: unknown): string | null {
  if (!isRecord(data) || !isRecord(data.Info)) return null
  const senderAlt = data.Info.SenderAlt
  return typeof senderAlt === 'string' ? phoneFromChatId(senderAlt) : null
}

function isImageMessage(payload: Record<string, unknown>): boolean {
  if (payload.hasMedia !== true) return false
  const media = payload.media
  if (isRecord(media) && typeof media.mimetype === 'string' && media.mimetype.startsWith('image/')) return true
  if (typeof payload.mimetype === 'string' && payload.mimetype.startsWith('image/')) return true
  const data = payload._data
  if (!isRecord(data) || !isRecord(data.message)) return false
  return isRecord(data.message.imageMessage)
}

function ignored(messageId: string | null, reason: IgnoredReason): WahaWebhookContent {
  return { kind: 'ignored', messageId, reason }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
