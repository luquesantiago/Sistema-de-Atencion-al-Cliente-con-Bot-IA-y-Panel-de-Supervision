import {
  decideRelease,
  decideReply,
  decideTake,
  type CloseError,
  type PanelActor,
  type ReleaseError,
  type ReplyError,
  type TakeError,
} from '../domain/case-actions.js'
import type { MessageOrigin, QueryType } from '../domain/conversation.js'
import {
  inboxLabel,
  waitingSince,
  type InboxAlert,
  type InboxCustomer,
  type InboxEntry,
  type InboxLabel,
  type InboxLastMessage,
  type InboxRepository,
} from '../domain/inbox.js'
import { RequestManagementError, type PageRequest } from '../domain/request-management.js'
import type { RiskLevel } from '../domain/risk-level.js'
import type { WhatsAppClient, WhatsAppImage } from '../domain/whatsapp-client.js'

const maxPageSize = 100
const maxId = 4_294_967_295

// Un caso de la Bandeja de Atención como lo recibe el panel (decisión 5 de design.md de
// bandeja-atencion-lectura; assignedToMe, decisión 1 de bandeja-atender-casos).
export type InboxItem = {
  caseId: number
  severity: RiskLevel | null
  label: InboxLabel | null
  customer: InboxCustomer | null
  phone: string
  queryType: QueryType | null
  handoffReason: string | null
  handedOff: boolean
  lastMessage: InboxLastMessage | null
  assignee: { name: string } | null
  assignedToMe: boolean
  takenAt: Date | null
  waitingSince: Date | null
}

export type InboxItemPage = { items: InboxItem[]; total: number }

export type InboxCaseDetail = {
  case: InboxItem
  alerts: InboxAlert[]
  messages: Array<{
    id: number
    caseId: number
    origin: MessageOrigin
    text: string
    at: Date
    inCase: boolean
    hasImage: boolean
    author: { name: string } | null
  }>
}

export type ReplyResult =
  | { sent: true; saved: true; messageId: number }
  | { sent: true; saved: false; warning: string }

export type ReleaseResult = { caseId: number; releasedAt: Date }

export type CloseRequest = { reason?: string | null; alertsReviewed?: boolean }

const takeErrors: Record<TakeError, () => RequestManagementError> = {
  'not-in-inbox': () => notInInbox(),
  'taken-by-other': () => new RequestManagementError(409, 'CONFLICT', 'El caso lo tiene otra persona: tiene que liberarlo antes.'),
}

const replyErrors: Record<ReplyError, () => RequestManagementError> = {
  'invalid-text': () => new RequestManagementError(400, 'VALIDATION_ERROR', 'El mensaje no puede estar vacío ni superar los 4096 caracteres.'),
  'not-in-inbox': () => new RequestManagementError(404, 'NOT_FOUND', 'El caso no está en la bandeja.'),
  'not-handed-off': () => new RequestManagementError(409, 'CONFLICT', 'En este caso el asistente sigue atendiendo: solo se contesta un caso derivado.'),
  'taken-by-other': () => new RequestManagementError(409, 'CONFLICT', 'El caso lo tiene otra persona: solo su responsable puede contestar.'),
  'no-customer-message': () => new RequestManagementError(409, 'CONFLICT', 'El caso no tiene un mensaje del cliente para responder.'),
}

const releaseErrors: Record<ReleaseError | 'changed', () => RequestManagementError> = {
  'not-in-inbox': () => new RequestManagementError(404, 'NOT_FOUND', 'El caso no está en la bandeja.'),
  'not-assignee': () => new RequestManagementError(409, 'CONFLICT', 'Solo el responsable puede liberar el caso.'),
  changed: () => new RequestManagementError(409, 'CONFLICT', 'El caso cambió mientras lo liberabas. Volvé a intentarlo.'),
}

const closeErrors: Record<CloseError | 'changed', () => RequestManagementError> = {
  'not-in-inbox': () => new RequestManagementError(404, 'NOT_FOUND', 'El caso no está en la bandeja.'),
  'not-handed-off': () => new RequestManagementError(409, 'CONFLICT', 'Este caso no está derivado: se cierra al decidir el trámite en Trámites.'),
  'not-assignee': () => new RequestManagementError(409, 'CONFLICT', 'Solo el responsable puede cerrar el caso: si no tiene responsable, tomalo antes.'),
  'reason-required': () => new RequestManagementError(400, 'VALIDATION_ERROR', 'Para cerrar el caso de un alta hace falta un motivo.'),
  'invalid-reason': () => new RequestManagementError(400, 'VALIDATION_ERROR', 'El motivo debe tener entre 3 y 2000 caracteres.'),
  'alerts-not-reviewed': () => new RequestManagementError(409, 'CONFLICT', 'El caso tiene alertas sin revisar: confirmá que las revisaste para cerrarlo.'),
  changed: () => new RequestManagementError(409, 'CONFLICT', 'El caso cambió mientras lo cerrabas. Volvé a intentarlo.'),
}

// Casos de uso de la Bandeja de Atención (RF-SUP-01, RF-SUP-02, RF-DER-02, RF-DER-03, RF-SUP-04).
// Las reglas de tomar, contestar y cerrar están en domain/case-actions.ts.
export class ManageInbox {
  public constructor(
    private readonly repository: InboxRepository,
    private readonly whatsapp: WhatsAppClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public async listCases(page: PageRequest, actor: PanelActor): Promise<InboxItemPage> {
    validatePage(page)
    const result = await this.repository.listPage(page)
    return { items: result.entries.map((entry) => toItem(entry, actor)), total: result.total }
  }

  public async findCase(id: string, actor: PanelActor): Promise<InboxCaseDetail> {
    const caseId = parseCaseId(id)
    const conversation = await this.repository.findConversation(caseId)
    if (!conversation) throw notInInbox()
    return {
      case: toItem(conversation.entry, actor),
      alerts: conversation.alerts,
      messages: conversation.messages.map((message) => ({ ...message, inCase: message.caseId === caseId })),
    }
  }

  public async take(id: string, actor: PanelActor): Promise<InboxItem> {
    const caseId = parseCaseId(id)
    const state = await this.repository.findActionState(caseId)
    if (!state) throw notInInbox()
    const decision = decideTake(state, actor)
    if (!decision.ok) throw takeErrors[decision.error]()
    if (state.assigneeId !== actor.userId) {
      const taken = await this.repository.take(caseId, actor, state.assigneeId, this.clock())
      if (!taken) throw new RequestManagementError(409, 'CONFLICT', 'El caso cambió mientras lo tomabas. Volvé a intentarlo.')
      console.log(`[bandeja] caso ${caseId} tomado por el usuario ${actor.userId}`)
    }
    const conversation = await this.repository.findConversation(caseId)
    if (!conversation) throw notInInbox()
    return toItem(conversation.entry, actor)
  }

  public async release(id: string, actor: PanelActor): Promise<ReleaseResult> {
    const caseId = parseCaseId(id)
    const state = await this.repository.findActionState(caseId)
    if (!state) throw releaseErrors['not-in-inbox']()
    const decision = decideRelease(state, actor)
    if (!decision.ok) throw releaseErrors[decision.error]()
    const releasedAt = this.clock()
    const released = await this.repository.release(caseId, actor.userId)
    if (!released) throw releaseErrors.changed()
    console.log(`[bandeja] caso ${caseId} liberado por el usuario ${actor.userId}`)
    return { caseId, releasedAt }
  }

  // Primero WhatsApp y después la base (decisión 5): la base registra lo que efectivamente salió.
  public async reply(id: string, actor: PanelActor, text: unknown): Promise<ReplyResult> {
    const caseId = parseCaseId(id)
    if (typeof text !== 'string') throw replyErrors['invalid-text']()
    const state = await this.repository.findActionState(caseId)
    if (!state) throw notInInbox()
    const decision = decideReply(state, actor, text)
    if (!decision.ok) throw replyErrors[decision.error]()

    try {
      await this.whatsapp.sendText(state.phone, decision.text)
    } catch {
      console.error(`[bandeja] no se pudo enviar la respuesta del caso ${caseId}`)
      throw new RequestManagementError(502, 'WHATSAPP_ERROR', 'No se pudo enviar el mensaje por WhatsApp.')
    }
    try {
      const saved = await this.repository.recordOperatorReply(caseId, actor, decision.text, this.clock(), decision.take)
      return { sent: true, saved: true, messageId: saved.messageId }
    } catch {
      // Ya salió: no se reintenta, para no duplicarlo.
      console.error(`[bandeja] la respuesta del caso ${caseId} se envió pero no se pudo guardar`)
      return { sent: true, saved: false, warning: 'El mensaje se envió, pero no quedó registrado.' }
    }
  }

  public async close(id: string, actor: PanelActor, request: CloseRequest): Promise<{ caseId: number; closedAt: Date }> {
    const caseId = parseCaseId(id)
    const outcome = await this.repository.close(caseId, actor, request, this.clock())
    if (!outcome.ok) throw closeErrors[outcome.error]()
    return { caseId, closedAt: outcome.closedAt }
  }

  // La imagen se pide a WhatsApp en el momento y no se guarda (decisión 7).
  public async findImage(caseIdText: string, messageIdText: string): Promise<WhatsAppImage> {
    const caseId = parseCaseId(caseIdText)
    const messageId = parseId(messageIdText, 'El identificador del mensaje no es válido.')
    const image = await this.repository.findImage(caseId, messageId)
    if (!image) throw new RequestManagementError(404, 'NOT_FOUND', 'No se encontró la imagen en este caso.')
    let downloaded: WhatsAppImage | null
    try {
      downloaded = await this.whatsapp.downloadImage(image.ref, image.phone)
    } catch {
      console.error(`[bandeja] no se pudo traer una imagen del caso ${caseId}`)
      throw new RequestManagementError(502, 'WHATSAPP_ERROR', 'No se pudo traer la imagen de WhatsApp.')
    }
    if (!downloaded) throw new RequestManagementError(404, 'IMAGE_UNAVAILABLE', 'La imagen ya no está disponible.')
    return downloaded
  }
}

function toItem(entry: InboxEntry, actor: PanelActor): InboxItem {
  return {
    caseId: entry.caseId,
    severity: entry.severity,
    label: inboxLabel(entry),
    customer: entry.customer,
    phone: entry.phone,
    queryType: entry.queryType,
    handoffReason: entry.handoffReason,
    handedOff: entry.handedOffAt !== null,
    lastMessage: entry.lastMessage,
    assignee: entry.assignee ? { name: entry.assignee.name } : null,
    assignedToMe: entry.assignee?.id === actor.userId,
    takenAt: entry.takenAt,
    waitingSince: waitingSince(entry),
  }
}

function notInInbox(): RequestManagementError {
  return new RequestManagementError(404, 'NOT_FOUND', 'El caso no está en la bandeja.')
}

function parseCaseId(id: string): number {
  return parseId(id, 'El identificador del caso no es válido.')
}

function parseId(id: string, message: string): number {
  const value = Number(id)
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(value) || value > maxId) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', message)
  }
  return value
}

function validatePage(page: PageRequest): void {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > maxPageSize ||
    !Number.isInteger(page.offset) || page.offset < 0) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'La paginación no es válida.')
  }
}
