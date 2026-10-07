import type { PrismaClient } from '../generated/prisma/client.js'
import {
  isPolicyStatus,
  isRamo,
  type Customer,
  type CustomerPolicy,
  type CustomerRepository,
} from '../domain/customer.js'

export class PrismaCustomerRepository implements CustomerRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findByDni(dni: string): Promise<Customer | null> {
    const customer = await this.prisma.cliente.findFirst({
      where: { dni, activo: true },
      include: customerInclude,
    })
    return customer ? customerFromRecord(customer) : null
  }

  public async findById(id: number): Promise<Customer | null> {
    const customer = await this.prisma.cliente.findFirst({
      where: { id_cliente: id, activo: true },
      include: customerInclude,
    })
    return customer ? customerFromRecord(customer) : null
  }

  public async linkedCustomerIds(phone: string): Promise<number[]> {
    const links = await this.prisma.cliente_telefono.findMany({
      where: {
        telefono: { numero: phone, activo: true },
        cliente: { activo: true },
      },
      select: { id_cliente: true },
      orderBy: { id_cliente: 'asc' },
    })
    return links.map((link) => link.id_cliente)
  }
}

const customerInclude = {
  poliza: { where: { activo: true }, include: { ramo: true, estado_poliza: true } },
} as const

export type CustomerRecord = {
  id_cliente: number
  dni: string | null
  nombre: string | null
  apellido: string | null
  activo: boolean
  poliza: Array<{
    numero_poliza: string
    fecha_vencimiento: Date
    activo: boolean
    ramo: { nombre: string }
    estado_poliza: { nombre: string }
  }>
}

// Convierte la fila de la base al cliente del dominio (design.md, decisión 2). Un cliente
// cargado por error o sin DNI (una empresa) no se usa; un ramo o un estado que no está en
// el dominio es un error de programación y lanza.
export function customerFromRecord(record: CustomerRecord): Customer | null {
  if (!record.activo || !record.dni) return null
  if (!record.nombre || !record.apellido) {
    throw new Error(`El cliente ${record.id_cliente} no tiene nombre y apellido`)
  }
  const policies: CustomerPolicy[] = record.poliza
    .filter((policy) => policy.activo)
    .map((policy) => {
      if (!isRamo(policy.ramo.nombre) || !isPolicyStatus(policy.estado_poliza.nombre)) {
        throw new Error(`La póliza ${policy.numero_poliza} contiene valores fuera de catálogo`)
      }
      return {
        number: policy.numero_poliza,
        ramo: policy.ramo.nombre,
        status: policy.estado_poliza.nombre,
        // Columna DATE: la fecha llega a medianoche UTC y se toma tal cual, sin zona horaria.
        expirationDate: policy.fecha_vencimiento.toISOString().slice(0, 10),
      }
    })
    .sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true }))
  return {
    id: record.id_cliente,
    dni: record.dni,
    firstName: record.nombre,
    lastName: record.apellido,
    policies,
  }
}
