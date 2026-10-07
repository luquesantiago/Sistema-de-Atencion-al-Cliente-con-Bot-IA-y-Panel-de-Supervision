import { describe, expect, it } from 'vitest'
import type { Customer } from '../domain/customer.js'
import {
  customerRepositoryFromFixtures,
  InMemoryCustomerRepository,
  parseCustomerFixtures,
} from './in-memory-customer-repository.js'

describe('clientes de prueba', () => {
  it('carga el archivo del repo y encuentra un DNI ficticio', async () => {
    const repository = customerRepositoryFromFixtures()
    const customer = await repository.findByDni('99000001')
    expect(customer?.id).toBe(90001)
    expect(await repository.findById(90001)).toEqual(customer)
    expect(await repository.findByDni('30111222')).toBeNull()
  })

  const validPolicy = { number: 'POL-90001', ramo: 'auto', status: 'activa', expirationDate: '2027-03-15' }
  const fixtureWith = (policy: Record<string, unknown>) => ({
    clientes: [{ id: 9, dni: '99000009', firstName: 'X', lastName: 'Y', policies: [policy] }],
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

describe('clientes vinculados a un número', () => {
  const ana: Customer = { id: 1, dni: '99000001', firstName: 'Ana', lastName: 'Ficticia', policies: [] }
  const bruno: Customer = { id: 2, dni: '99000002', firstName: 'Bruno', lastName: 'Ficticio', policies: [] }

  it('un número vinculado a un cliente da su id', async () => {
    const repository = new InMemoryCustomerRepository([ana, bruno])
    repository.linkPhone('5490000000001', ana.id)
    expect(await repository.linkedCustomerIds('5490000000001')).toEqual([1])
  })

  it('un número vinculado a dos clientes da los dos', async () => {
    const repository = new InMemoryCustomerRepository([ana, bruno])
    repository.linkPhone('5490000000001', bruno.id)
    repository.linkPhone('5490000000001', ana.id)
    expect(await repository.linkedCustomerIds('5490000000001')).toEqual([1, 2])
  })

  it('un número sin vínculos da una lista vacía', async () => {
    const repository = new InMemoryCustomerRepository([ana, bruno])
    repository.linkPhone('5490000000001', ana.id)
    expect(await repository.linkedCustomerIds('5490000000002')).toEqual([])
  })

  it('un vínculo con un cliente cargado por error no cuenta', async () => {
    const repository = new InMemoryCustomerRepository([ana, bruno])
    repository.linkPhone('5490000000001', ana.id)
    repository.deactivate(ana.id)
    expect(await repository.linkedCustomerIds('5490000000001')).toEqual([])
    expect(await repository.findByDni(ana.dni)).toBeNull()
  })
})
