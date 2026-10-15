import { describe, expect, it } from 'vitest'
import { inboxLabel, queryTypeRiskLevels, waitingSince, type InboxEntry } from './inbox.js'

// Caso derivado sin nada pendiente. Datos ficticios.
function entry(overrides: Partial<InboxEntry> = {}): InboxEntry {
  return {
    caseId: 1,
    conversationId: 1,
    severity: 'alto',
    customer: { id: 7, name: 'Ana Prueba', document: '99000001' },
    phone: '5491100000001',
    queryType: 'reclamo',
    handoffReason: 'intención: reclamo',
    handedOffAt: new Date('2026-10-15T13:00:00.000Z'),
    takenAt: null,
    assignee: null,
    prospectState: null,
    pendingPhoneChangeAt: null,
    lastMessage: null,
    ...overrides,
  }
}

describe('inboxLabel', () => {
  it('el alta pendiente de un cliente nuevo', () => {
    expect(inboxLabel(entry({ queryType: null, prospectState: 'pendiente' }))).toBe('alta-pendiente')
  })

  it('el alta rechazada que sigue abierta', () => {
    expect(inboxLabel(entry({ queryType: null, prospectState: 'descartado' }))).toBe('alta-rechazada')
  })

  it('un caso sin prospecto no es un alta pendiente ni rechazada', () => {
    expect(inboxLabel(entry({ queryType: null, prospectState: null }))).toBeNull()
  })

  it.each(['baja', 'modificación'] as const)('la %s derivada es un pedido pendiente de aprobación', (queryType) => {
    expect(inboxLabel(entry({ queryType }))).toBe('pedido-pendiente')
  })

  it('el cambio de teléfono pendiente', () => {
    expect(inboxLabel(entry({
      queryType: 'cambio de teléfono',
      handedOffAt: null,
      pendingPhoneChangeAt: new Date('2026-10-15T12:00:00.000Z'),
    }))).toBe('cambio-telefono-pendiente')
  })

  it('una baja sin derivar no lleva la etiqueta de pedido', () => {
    expect(inboxLabel(entry({ queryType: 'baja', handedOffAt: null }))).toBeNull()
  })

  it('un caso derivado sin prospecto ni solicitud no lleva etiqueta', () => {
    expect(inboxLabel(entry())).toBeNull()
  })
})

describe('waitingSince', () => {
  it('cuenta desde la derivación', () => {
    expect(waitingSince(entry())).toEqual(new Date('2026-10-15T13:00:00.000Z'))
  })

  it('un cambio de teléfono sin derivar cuenta desde la solicitud', () => {
    const requestedAt = new Date('2026-10-15T12:00:00.000Z')
    expect(waitingSince(entry({ handedOffAt: null, pendingPhoneChangeAt: requestedAt }))).toEqual(requestedAt)
  })
})

describe('queryTypeRiskLevels', () => {
  it('da los tipos con nivel propio y ninguno más', () => {
    const levels = queryTypeRiskLevels()
    expect(levels).toHaveLength(7)
    expect(levels).toEqual(expect.arrayContaining([
      { type: 'siniestro', level: 'alto' },
      { type: 'reclamo', level: 'alto' },
      { type: 'cotización', level: 'medio' },
      { type: 'cobertura', level: 'medio' },
      { type: 'baja', level: 'medio' },
      { type: 'modificación', level: 'medio' },
      { type: 'cambio de teléfono', level: 'bajo' },
    ]))
  })
})
