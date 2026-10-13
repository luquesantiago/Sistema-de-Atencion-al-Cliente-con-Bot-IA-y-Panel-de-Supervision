import { describe, expect, it } from 'vitest'
import { agencyInfoAnswer } from './agency-info.js'
import { checkRewrite } from './rewrite-check.js'

const vencimientos = [
  'Ana, estos son los vencimientos de sus pólizas:',
  '- POL-90001 (auto): vence el 15/11/2026.',
  '- POL-90002 (hogar): venció el 03/10/2026.',
].join('\n')

const goodDraft =
  'Hola Ana, le paso los vencimientos: la póliza POL-90001 de su auto vence el 15/11/2026, y la POL-90002 de hogar venció el 03/10/2026.'

describe('checkRewrite: se envía', () => {
  it('acepta otras palabras con los mismos datos', () => {
    expect(checkRewrite(vencimientos, goodDraft)).toEqual({ ok: true })
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
    expect(checkRewrite(vencimientos, draft).ok).toBe(false)
  })

  it.each(['Su pedido quedó registrado.', 'Tiene cobertura total.', 'Le cuento que soy una persona del equipo.'])(
    'rechaza una frase sin números con un término prohibido: %s',
    (sentence) => {
      expect(checkRewrite(vencimientos, `${goodDraft} ${sentence}`)).toMatchObject({ ok: false })
    },
  )
})

describe('checkRewrite con la información de la agencia', () => {
  const answer = agencyInfoAnswer({
    ramos: ['auto', 'moto', 'vida', 'hogar', 'embarcaciones', 'comercio'],
    plans: ['terceros', 'todo riesgo', 'terceros incompletos', 'riesgos incompletos'],
    address: 'Ficticia 123',
    phone: '11 7816-8015',
    hours: [1, 2, 3, 4, 5].map((day) => ({ day, opens: '09:00', closes: '18:00' })),
  })
  if (!answer) throw new Error('Faltan datos de la agencia en la prueba')
  const { template, literals } = answer
  const agencyDraft =
    'En Seguros Castaño trabajamos con seguros de auto, moto, vida, hogar, embarcaciones y comercio. ' +
    'Los planes disponibles son terceros, todo riesgo, terceros incompletos y riesgos incompletos. ' +
    'Nuestra oficina está en Ficticia 123 y nuestro teléfono es 11 7816-8015. Atendemos de lunes a viernes, de 9 a 18 horas.'

  it('acepta otras palabras con los mismos datos', () => {
    expect(checkRewrite(template, agencyDraft, literals)).toEqual({ ok: true })
  })

  it.each([
    ['«lunes a sábado» en lugar de «lunes a viernes»', agencyDraft.replace('lunes a viernes', 'lunes a sábado')],
    ['«de 18 a 9»', agencyDraft.replace('de 9 a 18', 'de 18 a 9')],
    ['otro teléfono', agencyDraft.replace('11 7816-8015', '11 7816-8016')],
    ['«Falsa 123» en lugar de «Ficticia 123»', agencyDraft.replace('Ficticia 123', 'Falsa 123')],
    ['sacar «terceros» y dejar «terceros incompletos»', agencyDraft.replace('son terceros, todo riesgo', 'son todo riesgo')],
    ['sacar un ramo', agencyDraft.replace('vida, ', '')],
  ])('rechaza: %s', (_case, draft) => {
    expect(checkRewrite(template, draft, literals)).toEqual({ ok: false, reason: 'dato de la agencia distinto' })
  })

  it('rechaza un día agregado al horario, aunque estén todos los literales', () => {
    const draft = agencyDraft.replace('de 9 a 18 horas.', 'de 9 a 18 horas, y también los sábados.')
    expect(checkRewrite(template, draft, literals)).toEqual({ ok: false, reason: 'datos distintos de la plantilla' })
  })

  it('rechaza un día agregado a una redacción de vencimientos', () => {
    expect(checkRewrite(vencimientos, `${goodDraft} Lo esperamos el lunes.`)).toEqual({ ok: false, reason: 'datos distintos de la plantilla' })
  })
})

describe('checkRewrite: saldo, en orden', () => {
  const saldo = [
    'Ana, este es el detalle de las cuotas sin pagar de sus pólizas:',
    '- POL-90001 (auto): 2 cuotas vencidas sin pagar por $ 90.000,00 y 3 cuotas por vencer por $ 135.000,00.',
    '- POL-90002 (hogar): ninguna cuota vencida sin pagar y 1 cuota por vencer por US$ 40,00.',
    '- POL-90003 (moto): no tiene ninguna cuota pendiente de pago.',
  ].join('\n')

  const saldoDraft = [
    'Hola Ana, le cuento cómo están sus cuotas.',
    'En la póliza POL-90001 de auto tiene 2 cuotas vencidas sin pagar, que suman $ 90.000,00, y 3 cuotas por vencer, que suman $ 135.000,00.',
    'En la POL-90002 de hogar no hay ninguna cuota vencida sin pagar y le queda 1 cuota por vencer de US$ 40,00.',
    'La POL-90003 de moto no tiene ninguna cuota pendiente de pago.',
  ].join(' ')

  it('acepta otras palabras con los mismos importes, cantidades y orden', () => {
    expect(checkRewrite(saldo, saldoDraft, [], true)).toEqual({ ok: true })
  })

  it('acepta el importe sin el espacio después del símbolo', () => {
    expect(checkRewrite(saldo, saldoDraft.replace('$ 90.000,00', '$90.000,00'), [], true)).toEqual({ ok: true })
  })

  it.each([
    ['importe cambiado', saldoDraft.replace('$ 90.000,00', '$ 90.000,01')],
    ['importe con otro formato', saldoDraft.replace('$ 90.000,00', '90000 pesos')],
    ['importe sin separador de miles', saldoDraft.replace('$ 135.000,00', '$ 135000,00')],
    ['moneda cambiada', saldoDraft.replace('$ 90.000,00', 'US$ 90.000,00')],
    ['dólares en pesos', saldoDraft.replace('US$ 40,00', '$ 40,00')],
    ['importe quitado', saldoDraft.replace(', que suman $ 90.000,00', '')],
    ['vencidas cambiadas por por vencer', saldoDraft.replace('cuotas vencidas sin pagar, que suman', 'cuotas por vencer, que suman')],
    ['«ninguna» cambiada por «una»', saldoDraft.replace('no hay ninguna cuota vencida', 'hay una cuota vencida')],
    ['sin «ninguna» en la póliza paga', saldoDraft.replace('no tiene ninguna cuota pendiente', 'tiene cuotas pendientes')],
    [
      'grupos intercambiados',
      saldoDraft.replace(
        '2 cuotas vencidas sin pagar, que suman $ 90.000,00, y 3 cuotas por vencer, que suman $ 135.000,00',
        '3 cuotas por vencer, que suman $ 135.000,00, y 2 cuotas vencidas sin pagar, que suman $ 90.000,00',
      ),
    ],
  ])('rechaza: %s', (_case, draft) => {
    expect(checkRewrite(saldo, draft, [], true)).toEqual({ ok: false, reason: 'datos distintos de la plantilla' })
  })

  it('sin orden, los grupos intercambiados pasarían: el saldo necesita el orden', () => {
    const swapped = saldoDraft.replace(
      '2 cuotas vencidas sin pagar, que suman $ 90.000,00, y 3 cuotas por vencer, que suman $ 135.000,00',
      '2 cuotas por vencer, que suman $ 90.000,00, y 3 cuotas vencidas sin pagar, que suman $ 135.000,00',
    )
    expect(checkRewrite(saldo, swapped).ok).toBe(true)
    expect(checkRewrite(saldo, swapped, [], true).ok).toBe(false)
  })

  it.each([
    ['saldo', `${saldoDraft} Su saldo es ese.`],
    ['deuda', `${saldoDraft} Esa es toda su deuda.`],
  ])('rechaza el término prohibido «%s»', (term, draft) => {
    expect(checkRewrite(saldo, draft, [], true)).toEqual({ ok: false, reason: `término prohibido: ${term}` })
  })
})
