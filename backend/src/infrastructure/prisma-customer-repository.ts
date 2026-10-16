import type { Prisma } from '../generated/prisma/client.js'
import type { PrismaClient } from '../generated/prisma/client.js'
import {
  isCurrency,
  isPolicyStatus,
  isRamo,
  type Customer,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerListQuery,
  type CustomerPage,
  type CustomerPolicy,
  type CustomerPolicySummary,
  type CustomerRepository,
  type Installment,
  type PolicyDetail,
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

  public async listCustomers(query: CustomerListQuery): Promise<CustomerPage> {
    const where = customerSearchWhere(query)
    const [records, total] = await Promise.all([
      this.prisma.cliente.findMany({
        where,
        // A-Z por apellido; las empresas (apellido null) quedan antes y se
        // ordenan entre sí por razón social, con el id como desempate.
        orderBy: [{ apellido: 'asc' }, { razon_social: 'asc' }, { id_cliente: 'asc' }],
        skip: query.offset,
        take: query.limit,
        select: {
          id_cliente: true,
          dni: true,
          cuit: true,
          razon_social: true,
          nombre: true,
          apellido: true,
          cliente_telefono: {
            where: { telefono: { activo: true } },
            orderBy: { fecha_alta: 'asc' },
            select: { telefono: { select: { numero: true } } },
          },
          poliza: {
            where: { activo: true },
            orderBy: { numero_poliza: 'asc' },
            select: {
              numero_poliza: true,
              fecha_vencimiento: true,
              ramo: { select: { nombre: true } },
              estado_poliza: { select: { nombre: true } },
            },
          },
        },
      }),
      this.prisma.cliente.count({ where }),
    ])
    return { items: records.map(toListItem), total }
  }

  public async findCustomerDetail(id: number): Promise<CustomerDetail | null> {
    const record = await this.prisma.cliente.findFirst({
      where: { id_cliente: id, activo: true },
      include: {
        cliente_telefono: {
          where: { telefono: { activo: true } },
          orderBy: { fecha_alta: 'asc' },
          include: { telefono: true },
        },
        poliza: {
          where: { activo: true },
          orderBy: [{ fecha_vencimiento: 'asc' }, { numero_poliza: 'asc' }],
          include: {
            ramo: true,
            estado_poliza: true,
            moneda: true,
            compania_aseguradora: true,
            bien_asegurado: true,
            cobertura: {
              where: { activo: true },
              orderBy: { id_cobertura: 'asc' },
              include: { plan: true },
            },
          },
        },
      },
    })
    return record ? toDetail(record) : null
  }
}

const customerInclude = {
  poliza: {
    where: { activo: true },
    include: { ramo: true, estado_poliza: true, moneda: true, cuota: { orderBy: { numero_cuota: 'asc' } } },
  },
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
    moneda: { codigo: string }
    cuota: Array<{
      numero_cuota: number
      fecha_vencimiento: Date
      // DECIMAL(12,2): Prisma lo entrega como Decimal.
      importe: { toFixed(decimals: number): string }
      fecha_pago: Date | null
    }>
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
    .map(toCustomerPolicy)
    .sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true }))
  return {
    id: record.id_cliente,
    dni: record.dni,
    firstName: record.nombre,
    lastName: record.apellido,
    policies,
  }
}

type PolicyRecord = {
  numero_poliza: string
  fecha_vencimiento: Date
  ramo: { nombre: string }
  estado_poliza: { nombre: string }
}

// Lo que trae el listado: tipo, estado y vencimiento de cada póliza del cliente.
type PolicySummaryRecord = {
  numero_poliza: string
  fecha_vencimiento: Date
  ramo: { nombre: string }
  estado_poliza: { nombre: string }
}

// La ficha agrega la vigencia, la compañía, la moneda, la prima, el bien
// asegurado y las coberturas activas, que pueden no existir (vida sin bien,
// póliza sin coberturas cargadas).
type PolicyDetailRecord = PolicyRecord & {
  id_poliza: number
  fecha_inicio: Date
  // DECIMAL(12,2): Prisma lo entrega como Decimal.
  prima_mensual: { toFixed(decimals: number): string } | null
  observaciones: string | null
  moneda: { codigo: string }
  compania_aseguradora: { id_compania: number; nombre: string }
  bien_asegurado: {
    descripcion: string
    patente_matricula: string | null
    direccion: string | null
    marca: string | null
    modelo: string | null
    anio: number | null
  } | null
  cobertura: Array<{
    id_cobertura: number
    id_plan: number
    descripcion: string | null
    // DECIMAL(14,2): Prisma lo entrega como Decimal.
    suma_asegurada: { toFixed(decimals: number): string } | null
    plan: { nombre: string }
  }>
}

export type CustomerListRecord = {
  id_cliente: number
  dni: string | null
  cuit: string | null
  razon_social: string | null
  nombre: string | null
  apellido: string | null
  cliente_telefono: Array<{ telefono: { numero: string } }>
  poliza: PolicySummaryRecord[]
}

export type CustomerDetailRecord = {
  id_cliente: number
  dni: string | null
  cuit: string | null
  razon_social: string | null
  nombre: string | null
  apellido: string | null
  cliente_telefono: Array<{ telefono: { id_telefono: number; numero: string } }>
  poliza: PolicyDetailRecord[]
}

// Lo común de la póliza, para el asistente y para la ficha del panel.
function toPolicy(policy: PolicyRecord): Omit<CustomerPolicy, 'currency' | 'installments'> {
  if (!isRamo(policy.ramo.nombre) || !isPolicyStatus(policy.estado_poliza.nombre)) {
    throw new Error(`La póliza ${policy.numero_poliza} contiene valores fuera de catálogo`)
  }
  return {
    number: policy.numero_poliza,
    ramo: policy.ramo.nombre,
    status: policy.estado_poliza.nombre,
    expirationDate: dateOnly(policy.fecha_vencimiento),
  }
}

// El asistente suma la moneda y las cuotas, para responder el saldo.
function toCustomerPolicy(policy: CustomerRecord['poliza'][number]): CustomerPolicy {
  if (!isCurrency(policy.moneda.codigo)) {
    throw new Error(`La póliza ${policy.numero_poliza} contiene valores fuera de catálogo`)
  }
  return {
    ...toPolicy(policy),
    currency: policy.moneda.codigo,
    installments: policy.cuota
      .map((installment): Installment => ({
        number: installment.numero_cuota,
        dueDate: dateOnly(installment.fecha_vencimiento),
        amountCents: centsOf(installment.importe),
        paid: installment.fecha_pago !== null,
      }))
      .sort((a, b) => a.number - b.number),
  }
}

function toPolicySummary(policy: PolicySummaryRecord): CustomerPolicySummary {
  if (!isRamo(policy.ramo.nombre) || !isPolicyStatus(policy.estado_poliza.nombre)) {
    throw new Error(`La póliza ${policy.numero_poliza} contiene valores fuera de catálogo`)
  }
  return {
    number: policy.numero_poliza,
    ramo: policy.ramo.nombre,
    status: policy.estado_poliza.nombre,
    expirationDate: policy.fecha_vencimiento.toISOString().slice(0, 10),
  }
}

function toPolicyDetail(policy: PolicyDetailRecord): PolicyDetail {
  const base = toPolicy(policy)
  if (!isCurrency(policy.moneda.codigo)) {
    throw new Error(`La póliza ${policy.numero_poliza} contiene valores fuera de catálogo`)
  }
  return {
    ...base,
    id: String(policy.id_poliza),
    currency: policy.moneda.codigo,
    company: { id: String(policy.compania_aseguradora.id_compania), name: policy.compania_aseguradora.nombre },
    startDate: policy.fecha_inicio.toISOString().slice(0, 10),
    premiumCents: policy.prima_mensual === null ? null : centsOf(policy.prima_mensual),
    observations: policy.observaciones,
    insuredItem: policy.bien_asegurado
      ? {
          description: policy.bien_asegurado.descripcion,
          plate: policy.bien_asegurado.patente_matricula,
          address: policy.bien_asegurado.direccion,
          brand: policy.bien_asegurado.marca,
          model: policy.bien_asegurado.modelo,
          year: policy.bien_asegurado.anio,
        }
      : null,
    coverages: policy.cobertura.map((coverage) => ({
      id: coverage.id_cobertura,
      planId: coverage.id_plan,
      planName: coverage.plan.nombre,
      description: coverage.descripcion,
      insuredSumCents: coverage.suma_asegurada === null ? null : centsOf(coverage.suma_asegurada),
    })),
  }
}

// A diferencia de customerFromRecord, estos mappers aceptan clientes empresa
// (CUIT + razón social) y personas con datos incompletos: el panel los
// muestra como vienen, sin romper ni completar nada.
export function toListItem(record: CustomerListRecord): CustomerListItem {
  return {
    id: String(record.id_cliente),
    dni: record.dni,
    cuit: record.cuit,
    razonSocial: record.razon_social,
    firstName: record.nombre,
    lastName: record.apellido,
    phones: record.cliente_telefono.map((link) => link.telefono.numero),
    policies: record.poliza.map(toPolicySummary),
  }
}

export function toDetail(record: CustomerDetailRecord): CustomerDetail {
  return {
    id: String(record.id_cliente),
    dni: record.dni,
    cuit: record.cuit,
    razonSocial: record.razon_social,
    firstName: record.nombre,
    lastName: record.apellido,
    phones: record.cliente_telefono.map((link) => ({
      id: link.telefono.id_telefono,
      number: link.telefono.numero,
    })),
    policies: record.poliza.map(toPolicyDetail),
  }
}

// Un mismo buscador se aplica así: el texto contra nombre, apellido y razón
// social; los dígitos contra DNI, CUIT y teléfono, que es donde no hay signos.
function customerSearchWhere(query: CustomerListQuery): Prisma.clienteWhereInput {
  const clauses: Prisma.clienteWhereInput[] = []
  if (query.search) {
    clauses.push(
      { nombre: { contains: query.search } },
      { apellido: { contains: query.search } },
      { razon_social: { contains: query.search } },
    )
  }
  if (query.digits) {
    clauses.push(
      { dni: { contains: query.digits } },
      { cuit: { contains: query.digits } },
      { cliente_telefono: { some: { telefono: { numero: { contains: query.digits } } } } },
    )
  }
  return { activo: true, ...(clauses.length > 0 ? { OR: clauses } : {}) }
}

// Columna DATE: la fecha llega a medianoche UTC y se toma tal cual, sin zona horaria.
function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// DECIMAL(12,2) a centavos enteros, por texto, sin pasar por un número con decimales.
function centsOf(amount: { toFixed(decimals: number): string }): number {
  const text = amount.toFixed(2)
  if (!/^\d+\.\d{2}$/.test(text)) throw new Error(`Importe de cuota inválido: ${text}`)
  return Number(text.replace('.', ''))
}
