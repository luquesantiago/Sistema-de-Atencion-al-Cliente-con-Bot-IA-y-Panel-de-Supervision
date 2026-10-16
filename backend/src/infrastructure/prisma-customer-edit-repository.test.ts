import { describe, expect, it } from 'vitest'
import { dateFromOnly, dateOnly } from './prisma-customer-edit-repository.js'

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
