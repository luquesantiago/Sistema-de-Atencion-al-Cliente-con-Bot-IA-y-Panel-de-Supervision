import { describe, expect, it } from 'vitest'
import type { ConversationChanges } from '../domain/conversation.js'
import { InMemoryConversationStore } from './in-memory-conversation-store.js'

const phone = '5490000000001'
const at = new Date('2026-10-07T15:00:00Z')

function firstMessage(): ConversationChanges {
  return {
    phone,
    at,
    conversation: { create: true },
    newCases: [{ type: null }, { type: 'cambio de teléfono' }],
    caseTypes: [],
    incoming: { case: { created: 0 }, text: 'hola' },
    replies: [
      { case: { created: 1 }, text: 'aviso de pendiente', answers: 'incoming' },
      { case: { created: 0 }, text: 'bienvenida', answers: 'incoming' },
    ],
    customerId: 7,
    prospect: { case: { created: 0 }, name: 'Laura Inventada', dni: '99000010' },
    phoneChangeRequest: { case: { created: 1 }, customerId: 7 },
  }
}

describe('almacén de conversaciones en memoria', () => {
  it('después de guardar, devuelve la conversación con sus casos, sus mensajes en orden, el prospecto y la solicitud', async () => {
    const store = new InMemoryConversationStore()
    const sent: string[] = []
    const saved = await store.save(firstMessage(), async () => { sent.push('enviado') })

    const open = await store.findOpen(phone)
    expect(open).toMatchObject({ id: saved.conversationId, customerId: 7, suspended: false, startedAt: at })
    expect(open?.cases).toEqual([
      { id: expect.any(Number), type: null, handedOff: false, closedAt: null, hasPending: false },
      { id: expect.any(Number), type: 'cambio de teléfono', handedOff: false, closedAt: null, hasPending: true },
    ])
    expect(open?.messages.map((message) => [message.origin, message.text]))
      .toEqual([['cliente', 'hola'], ['asistente', 'aviso de pendiente'], ['asistente', 'bienvenida']])
    expect(open?.messages[0]?.id).toBe(saved.incomingMessageId)

    const state = store.snapshot()
    expect(state.prospects).toMatchObject([{ name: 'Laura Inventada', dni: '99000010', status: 'pendiente' }])
    expect(state.phoneChanges).toMatchObject([{ customerId: 7, phone, status: 'pendiente' }])
    expect(state.replies.every((reply) => reply.queryMessageId === saved.incomingMessageId && reply.sentMessageId !== null)).toBe(true)
    expect(sent).toEqual(['enviado'])
  })

  it('no crea otra solicitud si ya hay una pendiente para ese cliente y ese número', async () => {
    const store = new InMemoryConversationStore()
    const saved = await store.save(firstMessage(), async () => {})
    await store.save({
      phone,
      at,
      conversation: { existing: saved.conversationId, suspended: false },
      newCases: [{ type: 'cambio de teléfono' }],
      caseTypes: [],
      incoming: { case: { created: 0 }, text: 'otra vez' },
      replies: [],
      phoneChangeRequest: { case: { created: 0 }, customerId: 7 },
    }, async () => {})
    expect(store.snapshot().phoneChanges).toHaveLength(1)
  })

  it('si send lanza, save lanza y lo guardado queda igual que antes', async () => {
    const store = new InMemoryConversationStore()
    await expect(store.save(firstMessage(), async () => { throw new Error('WAHA no respondió') })).rejects.toThrow('WAHA')
    expect(await store.findOpen(phone)).toBeNull()
    expect(store.snapshot()).toMatchObject({ conversations: [], cases: [], messages: [], replies: [], prospects: [], phoneChanges: [] })
  })

  it('si la marca de silencio cambió desde que se leyó, save lanza', async () => {
    const store = new InMemoryConversationStore()
    const saved = await store.save({ ...firstMessage(), handoff: { case: { created: 0 }, reason: 'cliente nuevo' } }, async () => {})
    const changes: ConversationChanges = {
      phone,
      at,
      conversation: { existing: saved.conversationId, suspended: false },
      newCases: [],
      caseTypes: [],
      incoming: { case: { created: 0 }, text: 'hola' },
      replies: [],
    }
    await expect(store.save({ ...changes, newCases: [{ type: null }] }, async () => {})).rejects.toThrow('cambió')
  })
})
