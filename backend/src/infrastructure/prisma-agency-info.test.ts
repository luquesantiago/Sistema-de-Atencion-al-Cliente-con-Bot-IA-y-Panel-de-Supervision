import { describe, expect, it } from 'vitest'
import { agencyInfoFromRows, type AgencyInfoRows } from './prisma-agency-info.js'

// Una columna TIME de MySQL llega como una fecha del 01/01/1970 en UTC.
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`)

const rows: AgencyInfoRows = {
  ramos: [
    { id_ramo: 2, nombre: 'moto', activo: true },
    { id_ramo: 1, nombre: 'auto', activo: true },
    { id_ramo: 3, nombre: 'vida', activo: false },
  ],
  plans: [
    { id_plan: 2, nombre: 'todo riesgo', activo: true },
    { id_plan: 1, nombre: 'terceros', activo: true },
    { id_plan: 3, nombre: 'plan dado de baja', activo: false },
  ],
  hours: [{ dia_semana: 1, hora_apertura: time('09:00'), hora_cierre: time('18:00') }],
  settings: [
    { clave: 'direccion_agencia', valor: 'Ficticia 123' },
    { clave: 'telefono_agencia', valor: '11 7816-8015' },
  ],
}

describe('agencyInfoFromRows', () => {
  it('toma la hora del TIME sin correrla de zona horaria y ordena los ramos y los planes por id', () => {
    expect(agencyInfoFromRows(rows)).toEqual({
      ramos: ['auto', 'moto'],
      plans: ['terceros', 'todo riesgo'],
      address: 'Ficticia 123',
      phone: '11 7816-8015',
      hours: [{ day: 1, opens: '09:00', closes: '18:00' }],
    })
  })

  it('deja afuera los ramos y los planes inactivos', () => {
    const info = agencyInfoFromRows(rows)
    expect(info.ramos).not.toContain('vida')
    expect(info.plans).not.toContain('plan dado de baja')
  })

  it('una clave ausente o con el valor vacío da null', () => {
    const info = agencyInfoFromRows({ ...rows, settings: [{ clave: 'direccion_agencia', valor: '  ' }] })
    expect(info.address).toBeNull()
    expect(info.phone).toBeNull()
  })
})
