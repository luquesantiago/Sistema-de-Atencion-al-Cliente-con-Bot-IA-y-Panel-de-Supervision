import { readFileSync } from 'node:fs'
import {
  isPolicyStatus,
  isRamo,
  type Customer,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerListQuery,
  type CustomerPage,
  type CustomerPolicy,
  type CustomerRepository,
} from '../domain/customer.js'

// Doble de prueba de la cartera: el asistente usa PrismaCustomerRepository. El cargador de
// backend/fixtures/clientes-ficticios.json (datos ficticios) queda para las pruebas.
export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly links: Array<{ phone: string; customerId: number }> = []
  private readonly inactiveIds = new Set<number>()
  // Teléfonos del panel con su id: es el que se usa para desvincular teléfonos en los
  // trámites. `links` solo guarda el par número-cliente que consulta el asistente.
  private readonly phoneLinks = new Map<number, Array<{ id: number; number: string }>>()

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

  public async listCustomers(query: CustomerListQuery): Promise<CustomerPage> {
    const search = query.search === undefined ? undefined : foldText(query.search)
    const digits = query.digits
    const matching = this.activeCustomers()
      .filter((customer) => {
        if (search === undefined && digits === undefined) return true
        const textMatch = search !== undefined && foldText(customerFullName(customer)).includes(search)
        const digitsMatch = digits !== undefined &&
          (customer.dni.includes(digits) || this.phonesOf(customer.id).some((phone) => phone.number.includes(digits)))
        return textMatch || digitsMatch
      })
      .sort((a, b) =>
        a.lastName.localeCompare(b.lastName, 'es') ||
        a.firstName.localeCompare(b.firstName, 'es') ||
        a.id - b.id)
    return {
      items: matching
        .slice(query.offset, query.offset + query.limit)
        .map((customer) => toInMemoryListItem(customer, this.phonesOf(customer.id))),
      total: matching.length,
    }
  }

  public async findCustomerDetail(id: number): Promise<CustomerDetail | null> {
    const customer = this.activeCustomers().find((candidate) => candidate.id === id)
    if (!customer) return null
    return {
      id: String(customer.id),
      dni: customer.dni,
      cuit: null,
      razonSocial: null,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phones: this.phonesOf(customer.id),
      // Las fixtures no traen vigencia ni bien asegurado: la ficha lo dice
      // con null en lugar de inventar datos (el API real sí los tiene).
      policies: customer.policies.map((policy) => ({ ...policy, startDate: null, insuredItem: null })),
    }
  }

  public linkPhone(phone: string, customerId: number): void {
    this.links.push({ phone, customerId })
  }

  // Vincula un teléfono con su id de teléfono. El mismo número puede estar en dos
  // clientes: así se prueba que la búsqueda lo devuelva a los dos (RF-CAR-03).
  public addPhoneLink(customerId: number, phoneId: number, number: string): void {
    this.linkPhone(number, customerId)
    const links = this.phoneLinks.get(customerId) ?? []
    links.push({ id: phoneId, number })
    this.phoneLinks.set(customerId, links)
  }

  // Marca al cliente como cargado por error (activo = FALSE en la base).
  public deactivate(customerId: number): void {
    this.inactiveIds.add(customerId)
  }

  private phonesOf(customerId: number): Array<{ id: number; number: string }> {
    return this.phoneLinks.get(customerId) ?? []
  }

  private activeCustomers(): Customer[] {
    return this.customers.filter((customer) => !this.inactiveIds.has(customer.id))
  }
}

function customerFullName(customer: Customer): string {
  return `${customer.firstName} ${customer.lastName}`
}

// Minúsculas sin acentos, igual que la collation de la base: «gomez»
// encuentra a «Gómez».
function foldText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function toInMemoryListItem(customer: Customer, phones: Array<{ id: number; number: string }>): CustomerListItem {
  return {
    id: String(customer.id),
    dni: customer.dni,
    cuit: null,
    razonSocial: null,
    firstName: customer.firstName,
    lastName: customer.lastName,
    phones: phones.map((phone) => phone.number),
    policies: customer.policies.map((policy) => ({
      number: policy.number,
      ramo: policy.ramo,
      status: policy.status,
    })),
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
