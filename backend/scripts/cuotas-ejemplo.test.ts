import { describe, expect, it } from 'vitest'
import { exampleInstallments, type ExamplePolicy } from './cuotas-ejemplo.js'

// Pólizas ficticias, solo para estas pruebas.
function policy(start: string, end: string, monthlyPremium: string | null = '45000.00'): ExamplePolicy {
  return { number: 'POL-90001', startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`), monthlyPremium }
}

const day = (installment: { fecha_vencimiento: Date }) => installment.fecha_vencimiento.toISOString().slice(0, 10)

describe('exampleInstallments', () => {
  it('una vigencia de un año da 12 cuotas mensuales numeradas desde 1, con la prima como importe', () => {
    const installments = exampleInstallments(policy('2023-06-20', '2024-06-20'), 0)
    expect(installments).toHaveLength(12)
    expect(installments.map((item) => item.numero_cuota)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(installments.map(day).at(0)).toBe('2023-06-20')
    expect(installments.map(day).at(-1)).toBe('2024-05-20')
    expect(installments.every((item) => item.importe === '45000.00')).toBe(true)
  })

  it('un inicio el 31 cae el último día de los meses más cortos', () => {
    const installments = exampleInstallments(policy('2024-01-31', '2024-05-01'), 0)
    expect(installments.map(day)).toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30'])
  })

  it('con 2 sin pagar, las dos últimas quedan sin fecha de pago y las demás pagas en su vencimiento', () => {
    const installments = exampleInstallments(policy('2024-01-10', '2024-05-10'), 2)
    expect(installments.map((item) => item.fecha_pago?.toISOString().slice(0, 10) ?? null)).toEqual([
      '2024-01-10',
      '2024-02-10',
      null,
      null,
    ])
  })

  it('con 0 sin pagar, todas quedan pagas', () => {
    expect(exampleInstallments(policy('2024-01-10', '2024-05-10'), 0).every((item) => item.fecha_pago !== null)).toBe(true)
  })

  it('una póliza sin prima mensual lanza', () => {
    expect(() => exampleInstallments(policy('2024-01-10', '2024-05-10', null), 0)).toThrow('POL-90001 no tiene prima mensual')
  })
})
