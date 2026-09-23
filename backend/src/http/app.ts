import express, { type ErrorRequestHandler } from 'express'
import type { ProcessIncomingMessage } from '../application/process-incoming-message.js'

export function createApp(processIncomingMessage: ProcessIncomingMessage) {
  const app = express()
  app.use(express.json({ limit: '32kb' }))

  app.post('/webhooks/whatsapp', async (request, response, next) => {
    try {
      const body = request.body as Record<string, unknown>
      if (typeof body?.messageId !== 'string' || typeof body.phone !== 'string' || typeof body.text !== 'string') {
        response.status(400).json({ error: 'messageId, phone y text son obligatorios.' })
        return
      }
      const result = await processIncomingMessage.execute({
        messageId: body.messageId,
        phone: body.phone,
        text: body.text,
        dni: typeof body.dni === 'string' ? body.dni : undefined,
        receivedAt: typeof body.receivedAt === 'string' ? body.receivedAt : undefined,
      })
      response.status(200).json(result)
    } catch (error) {
      next(error)
    }
  })

  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }))
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    console.error(error)
    response.status(500).json({ error: 'No se pudo procesar el mensaje.' })
  }
  app.use(errorHandler)
  return app
}