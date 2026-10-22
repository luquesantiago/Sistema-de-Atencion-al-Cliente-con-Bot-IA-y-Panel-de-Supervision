import { describe, expect, it } from 'vitest'
import { decideClose, type CloseInput, type PanelActor } from '../domain/case-actions.js'
import type {
  CloseOutcome,
  InboxActionState,
  InboxConversation,
  InboxEntry,
  InboxImageRef,
  InboxPage,
  InboxRepository,
} from '../domain/inbox.js'
import type { PageRequest } from '../domain/request-management.js'
import type { WhatsAppClient, WhatsAppImage } from '../domain/whatsapp-client.js'
import { ManageInbox } from './manage-inbox.js'

const me: PanelActor = { userId: 10 }
const now = new Date('2026-10-15T14:00:00.000Z')

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
    prospectState: 'pendiente',
    pendingPhoneChangeAt: null,
    lastMessage: null,
    ...overrides,
  }
}

function actionState(overrides: Partial<InboxActionState> = {}): InboxActionState {
  return {
    caseId: 12,
    inInbox: true,
    handedOff: true,
    assigneeId: null,
    prospectState: null,
    unattendedAlerts: 0,
    hasCustomerMessage: true,
    phone: '5491100000001',
    takenAt: null,
    ...overrides,
  }
}

// Repositorio en memoria: aplica las mismas reglas del dominio que el de Prisma.
class InMemoryInbox implements InboxRepository {
  public readonly pages: PageRequest[] = []
  public readonly lookups: number[] = []
  public readonly replies: Array<{ caseId: number; text: string; take: boolean }> = []
  public readonly closed: Array<{ caseId: number; input: CloseInput }> = []
  public readonly takes: Array<{ caseId: number; expected: number | null }> = []
  public readonly releases: Array<{ caseId: number; expected: number; resumeAssistant: boolean }> = []
  public failReplySave = false
  public takeConflict = false
  public releaseConflict = false
  public image: InboxImageRef | null = null

  public constructor(
    private readonly entries: InboxEntry[],
    private readonly conversation: InboxConversation | null = null,
    public state: InboxActionState | null = null,
  ) {}

  public async listPage(page: PageRequest): Promise<InboxPage> {
    this.pages.push(page)
    return { entries: this.entries.slice(page.offset, page.offset + page.limit), total: this.entries.length }
  }

  public async findConversation(caseId: number): Promise<InboxConversation | null> {
    this.lookups.push(caseId)
    return this.conversation?.entry.caseId === caseId ? this.conversation : null
  }

  public async findActionState(caseId: number): Promise<InboxActionState | null> {
    this.lookups.push(caseId)
    return this.state?.caseId === caseId ? this.state : null
  }

  public async take(caseId: number, actor: PanelActor, expected: number | null): Promise<boolean> {
    this.takes.push({ caseId, expected })
    if (this.takeConflict || !this.state) return false
    this.state = { ...this.state, assigneeId: actor.userId }
    return true
  }

  public async release(caseId: number, expected: number, resumeAssistant: boolean): Promise<boolean> {
    this.releases.push({ caseId, expected, resumeAssistant })
    if (this.releaseConflict || !this.state) return false
    this.state = { ...this.state, assigneeId: null }
    return true
  }

  public async close(caseId: number, actor: PanelActor, input: CloseInput, at: Date): Promise<CloseOutcome> {
    if (!this.state || this.state.caseId !== caseId) return { ok: false, error: 'not-in-inbox' }
    const plan = decideClose(this.state, actor, input)
    if (!plan.ok) return { ok: false, error: plan.error }
    this.closed.push({ caseId, input })
    this.state = { ...this.state, inInbox: false, unattendedAlerts: 0, prospectState: plan.discardProspect ? 'descartado' : this.state.prospectState }
    return { ok: true, closedAt: at }
  }

  public async recordOperatorReply(caseId: number, actor: PanelActor, text: string, _sentAt: Date, take: boolean) {
    if (this.failReplySave) throw new Error('la base no respondió')
    this.replies.push({ caseId, text, take })
    if (take && this.state?.assigneeId === null) this.state = { ...this.state, assigneeId: actor.userId }
    return { messageId: 77 }
  }

  public async findImage(caseId: number, messageId: number): Promise<InboxImageRef | null> {
    this.lookups.push(caseId, messageId)
    return this.image
  }
}

class FakeWhatsApp implements WhatsAppClient {
  public readonly sent: Array<{ to: string; text: string }> = []
  public readonly downloads: string[] = []
  public failSend = false
  public image: WhatsAppImage | null | Error = { mimeType: 'image/jpeg', data: new Uint8Array([1, 2, 3]) }

  public async sendText(to: string, text: string): Promise<void> {
    if (this.failSend) throw new Error('WAHA no respondió')
    this.sent.push({ to, text })
  }

  public async downloadImage(ref: string): Promise<WhatsAppImage | null> {
    this.downloads.push(ref)
    if (this.image instanceof Error) throw this.image
    return this.image
  }
}

function inbox(repository: InMemoryInbox, whatsapp = new FakeWhatsApp()) {
  return new ManageInbox(repository, whatsapp, () => now)
}

describe('ManageInbox.listCases', () => {
  it('pasa la página validada al repositorio y devuelve cada caso con su etiqueta, su espera y si es mío', async () => {
    const repository = new InMemoryInbox([entry(), entry({ caseId: 13, assignee: { id: me.userId, name: 'Operador Prueba' } })])
    const result = await inbox(repository).listCases({ limit: 25, offset: 0 }, me)
    expect(repository.pages).toEqual([{ limit: 25, offset: 0 }])
    expect(result.total).toBe(2)
    expect(result.items[0]).toEqual(expect.objectContaining({
      caseId: 12,
      severity: 'medio',
      label: 'alta-pendiente',
      handedOff: true,
      assignedToMe: false,
      waitingSince: new Date('2026-10-15T13:00:00.000Z'),
    }))
    expect(result.items[1]).toMatchObject({ assignee: { name: 'Operador Prueba' }, assignedToMe: true })
    expect(result.items[1]?.assignee).not.toHaveProperty('id')
  })

  it.each([{ limit: 0, offset: 0 }, { limit: 101, offset: 0 }, { limit: 25, offset: -1 }, { limit: 2.5, offset: 0 }])(
    'rechaza %o sin consultar el repositorio',
    async (page) => {
      const repository = new InMemoryInbox([entry()])
      await expect(inbox(repository).listCases(page, me)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
      expect(repository.pages).toEqual([])
    },
  )
})

describe('ManageInbox.findCase', () => {
  const conversation: InboxConversation = {
    entry: entry({ caseId: 12, conversationId: 4 }),
    alerts: [{ type: 'Dato no verificable', level: 'alto' }],
    messages: [
      { id: 1, caseId: 11, origin: 'cliente', text: '¿cuándo vence?', at: new Date('2026-10-15T12:00:00.000Z'), hasImage: false, author: null },
      { id: 2, caseId: 11, origin: 'asistente', text: 'Vence el 15/03/2027.', at: new Date('2026-10-15T12:00:00.000Z'), hasImage: false, author: null },
      { id: 3, caseId: 12, origin: 'cliente', text: 'foto', at: new Date('2026-10-15T13:00:00.000Z'), hasImage: true, author: null },
    ],
  }

  it('trae toda la conversación en orden, marca los mensajes del caso y las alertas sin atender', async () => {
    const detail = await inbox(new InMemoryInbox([], conversation)).findCase('12', me)
    expect(detail.case).toMatchObject({ caseId: 12, label: 'alta-pendiente' })
    expect(detail.messages.map((message) => [message.id, message.inCase, message.hasImage])).toEqual([[1, false, false], [2, false, false], [3, true, true]])
    expect(detail.alerts).toEqual([{ type: 'Dato no verificable', level: 'alto' }])
  })

  it.each(['abc', '0', '-3', '1.5', '99999999999'])('rechaza el id %s sin consultar el repositorio', async (id) => {
    const repository = new InMemoryInbox([], conversation)
    await expect(inbox(repository).findCase(id, me)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    expect(repository.lookups).toEqual([])
  })

  it('un caso que no está en la bandeja da NOT_FOUND', async () => {
    await expect(inbox(new InMemoryInbox([], conversation)).findCase('99', me)).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })
})

describe('ManageInbox.take (RF-DER-02)', () => {
  const conversation: InboxConversation = { entry: entry(), alerts: [], messages: [] }

  it('toma un caso de otro responsable con el responsable que se leyó', async () => {
    const repository = new InMemoryInbox([], conversation, actionState({ assigneeId: 20 }))
    await inbox(repository).take('12', me)
    expect(repository.takes).toEqual([{ caseId: 12, expected: 20 }])
  })

  it('un caso que ya es mío no se vuelve a tomar', async () => {
    const repository = new InMemoryInbox([], conversation, actionState({ assigneeId: me.userId }))
    await inbox(repository).take('12', me)
    expect(repository.takes).toEqual([])
  })

  it('si otro lo cambió mientras tanto, CONFLICT', async () => {
    const repository = new InMemoryInbox([], conversation, actionState())
    repository.takeConflict = true
    await expect(inbox(repository).take('12', me)).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' })
  })

  it('un caso fuera de la bandeja da NOT_FOUND', async () => {
    const repository = new InMemoryInbox([], conversation, actionState({ inInbox: false }))
    await expect(inbox(repository).take('12', me)).rejects.toMatchObject({ statusCode: 404 })
    expect(repository.takes).toEqual([])
  })
})

describe('ManageInbox.release', () => {
  it('el responsable devuelve el caso y el asistente retoma la conversación', async () => {
    const repository = new InMemoryInbox([], null, actionState({ assigneeId: me.userId }))
    await expect(inbox(repository).release('12', me)).resolves.toEqual({ caseId: 12, releasedAt: now, assistantResumed: true })
    expect(repository.releases).toEqual([{ caseId: 12, expected: me.userId, resumeAssistant: true }])
  })

  it('un caso sin derivar se libera sin tocar al asistente', async () => {
    const repository = new InMemoryInbox([], null, actionState({ assigneeId: me.userId, handedOff: false }))
    await expect(inbox(repository).release('12', me)).resolves.toMatchObject({ assistantResumed: false })
    expect(repository.releases).toEqual([{ caseId: 12, expected: me.userId, resumeAssistant: false }])
  })

  it('un caso sin responsable o de otro responsable da CONFLICT', async () => {
    await expect(inbox(new InMemoryInbox([], null, actionState())).release('12', me))
      .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' })
    await expect(inbox(new InMemoryInbox([], null, actionState({ assigneeId: 20 }))).release('12', me))
      .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' })
  })

  it('un caso fuera de la bandeja da NOT_FOUND', async () => {
    await expect(inbox(new InMemoryInbox([], null, actionState({ assigneeId: me.userId, inInbox: false }))).release('12', me))
      .rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('si otro lo cambió mientras tanto, CONFLICT', async () => {
    const repository = new InMemoryInbox([], null, actionState({ assigneeId: me.userId }))
    repository.releaseConflict = true
    await expect(inbox(repository).release('12', me)).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' })
  })
})

describe('ManageInbox.reply (RF-DER-02)', () => {
  it('contestar un caso sin tomar envía, guarda y lo toma', async () => {
    const repository = new InMemoryInbox([], null, actionState())
    const whatsapp = new FakeWhatsApp()
    await expect(inbox(repository, whatsapp).reply('12', me, '  Hola, le escribo por su consulta.  ')).resolves.toEqual({
      sent: true,
      saved: true,
      messageId: 77,
    })
    expect(whatsapp.sent).toEqual([{ to: '5491100000001', text: 'Hola, le escribo por su consulta.' }])
    expect(repository.replies).toEqual([{ caseId: 12, text: 'Hola, le escribo por su consulta.', take: true }])
  })

  it('si WhatsApp falla no se guarda nada ni se toma el caso', async () => {
    const repository = new InMemoryInbox([], null, actionState())
    const whatsapp = new FakeWhatsApp()
    whatsapp.failSend = true
    await expect(inbox(repository, whatsapp).reply('12', me, 'Hola')).rejects.toMatchObject({ statusCode: 502, code: 'WHATSAPP_ERROR' })
    expect(repository.replies).toEqual([])
    expect(repository.state?.assigneeId).toBeNull()
  })

  it('si el guardado falla después del envío, avisa que no quedó registrado', async () => {
    const repository = new InMemoryInbox([], null, actionState())
    repository.failReplySave = true
    const whatsapp = new FakeWhatsApp()
    await expect(inbox(repository, whatsapp).reply('12', me, 'Hola')).resolves.toEqual({
      sent: true,
      saved: false,
      warning: 'El mensaje se envió, pero no quedó registrado.',
    })
    expect(whatsapp.sent).toHaveLength(1)
  })

  it('un caso de otro responsable no llama a WhatsApp', async () => {
    const whatsapp = new FakeWhatsApp()
    await expect(inbox(new InMemoryInbox([], null, actionState({ assigneeId: 20 })), whatsapp).reply('12', me, 'Hola'))
      .rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' })
    expect(whatsapp.sent).toEqual([])
  })

  it.each(['', '   ', 42])('el texto %o es un error de validación', async (text) => {
    const whatsapp = new FakeWhatsApp()
    await expect(inbox(new InMemoryInbox([], null, actionState()), whatsapp).reply('12', me, text))
      .rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
    expect(whatsapp.sent).toEqual([])
  })
})

describe('ManageInbox.close (RF-DER-02, RF-DER-03, RF-SUP-04)', () => {
  it('cerrar un alta pendiente con motivo la descarta', async () => {
    const repository = new InMemoryInbox([], null, actionState({ assigneeId: me.userId, prospectState: 'pendiente' }))
    await expect(inbox(repository).close('12', me, { reason: 'Lo cargué a mano' })).resolves.toEqual({ caseId: 12, closedAt: now })
    expect(repository.state?.prospectState).toBe('descartado')
  })

  it('cerrar con alertas sin revisar da CONFLICT y no cambia nada', async () => {
    const repository = new InMemoryInbox([], null, actionState({ assigneeId: me.userId, unattendedAlerts: 1 }))
    await expect(inbox(repository).close('12', me, {})).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' })
    expect(repository.closed).toEqual([])
  })

  it('un alta sin motivo es un error de validación', async () => {
    const repository = new InMemoryInbox([], null, actionState({ assigneeId: me.userId, prospectState: 'descartado' }))
    await expect(inbox(repository).close('12', me, {})).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' })
  })

  it('un caso sin tomar pide tomarlo primero', async () => {
    const repository = new InMemoryInbox([], null, actionState())
    await expect(inbox(repository).close('12', me, {})).rejects.toMatchObject({ statusCode: 409, message: 'Tomá el caso antes de cerrarlo.' })
  })
})

describe('ManageInbox.findImage (RF-SUP-01, RF-ATE-05)', () => {
  it('trae la imagen de WhatsApp en el momento', async () => {
    const repository = new InMemoryInbox([])
    repository.image = { ref: 'false_1@lid_ABC', phone: '5491100000001' }
    const whatsapp = new FakeWhatsApp()
    await expect(inbox(repository, whatsapp).findImage('12', '3')).resolves.toMatchObject({ mimeType: 'image/jpeg' })
    expect(whatsapp.downloads).toEqual(['false_1@lid_ABC'])
  })

  it('un mensaje que no es una imagen de la conversación da NOT_FOUND sin llamar a WhatsApp', async () => {
    const whatsapp = new FakeWhatsApp()
    await expect(inbox(new InMemoryInbox([]), whatsapp).findImage('12', '3')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    expect(whatsapp.downloads).toEqual([])
  })

  it('una imagen que WhatsApp ya no entrega da IMAGE_UNAVAILABLE', async () => {
    const repository = new InMemoryInbox([])
    repository.image = { ref: 'false_1@lid_ABC', phone: '5491100000001' }
    const whatsapp = new FakeWhatsApp()
    whatsapp.image = null
    await expect(inbox(repository, whatsapp).findImage('12', '3')).rejects.toMatchObject({ statusCode: 404, code: 'IMAGE_UNAVAILABLE' })
  })

  it('una falla de WhatsApp da WHATSAPP_ERROR', async () => {
    const repository = new InMemoryInbox([])
    repository.image = { ref: 'false_1@lid_ABC', phone: '5491100000001' }
    const whatsapp = new FakeWhatsApp()
    whatsapp.image = new Error('WAHA caído')
    await expect(inbox(repository, whatsapp).findImage('12', '3')).rejects.toMatchObject({ statusCode: 502, code: 'WHATSAPP_ERROR' })
  })

  it('un id de mensaje inválido es un error de validación', async () => {
    await expect(inbox(new InMemoryInbox([])).findImage('12', 'x')).rejects.toMatchObject({ statusCode: 400 })
  })
})
