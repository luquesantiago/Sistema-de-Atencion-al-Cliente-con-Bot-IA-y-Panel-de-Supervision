import { readFileSync } from 'node:fs'
import {
  isPolicyStatus,
  isRamo,
  type Customer,
  type CustomerPolicy,
  type CustomerRepository,
} from '../domain/customer.js'

// Doble de prueba de la cartera: el asistente usa PrismaCustomerRepository. El cargador de
// backend/fixtures/clientes-ficticios.json (datos ficticios) queda para las pruebas.
export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly links: Array<{ phone: string; customerId: number }> = []
  private readonly inactiveIds = new Set<number>()

  public constructor(private readonly customers: Customer[]) {}

  public async findByDni(dni: string): Promise<Customer | null> {
    return this.activeCustomers().find((customer) => customer.dni === dni) ?? null
  }

  public async findById(id: number): Promise<Customer | null> {
    return this.activeCustomers().find((customer) => customer.id === id) ?? null
  }

  public async linkedCustomerIds(phone: string): Promise<number[]> {
    const active = new Set(this.activeCustomers().map((customer) => customer.id))
    return this.links
      .filter((link) => link.phone === phone && active.has(link.customerId))
      .map((link) => link.customerId)
      .sort((a, b) => a - b)
  }

  public linkPhone(phone: string, customerId: number): void {
    this.links.push({ phone, customerId })
  }

  // Marca al cliente como cargado por error (activo = FALSE en la base).
  public deactivate(customerId: number): void {
    this.inactiveIds.add(customerId)
  }

  private activeCustomers(): Customer[] {
    return this.customers.filter((customer) => !this.inactiveIds.has(customer.id))
  }
}

const fixturesUrl = new URL('../../fixtures/clientes-ficticios.json', import.meta.url)

export function customerRepositoryFromFixtures(url: URL = fixturesUrl): CustomerRepository {
  return new InMemoryCustomerRepository(parseCustomerFixtures(JSON.parse(readFileSync(url, 'utf8'))))
}

// Valida cada campo: si el archivo no es válido, el backend no arranca y muestra el error.
export function parseCustomerFixtures(value: unknown): Customer[] {
  if (!isRecord(value) || !Array.isArray(value.clientes)) {
    throw new Error('El archivo de clientes de prueba tiene que tener un arreglo "clientes"')
  }
  return value.clientes.map((customer, index) => parseCustomer(customer, `clientes[${index}]`))
}

function parseCustomer(value: unknown, path: string): Customer {
  if (!isRecord(value)) throw new Error(`${path} no es un objeto`)
  const policies = value.policies
  if (!Array.isArray(policies)) throw new Error(`${path}.policies no es un arreglo`)
  const dni = requiredString(value, 'dni', path)
  if (!/^\d{7,8}$/.test(dni)) throw new Error(`${path}.dni tiene que tener 7 u 8 dígitos`)
  return {
    id: requiredPositiveInteger(value, 'id', path),
    dni,
    firstName: requiredString(value, 'firstName', path),
    lastName: requiredString(value, 'lastName', path),
    policies: policies.map((policy, index) => parsePolicy(policy, `${path}.policies[${index}]`)),
  }
}

function parsePolicy(value: unknown, path: string): CustomerPolicy {
  if (!isRecord(value)) throw new Error(`${path} no es un objeto`)
  const ramo = value.ramo
  const status = value.status
  const expirationDate = requiredString(value, 'expirationDate', path)
  if (!isRamo(ramo)) throw new Error(`${path}.ramo no está en el catálogo`)
  if (!isPolicyStatus(status)) throw new Error(`${path}.status no está en el catálogo`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) throw new Error(`${path}.expirationDate tiene que ser aaaa-mm-dd`)
  return {
    number: requiredString(value, 'number', path),
    ramo,
    status,
    expirationDate,
  }
}

function requiredString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path}.${key} falta o no es texto`)
  return value
}

function requiredPositiveInteger(record: Record<string, unknown>, key: string, path: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${path}.${key} tiene que ser un entero positivo`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
