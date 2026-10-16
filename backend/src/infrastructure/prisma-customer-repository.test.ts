import { describe, expect, it } from 'vitest'
import { Prisma } from '../generated/prisma/client.js'
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
    moneda: { codigo: 'ARS' },
    cuota: [],
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
        { number: 'POL-00126', ramo: 'auto', status: 'suspendida por mora', expirationDate: '2027-03-15', currency: 'ARS', installments: [] },
        { number: 'POL-00131', ramo: 'hogar', status: 'activa', expirationDate: '2026-09-01', currency: 'ARS', installments: [] },
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

  it('da la moneda y las cuotas, con el importe en centavos exactos y si están pagas', () => {
    const customer = customerFromRecord(record({
      poliza: [policy('POL-00126', {
        moneda: { codigo: 'USD' },
        cuota: [
          { numero_cuota: 2, fecha_vencimiento: new Date('2026-11-15T00:00:00.000Z'), importe: new Prisma.Decimal('12345.67'), fecha_pago: null },
          {
            numero_cuota: 1,
            fecha_vencimiento: new Date('2026-10-15T00:00:00.000Z'),
            importe: new Prisma.Decimal('0.1'),
            fecha_pago: new Date('2026-10-14T00:00:00.000Z'),
          },
        ],
      })],
    }))
    expect(customer?.policies[0]).toMatchObject({
      currency: 'USD',
      installments: [
        { number: 1, dueDate: '2026-10-15', amountCents: 10, paid: true },
        { number: 2, dueDate: '2026-11-15', amountCents: 1234567, paid: false },
      ],
    })
  })

  it('una moneda fuera del catálogo lanza', () => {
    expect(() => customerFromRecord(record({ poliza: [policy('POL-00126', { moneda: { codigo: 'EUR' } })] })))
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
        { numero_poliza: 'POL-00500', fecha_vencimiento: new Date('2026-03-01T00:00:00.000Z'), ramo: { nombre: 'comercio' }, estado_poliza: { nombre: 'activa' } },
        { numero_poliza: 'POL-00501', fecha_vencimiento: new Date('2026-06-15T00:00:00.000Z'), ramo: { nombre: 'hogar' }, estado_poliza: { nombre: 'dada de baja' } },
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
        { number: 'POL-00500', ramo: 'comercio', status: 'activa', expirationDate: '2026-03-01' },
        { number: 'POL-00501', ramo: 'hogar', status: 'dada de baja', expirationDate: '2026-06-15' },
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
          id_poliza: 91,
          numero_poliza: 'POL-00500',
          fecha_inicio: new Date('2025-01-15T00:00:00.000Z'),
          fecha_vencimiento: new Date('2026-03-01T00:00:00.000Z'),
          prima_mensual: new Prisma.Decimal('15500.00'),
          observaciones: 'Póliza con pago domiciliado',
          moneda: { codigo: 'ARS' },
          compania_aseguradora: { id_compania: 3, nombre: 'Seguros Castaño' },
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
          cobertura: [
            {
              id_cobertura: 5,
              id_plan: 2,
              descripcion: 'Responsabilidad civil',
              suma_asegurada: new Prisma.Decimal('1000000.00'),
              plan: { nombre: 'Básico' },
            },
          ],
        },
        {
          // Las pólizas de vida no aseguran un bien ni traen coberturas.
          id_poliza: 92,
          numero_poliza: 'POL-00502',
          fecha_inicio: new Date('2025-06-01T00:00:00.000Z'),
          fecha_vencimiento: new Date('2026-06-01T00:00:00.000Z'),
          prima_mensual: null,
          observaciones: null,
          moneda: { codigo: 'ARS' },
          compania_aseguradora: { id_compania: 3, nombre: 'Seguros Castaño' },
          ramo: { nombre: 'vida' },
          estado_poliza: { nombre: 'activa' },
          bien_asegurado: null,
          cobertura: [],
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
          id: '91',
          number: 'POL-00500',
          ramo: 'auto',
          status: 'activa',
          currency: 'ARS',
          company: { id: '3', name: 'Seguros Castaño' },
          startDate: '2025-01-15',
          expirationDate: '2026-03-01',
          premiumCents: 1_550_000,
          observations: 'Póliza con pago domiciliado',
          insuredItem: {
            description: 'Volkswagen Gol',
            plate: 'AB789CD',
            address: null,
            brand: 'Volkswagen',
            model: 'Gol Trend',
            year: 2018,
          },
          coverages: [
            { id: 5, planId: 2, planName: 'Básico', description: 'Responsabilidad civil', insuredSumCents: 100_000_000 },
          ],
        },
        {
          id: '92',
          number: 'POL-00502',
          ramo: 'vida',
          status: 'activa',
          currency: 'ARS',
          company: { id: '3', name: 'Seguros Castaño' },
          startDate: '2025-06-01',
          expirationDate: '2026-06-01',
          premiumCents: null,
          observations: null,
          insuredItem: null,
          coverages: [],
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
        id_poliza: 93,
        numero_poliza: 'POL-00501',
        fecha_inicio: new Date('2025-03-01T00:00:00.000Z'),
        fecha_vencimiento: new Date('2026-03-01T00:00:00.000Z'),
        prima_mensual: null,
        observaciones: null,
        moneda: { codigo: 'ARS' },
        compania_aseguradora: { id_compania: 3, nombre: 'Seguros Castaño' },
        ramo: { nombre: 'pirata' },
        estado_poliza: { nombre: 'activa' },
        bien_asegurado: null,
        cobertura: [],
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
      poliza: [{
        numero_poliza: 'POL-00501',
        fecha_vencimiento: new Date('2026-03-01T00:00:00.000Z'),
        ramo: { nombre: 'pirata' },
        estado_poliza: { nombre: 'activa' },
      }],
    }

    expect(() => toListItem(record)).toThrow('fuera de catálogo')
  })
})
