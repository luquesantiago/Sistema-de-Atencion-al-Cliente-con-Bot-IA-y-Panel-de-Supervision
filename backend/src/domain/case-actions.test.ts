import { describe, expect, it } from 'vitest'
import { decideClose, decideRelease, decideReply, decideTake, maxReplyLength, type CaseActionState } from './case-actions.js'

const me = { userId: 10 }
const graciela = 20

function caseState(overrides: Partial<CaseActionState> = {}): CaseActionState {
  return {
    caseId: 1,
    inInbox: true,
    handedOff: true,
    assigneeId: me.userId,
    prospectState: null,
    unattendedAlerts: 0,
    hasCustomerMessage: true,
    ...overrides,
  }
}

describe('tomar un caso (RF-DER-02)', () => {
  it('se puede tomar un caso sin responsable o uno propio', () => {
    expect(decideTake(caseState({ assigneeId: null }), me)).toEqual({ ok: true })
    expect(decideTake(caseState({ assigneeId: me.userId }), me)).toEqual({ ok: true })
  })

  it('el caso que tiene otra persona no se puede tomar', () => {
    expect(decideTake(caseState({ assigneeId: graciela }), me)).toEqual({ ok: false, error: 'taken-by-other' })
  })

  it('el cambio de teléfono pendiente, que no se deriva, también se puede tomar', () => {
    expect(decideTake(caseState({ handedOff: false, assigneeId: null }), me)).toEqual({ ok: true })
  })

  it('un caso que no está en la bandeja no se toma', () => {
    expect(decideTake(caseState({ inInbox: false }), me)).toEqual({ ok: false, error: 'not-in-inbox' })
  })
})

describe('liberar un caso (RF-DER-03)', () => {
  it('el responsable libera un caso derivado sin que el asistente retome la conversación', () => {
    expect(decideRelease(caseState(), me)).toEqual({ ok: true })
  })

  it('un caso sin derivar también se libera', () => {
    expect(decideRelease(caseState({ handedOff: false }), me)).toEqual({ ok: true })
  })

  it('un caso sin responsable o de otro no se libera', () => {
    expect(decideRelease(caseState({ assigneeId: null }), me)).toEqual({ ok: false, error: 'not-assignee' })
    expect(decideRelease(caseState({ assigneeId: graciela }), me)).toEqual({ ok: false, error: 'not-assignee' })
  })

  it('un caso fuera de la bandeja no se libera', () => {
    expect(decideRelease(caseState({ inInbox: false }), me)).toEqual({ ok: false, error: 'not-in-inbox' })
  })
})

describe('contestar desde la bandeja (RF-DER-02)', () => {
  it('el responsable contesta sin volver a tomar el caso', () => {
    expect(decideReply(caseState(), me, '  Hola, le escribo por su reclamo.  ')).toEqual({
      ok: true,
      take: false,
      text: 'Hola, le escribo por su reclamo.',
    })
  })

  it('contestar un caso sin responsable lo toma', () => {
    expect(decideReply(caseState({ assigneeId: null }), me, 'Hola')).toMatchObject({ ok: true, take: true })
  })

  it('un caso de otro responsable no se contesta hasta tomarlo', () => {
    expect(decideReply(caseState({ assigneeId: graciela }), me, 'Hola')).toEqual({ ok: false, error: 'taken-by-other' })
  })

  it('un caso sin derivar no se contesta: el asistente sigue atendiendo', () => {
    expect(decideReply(caseState({ handedOff: false }), me, 'Hola')).toEqual({ ok: false, error: 'not-handed-off' })
  })

  it('un caso sin mensajes del cliente no tiene a qué responder', () => {
    expect(decideReply(caseState({ hasCustomerMessage: false }), me, 'Hola')).toEqual({ ok: false, error: 'no-customer-message' })
  })

  it('un caso fuera de la bandeja no se contesta', () => {
    expect(decideReply(caseState({ inInbox: false }), me, 'Hola')).toEqual({ ok: false, error: 'not-in-inbox' })
  })

  it.each(['', '   \n ', 'x'.repeat(maxReplyLength + 1)])('el texto %# no es válido', (text) => {
    expect(decideReply(caseState(), me, text)).toEqual({ ok: false, error: 'invalid-text' })
  })

  it('un texto del largo máximo es válido', () => {
    expect(decideReply(caseState(), me, 'x'.repeat(maxReplyLength))).toMatchObject({ ok: true })
  })
})

describe('cerrar desde la bandeja (RF-DER-02, RF-DER-03)', () => {
  it('el responsable cierra un reclamo o una baja sin motivo', () => {
    expect(decideClose(caseState(), me, {})).toEqual({
      ok: true,
      discardProspect: false,
      noteOnProspect: false,
      attendAlerts: false,
      reason: null,
    })
  })

  it('un alta pendiente se cierra con motivo y queda descartada', () => {
    expect(decideClose(caseState({ prospectState: 'pendiente' }), me, { reason: ' Lo cargué a mano ' })).toEqual({
      ok: true,
      discardProspect: true,
      noteOnProspect: true,
      attendAlerts: false,
      reason: 'Lo cargué a mano',
    })
  })

  it('un alta rechazada se cierra con motivo, que solo se anota', () => {
    expect(decideClose(caseState({ prospectState: 'descartado' }), me, { reason: 'Se le explicó el rechazo' })).toMatchObject({
      ok: true,
      discardProspect: false,
      noteOnProspect: true,
    })
  })

  it.each([undefined, null, '', '   '])('un alta sin motivo (%s) no se cierra', (reason) => {
    expect(decideClose(caseState({ prospectState: 'pendiente' }), me, { reason })).toEqual({ ok: false, error: 'reason-required' })
    expect(decideClose(caseState({ prospectState: 'descartado' }), me, { reason })).toEqual({ ok: false, error: 'reason-required' })
  })

  it('un motivo de menos de 3 caracteres no es válido', () => {
    expect(decideClose(caseState({ prospectState: 'pendiente' }), me, { reason: 'ok' })).toEqual({ ok: false, error: 'invalid-reason' })
  })

  it('un caso sin responsable o de otro no se cierra hasta tomarlo', () => {
    expect(decideClose(caseState({ assigneeId: null }), me, {})).toEqual({ ok: false, error: 'not-assignee' })
    expect(decideClose(caseState({ assigneeId: graciela }), me, {})).toEqual({ ok: false, error: 'not-assignee' })
  })

  it('el cambio de teléfono pendiente no se cierra desde la bandeja', () => {
    expect(decideClose(caseState({ handedOff: false }), me, {})).toEqual({ ok: false, error: 'not-handed-off' })
  })

  it('un caso fuera de la bandeja no se cierra', () => {
    expect(decideClose(caseState({ inInbox: false }), me, {})).toEqual({ ok: false, error: 'not-in-inbox' })
  })
})

describe('cerrar con alertas sin atender (RF-SUP-04)', () => {
  it('sin confirmar la revisión no se cierra', () => {
    expect(decideClose(caseState({ unattendedAlerts: 2 }), me, {})).toEqual({ ok: false, error: 'alerts-not-reviewed' })
    expect(decideClose(caseState({ unattendedAlerts: 2 }), me, { alertsReviewed: false })).toEqual({
      ok: false,
      error: 'alerts-not-reviewed',
    })
  })

  it('con la revisión confirmada se cierra y las alertas quedan atendidas', () => {
    expect(decideClose(caseState({ unattendedAlerts: 2 }), me, { alertsReviewed: true })).toMatchObject({ ok: true, attendAlerts: true })
  })

  it('sin alertas pendientes no hace falta confirmar nada', () => {
    expect(decideClose(caseState(), me, { alertsReviewed: false })).toMatchObject({ ok: true, attendAlerts: false })
  })
})
