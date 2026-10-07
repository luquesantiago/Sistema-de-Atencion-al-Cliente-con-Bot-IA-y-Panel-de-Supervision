import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import {
  RequestManagementError,
  type DecisionResult,
  type PageRequest,
  type PhoneChangeNotification,
  type PendingPhoneChange,
  type PendingProspect,
  type PhoneChangeDecisionInput,
  type PhoneChangeDecisionResult,
  type ProspectDecisionInput,
  type RequestManagementRepository,
} from '../domain/request-management.js'

export class PrismaRequestManagementRepository implements RequestManagementRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listPendingProspects(page: PageRequest): Promise<PendingProspect[]> {
    const prospects = await this.prisma.prospecto.findMany({
      where: {
        estado_prospecto: { is: { nombre: 'pendiente' } },
        caso: { is: { fecha_cierre: null } },
      },
      orderBy: [{ fecha_registro: 'asc' }, { id_prospecto: 'asc' }],
      skip: page.offset,
      take: page.limit,
      select: {
        id_prospecto: true,
        nombre_declarado: true,
        dni_declarado: true,
        fecha_registro: true,
        caso: {
          select: {
            id_caso: true,
            conversacion: { select: { telefono: { select: { numero: true } } } },
          },
        },
      },
    })
    return prospects.map((prospect) => ({
      id: prospect.id_prospecto,
      caseId: prospect.caso.id_caso,
      name: prospect.nombre_declarado,
      dni: prospect.dni_declarado,
      phone: prospect.caso.conversacion.telefono.numero,
      registeredAt: prospect.fecha_registro.toISOString(),
    }))
  }

  public async listPendingPhoneChanges(page: PageRequest): Promise<PendingPhoneChange[]> {
    const requests = await this.prisma.solicitud_accion.findMany({
      where: {
        tipo_accion: { is: { nombre: 'cambio de teléfono' } },
        estado_solicitud: { is: { nombre: 'pendiente' } },
        caso: {
          is: {
            fecha_cierre: null,
            conversacion: { is: { id_cliente: { not: null } } },
          },
        },
      },
      orderBy: [{ fecha_solicitud: 'asc' }, { id_solicitud: 'asc' }],
      skip: page.offset,
      take: page.limit,
      select: {
        id_solicitud: true,
        fecha_solicitud: true,
        detalle: true,
        caso: {
          select: {
            id_caso: true,
            conversacion: {
              select: {
                telefono: { select: { numero: true } },
                cliente: {
                  select: {
                    dni: true,
                    nombre: true,
                    apellido: true,
                    cliente_telefono: {
                      select: {
                        id_telefono: true,
                        telefono: { select: { numero: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    return requests.flatMap((request) => {
      const customer = request.caso.conversacion.cliente
      if (!customer?.dni || !customer.nombre || !customer.apellido) {
        throw new Error(`La solicitud ${request.id_solicitud} no tiene datos completos del cliente.`)
      }
      const requestedPhone = request.caso.conversacion.telefono.numero
      if (!request.detalle?.includes(requestedPhone)) {
        throw new Error(`La solicitud ${request.id_solicitud} no identifica el teléfono solicitado.`)
      }
      return [{
        id: request.id_solicitud,
        caseId: request.caso.id_caso,
        customerName: `${customer.nombre} ${customer.apellido}`,
        customerDni: customer.dni,
        requestedPhone,
        currentPhones: customer.cliente_telefono.map((link) => ({
          id: link.id_telefono,
          number: link.telefono.numero,
        })),
        requestedAt: request.fecha_solicitud.toISOString(),
      }]
    })
  }

  public async decideProspect(input: ProspectDecisionInput): Promise<DecisionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const prospect = await transaction.prospecto.findUnique({
        where: { id_prospecto: input.id },
        select: {
          id_prospecto: true,
          id_cliente: true,
          id_estado_prospecto: true,
          dni_declarado: true,
          observaciones: true,
          estado_prospecto: { select: { nombre: true } },
          caso: {
            select: {
              id_caso: true,
              fecha_cierre: true,
              id_usuario_asignado: true,
              fecha_toma: true,
              id_conversacion: true,
              conversacion: { select: { telefono: { select: { id_telefono: true } } } },
            },
          },
        },
      })
      if (!prospect) throw new RequestManagementError(404, 'NOT_FOUND', 'No se encontró el prospecto.')
      if (prospect.estado_prospecto.nombre !== 'pendiente' || prospect.caso.fecha_cierre) {
        throw new RequestManagementError(409, 'CONFLICT', 'El prospecto ya no está pendiente.')
      }
      const operatorId = await findOperatorId(transaction)
      const state = await transaction.estado_prospecto.findUnique({
        where: { nombre: input.decision === 'aprobar' ? 'confirmado' : 'descartado' },
        select: { id_estado_prospecto: true },
      })
      if (!state) throw new Error(`Falta el estado de prospecto requerido para ${input.decision}.`)
      const decidedAt = new Date()
      const claim = await transaction.prospecto.updateMany({
        where: {
          id_prospecto: prospect.id_prospecto,
          id_estado_prospecto: prospect.id_estado_prospecto,
        },
        data: {
          id_estado_prospecto: state.id_estado_prospecto,
          observaciones: [
            prospect.observaciones,
            `Decisión ${input.decision} por operador el ${decidedAt.toISOString()}. Fundamento: ${input.fundamento.trim()}`,
          ].filter(Boolean).join('\n'),
        },
      })
      if (claim.count !== 1) {
        throw new RequestManagementError(409, 'CONFLICT', 'El prospecto ya fue decidido por otro operador.')
      }

      let customerId: number | undefined
      if (input.decision === 'aprobar') {
        if (!prospect.dni_declarado) {
          throw new RequestManagementError(409, 'CONFLICT', 'El prospecto no tiene un DNI para confirmar el alta.')
        }
        const existingCustomer = await transaction.cliente.findFirst({
          where: { dni: prospect.dni_declarado },
          select: { id_cliente: true },
        })
        if (existingCustomer) {
          throw new RequestManagementError(409, 'CONFLICT', 'Ya existe un cliente con el DNI declarado.')
        }
        let customer: { id_cliente: number }
        try {
          customer = await transaction.cliente.create({
            data: {
              dni: prospect.dni_declarado,
              nombre: input.nombre.trim(),
              apellido: input.apellido.trim(),
            },
            select: { id_cliente: true },
          })
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new RequestManagementError(409, 'CONFLICT', 'Ya existe un cliente con el DNI declarado.')
          }
          throw error
        }
        customerId = customer.id_cliente
        const existingLink = await transaction.cliente_telefono.findFirst({
          where: { id_cliente: customerId, id_telefono: prospect.caso.conversacion.telefono.id_telefono },
          select: { id_cliente: true },
        })
        if (!existingLink) {
          await transaction.cliente_telefono.create({
            data: {
              id_cliente: customerId,
              id_telefono: prospect.caso.conversacion.telefono.id_telefono,
            },
          })
        }
      }

      if (customerId !== undefined) {
        await transaction.prospecto.update({
          where: { id_prospecto: prospect.id_prospecto },
          data: { id_cliente: customerId },
        })
      }
      await closeCase(transaction, prospect.caso, operatorId, decidedAt)
      await releaseSilence(transaction, prospect.caso.id_conversacion)
      return { id: prospect.id_prospecto, decision: input.decision, ...(customerId ? { clienteId: customerId } : {}) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  public async decidePhoneChange(input: PhoneChangeDecisionInput): Promise<PhoneChangeDecisionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const request = await transaction.solicitud_accion.findUnique({
        where: { id_solicitud: input.id },
        select: {
          id_solicitud: true,
          id_estado_solicitud: true,
          detalle: true,
          estado_solicitud: { select: { nombre: true } },
          tipo_accion: { select: { nombre: true } },
          caso: {
            select: {
              id_caso: true,
              fecha_cierre: true,
              id_usuario_asignado: true,
              fecha_toma: true,
              id_conversacion: true,
              conversacion: {
                select: {
                  id_cliente: true,
                  telefono: { select: { id_telefono: true, numero: true } },
                  cliente: {
                    select: {
                      cliente_telefono: {
                        select: {
                          id_telefono: true,
                          telefono: { select: { numero: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
      if (!request || request.tipo_accion.nombre !== 'cambio de teléfono') {
        throw new RequestManagementError(404, 'NOT_FOUND', 'No se encontró la solicitud de cambio de teléfono.')
      }
      if (request.estado_solicitud.nombre !== 'pendiente' || request.caso.fecha_cierre) {
        throw new RequestManagementError(409, 'CONFLICT', 'La solicitud ya no está pendiente.')
      }
      const customerId = request.caso.conversacion.id_cliente
      if (!customerId || !request.caso.conversacion.cliente) {
        throw new RequestManagementError(409, 'CONFLICT', 'La solicitud no tiene un cliente asociado.')
      }
      const phoneId = request.caso.conversacion.telefono.id_telefono
      const currentPhoneIds = new Set(request.caso.conversacion.cliente.cliente_telefono.map((link) => link.id_telefono))
      if (input.decision === 'aprobar') {
        if (input.telefonosADesvincular.includes(phoneId)) {
          throw new RequestManagementError(400, 'VALIDATION_ERROR', 'No se puede desvincular el número solicitado.')
        }
        if (input.telefonosADesvincular.some((id) => !currentPhoneIds.has(id))) {
          throw new RequestManagementError(409, 'CONFLICT', 'Uno o más teléfonos seleccionados ya no están vinculados a este cliente.')
        }
      }
      const operatorId = await findOperatorId(transaction)
      const state = await transaction.estado_solicitud.findUnique({
        where: { nombre: input.decision === 'aprobar' ? 'aprobada' : 'rechazada' },
        select: { id_estado_solicitud: true },
      })
      if (!state) throw new Error(`Falta el estado de solicitud requerido para ${input.decision}.`)
      const decidedAt = new Date()

      const requestedPhone = request.caso.conversacion.telefono.numero
      const removedPhones = request.caso.conversacion.cliente.cliente_telefono
        .filter((link) => input.telefonosADesvincular.includes(link.id_telefono))
        .map((link) => link.telefono.numero)
      const decisionDetail = input.decision === 'aprobar'
        ? `Decisión aprobada. Número vinculado: ${requestedPhone}. Números desvinculados de este cliente: ${removedPhones.length ? removedPhones.join(', ') : 'ninguno'}.`
        : 'Decisión rechazada. No se modificaron los vínculos telefónicos.'
      const claim = await transaction.solicitud_accion.updateMany({
        where: {
          id_solicitud: request.id_solicitud,
          id_estado_solicitud: request.id_estado_solicitud,
        },
        data: {
          id_estado_solicitud: state.id_estado_solicitud,
          id_usuario_decision: operatorId,
          fecha_decision: decidedAt,
          fundamento: input.fundamento.trim(),
          detalle: `${request.detalle ?? ''}\n${decisionDetail}`.trim(),
        },
      })
      if (claim.count !== 1) {
        throw new RequestManagementError(409, 'CONFLICT', 'La solicitud ya fue decidida por otro operador.')
      }

      if (input.decision === 'aprobar') {
        if (!currentPhoneIds.has(phoneId)) {
          await transaction.cliente_telefono.create({ data: { id_cliente: customerId, id_telefono: phoneId } })
        }
        if (input.telefonosADesvincular.length > 0) {
          await transaction.cliente_telefono.deleteMany({
            where: {
              id_cliente: customerId,
              id_telefono: { in: input.telefonosADesvincular },
            },
          })
        }
      }

      await closeCase(transaction, request.caso, operatorId, decidedAt)
      await releaseSilence(transaction, request.caso.id_conversacion)
      return {
        id: request.id_solicitud,
        decision: input.decision,
        phone: requestedPhone,
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  // El aviso de la decisión que salió por WhatsApp queda en el caso de la solicitud, como
  // mensaje del asistente. No lleva respuesta: no contesta un mensaje del cliente.
  public async recordPhoneChangeNotification(id: number, text: string, sentAt: Date): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const request = await transaction.solicitud_accion.findUnique({
        where: { id_solicitud: id },
        select: { id_caso: true },
      })
      if (!request) throw new RequestManagementError(404, 'NOT_FOUND', 'No se encontró la solicitud de cambio de teléfono.')
      const origin = await transaction.origen_mensaje.findUnique({
        where: { nombre: 'asistente' },
        select: { id_origen_mensaje: true },
      })
      if (!origin) throw new Error('Falta el origen de mensaje asistente.')
      await transaction.mensaje.create({
        data: { id_caso: request.id_caso, id_origen_mensaje: origin.id_origen_mensaje, contenido: text, fecha_hora: sentAt },
      })
    })
  }

  public async getPhoneChangeNotification(id: number): Promise<PhoneChangeNotification> {
    const request = await this.prisma.solicitud_accion.findUnique({
      where: { id_solicitud: id },
      select: {
        id_solicitud: true,
        estado_solicitud: { select: { nombre: true } },
        tipo_accion: { select: { nombre: true } },
        caso: { select: { conversacion: { select: { telefono: { select: { numero: true } } } } } },
      },
    })
    if (!request || request.tipo_accion.nombre !== 'cambio de teléfono') {
      throw new RequestManagementError(404, 'NOT_FOUND', 'No se encontró la solicitud de cambio de teléfono.')
    }
    if (request.estado_solicitud.nombre !== 'aprobada' && request.estado_solicitud.nombre !== 'rechazada') {
      throw new RequestManagementError(409, 'CONFLICT', 'La solicitud todavía no tiene una decisión para notificar.')
    }
    return {
      id: request.id_solicitud,
      phone: request.caso.conversacion.telefono.numero,
      decision: request.estado_solicitud.nombre === 'aprobada' ? 'aprobar' : 'rechazar',
    }
  }
}

async function findOperatorId(transaction: Prisma.TransactionClient): Promise<number> {
  const operator = await transaction.usuario.findFirst({
    where: { nombre_usuario: 'operador', activo: true, rol: { is: { nombre: 'operador' } } },
    select: { id_usuario: true },
  })
  if (!operator) throw new Error('No está configurado el usuario de prueba operador.')
  return operator.id_usuario
}

async function closeCase(
  transaction: Prisma.TransactionClient,
  caseRecord: { id_caso: number; fecha_toma: Date | null },
  operatorId: number,
  closedAt: Date,
): Promise<void> {
  await transaction.caso.update({
    where: { id_caso: caseRecord.id_caso },
    data: {
      id_usuario_asignado: operatorId,
      fecha_toma: caseRecord.fecha_toma ?? closedAt,
      fecha_cierre: closedAt,
    },
  })
}

// Contrato del cierre de casos (design.md, decisión 5): si la conversación sigue abierta y
// ya no le queda un caso derivado sin cerrar, el asistente vuelve a atenderla.
async function releaseSilence(transaction: Prisma.TransactionClient, conversationId: number): Promise<void> {
  const openHandoff = await transaction.caso.findFirst({
    where: { id_conversacion: conversationId, fecha_derivacion: { not: null }, fecha_cierre: null },
    select: { id_caso: true },
  })
  if (openHandoff) return
  await transaction.conversacion.updateMany({
    where: { id_conversacion: conversationId, fecha_fin: null },
    data: { asistente_suspendido: false },
  })
}
