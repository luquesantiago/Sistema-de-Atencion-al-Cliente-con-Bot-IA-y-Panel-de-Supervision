import type { CustomerDetail, CustomerPage, CustomerRepository } from '../domain/customer.js'
import { RequestManagementError, type PageRequest } from '../domain/request-management.js'

const maxPageSize = 100
const maxId = 4_294_967_295
const maxSearchLength = 60

export type ListCustomersInput = PageRequest & {
  search?: string
}

// Casos de uso de la cartera para el panel de supervisión (RF-CAR-01,
// RF-CAR-02 y RF-CAR-03). Solo lectura: no alta, ni baja, ni modificación.
export class ManageCustomers {
  public constructor(private readonly repository: CustomerRepository) {}

  public async listCustomers(input: ListCustomersInput): Promise<CustomerPage> {
    validatePage(input)
    const search = normalizeSearch(input.search)
    if (search === undefined) {
      return this.repository.listCustomers({ limit: input.limit, offset: input.offset })
    }
    return this.repository.listCustomers({
      search,
      digits: onlyDigits(search),
      limit: input.limit,
      offset: input.offset,
    })
  }

  public async findCustomerDetail(id: string): Promise<CustomerDetail> {
    const customerId = Number(id)
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(customerId) || customerId > maxId) {
      throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El identificador del cliente no es válido.')
    }
    const detail = await this.repository.findCustomerDetail(customerId)
    if (!detail) {
      throw new RequestManagementError(404, 'NOT_FOUND', 'No existe un cliente con ese identificador.')
    }
    return detail
  }
}

function validatePage(page: PageRequest): void {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > maxPageSize ||
    !Number.isInteger(page.offset) || page.offset < 0) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'La paginación no es válida.')
  }
}

function normalizeSearch(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const search = value.trim()
  if (!search) return undefined
  if (search.length > maxSearchLength) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', `La búsqueda debe tener hasta ${maxSearchLength} caracteres.`)
  }
  return search
}

// DNI, CUIT y teléfono se buscan sin signos: quien escribe «30.111.222»
// espera encontrar al cliente igual que con «30111222».
function onlyDigits(search: string): string | undefined {
  const digits = search.replace(/\D/g, '')
  return digits || undefined
}
