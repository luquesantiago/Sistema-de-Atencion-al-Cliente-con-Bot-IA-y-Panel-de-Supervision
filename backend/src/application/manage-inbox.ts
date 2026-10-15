import type { MessageOrigin, QueryType } from '../domain/conversation.js'
import {
  inboxLabel,
  waitingSince,
  type InboxCustomer,
  type InboxEntry,
  type InboxLabel,
  type InboxLastMessage,
  type InboxRepository,
} from '../domain/inbox.js'
import { RequestManagementError, type PageRequest } from '../domain/request-management.js'
import type { RiskLevel } from '../domain/risk-level.js'

const maxPageSize = 100
const maxId = 4_294_967_295

// Un caso de la Bandeja de Atención como lo recibe el panel (decisión 5 de design.md).
export type InboxItem = {
  caseId: number
  severity: RiskLevel | null
  label: InboxLabel | null
  customer: InboxCustomer | null
  phone: string
  queryType: QueryType | null
  handoffReason: string | null
  lastMessage: InboxLastMessage | null
  assignee: { name: string } | null
  takenAt: Date | null
  waitingSince: Date | null
}

export type InboxItemPage = { items: InboxItem[]; total: number }

export type InboxCaseDetail = {
  case: InboxItem
  messages: Array<{ id: number; caseId: number; origin: MessageOrigin; text: string; at: Date; inCase: boolean }>
}

// Casos de uso de la Bandeja de Atención (RF-SUP-01, RF-SUP-02, RF-DER-02). Solo lectura:
// no toma, no responde ni cierra casos, y no cambia el silencio de ninguna conversación.
export class ManageInbox {
  public constructor(private readonly repository: InboxRepository) {}

  public async listCases(page: PageRequest): Promise<InboxItemPage> {
    validatePage(page)
    const result = await this.repository.listPage(page)
    return { items: result.entries.map(toItem), total: result.total }
  }

  public async findCase(id: string): Promise<InboxCaseDetail> {
    const caseId = Number(id)
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(caseId) || caseId > maxId) {
      throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El identificador del caso no es válido.')
    }
    const conversation = await this.repository.findConversation(caseId)
    if (!conversation) {
      throw new RequestManagementError(404, 'NOT_FOUND', 'El caso no está en la bandeja.')
    }
    return {
      case: toItem(conversation.entry),
      messages: conversation.messages.map((message) => ({ ...message, inCase: message.caseId === caseId })),
    }
  }
}

function toItem(entry: InboxEntry): InboxItem {
  return {
    caseId: entry.caseId,
    severity: entry.severity,
    label: inboxLabel(entry),
    customer: entry.customer,
    phone: entry.phone,
    queryType: entry.queryType,
    handoffReason: entry.handoffReason,
    lastMessage: entry.lastMessage,
    assignee: entry.assignee,
    takenAt: entry.takenAt,
    waitingSince: waitingSince(entry),
  }
}

function validatePage(page: PageRequest): void {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > maxPageSize ||
    !Number.isInteger(page.offset) || page.offset < 0) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'La paginación no es válida.')
  }
}
