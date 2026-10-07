// Valores de los catálogos estado_poliza y ramo (migración 20260928140100).
export const policyStatuses = ['activa', 'suspendida por mora', 'dada de baja'] as const
export const ramos = ['auto', 'moto', 'vida', 'hogar', 'embarcaciones', 'comercio'] as const

export type PolicyStatus = (typeof policyStatuses)[number]
export type Ramo = (typeof ramos)[number]

export function isPolicyStatus(value: unknown): value is PolicyStatus {
  return policyStatuses.some((status) => status === value)
}

export function isRamo(value: unknown): value is Ramo {
  return ramos.some((ramo) => ramo === value)
}

export type CustomerPolicy = {
  number: string
  ramo: Ramo
  status: PolicyStatus
  // Fecha sin hora, aaaa-mm-dd. «Vencida» no es un estado: se calcula con esta fecha.
  expirationDate: string
}

// Resumen que lleva el listado del panel: una línea por póliza con su tipo
// (ramo) y su estado.
export type CustomerPolicySummary = {
  number: string
  ramo: Ramo
  status: PolicyStatus
}

// El bien que asegura la póliza: patente para autos y motos, dirección para
// inmuebles y comercios. Las pólizas de vida no aseguran un bien: `null`.
export type InsuredItemDetail = {
  description: string
  plate: string | null
  address: string | null
  brand: string | null
  model: string | null
  year: number | null
}

// Póliza como la muestra la ficha del panel: vigencia y bien incluidos.
export type PolicyDetail = {
  number: string
  ramo: Ramo
  status: PolicyStatus
  // Fecha de inicio aaaa-mm-dd. Las fixtures de prueba no la tienen y queda null.
  startDate: string | null
  expirationDate: string
  insuredItem: InsuredItemDetail | null
}

export type Customer = {
  // id_cliente de la base.
  id: number
  dni: string
  firstName: string
  lastName: string
  policies: CustomerPolicy[]
}

// Fila del listado del panel. Una persona tiene DNI y nombre; una empresa
// tiene CUIT y razón social. Los campos ausentes son null, nunca se inventan.
export type CustomerListItem = {
  id: string
  dni: string | null
  cuit: string | null
  razonSocial: string | null
  firstName: string | null
  lastName: string | null
  phones: string[]
  policies: CustomerPolicySummary[]
}

export type CustomerDetail = {
  id: string
  dni: string | null
  cuit: string | null
  razonSocial: string | null
  firstName: string | null
  lastName: string | null
  phones: Array<{ id: number; number: string }>
  policies: PolicyDetail[]
}

// Búsqueda del panel: `search` es el texto (nombre, apellido y razón social)
// y `digits` son sus dígitos, para compararlos contra DNI, CUIT y teléfono
// sin puntos ni espacios.
export type CustomerListQuery = {
  search?: string
  digits?: string
  limit: number
  offset: number
}

export type CustomerPage = {
  items: CustomerListItem[]
  total: number
}

// Solo lecturas de la cartera (design.md, decisión 2): lo que escribe la conversación va
// en el ConversationStore. El panel agrega el listado y la ficha (RF-CAR-01, RF-CAR-02,
// RF-CAR-03), también de solo lectura.
export interface CustomerRepository {
  findByDni(dni: string): Promise<Customer | null>
  findById(id: number): Promise<Customer | null>
  // Ids de los clientes activos vinculados al número (cliente_telefono con el teléfono activo).
  linkedCustomerIds(phone: string): Promise<number[]>
  listCustomers(query: CustomerListQuery): Promise<CustomerPage>
  findCustomerDetail(id: number): Promise<CustomerDetail | null>
}
