import { describe, expect, it } from 'vitest'
import { balanceTemplate, formatAmount, policyBalance } from './balance.js'
import type { Customer, CustomerPolicy, Installment } from './customer.js'

// 04/10/2026 a las 23:30 en Argentina: en UTC ya es el 05/10.
const lateNight = new Date('2026-10-05T02:30:00Z')

function installment(number: number, dueDate: string, amountCents: number, paid = false): Installment {
  return { number, dueDate, amountCents, paid }
}

function policy(number: string, installments: Installment[], overrides: Partial<CustomerPolicy> = {}): CustomerPolicy {
  return { number, ramo: 'auto', status: 'activa', expirationDate: '2027-03-15', currency: 'ARS', installments, ...overrides }
}

function customerWith(policies: CustomerPolicy[]): Customer {
  return { id: 90099, dni: '99000099', firstName: 'Ana', lastName: 'Prueba', policies }
}

describe('policyBalance', () => {
  it('separa vencidas y por vencer con la fecha de Argentina: la que vence hoy es por vencer', () => {
    const balance = policyBalance(
      policy('POL-90001', [installment(1, '2026-10-03', 1000), installment(2, '2026-10-04', 2000), installment(3, '2026-10-05', 3000)]),
      lateNight,
    )
    expect(balance).toEqual({ overdue: { count: 1, cents: 1000 }, upcoming: { count: 2, cents: 5000 } })
  })

  it('no cuenta las cuotas pagas', () => {
    const balance = policyBalance(
      policy('POL-90001', [installment(1, '2026-09-01', 1000, true), installment(2, '2026-10-01', 2000), installment(3, '2026-11-01', 3000, true)]),
      lateNight,
    )
    expect(balance).toEqual({ overdue: { count: 1, cents: 2000 }, upcoming: { count: 0, cents: 0 } })
  })

  it('suma en centavos sin error de redondeo', () => {
    const tenCents = [installment(1, '2026-09-01', 10), installment(2, '2026-09-02', 10), installment(3, '2026-09-03', 10)]
    const { overdue } = policyBalance(policy('POL-90001', tenCents), lateNight)
    expect(formatAmount(overdue.cents, 'ARS')).toBe('$ 0,30')
  })
})

describe('formatAmount', () => {
  it('escribe punto de miles, coma decimal y el símbolo de la moneda', () => {
    expect(formatAmount(123456789, 'ARS')).toBe('$ 1.234.567,89')
    expect(formatAmount(4500, 'USD')).toBe('US$ 45,00')
    expect(formatAmount(0, 'ARS')).toBe('$ 0,00')
  })
})

describe('balanceTemplate', () => {
  it('da una línea por póliza, con los cuatro textos posibles y el singular', () => {
    const template = balanceTemplate(
      customerWith([
        policy('POL-90001', [installment(1, '2026-09-01', 4500000), installment(2, '2026-10-01', 4500000), installment(3, '2026-11-01', 4500000)]),
        policy('POL-90002', [installment(1, '2026-09-01', 2000), installment(2, '2026-10-01', 2000)], { ramo: 'hogar', currency: 'USD' }),
        policy('POL-90003', [installment(1, '2026-10-05', 150000)], { ramo: 'moto' }),
        policy('POL-90004', [installment(1, '2026-09-01', 150000, true)], { ramo: 'vida' }),
      ]),
      lateNight,
    )
    expect(template).toBe(
      [
        'Ana, este es el detalle de las cuotas sin pagar de sus pólizas:',
        '- POL-90001 (auto): 2 cuotas vencidas sin pagar por $ 90.000,00 y 1 cuota por vencer por $ 45.000,00.',
        '- POL-90002 (hogar): 2 cuotas vencidas sin pagar por US$ 40,00 y ninguna cuota por vencer.',
        '- POL-90003 (moto): ninguna cuota vencida sin pagar y 1 cuota por vencer por $ 1.500,00.',
        '- POL-90004 (vida): no tiene ninguna cuota pendiente de pago.',
      ].join('\n'),
    )
  })

  it('no suma importes de pólizas distintas', () => {
    const template = balanceTemplate(
      customerWith([
        policy('POL-90001', [installment(1, '2026-09-01', 1000)]),
        policy('POL-90002', [installment(1, '2026-09-01', 1000)], { currency: 'USD' }),
      ]),
      lateNight,
    )
    expect(template).toContain('1 cuota vencida sin pagar por $ 10,00')
    expect(template).toContain('1 cuota vencida sin pagar por US$ 10,00')
    expect(template).not.toContain('20,00')
  })

  it('sin pólizas no hay respuesta: se deriva', () => {
    expect(balanceTemplate(customerWith([]), lateNight)).toBeNull()
  })

  it('una póliza sin cuotas registradas hace derivar, aunque las otras tengan', () => {
    const customer = customerWith([policy('POL-90001', [installment(1, '2026-09-01', 1000)]), policy('POL-90002', [])])
    expect(balanceTemplate(customer, lateNight)).toBeNull()
  })
})
