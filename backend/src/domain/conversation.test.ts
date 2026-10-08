import { describe, expect, it } from 'vitest'
import {
  caseForMessage,
  casesClosedWithConversation,
  endByInactivity,
  endByRestart,
  intentContext,
  isQueryType,
  parseSettings,
  type ConversationCase,
  type ConversationMessage,
  type OpenConversation,
} from './conversation.js'
import type { Intent } from './intent.js'

const now = new Date('2026-10-07T15:00:00Z')
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

function aCase(id: number, overrides: Partial<ConversationCase> = {}): ConversationCase {
  return { id, type: null, handedOff: false, closedAt: null, hasPending: false, ...overrides }
}

function conversation(overrides: Partial<OpenConversation> = {}): OpenConversation {
  return { id: 1, customerId: 7, suspended: false, startedAt: minutesAgo(60), cases: [], messages: [], ...overrides }
}

function withLastMessage(at: Date, overrides: Partial<OpenConversation> = {}): OpenConversation {
  return conversation({
    cases: [aCase(10)],
    messages: [{ id: 100, caseId: 10, origin: 'cliente', text: 'hola', sentAt: at }],
    ...overrides,
  })
}

describe('el caso de cada mensaje', () => {
  it('sin conversación o sin casos no cerrados abre un caso sin tipo', () => {
    expect(caseForMessage(null, { kind: 'identifying' })).toEqual({ kind: 'new', type: null })
    const allClosed = conversation({ cases: [aCase(10, { closedAt: minutesAgo(5) })] })
    expect(caseForMessage(allClosed, { kind: 'identifying' })).toEqual({ kind: 'new', type: null })
  })

  it('antes de identificarse usa el caso actual', () => {
    const open = conversation({ cases: [aCase(10, { closedAt: minutesAgo(5) }), aCase(11)] })
    expect(caseForMessage(open, { kind: 'identifying' })).toEqual({ kind: 'existing', caseId: 11, setType: null })
  })

  it('un caso sin tipo toma el de la primera intención del catálogo', () => {
    const open = conversation({ cases: [aCase(10)] })
    expect(caseForMessage(open, { kind: 'intent', intent: 'vencimiento' }))
      .toEqual({ kind: 'existing', caseId: 10, setType: 'vencimiento' })
  })

  it('misma intención, mismo caso; intención distinta, caso nuevo con ese tipo', () => {
    const open = conversation({ cases: [aCase(10, { type: 'vencimiento' })] })
    expect(caseForMessage(open, { kind: 'intent', intent: 'vencimiento' }))
      .toEqual({ kind: 'existing', caseId: 10, setType: null })
    expect(caseForMessage(open, { kind: 'intent', intent: 'saludo' })).toEqual({ kind: 'new', type: 'saludo' })
  })

  it('la consulta guardada usa su propio caso, aunque haya otro más reciente', () => {
    const open = conversation({ cases: [aCase(10), aCase(11, { type: 'cambio de teléfono', hasPending: true })] })
    expect(caseForMessage(open, { kind: 'intent', intent: 'estado de póliza', caseId: 10 }))
      .toEqual({ kind: 'existing', caseId: 10, setType: 'estado de póliza' })
  })

  it('el DNI que crea la solicitud va a un caso nuevo de cambio de teléfono, y otra intención no lo reutiliza', () => {
    expect(caseForMessage(conversation({ cases: [aCase(10)] }), { kind: 'phone-change-request' }))
      .toEqual({ kind: 'new', type: 'cambio de teléfono' })
    const afterRequest = conversation({ cases: [aCase(10, { type: 'vencimiento' }), aCase(11, { type: 'cambio de teléfono', hasPending: true })] })
    expect(caseForMessage(afterRequest, { kind: 'intent', intent: 'saludo' })).toEqual({ kind: 'new', type: 'saludo' })
  })

  it.each<Intent>(['otra consulta', 'no se entiende'])('«%s» va al caso actual si no tiene tipo', (intent) => {
    const untyped = conversation({ cases: [aCase(10)] })
    expect(caseForMessage(untyped, { kind: 'intent', intent })).toEqual({ kind: 'existing', caseId: 10, setType: null })
  })

  it.each<Intent>(['otra consulta', 'no se entiende'])('«%s» con un caso actual con tipo, o sin caso abierto, va a uno nuevo sin tipo', (intent) => {
    const expiration = conversation({ cases: [aCase(10, { type: 'vencimiento' })] })
    const phoneChange = conversation({ cases: [aCase(10, { type: 'vencimiento' }), aCase(11, { type: 'cambio de teléfono', hasPending: true })] })
    expect(caseForMessage(expiration, { kind: 'intent', intent })).toEqual({ kind: 'new', type: null })
    expect(caseForMessage(phoneChange, { kind: 'intent', intent })).toEqual({ kind: 'new', type: null })
    expect(caseForMessage(null, { kind: 'intent', intent })).toEqual({ kind: 'new', type: null })
  })

  it('otro DNI va a un caso sin tipo', () => {
    const untyped = conversation({ cases: [aCase(10)] })
    const typed = conversation({ cases: [aCase(10, { type: 'vencimiento' })] })
    expect(caseForMessage(untyped, { kind: 'untyped-handoff' })).toEqual({ kind: 'existing', caseId: 10, setType: null })
    expect(caseForMessage(typed, { kind: 'untyped-handoff' })).toEqual({ kind: 'new', type: null })
  })

  it('«no es de seguros», «otra consulta» y «no se entiende» no son tipos de consulta', () => {
    expect(isQueryType('vencimiento')).toBe(true)
    expect(isQueryType('no es de seguros')).toBe(false)
    expect(isQueryType('otra consulta')).toBe(false)
    expect(isQueryType('no se entiende')).toBe(false)
  })

  it('«no es de seguros» va al caso actual sin cambiarlo', () => {
    const typed = conversation({ cases: [aCase(10, { type: 'vencimiento' })] })
    expect(caseForMessage(typed, { kind: 'intent', intent: 'no es de seguros' }))
      .toEqual({ kind: 'existing', caseId: 10, setType: null })
    expect(caseForMessage(null, { kind: 'intent', intent: 'no es de seguros' })).toEqual({ kind: 'new', type: null })
  })

  it('una conversación suspendida usa el caso derivado sin cerrar más reciente', () => {
    const suspended = conversation({
      suspended: true,
      cases: [
        aCase(10, { handedOff: true, closedAt: minutesAgo(30) }),
        aCase(11, { handedOff: true }),
        aCase(12, { type: 'saludo' }),
      ],
    })
    expect(caseForMessage(suspended, { kind: 'suspended' })).toEqual({ kind: 'existing', caseId: 11, setType: null })
    const withoutHandoff = conversation({ suspended: true, cases: [aCase(12)] })
    expect(caseForMessage(withoutHandoff, { kind: 'suspended' })).toEqual({ kind: 'existing', caseId: 12, setType: null })
    expect(caseForMessage(conversation({ suspended: true }), { kind: 'suspended' })).toEqual({ kind: 'new', type: null })
  })

  it('un caso actual derivado no toma otra intención', () => {
    const open = conversation({ cases: [aCase(10, { handedOff: true })] })
    expect(caseForMessage(open, { kind: 'intent', intent: 'vencimiento' })).toEqual({ kind: 'new', type: 'vencimiento' })
  })
})

describe('cierre por inactividad', () => {
  it('con 30 minutos, a los 29 no vence y a los 31 sí, a la hora en que se cumplió el plazo', () => {
    expect(endByInactivity(withLastMessage(minutesAgo(29)), now, 30)).toBeNull()
    expect(endByInactivity(withLastMessage(minutesAgo(31)), now, 30))
      .toEqual({ endedAt: minutesAgo(1), caseIds: [10] })
  })

  it('sin mensajes cuenta desde el inicio', () => {
    expect(endByInactivity(conversation({ startedAt: minutesAgo(31) }), now, 30)?.endedAt).toEqual(minutesAgo(1))
  })

  it('un caso derivado cerrado después del plazo: termina a la hora del cierre', () => {
    const closedLate = withLastMessage(minutesAgo(120), {
      cases: [aCase(10, { handedOff: true, closedAt: minutesAgo(10) })],
    })
    expect(endByInactivity(closedLate, now, 30)).toEqual({ endedAt: minutesAgo(10), caseIds: [] })
  })

  it('un caso derivado cerrado dentro del plazo: termina cuando se cumplió el plazo', () => {
    const closedEarly = withLastMessage(minutesAgo(40), {
      cases: [aCase(10, { handedOff: true, closedAt: minutesAgo(35) })],
    })
    expect(endByInactivity(closedEarly, now, 30)?.endedAt).toEqual(minutesAgo(10))
  })

  it('una conversación suspendida o con un caso derivado sin cerrar no vence', () => {
    expect(endByInactivity(withLastMessage(minutesAgo(600), { suspended: true }), now, 30)).toBeNull()
    const openHandoff = withLastMessage(minutesAgo(600), { cases: [aCase(10, { handedOff: true })] })
    expect(endByInactivity(openHandoff, now, 30)).toBeNull()
  })
})

describe('cierre por reinicio', () => {
  it('termina a la hora del último mensaje', () => {
    expect(endByRestart(withLastMessage(minutesAgo(3)))).toEqual({ endedAt: minutesAgo(3), caseIds: [10] })
  })

  it('o a la hora del cierre de un caso derivado, si es posterior', () => {
    const closedLater = withLastMessage(minutesAgo(30), {
      cases: [aCase(10, { handedOff: true, closedAt: minutesAgo(5) }), aCase(11)],
    })
    expect(endByRestart(closedLater)).toEqual({ endedAt: minutesAgo(5), caseIds: [11] })
  })
})

describe('casos que se cierran con la conversación', () => {
  it('no se cierran los derivados, los ya cerrados ni los que tienen algo pendiente', () => {
    const open = conversation({
      cases: [
        aCase(10),
        aCase(11, { handedOff: true }),
        aCase(12, { closedAt: minutesAgo(5) }),
        aCase(13, { hasPending: true }),
        aCase(14, { type: 'saludo' }),
      ],
    })
    expect(casesClosedWithConversation(open)).toEqual([10, 14])
  })
})

describe('parseSettings', () => {
  const rows = [
    { clave: 'max_intentos_dni', valor: '3' },
    { clave: 'minutos_max_caso_sin_tomar', valor: '60' },
    { clave: 'minutos_inactividad_sesion', valor: '30' },
  ]

  it('con los valores de la migración de catálogos da 3 y 30', () => {
    expect(parseSettings(rows)).toEqual({ maxDniRetries: 3, inactivityMinutes: 30 })
  })

  it('un parámetro ausente lanza', () => {
    expect(() => parseSettings(rows.filter((row) => row.clave !== 'max_intentos_dni'))).toThrow('max_intentos_dni')
  })

  it.each(['0', '-1', 'abc', '', '2.5'])('el valor «%s» lanza', (valor) => {
    const invalid = rows.map((row) => (row.clave === 'minutos_inactividad_sesion' ? { ...row, valor } : row))
    expect(() => parseSettings(invalid)).toThrow('minutos_inactividad_sesion')
  })
})

describe('el contexto para elegir la intención', () => {
  const message = (id: number, origin: ConversationMessage['origin'], text: string): ConversationMessage =>
    ({ id, caseId: 10, origin, text, sentAt: minutesAgo(20 - id) })

  it('con 6 mensajes da los 4 últimos, en orden', () => {
    const open = conversation({
      messages: [1, 2, 3, 4, 5, 6].map((id) => message(id, id % 2 === 1 ? 'cliente' : 'asistente', `m${id}`)),
    })
    expect(intentContext(open)).toEqual([
      { from: 'cliente', text: 'm3' },
      { from: 'asistente', text: 'm4' },
      { from: 'cliente', text: 'm5' },
      { from: 'asistente', text: 'm6' },
    ])
  })

  it('no entran los mensajes del operador y el DNI sale tapado', () => {
    const open = conversation({
      messages: [message(1, 'cliente', 'mi DNI es 30.111.222'), message(2, 'operador', 'Hola, soy del equipo'), message(3, 'asistente', 'Gracias.')],
    })
    expect(intentContext(open)).toEqual([
      { from: 'cliente', text: 'mi DNI es [DNI]' },
      { from: 'asistente', text: 'Gracias.' },
    ])
  })

  it('para la consulta guardada, solo entran los mensajes anteriores a ella', () => {
    const open = conversation({ messages: [message(1, 'cliente', 'a'), message(2, 'cliente', '¿cuándo vence?'), message(3, 'asistente', 'b')] })
    expect(intentContext(open, 2)).toEqual([{ from: 'cliente', text: 'a' }])
    expect(intentContext(open, 1)).toEqual([])
  })

  it('sin conversación o sin mensajes, el contexto queda vacío', () => {
    expect(intentContext(null)).toEqual([])
    expect(intentContext(conversation())).toEqual([])
  })
})
