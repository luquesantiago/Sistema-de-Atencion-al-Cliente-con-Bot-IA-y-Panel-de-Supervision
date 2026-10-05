import { describe, expect, it } from 'vitest'
import { checkRewrite } from './rewrite-check.js'

const template = [
  'Ana, estos son los vencimientos de sus pólizas:',
  '- POL-90001 (auto): vence el 15/11/2026.',
  '- POL-90002 (hogar): venció el 03/10/2026.',
].join('\n')

const goodDraft =
  'Hola Ana, le paso los vencimientos: la póliza POL-90001 de su auto vence el 15/11/2026, y la POL-90002 de hogar venció el 03/10/2026.'

describe('checkRewrite: se envía', () => {
  it('acepta otras palabras con los mismos datos', () => {
    expect(checkRewrite(template, goodDraft)).toEqual({ ok: true })
  })

  it('acepta «dada de baja» si está en la plantilla', () => {
    const statuses = 'Ana, este es el estado de sus pólizas:\n- POL-90003 (moto): dada de baja.'
    expect(checkRewrite(statuses, 'Ana, su póliza POL-90003 de moto figura dada de baja.')).toEqual({ ok: true })
  })
})

describe('checkRewrite: se deriva', () => {
  it.each([
    ['fecha cambiada', goodDraft.replace('15/11/2026', '16/11/2026')],
    ['póliza agregada', `${goodDraft} También tiene la POL-90009.`],
    ['póliza quitada', 'Hola Ana, la POL-90001 de su auto vence el 15/11/2026, y la de hogar venció el 03/10/2026.'],
    ['número de más', `${goodDraft} Tiene 2 días para renovar.`],
    ['estado cambiado', `${goodDraft} La POL-90001 está activa.`],
    ['ramo cambiado', goodDraft.replace('de su auto', 'de su moto')],
    ['venció cambiado por vence', goodDraft.replace('venció', 'vence')],
    ['link https', `${goodDraft} Más info en https://example.com`],
    ['link www', `${goodDraft} Vea www.seguros.example`],
    ['dominio', `${goodDraft} Escríbanos a castano.com.ar`],
    ['arroba', `${goodDraft} Escríbanos a ana@correo`],
    ['redacción vacía', '   '],
  ])('rechaza: %s', (_case, draft) => {
    expect(checkRewrite(template, draft).ok).toBe(false)
  })

  it.each(['Su pedido quedó registrado.', 'Tiene cobertura total.', 'Le cuento que soy una persona del equipo.'])(
    'rechaza una frase sin números con un término prohibido: %s',
    (sentence) => {
      expect(checkRewrite(template, `${goodDraft} ${sentence}`)).toMatchObject({ ok: false })
    },
  )
})
