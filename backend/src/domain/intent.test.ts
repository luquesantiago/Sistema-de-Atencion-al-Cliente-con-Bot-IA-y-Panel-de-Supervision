import { describe, expect, it } from 'vitest'
import { actionForIntent, intents, isIntent, type Intent } from './intent.js'

describe('actionForIntent', () => {
  it('responde vencimiento, estado de póliza y saludo', () => {
    expect(actionForIntent('vencimiento')).toEqual({ kind: 'answer', template: 'expirations' })
    expect(actionForIntent('estado de póliza')).toEqual({ kind: 'answer', template: 'statuses' })
    expect(actionForIntent('saludo')).toEqual({ kind: 'answer', template: 'courtesy' })
  })

  it.each<Intent>(['siniestro', 'cotización', 'saldo', 'cobertura', 'reclamo', 'no sé'])('deriva %s', (intent) => {
    expect(actionForIntent(intent)).toEqual({ kind: 'handoff' })
  })

  it.each<Intent>(['baja', 'modificación', 'cambio de teléfono'])('manda a aprobar %s', (intent) => {
    expect(actionForIntent(intent)).toEqual({ kind: 'approval' })
  })

  it('ignora lo que no es de seguros', () => {
    expect(actionForIntent('no es de seguros')).toEqual({ kind: 'ignore' })
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
})
