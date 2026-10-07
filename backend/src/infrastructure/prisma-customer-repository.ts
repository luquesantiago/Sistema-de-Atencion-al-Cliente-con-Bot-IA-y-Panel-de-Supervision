import type { PrismaClient } from '../generated/prisma/client.js'
import {
  isPolicyStatus,
  isRamo,
  type Customer,
  type CustomerPolicy,
  type CustomerRepository,
  type NewProspect,
  type PhoneChangeRequest,
} from '../domain/customer.js'

export class PrismaCustomerRepository implements CustomerRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findByDni(dni: string): Promise<Customer | null> {
    const customer = await this.prisma.cliente.findFirst({
      where: { dni, activo: true },
      include: { poliza: { where: { activo: true }, include: { ramo: true, estado_poliza: true } } },
    })
    return customer ? toCustomer(customer) : null
  }

  public async findById(id: string): Promise<Customer | null> {
    const idCliente = Number(id)
    if (!Number.isSafeInteger(idCliente) || idCliente <= 0) return null
    const customer = await this.prisma.cliente.findFirst({
      where: { id_cliente: idCliente, activo: true },
      include: { poliza: { where: { activo: true }, include: { ramo: true, estado_poliza: true } } },
    })
    return customer ? toCustomer(customer) : null
  }

  public async hasLinkedPhone(phone: string): Promise<boolean> {
    const link = await this.prisma.cliente_telefono.findFirst({
      where: {
        telefono: { numero: phone, activo: true },
        cliente: { activo: true },
      },
      select: { id_cliente: true },
    })
    return link !== null
  }

  public async hasOpenHandoff(phone: string): Promise<boolean> {
    const conversation = await this.prisma.conversacion.findFirst({
      where: {
        telefono: { numero: phone },
        fecha_fin: null,
        asistente_suspendido: true,
        caso: { some: { fecha_derivacion: { not: null }, fecha_cierre: null } },
      },
      select: { id_conversacion: true },
    })
    return conversation !== null
  }

  public async recordMessageForOpenHandoff(phone: string, content: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const caseRecord = await transaction.caso.findFirst({
        where: {
          conversacion: {
            telefono: { numero: phone },
            fecha_fin: null,
            asistente_suspendido: true,
          },
          fecha_derivacion: { not: null },
          fecha_cierre: null,
        },
        orderBy: { fecha_apertura: 'desc' },
        select: { id_caso: true },
      })
      if (!caseRecord) return
      const clientMessageOrigin = await requiredCatalogId(
        transaction.origen_mensaje.findUnique({ where: { nombre: 'cliente' }, select: { id_origen_mensaje: true } }),
        'origen de mensaje cliente',
      )
      await transaction.mensaje.create({
        data: {
          id_caso: caseRecord.id_caso,
          id_origen_mensaje: clientMessageOrigin,
          contenido: content,
        },
      })
    })
  }

  public async recordIncomingPhone(phone: string): Promise<void> {
    await this.prisma.telefono.upsert({
      where: { numero: phone },
      create: { numero: phone },
      update: {},
    })
  }

  public async createProspect(prospect: NewProspect): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const phone = await transaction.telefono.upsert({
        where: { numero: prospect.phone },
        create: { numero: prospect.phone },
        update: {},
      })
      const clientMessageOrigin = await requiredCatalogId(
        transaction.origen_mensaje.findUnique({ where: { nombre: 'cliente' }, select: { id_origen_mensaje: true } }),
        'origen de mensaje cliente',
      )
      const pendingProspectStatus = await requiredCatalogId(
        transaction.estado_prospecto.findUnique({
          where: { nombre: 'pendiente' },
          select: { id_estado_prospecto: true },
        }),
        'estado de prospecto pendiente',
      )
      const existingProspect = await transaction.prospecto.findFirst({
        where: {
          nombre_declarado: prospect.name,
          dni_declarado: prospect.dni,
          estado_prospecto: { is: { nombre: 'pendiente' } },
          caso: {
            is: {
              fecha_cierre: null,
              conversacion: { is: { telefono: { is: { numero: prospect.phone } } } },
            },
          },
        },
        select: { id_prospecto: true },
      })
      if (existingProspect) return

      const conversation = await transaction.conversacion.create({
        data: { id_telefono: phone.id_telefono, asistente_suspendido: true },
      })
      const caseRecord = await transaction.caso.create({
        data: {
          id_conversacion: conversation.id_conversacion,
          fecha_derivacion: new Date(),
          motivo_derivacion: 'Alta de cliente nuevo pendiente de revisión',
        },
      })
      await transaction.mensaje.create({
        data: {
          id_caso: caseRecord.id_caso,
          id_origen_mensaje: clientMessageOrigin,
          contenido: 'El cliente envió una foto de su DNI por WhatsApp. La imagen no se almacena en el sistema.',
        },
      })
      await transaction.prospecto.create({
        data: {
          id_caso: caseRecord.id_caso,
          id_estado_prospecto: pendingProspectStatus,
          nombre_declarado: prospect.name,
          dni_declarado: prospect.dni,
        },
      })
    })
  }

  public async createPhoneChangeRequest(request: PhoneChangeRequest): Promise<void> {
    const customerId = Number(request.customerId)
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      throw new Error('No se puede crear una solicitud de teléfono para un identificador de cliente inválido')
    }

    await this.prisma.$transaction(async (transaction) => {
      const phone = await transaction.telefono.upsert({
        where: { numero: request.phone },
        create: { numero: request.phone },
        update: {},
      })
      const client = await transaction.cliente.findFirst({
        where: { id_cliente: customerId, activo: true },
        select: { id_cliente: true },
      })
      if (!client) throw new Error('No se encontró el cliente activo para la solicitud de teléfono')

      const clientMessageOrigin = await requiredCatalogId(
        transaction.origen_mensaje.findUnique({ where: { nombre: 'cliente' }, select: { id_origen_mensaje: true } }),
        'origen de mensaje cliente',
      )
      const pendingRequestStatus = await requiredCatalogId(
        transaction.estado_solicitud.findUnique({
          where: { nombre: 'pendiente' },
          select: { id_estado_solicitud: true },
        }),
        'estado de solicitud pendiente',
      )
      const phoneChangeAction = await requiredCatalogId(
        transaction.tipo_accion.findUnique({ where: { nombre: 'cambio de teléfono' }, select: { id_tipo_accion: true } }),
        'tipo de acción cambio de teléfono',
      )
      const consultationType = await requiredCatalogId(
        transaction.tipo_consulta.findUnique({
          where: { nombre: 'cambio de teléfono' },
          select: { id_tipo_consulta: true },
        }),
        'tipo de consulta cambio de teléfono',
      )
      const detail = `Número de WhatsApp solicitado para vincular: ${request.phone}. El vínculo no se aplicará hasta la aprobación de un operador.`
      const existingRequest = await transaction.solicitud_accion.findFirst({
        where: {
          id_tipo_accion: phoneChangeAction,
          detalle: detail,
          estado_solicitud: { is: { nombre: 'pendiente' } },
          caso: {
            is: {
              fecha_cierre: null,
              conversacion: { is: { id_cliente: client.id_cliente, telefono: { is: { numero: request.phone } } } },
            },
          },
        },
        select: { id_solicitud: true },
      })
      if (existingRequest) return

      const conversation = await transaction.conversacion.create({
        data: {
          id_telefono: phone.id_telefono,
          id_cliente: client.id_cliente,
          asistente_suspendido: true,
        },
      })
      const caseRecord = await transaction.caso.create({
        data: {
          id_conversacion: conversation.id_conversacion,
          id_tipo_consulta: consultationType,
          fecha_derivacion: new Date(),
          motivo_derivacion: 'Solicitud de cambio de teléfono pendiente de aprobación',
        },
      })
      await transaction.mensaje.create({
        data: {
          id_caso: caseRecord.id_caso,
          id_origen_mensaje: clientMessageOrigin,
          contenido: 'El cliente solicitó registrar como contacto el número desde el que inició esta conversación.',
        },
      })
      await transaction.solicitud_accion.create({
        data: {
          id_caso: caseRecord.id_caso,
          id_tipo_accion: phoneChangeAction,
          id_estado_solicitud: pendingRequestStatus,
          detalle: detail,
        },
      })
    })
  }
}

type CatalogId = { id_origen_mensaje: number } | { id_estado_prospecto: number } |
  { id_estado_solicitud: number } | { id_tipo_accion: number } | { id_tipo_consulta: number } | null

async function requiredCatalogId<T extends CatalogId>(lookup: Promise<T>, description: string): Promise<number> {
  const record = await lookup
  if (!record) throw new Error(`Falta el catálogo requerido: ${description}`)
  const id = Object.values(record)[0]
  if (typeof id !== 'number') throw new Error(`El catálogo requerido no tiene un identificador válido: ${description}`)
  return id
}

type CustomerRecord = {
  id_cliente: number
  dni: string | null
  nombre: string | null
  apellido: string | null
  poliza: Array<{
    numero_poliza: string
    fecha_vencimiento: Date
    ramo: { nombre: string }
    estado_poliza: { nombre: string }
  }>
}

function toCustomer(record: CustomerRecord): Customer {
  if (!record.dni || !record.nombre || !record.apellido) {
    throw new Error(`El cliente ${record.id_cliente} no tiene datos completos de persona`)
  }
  const policies: CustomerPolicy[] = record.poliza.map((policy) => {
    if (!isRamo(policy.ramo.nombre) || !isPolicyStatus(policy.estado_poliza.nombre)) {
      throw new Error(`La póliza ${policy.numero_poliza} contiene valores fuera de catálogo`)
    }
    return {
      number: policy.numero_poliza,
      ramo: policy.ramo.nombre,
      status: policy.estado_poliza.nombre,
      expirationDate: policy.fecha_vencimiento.toISOString().slice(0, 10),
    }
  })
  return {
    id: String(record.id_cliente),
    dni: record.dni,
    firstName: record.nombre,
    lastName: record.apellido,
    policies,
  }
}
