import type { Customer, CustomerRepository } from '../domain/customer.js'

export class InMemoryCustomerRepository implements CustomerRepository {
  public constructor(private readonly customers: Customer[]) {}

  public async findByDni(dni: string): Promise<Customer | null> {
    return this.customers.find((customer) => customer.dni === dni) ?? null
  }
}

export function customerRepositoryFromEnvironment(): CustomerRepository {
  const serializedCustomers = process.env.CUSTOMERS_JSON ?? '[]'
  const customers: unknown = JSON.parse(serializedCustomers)

  if (!Array.isArray(customers)) {
    throw new Error('CUSTOMERS_JSON must contain a JSON array')
  }

  return new InMemoryCustomerRepository(customers as Customer[])
}