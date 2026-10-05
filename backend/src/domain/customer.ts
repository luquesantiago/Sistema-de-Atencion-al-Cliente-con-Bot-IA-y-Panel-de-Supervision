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

export type Customer = {
  id: string
  dni: string
  firstName: string
  lastName: string
  policies: CustomerPolicy[]
}

export interface CustomerRepository {
  findByDni(dni: string): Promise<Customer | null>
  findById(id: string): Promise<Customer | null>
}
