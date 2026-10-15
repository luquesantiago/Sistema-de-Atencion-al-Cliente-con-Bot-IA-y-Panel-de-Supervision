import type { CustomerDetail, CustomerRepository } from '../domain/customer.js'
import {
  parseCreateCustomer,
  parseLinkPhone,
  parseReplaceCoverages,
  parseUpdateCustomer,
  parseUpdatePolicy,
  type Catalogs,
  type CustomerEditRepository,
} from '../domain/customer-edits.js'
import { RequestManagementError } from '../domain/request-management.js'

// Casos de uso de edición de cartera desde el panel (RF-CAR-01, RF-CAR-02,
// RF-CAR-03). El cuerpo JSON pasa por los parsers del dominio, que validan y
// normalizan; el repositorio aplica cada mutación en una transacción y acá se
// recarga la ficha para devolverla actualizada. El DNI no se modifica nunca y
// estos cambios no pasan por aprobación: los pedidos que llegan por WhatsApp
// siguen el flujo de solicitud (RF-APR-01).
export class ManageCustomerEdits {
  public constructor(
    private readonly edits: CustomerEditRepository,
    private readonly customers: CustomerRepository,
  ) {}

  public async createCustomer(body: unknown): Promise<CustomerDetail> {
    const input = parseCreateCustomer(body)
    const id = await this.edits.createCustomer(input)
    return this.detail(id)
  }

  public async updateCustomer(idValue: string, body: unknown): Promise<CustomerDetail> {
    const id = parseId(idValue, 'cliente')
    const input = parseUpdateCustomer(id, body)
    await this.edits.updateCustomer(input)
    return this.detail(id)
  }

  public async deactivateCustomer(idValue: string): Promise<{ id: string }> {
    const id = parseId(idValue, 'cliente')
    await this.edits.deactivateCustomer(id)
    return { id: String(id) }
  }

  public async linkPhone(idValue: string, body: unknown): Promise<CustomerDetail> {
    const id = parseId(idValue, 'cliente')
    const input = parseLinkPhone(id, body)
    await this.edits.linkPhone(input)
    return this.detail(id)
  }

  public async unlinkPhone(idValue: string, phoneIdValue: string): Promise<CustomerDetail> {
    const id = parseId(idValue, 'cliente')
    const phoneId = parseId(phoneIdValue, 'teléfono')
    await this.edits.unlinkPhone({ customerId: id, phoneId })
    return this.detail(id)
  }

  public async updatePolicy(idValue: string, body: unknown): Promise<CustomerDetail> {
    const id = parseId(idValue, 'póliza')
    const input = parseUpdatePolicy(id, body)
    const customerId = await this.edits.updatePolicy(input)
    return this.detail(customerId)
  }

  public async replaceCoverages(idValue: string, body: unknown): Promise<CustomerDetail> {
    const id = parseId(idValue, 'póliza')
    const input = parseReplaceCoverages(id, body)
    const customerId = await this.edits.replaceCoverages(input)
    return this.detail(customerId)
  }

  public async listCatalogs(): Promise<Catalogs> {
    return this.edits.listCatalogs()
  }

  private async detail(id: number): Promise<CustomerDetail> {
    const detail = await this.customers.findCustomerDetail(id)
    if (!detail) {
      throw new RequestManagementError(404, 'NOT_FOUND', 'No existe un cliente con ese identificador.')
    }
    return detail
  }
}

function parseId(value: string, entity: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', `El identificador del ${entity} no es válido.`)
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id > 4_294_967_295) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', `El identificador del ${entity} está fuera del rango permitido.`)
  }
  return id
}
