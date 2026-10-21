import express, { type ErrorRequestHandler, type NextFunction, type RequestHandler, type Response } from 'express'
import { ManageCustomers } from '../application/manage-customers.js'
import { ManageCustomerEdits } from '../application/manage-customer-edits.js'
import { ManageInbox } from '../application/manage-inbox.js'
import { ManageRequests } from '../application/manage-requests.js'
import type { PanelActor } from '../domain/case-actions.js'
import type { ProcessIncomingMessage } from '../application/process-incoming-message.js'
import {
  RequestManagementError,
  type PhoneChangeDecisionInput,
  type ProspectDecisionInput,
} from '../domain/request-management.js'
import { KeyedQueue } from '../infrastructure/keyed-queue.js'
import { isValidWebhookSecret, maskPhoneForLog, messageKeyForLog, parseWahaWebhook } from '../infrastructure/waha-webhook.js'

export type WhatsAppWebhookOptions = {
  secret: string
  findPhoneByLid: (lid: string) => Promise<string | null>
}

export function createApp(
  processIncomingMessage: ProcessIncomingMessage,
  whatsapp: WhatsAppWebhookOptions,
  manageRequests: ManageRequests,
  manageCustomers: ManageCustomers,
  manageCustomerEdits: ManageCustomerEdits,
  manageInbox: ManageInbox,
  // Mientras no haya autenticación, el usuario de prueba operador (change bandeja-atender-casos, decisión 1).
  resolvePanelActor: () => Promise<PanelActor>,
) {
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
  app.get('/api/tramites/prospectos', async (request, response, next) => {
    try {
      const page = parsePage(request.query.limit, request.query.offset)
      const items = await manageRequests.listPendingProspects(page)
      response.status(200).json({ items, ...page })
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.get('/api/tramites/cambios-telefono', async (request, response, next) => {
    try {
      const page = parsePage(request.query.limit, request.query.offset)
      const items = await manageRequests.listPendingPhoneChanges(page)
      response.status(200).json({ items, ...page })
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/tramites/prospectos/:id/decision', async (request, response, next) => {
    try {
      const input = parseProspectDecision(request.params.id, request.body)
      const result = await manageRequests.decideProspect(input)
      response.status(200).json({
        id: result.id,
        decision: result.decision,
        casoId: result.casoId,
        ...(result.clienteId === undefined ? {} : { clienteId: result.clienteId }),
      })
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/tramites/cambios-telefono/:id/decision', async (request, response, next) => {
    try {
      const input = parsePhoneChangeDecision(request.params.id, request.body)
      const result = await manageRequests.decidePhoneChange(input)
      response.status(200).json({
        id: result.id,
        decision: result.decision,
        notificationSent: result.notificationSent,
        ...(result.notificationSent ? {} : {
          warning: 'La decisión quedó registrada, pero no se pudo avisar al cliente por WhatsApp.',
        }),
      })
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/tramites/cambios-telefono/:id/notificacion', async (request, response, next) => {
    try {
      if (request.body !== undefined && Object.keys(parseBody(request.body, [])).length > 0) {
        throw new RequestManagementError(400, 'VALIDATION_ERROR', 'Este endpoint no acepta campos en el cuerpo.')
      }
      const result = await manageRequests.retryPhoneChangeNotification(parseId(request.params.id))
      response.status(200).json({
        id: result.id,
        decision: result.decision,
        notificationSent: result.notificationSent,
        ...(result.notificationSent ? {} : {
          warning: 'La decisión está registrada, pero todavía no se pudo avisar al cliente por WhatsApp.',
        }),
      })
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  // Cartera de clientes para el panel (RF-CAR-01, RF-CAR-02, RF-CAR-03).
  app.get('/api/clientes', async (request, response, next) => {
    try {
      const page = parsePage(request.query.limit, request.query.offset)
      const search = parseSearch(request.query.buscar)
      const result = await manageCustomers.listCustomers({ ...page, ...(search === undefined ? {} : { search }) })
      response.status(200).json({ items: result.items, total: result.total, ...page })
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.get('/api/clientes/:id', async (request, response, next) => {
    try {
      const detail = await manageCustomers.findCustomerDetail(request.params.id)
      response.status(200).json(detail)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  // Catálogos para los formularios de edición del panel: ramos, estados de
  // póliza, monedas, compañías y planes.
  app.get('/api/catalogos', async (_request, response, next) => {
    try {
      response.status(200).json(await manageCustomerEdits.listCatalogs())
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  // Bandeja de Atención. El actor lo resuelve el backend, nunca el cuerpo del pedido.
  // Bandeja de Atención (RF-SUP-01, RF-SUP-02, RF-DER-02, RF-DER-03, RF-SUP-04). Quién actúa lo
  // resuelve resolvePanelActor: nunca sale del cuerpo del pedido.
  app.get('/api/bandeja', async (request, response, next) => {
    try {
      const page = parsePage(request.query.limit, request.query.offset)
      const result = await manageInbox.listCases(page, await resolvePanelActor())
      response.status(200).json({ items: result.items, total: result.total, ...page })
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  // Ediciones de cartera desde el panel (RF-CAR-01, RF-CAR-02, RF-CAR-03).
  // Cada respuesta devuelve la ficha actualizada del cliente.
  app.post('/api/clientes', async (request, response, next) => {
    try {
      const detail = await manageCustomerEdits.createCustomer(request.body)
      response.status(201).json(detail)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.get('/api/bandeja/:idCaso', async (request, response, next) => {
    try {
      response.status(200).json(await manageInbox.findCase(request.params.idCaso, await resolvePanelActor()))
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.patch('/api/clientes/:id', async (request, response, next) => {
    try {
      const detail = await manageCustomerEdits.updateCustomer(request.params.id, request.body)
      response.status(200).json(detail)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/bandeja/:idCaso/toma', async (request, response, next) => {
    try {
      if (request.body !== undefined) parseBody(request.body, [])
      response.status(200).json(await manageInbox.take(request.params.idCaso, await resolvePanelActor()))
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.delete('/api/clientes/:id', async (request, response, next) => {
    try {
      const result = await manageCustomerEdits.deactivateCustomer(request.params.id)
      response.status(200).json(result)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/bandeja/:idCaso/respuestas', async (request, response, next) => {
    try {
      const body = parseBody(request.body, ['texto'])
      const result = await manageInbox.reply(request.params.idCaso, await resolvePanelActor(), body.texto)
      response.status(result.saved ? 201 : 200).json(result)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/bandeja/:idCaso/cierre', async (request, response, next) => {
    try {
      const body = request.body === undefined ? {} : parseBody(request.body, ['motivo', 'alertasRevisadas'])
      if (body.motivo !== undefined && body.motivo !== null && typeof body.motivo !== 'string') {
        throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El motivo debe ser un texto.')
      }
      if (body.alertasRevisadas !== undefined && typeof body.alertasRevisadas !== 'boolean') {
        throw new RequestManagementError(400, 'VALIDATION_ERROR', 'alertasRevisadas debe ser verdadero o falso.')
      }
      const result = await manageInbox.close(request.params.idCaso, await resolvePanelActor(), {
        reason: typeof body.motivo === 'string' ? body.motivo : null,
        alertsReviewed: body.alertasRevisadas === true,
      })
      response.status(200).json(result)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/clientes/:id/telefonos', async (request, response, next) => {
    try {
      const detail = await manageCustomerEdits.linkPhone(request.params.id, request.body)
      response.status(200).json(detail)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.delete('/api/clientes/:id/telefonos/:telefonoId', async (request, response, next) => {
    try {
      const detail = await manageCustomerEdits.unlinkPhone(request.params.id, request.params.telefonoId)
      response.status(200).json(detail)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  // Alta de una póliza de un cliente que ya existe, con su bien y sus
  // coberturas: carga de cartera (ABM), no emisión.
  app.post('/api/clientes/:id/polizas', async (request, response, next) => {
    try {
      const detail = await manageCustomerEdits.createPolicy(request.params.id, request.body)
      response.status(201).json(detail)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.patch('/api/polizas/:id', async (request, response, next) => {
    try {
      const detail = await manageCustomerEdits.updatePolicy(request.params.id, request.body)
      response.status(200).json(detail)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.put('/api/polizas/:id/coberturas', async (request, response, next) => {
    try {
      const detail = await manageCustomerEdits.replaceCoverages(request.params.id, request.body)
      response.status(200).json(detail)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  // Bandeja de Atención (RF-SUP-01, RF-SUP-02, RF-DER-02, RF-DER-03, RF-SUP-04). Quién actúa lo
  // resuelve resolvePanelActor: nunca sale del cuerpo del pedido.
  app.get('/api/bandeja', async (request, response, next) => {
    try {
      const page = parsePage(request.query.limit, request.query.offset)
      const result = await manageInbox.listCases(page, await resolvePanelActor())
      response.status(200).json({ items: result.items, total: result.total, ...page })
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.get('/api/bandeja/:idCaso', async (request, response, next) => {
    try {
      response.status(200).json(await manageInbox.findCase(request.params.idCaso, await resolvePanelActor()))
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/bandeja/:idCaso/toma', async (request, response, next) => {
    try {
      if (request.body !== undefined) parseBody(request.body, [])
      response.status(200).json(await manageInbox.take(request.params.idCaso, await resolvePanelActor()))
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/bandeja/:idCaso/respuestas', async (request, response, next) => {
    try {
      const body = parseBody(request.body, ['texto'])
      const result = await manageInbox.reply(request.params.idCaso, await resolvePanelActor(), body.texto)
      response.status(result.saved ? 201 : 200).json(result)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  app.post('/api/bandeja/:idCaso/cierre', async (request, response, next) => {
    try {
      const body = request.body === undefined ? {} : parseBody(request.body, ['motivo', 'alertasRevisadas'])
      if (body.motivo !== undefined && body.motivo !== null && typeof body.motivo !== 'string') {
        throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El motivo debe ser un texto.')
      }
      if (body.alertasRevisadas !== undefined && typeof body.alertasRevisadas !== 'boolean') {
        throw new RequestManagementError(400, 'VALIDATION_ERROR', 'alertasRevisadas debe ser verdadero o falso.')
      }
      const result = await manageInbox.close(request.params.idCaso, await resolvePanelActor(), {
        reason: typeof body.motivo === 'string' ? body.motivo : null,
        alertsReviewed: body.alertasRevisadas === true,
      })
      response.status(200).json(result)
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  // La imagen se pide a WhatsApp en el momento: no se guarda ni se deja en caché (RF-ATE-05).
  app.get('/api/bandeja/:idCaso/mensajes/:idMensaje/imagen', async (request, response, next) => {
    try {
      const image = await manageInbox.findImage(request.params.idCaso, request.params.idMensaje)
      response
        .status(200)
        .set({
          'Content-Type': image.mimeType,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'inline',
        })
        .send(Buffer.from(image.data))
    } catch (error) {
      handleRequestError(error, response, next)
    }
  })
  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (isRecord(error) && error.type === 'entity.parse.failed') {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'El cuerpo no contiene JSON válido.' } })
      return
    }
    if (isRecord(error) && error.type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo supera el tamaño permitido.' } })
      return
    }
    console.error(error)
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'No se pudo procesar la solicitud.' } })
  }
  app.use(errorHandler)
  return app
}

function parsePage(limitValue: unknown, offsetValue: unknown): { limit: number; offset: number } {
  const limit = limitValue === undefined ? 25 : parseNonNegativeInteger(limitValue, 'limit')
  const offset = offsetValue === undefined ? 0 : parseNonNegativeInteger(offsetValue, 'offset')
  if (limit < 1 || limit > 100) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'limit debe estar entre 1 y 100.')
  }
  return { limit, offset }
}

function parseSearch(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'buscar debe ser texto.')
  }
  return value
}

function parseNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', `${field} debe ser un entero no negativo.`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', `${field} está fuera del rango permitido.`)
  }
  return parsed
}

function parseProspectDecision(idValue: unknown, value: unknown): ProspectDecisionInput {
  const body = parseBody(value, ['decision', 'fundamento', 'nombre', 'apellido'])
  const id = parseId(idValue)
  const decision = parseDecision(body.decision)
  const fundamento = parseString(body.fundamento, 'fundamento')
  if (decision === 'aprobar') {
    return {
      id,
      decision,
      fundamento,
      nombre: parseString(body.nombre, 'nombre'),
      apellido: parseString(body.apellido, 'apellido'),
    }
  }
  if (body.nombre !== undefined || body.apellido !== undefined) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'No se envían nombre ni apellido al rechazar un prospecto.')
  }
  return {
    id,
    decision,
    fundamento,
  }
}

function parsePhoneChangeDecision(idValue: unknown, value: unknown): PhoneChangeDecisionInput {
  const body = parseBody(value, ['decision', 'fundamento', 'telefonosADesvincular'])
  const ids = body.telefonosADesvincular === undefined ? [] : body.telefonosADesvincular
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'number')) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'telefonosADesvincular debe ser una lista de identificadores.')
  }
  return {
    id: parseId(idValue),
    decision: parseDecision(body.decision),
    fundamento: parseString(body.fundamento, 'fundamento'),
    telefonosADesvincular: ids,
  }
}

function parseBody(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!isRecord(value)) throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El cuerpo contiene campos no permitidos.')
  }
  return value
}

function parseId(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El identificador del trámite no es válido.')
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id > 4_294_967_295) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El identificador del trámite está fuera del rango permitido.')
  }
  return id
}

function parseDecision(value: unknown): 'aprobar' | 'rechazar' {
  if (value !== 'aprobar' && value !== 'rechazar') {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'La decisión debe ser aprobar o rechazar.')
  }
  return value
}

function parseString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', `${field} debe ser texto.`)
  }
  return value
}

function handleRequestError(
  error: unknown,
  response: Response,
  next: NextFunction,
): void {
  if (error instanceof RequestManagementError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } })
    return
  }
  next(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
