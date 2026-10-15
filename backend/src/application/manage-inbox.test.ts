import { describe, expect, it } from 'vitest'
import type { InboxConversation, InboxEntry, InboxPage, InboxRepository } from '../domain/inbox.js'
import type { PageRequest } from '../domain/request-management.js'
import { ManageInbox } from './manage-inbox.js'

// Datos ficticios.
function entry(overrides: Partial<InboxEntry> = {}): InboxEntry {
  return {
    caseId: 12,
    conversationId: 4,
    severity: 'medio',
    customer: null,
    phone: '5491100000001',
    queryType: null,
    handoffReason: 'cliente nuevo',
    handedOffAt: new Date('2026-10-15T13:00:00.000Z'),
    takenAt: null,
    assignee: null,
    hasPendingProspect: true,
    pendingPhoneChangeAt: null,
    lastMessage: null,
    ...overrides,
  }
}

class InMemoryInbox implements InboxRepository {
  public readonly pages: PageRequest[] = []
  public readonly lookups: number[] = []

  public constructor(private readonly entries: InboxEntry[], private readonly conversation: InboxConversation | null = null) {}

  public async listPage(page: PageRequest): Promise<InboxPage> {
    this.pages.push(page)
    return { entries: this.entries.slice(page.offset, page.offset + page.limit), total: this.entries.length }
  }

  public async findConversation(caseId: number): Promise<InboxConversation | null> {
    this.lookups.push(caseId)
    return this.conversation?.entry.caseId === caseId ? this.conversation : null
  }
}

describe('ManageInbox.listCases', () => {
  it('pasa la página validada al repositorio y devuelve cada caso con su etiqueta y su espera', async () => {
    const repository = new InMemoryInbox([entry()])
    const result = await new ManageInbox(repository).listCases({ limit: 25, offset: 0 })
    expect(repository.pages).toEqual([{ limit: 25, offset: 0 }])
    expect(result.total).toBe(1)
    expect(result.items).toEqual([expect.objectContaining({
      caseId: 12,
      severity: 'medio',
      label: 'alta-pendiente',
      waitingSince: new Date('2026-10-15T13:00:00.000Z'),
    })])
  })

  it.each([{ limit: 0, offset: 0 }, { limit: 101, offset: 0 }, { limit: 25, offset: -1 }, { limit: 2.5, offset: 0 }])(
    'rechaza %o sin consultar el repositorio',
    async (page) => {
      const repository = new InMemoryInbox([entry()])
      await expect(new ManageInbox(repository).listCases(page)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
      expect(repository.pages).toEqual([])
    },
  )
})

describe('ManageInbox.findCase', () => {
  const conversation: InboxConversation = {
    entry: entry({ caseId: 12, conversationId: 4 }),
    messages: [
      { id: 1, caseId: 11, origin: 'cliente', text: '¿cuándo vence?', at: new Date('2026-10-15T12:00:00.000Z') },
      { id: 2, caseId: 11, origin: 'asistente', text: 'Vence el 15/03/2027.', at: new Date('2026-10-15T12:00:00.000Z') },
      { id: 3, caseId: 12, origin: 'cliente', text: 'soy nuevo', at: new Date('2026-10-15T13:00:00.000Z') },
    ],
  }

  it('trae toda la conversación en orden y marca los mensajes del caso', async () => {
    const detail = await new ManageInbox(new InMemoryInbox([], conversation)).findCase('12')
    expect(detail.case).toMatchObject({ caseId: 12, label: 'alta-pendiente' })
    expect(detail.messages.map((message) => [message.id, message.inCase])).toEqual([[1, false], [2, false], [3, true]])
  })

  it.each(['abc', '0', '-3', '1.5', '99999999999'])('rechaza el id %s sin consultar el repositorio', async (id) => {
    const repository = new InMemoryInbox([], conversation)
    await expect(new ManageInbox(repository).findCase(id)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    expect(repository.lookups).toEqual([])
  })

  it('un caso que no está en la bandeja da NOT_FOUND', async () => {
    await expect(new ManageInbox(new InMemoryInbox([], conversation)).findCase('99')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })
})
