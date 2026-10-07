import { describe, expect, it } from 'vitest'
import { customerFromRecord, type CustomerRecord } from './prisma-customer-repository.js'

// Filas armadas en la prueba, sin base. Datos ficticios.
function policy(numero: string, overrides: Partial<CustomerRecord['poliza'][number]> = {}): CustomerRecord['poliza'][number] {
  return {
    numero_poliza: numero,
    fecha_vencimiento: new Date('2027-03-15T00:00:00.000Z'),
    activo: true,
    ramo: { nombre: 'auto' },
    estado_poliza: { nombre: 'activa' },
    ...overrides,
  }
}

function record(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id_cliente: 7,
    dni: '99000001',
    nombre: 'Ana',
    apellido: 'Ficticia',
    activo: true,
    poliza: [],
    ...overrides,
  }
}

describe('customerFromRecord', () => {
  it('da las pólizas con ramo, estado y vencimiento, ordenadas por número', () => {
    const customer = customerFromRecord(record({
      poliza: [
        policy('POL-00131', { ramo: { nombre: 'hogar' }, fecha_vencimiento: new Date('2026-09-01T00:00:00.000Z') }),
        policy('POL-00126', { estado_poliza: { nombre: 'suspendida por mora' } }),
      ],
    }))
    expect(customer).toEqual({
      id: 7,
      dni: '99000001',
      firstName: 'Ana',
      lastName: 'Ficticia',
      policies: [
        { number: 'POL-00126', ramo: 'auto', status: 'suspendida por mora', expirationDate: '2027-03-15' },
        { number: 'POL-00131', ramo: 'hogar', status: 'activa', expirationDate: '2026-09-01' },
      ],
    })
  })

  it('un cliente cargado por error no se usa', () => {
    expect(customerFromRecord(record({ activo: false, poliza: [policy('POL-00126')] }))).toBeNull()
  })

  it('una póliza cargada por error no aparece', () => {
    const customer = customerFromRecord(record({ poliza: [policy('POL-00126'), policy('POL-00127', { activo: false })] }))
    expect(customer?.policies.map((item) => item.number)).toEqual(['POL-00126'])
  })

  it('un cliente sin DNI (empresa) no se usa', () => {
    expect(customerFromRecord(record({ dni: null, nombre: null, apellido: null }))).toBeNull()
  })

  it('un ramo fuera del catálogo lanza', () => {
    expect(() => customerFromRecord(record({ poliza: [policy('POL-00126', { ramo: { nombre: 'aviones' } })] })))
      .toThrow('fuera de catálogo')
  })

  it('un estado fuera del catálogo lanza', () => {
    expect(() => customerFromRecord(record({ poliza: [policy('POL-00126', { estado_poliza: { nombre: 'vigente' } })] })))
      .toThrow('fuera de catálogo')
  })
})
