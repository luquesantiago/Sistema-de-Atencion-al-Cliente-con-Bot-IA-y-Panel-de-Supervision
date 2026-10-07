import { describe, expect, it } from 'vitest'
import {
  customerFromRecord,
  toDetail,
  toListItem,
  type CustomerDetailRecord,
  type CustomerListRecord,
  type CustomerRecord,
} from './prisma-customer-repository.js'

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

describe('mappers de la cartera', () => {
  it('arma el listado de una empresa sin romper, aunque no tenga DNI', () => {
    const record: CustomerListRecord = {
      id_cliente: 7,
      dni: null,
      cuit: '30712345678',
      razon_social: 'Distribuidora Norte SRL',
      nombre: null,
      apellido: null,
      cliente_telefono: [{ telefono: { numero: '5491155552002' } }],
      poliza: [
        { numero_poliza: 'POL-00500', ramo: { nombre: 'comercio' }, estado_poliza: { nombre: 'activa' } },
        { numero_poliza: 'POL-00501', ramo: { nombre: 'hogar' }, estado_poliza: { nombre: 'dada de baja' } },
      ],
    }

    expect(toListItem(record)).toEqual({
      id: '7',
      dni: null,
      cuit: '30712345678',
      razonSocial: 'Distribuidora Norte SRL',
      firstName: null,
      lastName: null,
      phones: ['5491155552002'],
      policies: [
        { number: 'POL-00500', ramo: 'comercio', status: 'activa' },
        { number: 'POL-00501', ramo: 'hogar', status: 'dada de baja' },
      ],
    })
  })

  it('arma el detalle con el bien asegurado de cada póliza', () => {
    const record: CustomerDetailRecord = {
      id_cliente: 7,
      dni: null,
      cuit: '30712345678',
      razon_social: 'Distribuidora Norte SRL',
      nombre: null,
      apellido: null,
      cliente_telefono: [{ telefono: { id_telefono: 19, numero: '5491155552002' } }],
      poliza: [
        {
          numero_poliza: 'POL-00500',
          fecha_inicio: new Date('2025-01-15T00:00:00.000Z'),
          fecha_vencimiento: new Date('2026-03-01T00:00:00.000Z'),
          ramo: { nombre: 'auto' },
          estado_poliza: { nombre: 'activa' },
          bien_asegurado: {
            descripcion: 'Volkswagen Gol',
            patente_matricula: 'AB789CD',
            direccion: null,
            marca: 'Volkswagen',
            modelo: 'Gol Trend',
            anio: 2018,
          },
        },
        {
          // Las pólizas de vida no aseguran un bien.
          numero_poliza: 'POL-00502',
          fecha_inicio: new Date('2025-06-01T00:00:00.000Z'),
          fecha_vencimiento: new Date('2026-06-01T00:00:00.000Z'),
          ramo: { nombre: 'vida' },
          estado_poliza: { nombre: 'activa' },
          bien_asegurado: null,
        },
      ],
    }

    expect(toDetail(record)).toEqual({
      id: '7',
      dni: null,
      cuit: '30712345678',
      razonSocial: 'Distribuidora Norte SRL',
      firstName: null,
      lastName: null,
      phones: [{ id: 19, number: '5491155552002' }],
      policies: [
        {
          number: 'POL-00500',
          ramo: 'auto',
          status: 'activa',
          startDate: '2025-01-15',
          expirationDate: '2026-03-01',
          insuredItem: {
            description: 'Volkswagen Gol',
            plate: 'AB789CD',
            address: null,
            brand: 'Volkswagen',
            model: 'Gol Trend',
            year: 2018,
          },
        },
        {
          number: 'POL-00502',
          ramo: 'vida',
          status: 'activa',
          startDate: '2025-06-01',
          expirationDate: '2026-06-01',
          insuredItem: null,
        },
      ],
    })
  })

  it('sigue marcando como error una póliza fuera de catálogo', () => {
    const record: CustomerDetailRecord = {
      id_cliente: 7,
      dni: null,
      cuit: null,
      razon_social: null,
      nombre: 'Sofía',
      apellido: 'Benítez',
      cliente_telefono: [],
      poliza: [{
        numero_poliza: 'POL-00501',
        fecha_inicio: new Date('2025-03-01T00:00:00.000Z'),
        fecha_vencimiento: new Date('2026-03-01T00:00:00.000Z'),
        ramo: { nombre: 'pirata' },
        estado_poliza: { nombre: 'activa' },
        bien_asegurado: null,
      }],
    }

    expect(() => toDetail(record)).toThrow('fuera de catálogo')
  })

  it('también rechaza una póliza fuera de catálogo en el listado', () => {
    const record: CustomerListRecord = {
      id_cliente: 7,
      dni: null,
      cuit: null,
      razon_social: null,
      nombre: 'Sofía',
      apellido: 'Benítez',
      cliente_telefono: [],
      poliza: [{ numero_poliza: 'POL-00501', ramo: { nombre: 'pirata' }, estado_poliza: { nombre: 'activa' } }],
    }

    expect(() => toListItem(record)).toThrow('fuera de catálogo')
  })
})
