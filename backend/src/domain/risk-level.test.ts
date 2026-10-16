import { describe, expect, it } from 'vitest'
import type { QueryType } from './conversation.js'
import type { HandoffReason } from './handoff.js'
import {
  handoffRiskLevel,
  mostSevere,
  queryTypeRiskLevel,
  reasonRiskLevel,
  type RiskLevel,
  type Urgency,
} from './risk-level.js'

describe('mostSevere', () => {
  it('se queda con el más grave e ignora los null', () => {
    expect(mostSevere(['bajo', null, 'alto', 'medio'])).toBe('alto')
    expect(mostSevere(['medio', 'crítico'])).toBe('crítico')
  })

  it('sin niveles devuelve null', () => {
    expect(mostSevere([])).toBeNull()
    expect(mostSevere([null, null])).toBeNull()
  })
})

describe('queryTypeRiskLevel', () => {
  it.each<[QueryType, RiskLevel]>([
    ['siniestro', 'alto'],
    ['reclamo', 'alto'],
    ['cotización', 'medio'],
    ['cobertura', 'medio'],
    ['baja', 'medio'],
    ['modificación', 'medio'],
    ['cambio de teléfono', 'bajo'],
  ])('%s → %s', (type, level) => {
    expect(queryTypeRiskLevel(type)).toBe(level)
  })

  it.each<QueryType | null>(['saldo', 'vencimiento', 'estado de póliza', 'saludo', 'información de la agencia', null])(
    '%s no tiene nivel propio',
    (type) => {
      expect(queryTypeRiskLevel(type)).toBeNull()
    },
  )
})

describe('reasonRiskLevel', () => {
  it.each<[HandoffReason, RiskLevel]>([
    [{ kind: 'new-customer' }, 'medio'],
    [{ kind: 'dni-unrecognized' }, 'medio'],
    [{ kind: 'dni-other-person' }, 'medio'],
    [{ kind: 'customer-missing' }, 'medio'],
    [{ kind: 'rewrite-rejected', detail: 'cambió un importe' }, 'medio'],
    [{ kind: 'not-understood' }, 'bajo'],
    [{ kind: 'intent', intent: 'otra consulta' }, 'bajo'],
    [{ kind: 'missing-data', data: 'policies' }, 'bajo'],
    [{ kind: 'missing-data', data: 'installments' }, 'bajo'],
    [{ kind: 'missing-data', data: 'agency-info' }, 'bajo'],
    [{ kind: 'provider-failure', step: 'customer-status' }, 'bajo'],
    [{ kind: 'provider-failure', step: 'intent' }, 'bajo'],
    [{ kind: 'provider-failure', step: 'rewrite' }, 'bajo'],
    [{ kind: 'intent', intent: 'reclamo' }, 'alto'],
    [{ kind: 'intent', intent: 'cotización' }, 'medio'],
    [{ kind: 'approval', intent: 'baja' }, 'medio'],
    [{ kind: 'approval', intent: 'modificación' }, 'medio'],
  ])('%o → %s', (reason, level) => {
    expect(reasonRiskLevel(reason)).toBe(level)
  })
})

describe('handoffRiskLevel', () => {
  const claim: HandoffReason = { kind: 'intent', intent: 'siniestro' }

  it('un siniestro grave sube a crítico', () => {
    expect(handoffRiskLevel({ reason: claim, caseType: 'siniestro', urgency: 'grave' })).toBe('crítico')
  })

  it.each<Urgency | null>(['normal', null])('un siniestro con urgencia %s queda en el piso: alto', (urgency) => {
    expect(handoffRiskLevel({ reason: claim, caseType: 'siniestro', urgency })).toBe('alto')
  })

  it.each<QueryType>(['reclamo', 'cotización'])('la urgencia grave en %s no sube el nivel', (type) => {
    const level = handoffRiskLevel({ reason: { kind: 'intent', intent: type }, caseType: type, urgency: 'grave' })
    expect(level).toBe(queryTypeRiskLevel(type))
  })

  it('gana el más grave: un reclamo derivado por falla del proveedor queda alto', () => {
    expect(handoffRiskLevel({
      reason: { kind: 'provider-failure', step: 'rewrite' },
      caseType: 'reclamo',
      urgency: null,
    })).toBe('alto')
  })

  it('un saldo derivado por una póliza sin cuotas queda bajo', () => {
    expect(handoffRiskLevel({
      reason: { kind: 'missing-data', data: 'installments' },
      caseType: 'saldo',
      urgency: null,
    })).toBe('bajo')
  })

  it('una redacción rechazada de un vencimiento queda medio', () => {
    expect(handoffRiskLevel({
      reason: { kind: 'rewrite-rejected', detail: 'cambió una fecha' },
      caseType: 'vencimiento',
      urgency: null,
    })).toBe('medio')
  })

  it('el cliente nuevo, sin tipo de consulta, queda medio', () => {
    expect(handoffRiskLevel({ reason: { kind: 'new-customer' }, caseType: null, urgency: null })).toBe('medio')
  })
})
