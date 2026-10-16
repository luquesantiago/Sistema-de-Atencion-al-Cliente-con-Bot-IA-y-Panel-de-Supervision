import { describe, expect, it } from 'vitest'
import {
  assertPolicyWindow,
  parseCreateCustomer,
  parseCreatePolicy,
  parseLinkPhone,
  parseReplaceCoverages,
  parseUpdateCustomer,
  parseUpdatePolicy,
} from './customer-edits.js'
import { RequestManagementError } from './request-management.js'

function expectValidationError(operation: () => unknown): RequestManagementError {
  let caught: unknown
  try {
    operation()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(RequestManagementError)
  const requestError = caught as RequestManagementError
  expect(requestError.statusCode).toBe(400)
  expect(requestError.code).toBe('VALIDATION_ERROR')
  return requestError
}

describe('parseCreateCustomer', () => {
  it('acepta una persona con DNI normalizado y teléfono opcional', () => {
    const input = parseCreateCustomer({
      kind: 'persona',
      dni: '30.111.222',
      lastName: 'Gómez',
      firstName: 'Ana',
      phone: '+54 9 11 5555-1234',
    })
    expect(input).toEqual({
      kind: 'persona',
      dni: '30111222',
      lastName: 'Gómez',
      firstName: 'Ana',
      phone: '5491155551234',
    })
  })

  it('acepta una empresa con CUIT', () => {
    const input = parseCreateCustomer({
      kind: 'empresa',
      cuit: '30-71234567-9',
      razonSocial: 'Distribuidora Norte SRL',
    })
    expect(input).toEqual({
      kind: 'empresa',
      cuit: '30712345679',
      razonSocial: 'Distribuidora Norte SRL',
    })
  })

  it('rechaza un DNI con menos de 7 dígitos', () => {
    expectValidationError(() => parseCreateCustomer({
      kind: 'persona',
      dni: '123456',
      lastName: 'Gómez',
      firstName: 'Ana',
    }))
  })

  it('rechaza una persona con CUIT', () => {
    expectValidationError(() => parseCreateCustomer({
      kind: 'persona',
      dni: '30111222',
      lastName: 'Gómez',
      firstName: 'Ana',
      cuit: '30712345679',
    }))
  })

  it('rechaza una empresa con nombre de persona', () => {
    expectValidationError(() => parseCreateCustomer({
      kind: 'empresa',
      cuit: '30712345679',
      razonSocial: 'Distribuidora Norte SRL',
      firstName: 'Ana',
    }))
  })

  it('rechaza un teléfono muy corto', () => {
    expectValidationError(() => parseCreateCustomer({
      kind: 'persona',
      dni: '30111222',
      lastName: 'Gómez',
      firstName: 'Ana',
      phone: '115555123',
    }))
  })
})

describe('parseUpdateCustomer', () => {
  it('arma la edición de una persona', () => {
    expect(parseUpdateCustomer(7, { lastName: 'Gómez', firstName: 'Ana María' })).toEqual({
      id: 7,
      changes: { kind: 'persona', lastName: 'Gómez', firstName: 'Ana María' },
    })
  })

  it('arma la edición de una empresa', () => {
    expect(parseUpdateCustomer(7, { cuit: '30712345679', razonSocial: 'Distribuidora Norte SRL' })).toEqual({
      id: 7,
      changes: { kind: 'empresa', cuit: '30712345679', razonSocial: 'Distribuidora Norte SRL' },
    })
  })

  it('rechaza mezclar datos de persona y de empresa', () => {
    expectValidationError(() => parseUpdateCustomer(7, { lastName: 'Gómez', razonSocial: 'Norte' }))
  })

  it('rechaza un cuerpo sin campos', () => {
    expectValidationError(() => parseUpdateCustomer(7, {}))
  })

  it('rechaza campos no permitidos, entre ellos el DNI', () => {
    expectValidationError(() => parseUpdateCustomer(7, { dni: '30111222' }))
  })

  it('rechaza un apellido vacío', () => {
    expectValidationError(() => parseUpdateCustomer(7, { lastName: '  ', firstName: 'Ana' }))
  })
})

describe('parseLinkPhone', () => {
  it('normaliza el número a solo dígitos', () => {
    expect(parseLinkPhone(3, { phone: '(011) 5555-1234' })).toEqual({ customerId: 3, phone: '01155551234' })
  })

  it('rechaza un número sin dígitos suficientes', () => {
    expectValidationError(() => parseLinkPhone(3, { phone: '123' }))
  })
})

describe('parseUpdatePolicy', () => {
  it('arma la edición de estado, vigencia y prima', () => {
    const input = parseUpdatePolicy(9, {
      status: 'dada de baja',
      startDate: '2026-01-01',
      expirationDate: '2026-12-31',
      premiumCents: 15_500,
    })
    expect(input).toEqual({
      id: 9,
      status: 'dada de baja',
      startDate: '2026-01-01',
      expirationDate: '2026-12-31',
      premiumCents: 15_500,
    })
  })

  it('acepta el bien asegurado completo y la prima en null', () => {
    const input = parseUpdatePolicy(9, {
      premiumCents: null,
      insuredItem: {
        description: 'Volkswagen Gol',
        plate: 'ABC123',
        brand: 'Volkswagen',
        model: 'Gol',
        year: 2019,
        address: null,
      },
    })
    expect(input.insuredItem).toEqual({
      description: 'Volkswagen Gol',
      plate: 'ABC123',
      address: null,
      brand: 'Volkswagen',
      model: 'Gol',
      year: 2019,
    })
    expect(input.premiumCents).toBeNull()
  })

  it('acepta desconectar el bien con null', () => {
    expect(parseUpdatePolicy(9, { insuredItem: null }).insuredItem).toBeNull()
  })

  it('rechaza un estado fuera de catálogo', () => {
    expectValidationError(() => parseUpdatePolicy(9, { status: 'vencida' }))
  })

  it('rechaza una fecha que no sea aaaa-mm-dd', () => {
    expectValidationError(() => parseUpdatePolicy(9, { startDate: '01/01/2026' }))
  })

  it('rechaza una fecha inexistente del calendario', () => {
    expectValidationError(() => parseUpdatePolicy(9, { expirationDate: '2026-02-30' }))
  })

  it('rechaza un cuerpo sin campos', () => {
    expectValidationError(() => parseUpdatePolicy(9, {}))
  })

  it('rechaza un año fuera de rango en el bien', () => {
    expectValidationError(() => parseUpdatePolicy(9, {
      insuredItem: { description: 'Auto', year: 1200 },
    }))
  })
})

describe('assertPolicyWindow', () => {
  it('acepta vencimiento igual al inicio', () => {
    expect(() => assertPolicyWindow('2026-01-01', '2026-01-01')).not.toThrow()
  })

  it('rechaza un vencimiento anterior al inicio', () => {
    expectValidationError(() => assertPolicyWindow('2026-01-02', '2026-01-01'))
  })
})

describe('parseReplaceCoverages', () => {
  it('arma la lista completa de coberturas', () => {
    const input = parseReplaceCoverages(4, {
      coverages: [
        { planId: 2, description: 'Responsabilidad civil', insuredSumCents: 100_000_00 },
        { id: 15, planId: 3, description: null, insuredSumCents: null },
      ],
    })
    expect(input).toEqual({
      policyId: 4,
      coverages: [
        { planId: 2, description: 'Responsabilidad civil', insuredSumCents: 100_000_00 },
        { id: 15, planId: 3, description: null, insuredSumCents: null },
      ],
    })
  })

  it('acepta la lista vacía, que deja la póliza sin coberturas', () => {
    expect(parseReplaceCoverages(4, { coverages: [] }).coverages).toEqual([])
  })

  it('rechaza coverages que no sea una lista', () => {
    expectValidationError(() => parseReplaceCoverages(4, { coverages: {} }))
  })

  it('rechaza una cobertura sin planId', () => {
    expectValidationError(() => parseReplaceCoverages(4, { coverages: [{ description: null, insuredSumCents: null }] }))
  })
})

describe('parseCreatePolicy', () => {
  // Cuerpo completo de un alta: obligatorios + opcionales. Sin número ni
  // compañía: los asigna el sistema.
  const altaCompleta = () => ({
    ramo: 'auto',
    status: 'activa',
    currency: 'ARS',
    startDate: '2026-10-01',
    expirationDate: '2027-10-01',
    premiumCents: 12_500_00,
    observations: 'Póliza cargada desde el panel',
    insuredItem: { description: 'VW Gol', plate: 'ABC123', brand: 'Volkswagen', model: 'Gol', year: 2019 },
    coverages: [{ planId: 2, description: 'Responsabilidad civil', insuredSumCents: 100_000_00 }],
  })

  it('arma el alta completa con las coberturas y el bien', () => {
    const input = parseCreatePolicy(7, altaCompleta())
    expect(input).toEqual({
      customerId: 7,
      ramo: 'auto',
      status: 'activa',
      currency: 'ARS',
      startDate: '2026-10-01',
      expirationDate: '2027-10-01',
      premiumCents: 12_500_00,
      observations: 'Póliza cargada desde el panel',
      insuredItem: {
        description: 'VW Gol',
        plate: 'ABC123',
        address: null,
        brand: 'Volkswagen',
        model: 'Gol',
        year: 2019,
      },
      coverages: [{ planId: 2, description: 'Responsabilidad civil', insuredSumCents: 100_000_00 }],
    })
  })

  it('acepta el mínimo: sin coberturas, sin bien y sin prima', () => {
    const input = parseCreatePolicy(3, {
      ramo: 'vida',
      status: 'activa',
      currency: 'ARS',
      startDate: '2026-10-01',
      expirationDate: '2027-10-01',
    })
    expect(input).toEqual({
      customerId: 3,
      ramo: 'vida',
      status: 'activa',
      currency: 'ARS',
      startDate: '2026-10-01',
      expirationDate: '2027-10-01',
      coverages: [],
    })
  })

  it('rechaza un alta con número: lo asigna el sistema', () => {
    expectValidationError(() => parseCreatePolicy(1, { ...altaCompleta(), number: 'POL-00999' }))
  })

  it('rechaza un alta con compañía: la fija el sistema', () => {
    expectValidationError(() => parseCreatePolicy(1, { ...altaCompleta(), companyId: 1 }))
  })

  it('rechaza un alta sin vigencia', () => {
    const { startDate: _startDate, ...sinInicio } = altaCompleta()
    expectValidationError(() => parseCreatePolicy(1, sinInicio))
  })

  it('rechaza un bien asegurado en una póliza de vida', () => {
    expectValidationError(() => parseCreatePolicy(1, {
      ...altaCompleta(),
      ramo: 'vida',
      insuredItem: { description: 'Persona', plate: null, address: null, brand: null, model: null, year: null },
    }))
  })

  it('rechaza un ramo fuera de catálogo', () => {
    expectValidationError(() => parseCreatePolicy(1, { ...altaCompleta(), ramo: 'viajes' }))
  })

  it('rechaza un estado fuera de catálogo', () => {
    expectValidationError(() => parseCreatePolicy(1, { ...altaCompleta(), status: 'pagada' }))
  })

  it('rechaza una moneda fuera de catálogo', () => {
    expectValidationError(() => parseCreatePolicy(1, { ...altaCompleta(), currency: 'EUR' }))
  })

  it('rechaza una vigencia que no cierra', () => {
    expectValidationError(() => parseCreatePolicy(1, { ...altaCompleta(), expirationDate: '2026-05-01' }))
  })

  it('rechaza una prima negativa', () => {
    expectValidationError(() => parseCreatePolicy(1, { ...altaCompleta(), premiumCents: -100 }))
  })

  it('rechaza campos de más, entre ellos el del actor', () => {
    expectValidationError(() => parseCreatePolicy(1, { ...altaCompleta(), actor: 'operador' }))
  })

  it('rechaza coberturas con id: en un alta no existen todavía', () => {
    expectValidationError(() => parseCreatePolicy(1, {
      ...altaCompleta(),
      coverages: [{ id: 12, planId: 2, description: null, insuredSumCents: null }],
    }))
  })
})
