import { describe, expect, it } from 'vitest'
import { actionForIntent, clarificationStep, intents, isIntent, type Intent } from './intent.js'

describe('actionForIntent', () => {
  it('responde vencimiento, estado de póliza, saludo e información de la agencia', () => {
    expect(actionForIntent('vencimiento')).toEqual({ kind: 'answer', template: 'expirations' })
    expect(actionForIntent('estado de póliza')).toEqual({ kind: 'answer', template: 'statuses' })
    expect(actionForIntent('saludo')).toEqual({ kind: 'answer', template: 'courtesy' })
    expect(actionForIntent('información de la agencia')).toEqual({ kind: 'answer', template: 'agency' })
  })

  it.each<Intent>(['siniestro', 'cotización', 'saldo', 'cobertura', 'reclamo', 'otra consulta'])('deriva %s', (intent) => {
    expect(actionForIntent(intent)).toEqual({ kind: 'handoff' })
  })

  it.each<Intent>(['baja', 'modificación', 'cambio de teléfono'])('manda a aprobar %s', (intent) => {
    expect(actionForIntent(intent)).toEqual({ kind: 'approval' })
  })

  it('a lo que no es de seguros le contesta que no tiene que ver con la agencia', () => {
    expect(actionForIntent('no es de seguros')).toEqual({ kind: 'unrelated' })
  })

  it('repregunta lo que no se entiende', () => {
    expect(actionForIntent('no se entiende')).toEqual({ kind: 'clarify' })
  })

  it('tiene una acción para toda intención de la lista', () => {
    for (const intent of intents) expect(actionForIntent(intent).kind).toBeTypeOf('string')
  })
})

describe('isIntent', () => {
  it('acepta solo valores de la lista', () => {
    expect(isIntent('vencimiento')).toBe(true)
    expect(isIntent('Vencimiento')).toBe(false)
    expect(isIntent('alta de conductor')).toBe(false)
    expect(isIntent(3)).toBe(false)
  })

  it('«no sé» ya no está: se partió en «otra consulta» y «no se entiende»', () => {
    expect(isIntent('no sé')).toBe(false)
    expect(isIntent('otra consulta')).toBe(true)
    expect(isIntent('no se entiende')).toBe(true)
  })
})

describe('clarificationStep', () => {
  it('con 0 y con 1 repregunta y suma una', () => {
    expect(clarificationStep(0)).toEqual({ kind: 'clarify', notUnderstood: 1 })
    expect(clarificationStep(1)).toEqual({ kind: 'clarify', notUnderstood: 2 })
  })

  it('con 2 repreguntas seguidas, el tercer mensaje deriva', () => {
    expect(clarificationStep(2)).toEqual({ kind: 'handoff' })
  })
})
