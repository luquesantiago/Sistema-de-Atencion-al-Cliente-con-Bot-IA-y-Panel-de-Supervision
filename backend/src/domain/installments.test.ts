import { describe, expect, it } from 'vitest'
import { installmentPlan, monthlyDueDates, overdueInstallments, paidInstallmentsProblem } from './installments.js'

describe('monthlyDueDates', () => {
  it('una póliza que empieza hoy y vence en un año tiene 12 cuotas, la primera hoy', () => {
    const dueDates = monthlyDueDates('2026-11-03', '2027-11-03')
    expect(dueDates).toHaveLength(12)
    expect(dueDates.at(0)).toBe('2026-11-03')
    expect(dueDates.at(1)).toBe('2026-12-03')
    expect(dueDates.at(-1)).toBe('2027-10-03')
  })

  it('un inicio el 31 de enero cae el último día de febrero y el 31 de marzo', () => {
    expect(monthlyDueDates('2027-01-31', '2027-05-01')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
  })

  it('no incluye una cuota que vence el mismo día que la póliza', () => {
    expect(monthlyDueDates('2026-01-10', '2026-03-10')).toEqual(['2026-01-10', '2026-02-10'])
  })
})

describe('overdueInstallments', () => {
  it('cuenta solo las que vencen antes de hoy, no la de hoy', () => {
    expect(overdueInstallments(['2026-09-03', '2026-10-03', '2026-11-03', '2026-12-03'], '2026-11-03')).toBe(2)
  })
})

describe('paidInstallmentsProblem', () => {
  it('sin cuotas vencidas no hace falta declarar las pagas', () => {
    expect(paidInstallmentsProblem(0, undefined)).toBeNull()
    expect(paidInstallmentsProblem(0, 0)).toBeNull()
  })

  it('con cuotas vencidas la cantidad pagas es obligatoria', () => {
    expect(paidInstallmentsProblem(3, undefined)).toBe('Indique cuántas de las 3 cuotas ya vencidas están pagas.')
  })

  it('acepta entre 0 y la cantidad de cuotas vencidas', () => {
    expect(paidInstallmentsProblem(3, 0)).toBeNull()
    expect(paidInstallmentsProblem(3, 2)).toBeNull()
    expect(paidInstallmentsProblem(3, 3)).toBeNull()
  })

  it('rechaza más pagas que vencidas', () => {
    expect(paidInstallmentsProblem(3, 4)).toBe('Las cuotas pagas no pueden ser más que las 3 cuotas ya vencidas.')
    expect(paidInstallmentsProblem(0, 1)).toBe('La póliza no tiene cuotas vencidas: no puede tener cuotas pagas.')
  })
})

describe('installmentPlan', () => {
  it('numera desde 1, usa la prima como importe y deja pagas las primeras', () => {
    const plan = installmentPlan({ startDate: '2026-08-03', endDate: '2027-08-03', premiumCents: 4_500_000 }, 2)
    expect(plan).toHaveLength(12)
    expect(plan.map((item) => item.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(plan.every((item) => item.amountCents === 4_500_000)).toBe(true)
    expect(plan.map((item) => item.paid).slice(0, 4)).toEqual([true, true, false, false])
  })
})
