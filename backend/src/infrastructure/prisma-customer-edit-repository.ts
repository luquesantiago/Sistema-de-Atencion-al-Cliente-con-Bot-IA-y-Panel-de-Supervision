import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { isCurrency, isPolicyStatus, isRamo, type Currency, type PolicyStatus, type Ramo } from '../domain/customer.js'
import {
  assertPolicyWindow,
  type Catalogs,
  type CreateCustomerInput,
  type CustomerEditRepository,
  type InsuredItemInput,
  type LinkPhoneInput,
  type ReplaceCoveragesInput,
  type UnlinkPhoneInput,
  type UpdateCustomerInput,
  type UpdatePolicyInput,
} from '../domain/customer-edits.js'
import { RequestManagementError } from '../domain/request-management.js'

// Escrituras de cartera del panel sobre MySQL. Cada operación corre en una
// transacción: o se aplica entera o no se aplica. Un DNI, CUIT, teléfono o
// patente repetido es un conflicto (409), igual que una decisión tomada por
// otro operador a la vez en los trámites.
export class PrismaCustomerEditRepository implements CustomerEditRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createCustomer(input: CreateCustomerInput): Promise<number> {
    return this.guard(() => this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.cliente.create({
        data: input.kind === 'persona'
          ? { dni: input.dni, apellido: input.lastName, nombre: input.firstName }
          : { cuit: input.cuit, razon_social: input.razonSocial },
      })
      if (input.phone !== undefined) {
        await linkPhone(transaction, customer.id_cliente, input.phone)
      }
      return customer.id_cliente
    }))
  }

  public async updateCustomer(input: UpdateCustomerInput): Promise<void> {
    await this.guard(() => this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.cliente.findUnique({
        where: { id_cliente: input.id },
        select: { dni: true, cuit: true, activo: true },
      })
      if (!customer || !customer.activo) {
        throw notFound('No existe un cliente activo con ese identificador.')
      }
      if (input.changes.kind === 'persona') {
        if (!customer.dni) {
          throw validation('Ese cliente es una empresa: no tiene DNI ni nombre de persona.')
        }
        await transaction.cliente.update({
          where: { id_cliente: input.id },
          data: { apellido: input.changes.lastName, nombre: input.changes.firstName },
        })
        return
      }
      if (!customer.cuit) {
        throw validation('Ese cliente es una persona: no tiene CUIT ni razón social.')
      }
      await transaction.cliente.update({
        where: { id_cliente: input.id },
        data: { cuit: input.changes.cuit, razon_social: input.changes.razonSocial },
      })
    }))
  }

  public async deactivateCustomer(id: number): Promise<void> {
    await this.guard(() => this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.cliente.findUnique({
        where: { id_cliente: id },
        select: { activo: true },
      })
      if (!customer || !customer.activo) {
        throw notFound('No existe un cliente activo con ese identificador.')
      }
      await transaction.cliente.update({ where: { id_cliente: id }, data: { activo: false } })
    }))
  }

  public async linkPhone(input: LinkPhoneInput): Promise<void> {
    await this.guard(() => this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.cliente.findUnique({
        where: { id_cliente: input.customerId },
        select: { activo: true },
      })
      if (!customer || !customer.activo) {
        throw notFound('No existe un cliente activo con ese identificador.')
      }
      await linkPhone(transaction, input.customerId, input.phone)
    }))
  }

  public async unlinkPhone(input: UnlinkPhoneInput): Promise<void> {
    await this.guard(() => this.prisma.$transaction(async (transaction) => {
      const link = await transaction.cliente_telefono.findUnique({
        where: {
          id_cliente_id_telefono: { id_cliente: input.customerId, id_telefono: input.phoneId },
        },
      })
      if (!link) {
        throw notFound('Ese teléfono no está vinculado a este cliente.')
      }
      // Solo se quita el vínculo de este cliente: el número puede pertenecer
      // a otras personas (regla 9) y esas vinculaciones no se tocan.
      await transaction.cliente_telefono.delete({
        where: {
          id_cliente_id_telefono: { id_cliente: input.customerId, id_telefono: input.phoneId },
        },
      })
    }))
  }

  public async updatePolicy(input: UpdatePolicyInput): Promise<number> {
    return this.guard(() => this.prisma.$transaction(async (transaction) => {
      const policy = await transaction.poliza.findUnique({
        where: { id_poliza: input.id },
        include: { bien_asegurado: true },
      })
      if (!policy || !policy.activo) {
        throw notFound('No existe una póliza activa con ese identificador.')
      }
      const data: Prisma.polizaUpdateInput = {}
      if (input.number !== undefined) data.numero_poliza = input.number
      if (input.companyId !== undefined) {
        const company = await transaction.compania_aseguradora.findUnique({
          where: { id_compania: input.companyId },
          select: { id_compania: true },
        })
        if (!company) throw validation('No existe una compañía aseguradora con ese identificador.')
        data.compania_aseguradora = { connect: { id_compania: input.companyId } }
      }
      if (input.ramo !== undefined) data.ramo = { connect: { id_ramo: await ramoId(transaction, input.ramo) } }
      if (input.status !== undefined) {
        data.estado_poliza = { connect: { id_estado_poliza: await policyStatusId(transaction, input.status) } }
      }
      if (input.currency !== undefined) {
        data.moneda = { connect: { id_moneda: await currencyId(transaction, input.currency) } }
      }
      // `fecha_inicio` y `fecha_vencimiento` son DateTime @db.Date: Prisma
      // solo acepta un Date, no el texto aaaa-mm-dd que viene del panel.
      if (input.startDate !== undefined) data.fecha_inicio = dateFromOnly(input.startDate)
      if (input.expirationDate !== undefined) data.fecha_vencimiento = dateFromOnly(input.expirationDate)
      if (input.premiumCents !== undefined) {
        data.prima_mensual = input.premiumCents === null ? null : centsToDecimal(input.premiumCents)
      }
      if (input.observations !== undefined) data.observaciones = input.observations
      // La vigencia final tiene que cerrar aunque solo se edite una de las dos fechas.
      assertPolicyWindow(
        input.startDate ?? dateOnly(policy.fecha_inicio),
        input.expirationDate ?? dateOnly(policy.fecha_vencimiento),
      )
      if (input.insuredItem !== undefined) {
        if (input.insuredItem === null) {
          if (policy.id_bien !== null) data.bien_asegurado = { disconnect: true }
        } else {
          data.bien_asegurado = await insuredItemWrite(transaction, policy.id_bien, input.insuredItem)
        }
      }
      await transaction.poliza.update({ where: { id_poliza: input.id }, data })
      return policy.id_cliente
    }))
  }

  public async replaceCoverages(input: ReplaceCoveragesInput): Promise<number> {
    return this.guard(() => this.prisma.$transaction(async (transaction) => {
      const policy = await transaction.poliza.findUnique({
        where: { id_poliza: input.policyId },
        select: { id_poliza: true, id_cliente: true, activo: true },
      })
      if (!policy || !policy.activo) {
        throw notFound('No existe una póliza activa con ese identificador.')
      }
      for (const coverage of input.coverages) {
        const plan = await transaction.plan.findUnique({
          where: { id_plan: coverage.planId },
          select: { activo: true },
        })
        if (!plan || !plan.activo) {
          throw validation(`No existe un plan activo con el identificador ${coverage.planId}.`)
        }
      }
      const current = await transaction.cobertura.findMany({
        where: { id_poliza: input.policyId, activo: true },
        select: { id_cobertura: true },
      })
      const currentIds = new Set(current.map((coverage) => coverage.id_cobertura))
      const keptIds = new Set(input.coverages.flatMap((coverage) => coverage.id === undefined ? [] : [coverage.id]))
      for (const id of keptIds) {
        if (!currentIds.has(id)) {
          throw validation(`La cobertura ${id} no pertenece a esta póliza.`)
        }
      }
      for (const coverage of input.coverages) {
        const data = {
          id_plan: coverage.planId,
          descripcion: coverage.description,
          suma_asegurada: coverage.insuredSumCents === null ? null : centsToDecimal(coverage.insuredSumCents),
        }
        if (coverage.id === undefined) {
          await transaction.cobertura.create({ data: { ...data, id_poliza: input.policyId } })
        } else {
          await transaction.cobertura.update({ where: { id_cobertura: coverage.id }, data })
        }
      }
      // Baja lógica de las que se quitaron: la historia de la póliza no se pierde.
      const removed = current.filter((coverage) => !keptIds.has(coverage.id_cobertura))
      if (removed.length > 0) {
        await transaction.cobertura.updateMany({
          where: { id_cobertura: { in: removed.map((coverage) => coverage.id_cobertura) } },
          data: { activo: false },
        })
      }
      return policy.id_cliente
    }))
  }

  public async listCatalogs(): Promise<Catalogs> {
    const [ramoRows, statusRows, currencyRows, companyRows, planRows] = await Promise.all([
      this.prisma.ramo.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: { nombre: true },
      }),
      this.prisma.estado_poliza.findMany({ orderBy: { nombre: 'asc' }, select: { nombre: true } }),
      this.prisma.moneda.findMany({ orderBy: { codigo: 'asc' }, select: { codigo: true, nombre: true } }),
      this.prisma.compania_aseguradora.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: { id_compania: true, nombre: true },
      }),
      this.prisma.plan.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        select: { id_plan: true, nombre: true },
      }),
    ])
    return {
      ramoNames: ramoRows.map((row) => row.nombre).filter(isRamo),
      policyStatusNames: statusRows.map((row) => row.nombre).filter(isPolicyStatus),
      currencies: currencyRows
        .filter((row) => isCurrency(row.codigo))
        .map((row) => ({ code: row.codigo, name: row.nombre })),
      companies: companyRows.map((row) => ({ id: row.id_compania, name: row.nombre })),
      plans: planRows.map((row) => ({ id: row.id_plan, name: row.nombre })),
    }
  }

  // Un valor repetido (DNI, CUIT, teléfono, patente) llega de Prisma como
  // P2002 y se traduce a un conflicto para el panel.
  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new RequestManagementError(409, 'CONFLICT', 'Ya existe un registro con esos datos únicos (DNI, CUIT, teléfono o patente).')
      }
      throw error
    }
  }
}

type Transaction = Prisma.TransactionClient

// Crea el teléfono si no existe y lo vincula al cliente. Un número ya
// vinculado al mismo cliente es un conflicto.
async function linkPhone(transaction: Transaction, customerId: number, phone: string): Promise<void> {
  const existing = await transaction.telefono.findUnique({ where: { numero: phone } })
  const phoneRow = existing ?? await transaction.telefono.create({ data: { numero: phone } })
  const link = await transaction.cliente_telefono.findUnique({
    where: { id_cliente_id_telefono: { id_cliente: customerId, id_telefono: phoneRow.id_telefono } },
  })
  if (link) {
    throw new RequestManagementError(409, 'CONFLICT', 'Ese teléfono ya está vinculado al cliente.')
  }
  await transaction.cliente_telefono.create({
    data: { id_cliente: customerId, id_telefono: phoneRow.id_telefono },
  })
}

// El bien asegurado se crea o se actualiza según si la póliza ya lo tiene.
async function insuredItemWrite(
  transaction: Transaction,
  currentId: number | null,
  item: InsuredItemInput,
): Promise<Prisma.bien_aseguradoUpdateOneWithoutPolizaNestedInput> {
  const data = {
    descripcion: item.description,
    patente_matricula: item.plate,
    direccion: item.address,
    marca: item.brand,
    modelo: item.model,
    anio: item.year,
    activo: true,
  }
  if (currentId !== null) {
    return { update: { where: { id_bien: currentId }, data } }
  }
  return { create: data }
}

async function ramoId(transaction: Transaction, ramo: Ramo): Promise<number> {
  const row = await transaction.ramo.findUnique({ where: { nombre: ramo }, select: { id_ramo: true } })
  if (!row) throw validation(`No existe el ramo «${ramo}».`)
  return row.id_ramo
}

async function policyStatusId(transaction: Transaction, status: PolicyStatus): Promise<number> {
  const row = await transaction.estado_poliza.findUnique({ where: { nombre: status }, select: { id_estado_poliza: true } })
  if (!row) throw validation(`No existe el estado «${status}».`)
  return row.id_estado_poliza
}

async function currencyId(transaction: Transaction, currency: Currency): Promise<number> {
  const row = await transaction.moneda.findUnique({ where: { codigo: currency }, select: { id_moneda: true } })
  if (!row) throw validation(`No existe la moneda «${currency}».`)
  return row.id_moneda
}

// Centavos enteros a DECIMAL(12,2) por texto, sin pasar por un flotante.
function centsToDecimal(cents: number): Prisma.Decimal {
  const text = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
  return new Prisma.Decimal(text)
}

// Columna DATE: la fecha llega a medianoche UTC y se toma tal cual.
export function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Fecha aaaa-mm-dd a Date a medianoche UTC: es lo que Prisma necesita para
// escribir en una columna @db.Date, y dateOnly la devuelve igual.
export function dateFromOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function notFound(message: string): RequestManagementError {
  return new RequestManagementError(404, 'NOT_FOUND', message)
}

function validation(message: string): RequestManagementError {
  return new RequestManagementError(400, 'VALIDATION_ERROR', message)
}
