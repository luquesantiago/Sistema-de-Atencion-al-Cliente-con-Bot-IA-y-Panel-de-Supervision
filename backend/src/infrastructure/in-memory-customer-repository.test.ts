import { describe, expect, it } from 'vitest'
import { customerRepositoryFromFixtures, parseCustomerFixtures } from './in-memory-customer-repository.js'

describe('clientes de prueba', () => {
  it('carga el archivo del repo y encuentra un DNI ficticio', async () => {
    const repository = customerRepositoryFromFixtures()
    const customer = await repository.findByDni('99000001')
    expect(customer?.id).toBe('ficticio-1')
    expect(await repository.findById('ficticio-1')).toEqual(customer)
    expect(await repository.findByDni('30111222')).toBeNull()
  })

  const validPolicy = { number: 'POL-90001', ramo: 'auto', status: 'activa', expirationDate: '2027-03-15' }
  const fixtureWith = (policy: Record<string, unknown>) => ({
    clientes: [{ id: 'x', dni: '99000009', firstName: 'X', lastName: 'Y', policies: [policy] }],
  })

  it('acepta una póliza válida', () => {
    expect(parseCustomerFixtures(fixtureWith(validPolicy))).toHaveLength(1)
  })

  it('rechaza una póliza sin número', () => {
    const { number: _number, ...withoutNumber } = validPolicy
    expect(() => parseCustomerFixtures(fixtureWith(withoutNumber))).toThrow('number')
  })

  it('rechaza un estado fuera del catálogo', () => {
    expect(() => parseCustomerFixtures(fixtureWith({ ...validPolicy, status: 'ACTIVE' }))).toThrow('status')
  })

  it('rechaza un archivo sin "clientes"', () => {
    expect(() => parseCustomerFixtures([])).toThrow()
  })
})
