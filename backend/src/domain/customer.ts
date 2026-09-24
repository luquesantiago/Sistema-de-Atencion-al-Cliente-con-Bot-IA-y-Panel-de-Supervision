export type PolicyStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

export type CustomerPolicy = {
  number: string
  type: string
  status: PolicyStatus
  expirationDate: string
  coverages: string[]
}

export type Customer = {
  id: string
  dni: string
  name: string
  policies: CustomerPolicy[]
}

export interface CustomerRepository {
  findByDni(dni: string): Promise<Customer | null>
}