import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import {
  isQueryType,
  parseSettings,
  settingKeyList,
  type CaseRef,
  type ConversationChanges,
  type ConversationStore,
  type MessageOrigin,
  type OpenConversation,
  type QueryRef,
  type QueryType,
  type SavedConversation,
  type Settings,
} from '../domain/conversation.js'
import { isIntent } from '../domain/intent.js'

// Error sin datos del cliente: el manejador de errores de app.ts lo vuelca al log, y un
// error de Prisma puede traer los argumentos de la consulta (textos, DNI, teléfonos).
export class ConversationStoreError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ConversationStoreError'
  }
}

function storeError(operation: string, error: unknown): ConversationStoreError {
  if (error instanceof ConversationStoreError) return error
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? ` (${error.code})` : ''
  return new ConversationStoreError(`No se pudo ${operation} la conversación${code}`)
}

// El envío a WAHA va adentro de la transacción (design.md, decisión 3).
const transactionTimeoutMs = 20_000

const origins = ['cliente', 'asistente', 'operador'] as const satisfies readonly MessageOrigin[]

function isOrigin(value: string): value is MessageOrigin {
  return origins.some((origin) => origin === value)
}

export class PrismaConversationStore implements ConversationStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findOpen(phone: string): Promise<OpenConversation | null> {
    try {
      const conversation = await this.prisma.conversacion.findFirst({
        where: { telefono: { numero: phone }, fecha_fin: null },
        orderBy: [{ fecha_inicio: 'desc' }, { id_conversacion: 'desc' }],
        select: {
          id_conversacion: true,
          id_cliente: true,
          asistente_suspendido: true,
          fecha_inicio: true,
          caso: {
            orderBy: [{ fecha_apertura: 'asc' }, { id_caso: 'asc' }],
            select: {
              id_caso: true,
              fecha_derivacion: true,
              fecha_cierre: true,
              tipo_consulta: { select: { nombre: true } },
              alerta: { where: { fecha_atencion: null }, select: { id_alerta: true }, take: 1 },
              solicitud_accion: {
                where: { estado_solicitud: { is: { nombre: 'pendiente' } } },
                select: { id_solicitud: true },
                take: 1,
              },
              mensaje: {
                select: {
                  id_mensaje: true,
                  contenido: true,
                  fecha_hora: true,
                  origen_mensaje: { select: { nombre: true } },
                },
              },
            },
          },
        },
      })
      if (!conversation) return null
      return {
        id: conversation.id_conversacion,
        customerId: conversation.id_cliente,
        suspended: conversation.asistente_suspendido,
        startedAt: conversation.fecha_inicio,
        cases: conversation.caso.map((item) => ({
          id: item.id_caso,
          type: queryTypeOf(item.tipo_consulta?.nombre ?? null),
          handedOff: item.fecha_derivacion !== null,
          closedAt: item.fecha_cierre,
          hasPending: item.alerta.length > 0 || item.solicitud_accion.length > 0,
        })),
        messages: conversation.caso
          .flatMap((item) => item.mensaje.map((message) => {
            const origin = message.origen_mensaje.nombre
            if (!isOrigin(origin)) throw new ConversationStoreError('Origen de mensaje fuera de catálogo')
            return { id: message.id_mensaje, caseId: item.id_caso, origin, text: message.contenido, sentAt: message.fecha_hora }
          }))
          .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime() || a.id - b.id),
      }
    } catch (error) {
      throw storeError('leer', error)
    }
  }

  public async settings(): Promise<Settings> {
    let rows: Array<{ clave: string; valor: string }>
    try {
      rows = await this.prisma.parametro_configuracion.findMany({
        where: { clave: { in: [...settingKeyList] } },
        select: { clave: true, valor: true },
      })
    } catch (error) {
      throw storeError('leer los parámetros de', error)
    }
    return parseSettings(rows)
  }

  public async save(changes: ConversationChanges, send: () => Promise<void>): Promise<SavedConversation> {
    let sendError: unknown = null
    try {
      return await this.prisma.$transaction(async (tx) => {
        const saved = await write(tx, changes)
        try {
          await send()
        } catch (error) {
          sendError = error
          throw error
        }
        return saved
      }, { timeout: transactionTimeoutMs })
    } catch (error) {
      if (sendError !== null && error === sendError) throw error
      throw storeError('guardar', error)
    }
  }
}

function queryTypeOf(name: string | null): QueryType | null {
  if (name === null) return null
  if (!isIntent(name) || !isQueryType(name)) throw new ConversationStoreError('Tipo de consulta fuera de catálogo')
  return name
}

async function write(tx: Prisma.TransactionClient, changes: ConversationChanges): Promise<SavedConversation> {
  const { at, phone } = changes
  const catalogs = await catalogIds(tx)

  if (changes.closePrevious) {
    const { conversationId, endedAt, caseIds } = changes.closePrevious
    const closed = await tx.conversacion.updateMany({
      where: { id_conversacion: conversationId, fecha_fin: null, asistente_suspendido: false },
      data: { fecha_fin: endedAt },
    })
    if (closed.count !== 1) throw new ConversationStoreError('La conversación a cerrar cambió desde que se leyó')
    if (caseIds.length > 0) {
      await tx.caso.updateMany({
        where: { id_caso: { in: caseIds }, id_conversacion: conversationId, fecha_cierre: null, fecha_derivacion: null },
        data: { fecha_cierre: endedAt },
      })
    }
  }

  let conversationId: number
  if ('existing' in changes.conversation) {
    const { existing, suspended } = changes.conversation
    // Se vuelve a leer adentro de la transacción: la decisión de un trámite puede haber
    // cambiado la marca mientras se decidía qué contestar.
    const current = await tx.conversacion.findUnique({
      where: { id_conversacion: existing },
      select: { fecha_fin: true, asistente_suspendido: true, telefono: { select: { numero: true } } },
    })
    if (!current || current.fecha_fin !== null || current.asistente_suspendido !== suspended || current.telefono.numero !== phone) {
      throw new ConversationStoreError('La conversación cambió desde que se leyó')
    }
    conversationId = existing
  } else {
    const phoneRow = await tx.telefono.upsert({
      where: { numero: phone },
      create: { numero: phone },
      update: {},
      select: { id_telefono: true },
    })
    const alreadyOpen = await tx.conversacion.findFirst({
      where: { id_telefono: phoneRow.id_telefono, fecha_fin: null },
      select: { id_conversacion: true },
    })
    if (alreadyOpen) throw new ConversationStoreError('El número ya tiene una conversación abierta')
    const created = await tx.conversacion.create({
      data: { id_telefono: phoneRow.id_telefono, fecha_inicio: at },
      select: { id_conversacion: true },
    })
    conversationId = created.id_conversacion
  }
  if (changes.customerId !== undefined) {
    await tx.conversacion.update({ where: { id_conversacion: conversationId }, data: { id_cliente: changes.customerId } })
  }

  const createdCases: number[] = []
  for (const item of changes.newCases) {
    const created = await tx.caso.create({
      data: {
        id_conversacion: conversationId,
        id_tipo_consulta: item.type === null ? null : catalogs.queryType(item.type),
        fecha_apertura: at,
      },
      select: { id_caso: true },
    })
    createdCases.push(created.id_caso)
  }
  const existingCases = new Set((await tx.caso.findMany({
    where: { id_conversacion: conversationId },
    select: { id_caso: true },
  })).map((item) => item.id_caso))
  const caseId = (ref: CaseRef): number => {
    const id = 'created' in ref ? createdCases[ref.created] : ref.existing
    if (id === undefined || !existingCases.has(id)) throw new ConversationStoreError('El caso no es de la conversación')
    return id
  }

  for (const { case: ref, type } of changes.caseTypes) {
    await tx.caso.updateMany({
      where: { id_caso: caseId(ref), id_tipo_consulta: null },
      data: { id_tipo_consulta: catalogs.queryType(type) },
    })
  }

  const incoming = await tx.mensaje.create({
    data: {
      id_caso: caseId(changes.incoming.case),
      id_origen_mensaje: catalogs.origin('cliente'),
      contenido: changes.incoming.text,
      fecha_hora: at,
    },
    select: { id_mensaje: true },
  })
  const queryId = (ref: QueryRef) => (ref === 'incoming' ? incoming.id_mensaje : ref.existing)

  if (changes.rejectedDraft) {
    await tx.respuesta.create({
      data: { id_mensaje_consulta: queryId(changes.rejectedDraft.answers), contenido: changes.rejectedDraft.text, fecha_hora: at },
    })
  }
  for (const reply of changes.replies) {
    const sent = await tx.mensaje.create({
      data: { id_caso: caseId(reply.case), id_origen_mensaje: catalogs.origin('asistente'), contenido: reply.text, fecha_hora: at },
      select: { id_mensaje: true },
    })
    await tx.respuesta.create({
      data: {
        id_mensaje_consulta: queryId(reply.answers),
        id_mensaje_enviado: sent.id_mensaje,
        contenido: reply.text,
        fecha_hora: at,
      },
    })
  }

  if (changes.handoff) {
    await tx.caso.update({
      where: { id_caso: caseId(changes.handoff.case) },
      data: { fecha_derivacion: at, motivo_derivacion: changes.handoff.reason.slice(0, 255) },
    })
    await tx.conversacion.update({ where: { id_conversacion: conversationId }, data: { asistente_suspendido: true } })
  }

  if (changes.prospect) {
    await tx.prospecto.create({
      data: {
        id_caso: caseId(changes.prospect.case),
        id_estado_prospecto: await catalogs.pendingProspect(),
        nombre_declarado: changes.prospect.name.slice(0, 200),
        dni_declarado: changes.prospect.dni,
        fecha_registro: at,
      },
    })
  }

  if (changes.phoneChangeRequest) {
    const { case: ref, customerId } = changes.phoneChangeRequest
    const phoneChange = await catalogs.phoneChangeAction()
    const pending = await catalogs.pendingRequest()
    const existing = await tx.solicitud_accion.findFirst({
      where: {
        id_tipo_accion: phoneChange,
        id_estado_solicitud: pending,
        caso: { is: { conversacion: { is: { id_cliente: customerId, telefono: { is: { numero: phone } } } } } },
      },
      select: { id_solicitud: true },
    })
    if (!existing) {
      await tx.solicitud_accion.create({
        data: {
          id_caso: caseId(ref),
          id_tipo_accion: phoneChange,
          id_estado_solicitud: pending,
          detalle: `Número de WhatsApp solicitado para vincular: ${phone}. El vínculo no se aplicará hasta la aprobación de un operador.`,
          fecha_solicitud: at,
        },
      })
    }
  }

  return { conversationId, incomingMessageId: incoming.id_mensaje }
}

// Los ids de los catálogos se buscan por nombre, como en el script de la planilla.
async function catalogIds(tx: Prisma.TransactionClient) {
  const [originRows, queryTypeRows] = await Promise.all([
    tx.origen_mensaje.findMany({ select: { id_origen_mensaje: true, nombre: true } }),
    tx.tipo_consulta.findMany({ select: { id_tipo_consulta: true, nombre: true } }),
  ])
  const required = (id: number | undefined, description: string): number => {
    if (id === undefined) throw new ConversationStoreError(`Falta el catálogo requerido: ${description}`)
    return id
  }
  return {
    origin: (name: MessageOrigin) =>
      required(originRows.find((row) => row.nombre === name)?.id_origen_mensaje, `origen de mensaje ${name}`),
    queryType: (name: QueryType) =>
      required(queryTypeRows.find((row) => row.nombre === name)?.id_tipo_consulta, `tipo de consulta ${name}`),
    pendingProspect: async () => required((await tx.estado_prospecto.findUnique({
      where: { nombre: 'pendiente' }, select: { id_estado_prospecto: true },
    }))?.id_estado_prospecto, 'estado de prospecto pendiente'),
    pendingRequest: async () => required((await tx.estado_solicitud.findUnique({
      where: { nombre: 'pendiente' }, select: { id_estado_solicitud: true },
    }))?.id_estado_solicitud, 'estado de solicitud pendiente'),
    phoneChangeAction: async () => required((await tx.tipo_accion.findUnique({
      where: { nombre: 'cambio de teléfono' }, select: { id_tipo_accion: true },
    }))?.id_tipo_accion, 'tipo de acción cambio de teléfono'),
  }
}
