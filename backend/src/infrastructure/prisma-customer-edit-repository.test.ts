import { describe, expect, it } from 'vitest'
import { dateFromOnly, dateOnly, installmentRows } from './prisma-customer-edit-repository.js'

// Escritura de pólizas desde el panel (RF-CAR-03). Prisma exige un Date para
// fecha_inicio y fecha_vencimiento (DateTime @db.Date): con un texto aaaa-mm-dd
// rechazaba toda edición con un PrismaClientValidationError y la API devolvía
// 500. Estas pruebas cuidan la conversión entre el formato del panel y el de
// la base.
describe('dateFromOnly', () => {
  it('da la fecha como Date a medianoche UTC, que es lo que Prisma acepta', () => {
    const fecha = dateFromOnly('2026-10-15')
    expect(fecha).toBeInstanceOf(Date)
    expect(fecha.toISOString()).toBe('2026-10-15T00:00:00.000Z')
  })

  it('no corre el día aunque la hora local sea distinta de UTC', () => {
    expect(dateFromOnly('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(dateFromOnly('2026-12-31').toISOString()).toBe('2026-12-31T00:00:00.000Z')
  })

  it('da la vuelta con dateOnly: la lectura devuelve la misma fecha', () => {
    for (const fecha of ['2023-11-01', '2026-10-15', '2027-03-15']) {
      expect(dateOnly(dateFromOnly(fecha))).toBe(fecha)
    }
  })
})

// Las cuotas del alta de póliza (RF-CAR-02): la cuota paga lleva su vencimiento como fecha
// de pago, porque el pago real no se conoce.
describe('installmentRows', () => {
  it('arma las filas de cuota con la fecha a medianoche UTC y el importe en pesos', () => {
    const rows = installmentRows(9, [
      { number: 1, dueDate: '2026-10-03', amountCents: 4_500_050, paid: true },
      { number: 2, dueDate: '2026-11-03', amountCents: 4_500_050, paid: false },
    ])
    expect(rows.map((row) => ({
      ...row,
      fecha_vencimiento: row.fecha_vencimiento.toISOString(),
      importe: row.importe.toString(),
      fecha_pago: row.fecha_pago?.toISOString() ?? null,
    }))).toEqual([
      { id_poliza: 9, numero_cuota: 1, fecha_vencimiento: '2026-10-03T00:00:00.000Z', importe: '45000.5', fecha_pago: '2026-10-03T00:00:00.000Z' },
      { id_poliza: 9, numero_cuota: 2, fecha_vencimiento: '2026-11-03T00:00:00.000Z', importe: '45000.5', fecha_pago: null },
    ])
  })
})
