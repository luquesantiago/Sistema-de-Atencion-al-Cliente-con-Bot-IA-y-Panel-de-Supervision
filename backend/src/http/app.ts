import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import type { ProcessIncomingMessage } from '../application/process-incoming-message.js'
import { KeyedQueue } from '../infrastructure/keyed-queue.js'
import { isValidWebhookSecret, maskPhoneForLog, messageKeyForLog, parseWahaWebhook } from '../infrastructure/waha-webhook.js'

export type WhatsAppWebhookOptions = {
  secret: string
  findPhoneByLid: (lid: string) => Promise<string | null>
}

export function createApp(processIncomingMessage: ProcessIncomingMessage, whatsapp: WhatsAppWebhookOptions) {
  const app = express()
  const senders = new KeyedQueue()

  // El secreto se valida antes de leer el cuerpo: un aviso sin secreto ni se parsea.
  const requireWebhookSecret: RequestHandler = (request, response, next) => {
    if (!isValidWebhookSecret(request.get('X-Webhook-Secret'), whatsapp.secret)) {
      response.status(401).end()
      return
    }
    next()
  }

  // Aviso de WAHA. Se procesa antes de responder: si falla, el 500 hace que WAHA lo reintente.
  // Los ignorados responden 200, porque WAHA reintenta cualquier otro código.
  app.post('/webhooks/whatsapp', requireWebhookSecret, express.json({ limit: '1mb' }), async (request, response, next) => {
    const content = parseWahaWebhook(request.body)
    if (content.kind === 'ignored') {
      console.log(`[whatsapp] ${messageKeyForLog(content.messageId)} ignorado: ${content.reason}`)
      response.status(200).json({ status: 'IGNORED', reason: content.reason })
      return
    }
    const key = messageKeyForLog(content.message.messageId)
    try {
      // De a uno por remitente: WAHA no espera la respuesta de un aviso para mandar el siguiente.
      const outcome = await senders.run(content.from, async () => {
        const phone = content.kind === 'message' ? content.message.phone : await whatsapp.findPhoneByLid(content.from)
        if (!phone) return null
        return { phone, result: await processIncomingMessage.execute({ ...content.message, phone }) }
      })
      if (!outcome) {
        console.log(`[whatsapp] ${key} ignorado: sin número válido`)
        response.status(200).json({ status: 'IGNORED', reason: 'sin número válido' })
        return
      }
      console.log(`[whatsapp] ${key} de ${maskPhoneForLog(outcome.phone)}: ${outcome.result.status}`)
      response.status(200).json(outcome.result)
    } catch (error) {
      console.log(`[whatsapp] ${key} falló: responde 500 y WAHA lo reintenta`)
      next(error)
    }
  })

  // El resto de las rutas lee JSON con el límite de siempre; el webhook ya respondió antes de llegar acá.
  app.use(express.json({ limit: '32kb' }))

  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }))
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    console.error(error)
    response.status(500).json({ error: 'No se pudo procesar el mensaje.' })
  }
  app.use(errorHandler)
  return app
}
