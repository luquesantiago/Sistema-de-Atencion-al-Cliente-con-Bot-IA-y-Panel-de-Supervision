import { describe, expect, it } from 'vitest'
import type { Customer } from './customer.js'
import {
  approvalNotice,
  argentinaToday,
  clarificationRequest,
  expirationsTemplate,
  handoffMessage,
  notInsuranceMessage,
  statusesTemplate,
} from './templates.js'

// 04/10/2026 a las 23:30 en Argentina: en UTC ya es el 05/10.
const lateNight = new Date('2026-10-05T02:30:00Z')

const customer: Customer = {
  id: 90099,
  dni: '99000099',
  firstName: 'Ana',
  lastName: 'Prueba',
  policies: [
    { number: 'POL-90001', ramo: 'auto', status: 'activa', expirationDate: '2026-10-04' },
    { number: 'POL-90002', ramo: 'hogar', status: 'activa', expirationDate: '2026-10-03' },
  ],
}

describe('fecha de Argentina', () => {
  it('usa el día de Argentina, no el de UTC', () => {
    expect(argentinaToday(lateNight)).toBe('2026-10-04')
  })
})

describe('expirationsTemplate', () => {
  it('da una línea por póliza, con número, ramo y fecha', () => {
    expect(expirationsTemplate(customer, lateNight)).toBe(
      [
        'Ana, estos son los vencimientos de sus pólizas:',
        '- POL-90001 (auto): vence el 04/10/2026.',
        '- POL-90002 (hogar): venció el 03/10/2026.',
      ].join('\n'),
    )
  })
})

describe('statusesTemplate', () => {
  it('muestra vencida la póliza activa de ayer en Argentina y no la de hoy', () => {
    expect(statusesTemplate(customer, lateNight)).toBe(
      ['Ana, este es el estado de sus pólizas:', '- POL-90001 (auto): activa.', '- POL-90002 (hogar): vencida.'].join('\n'),
    )
  })

  it('muestra tal cual «dada de baja» y «suspendida por mora», aunque estén vencidas', () => {
    const other: Customer = {
      ...customer,
      policies: [
        { number: 'POL-90003', ramo: 'moto', status: 'dada de baja', expirationDate: '2026-01-01' },
        { number: 'POL-90004', ramo: 'vida', status: 'suspendida por mora', expirationDate: '2026-01-01' },
      ],
    }
    expect(statusesTemplate(other, lateNight)).toBe(
      ['Ana, este es el estado de sus pólizas:', '- POL-90003 (moto): dada de baja.', '- POL-90004 (vida): suspendida por mora.'].join('\n'),
    )
  })
})

describe('textos fijos', () => {
  it('usa el mensaje de derivación de AGENTS.md', () => {
    expect(handoffMessage).toBe(
      'Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle.',
    )
  })

  it('avisa que el pedido queda en revisión, sin darlo por hecho', () => {
    expect(approvalNotice).toBe('Recibimos su pedido. Un miembro de nuestro equipo lo va a revisar y se va a comunicar con usted.')
  })

  it('lo que no es de seguros recibe un texto que no menciona bots, la IA ni el sistema', () => {
    expect(notInsuranceMessage).toContain('no tiene que ver con Seguros Castaño')
    expect(notInsuranceMessage).not.toMatch(/\bbots?\b|inteligencia artificial|modelo|instrucciones|\bsoy\b|\d/i)
  })

  it('la repregunta no lista datos de las pólizas', () => {
    expect(clarificationRequest).not.toMatch(/\d|POL-/)
    expect(clarificationRequest).not.toMatch(/\b(auto|moto|vida|hogar|embarcaciones|comercio)\b/)
  })
})
