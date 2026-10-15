import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { decideClose, type CloseInput, type PanelActor, type ProspectState } from '../domain/case-actions.js'
import { isQueryType, type MessageOrigin, type QueryType } from '../domain/conversation.js'
import {
  queryTypeRiskLevels,
  type CloseOutcome,
  type InboxActionState,
  type InboxAlert,
  type InboxConversation,
  type InboxCustomer,
  type InboxEntry,
  type InboxImageRef,
  type InboxMessage,
  type InboxPage,
  type InboxRepository,
} from '../domain/inbox.js'
import { isIntent } from '../domain/intent.js'
import type { PageRequest } from '../domain/request-management.js'
import { isRiskLevel, type RiskLevel } from '../domain/risk-level.js'
import { releaseSilence } from './prisma-case-closing.js'

// El último mensaje de la lista se recorta: el completo está en el detalle.
const lastMessageLength = 160

// Gravedad sin nivel en la consulta: mayor que cualquier `orden` del catálogo (TINYINT).
const noSeverity = 255

const entrySelect = {
  id_caso: true,
  id_conversacion: true,
  fecha_derivacion: true,
  fecha_toma: true,
  motivo_derivacion: true,
  tipo_consulta: { select: { nombre: true } },
  usuario: { select: { id_usuario: true, nombre: true, apellido: true } },
  prospecto: { select: { estado_prospecto: { select: { nombre: true } } } },
  solicitud_accion: {
    where: {
      estado_solicitud: { is: { nombre: 'pendiente' } },
      tipo_accion: { is: { nombre: 'cambio de teléfono' } },
    },
    orderBy: { fecha_solicitud: 'asc' },
    take: 1,
    select: { fecha_solicitud: true },
  },
  conversacion: {
    select: {
      telefono: { select: { numero: true } },
      cliente: { select: { id_cliente: true, dni: true, cuit: true, razon_social: true, nombre: true, apellido: true } },
    },
  },
  mensaje: {
    orderBy: [{ fecha_hora: 'desc' }, { id_mensaje: 'desc' }],
    take: 1,
    select: { contenido: true, fecha_hora: true, origen_mensaje: { select: { nombre: true } } },
  },
} satisfies Prisma.casoSelect

export type InboxCaseRecord = Prisma.casoGetPayload<{ select: typeof entrySelect }>

const messageSelect = {
  id_mensaje: true,
  id_caso: true,
  contenido: true,
  fecha_hora: true,
  id_imagen_whatsapp: true,
  origen_mensaje: { select: { nombre: true } },
  respuesta_enviada: { select: { usuario: { select: { nombre: true, apellido: true } } } },
} satisfies Prisma.mensajeSelect

export type InboxMessageRecord = Prisma.mensajeGetPayload<{ select: typeof messageSelect }>

const actionStateSelect = {
  id_caso: true,
  id_conversacion: true,
  fecha_derivacion: true,
  fecha_toma: true,
  id_usuario_asignado: true,
  prospecto: { select: { id_prospecto: true, observaciones: true, estado_prospecto: { select: { nombre: true } } } },
  alerta: { where: { fecha_atencion: null }, select: { id_alerta: true } },
  mensaje: { where: { origen_mensaje: { is: { nombre: 'cliente' } } }, take: 1, select: { id_mensaje: true } },
  conversacion: { select: { telefono: { select: { numero: true } } } },
} satisfies Prisma.casoSelect

export type InboxActionRecord = Prisma.casoGetPayload<{ select: typeof actionStateSelect }>

// Fila de la consulta de orden: el caso y el `orden` de su gravedad (null si no tiene).
export type InboxOrderRow = { caseId: unknown; severityOrder: unknown }

// Bandeja de Atención (change bandeja-atencion-lectura, decisión 4). La base filtra, ordena y
// pagina con SQL escrito a mano, porque Prisma no ordena por una expresión calculada; los
// datos de cada caso se leen después con Prisma.
export class PrismaInboxRepository implements InboxRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listPage(page: PageRequest): Promise<InboxPage> {
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<InboxOrderRow[]>(inboxOrderQuery(page)),
      this.prisma.$queryRaw<Array<{ total: unknown }>>(inboxCountQuery()),
    ])
    const ordered = rows.map(toOrderedCase)
    const entries = await this.entriesFor(ordered)
    return { entries, total: toCount(countRows[0]?.total) }
  }

  public async findConversation(caseId: number): Promise<InboxConversation | null> {
    const rows = await this.prisma.$queryRaw<InboxOrderRow[]>(inboxOrderQuery({ limit: 1, offset: 0 }, caseId))
    const [entry] = await this.entriesFor(rows.map(toOrderedCase))
    if (!entry) return null
    const [messages, alerts] = await Promise.all([
      this.prisma.mensaje.findMany({
        where: { caso: { is: { id_conversacion: entry.conversationId } } },
        orderBy: [{ fecha_hora: 'asc' }, { id_mensaje: 'asc' }],
        select: messageSelect,
      }),
      this.prisma.alerta.findMany({
        where: { id_caso: caseId, fecha_atencion: null },
        orderBy: [{ fecha_hora: 'asc' }, { id_alerta: 'asc' }],
        select: { tipo_alerta: { select: { nombre: true } }, nivel_riesgo: { select: { nombre: true } } },
      }),
    ])
    return { entry, messages: messages.map(toInboxMessage), alerts: alerts.map(toInboxAlert) }
  }

  public async findActionState(caseId: number): Promise<InboxActionState | null> {
    return readActionState(this.prisma, caseId)
  }

  // Actualización condicional (decisión 3): si otro pedido cambió el responsable o cerró el
  // caso desde que se leyó, no escribe nada.
  public async take(caseId: number, actor: PanelActor, expectedAssigneeId: number | null, at: Date): Promise<boolean> {
    const current = await this.prisma.caso.findUnique({ where: { id_caso: caseId }, select: { fecha_toma: true } })
    if (!current) return false
    const claim = await this.prisma.caso.updateMany({
      where: { id_caso: caseId, fecha_cierre: null, id_usuario_asignado: expectedAssigneeId },
      data: { id_usuario_asignado: actor.userId, fecha_toma: current.fecha_toma ?? at },
    })
    return claim.count === 1
  }

  public async close(caseId: number, actor: PanelActor, input: CloseInput, at: Date): Promise<CloseOutcome> {
    return this.prisma.$transaction(async (transaction): Promise<CloseOutcome> => {
      const state = await readActionState(transaction, caseId)
      if (!state) return { ok: false, error: 'not-in-inbox' }
      const plan = decideClose(state, actor, input)
      if (!plan.ok) return { ok: false, error: plan.error }

      const claim = await transaction.caso.updateMany({
        where: { id_caso: caseId, fecha_cierre: null, id_usuario_asignado: actor.userId },
        data: { fecha_cierre: at },
      })
      if (claim.count !== 1) return { ok: false, error: 'changed' }

      if (plan.noteOnProspect && plan.reason !== null) {
        const prospect = await transaction.prospecto.findUnique({
          where: { id_caso: caseId },
          select: { id_prospecto: true, id_estado_prospecto: true, observaciones: true },
        })
        if (!prospect) throw new Error('El caso de un alta no tiene prospecto')
        const user = await transaction.usuario.findUnique({ where: { id_usuario: actor.userId }, select: { nombre_usuario: true } })
        if (!user) throw new Error('No existe el usuario que cierra el caso')
        const discarded = plan.discardProspect
          ? await transaction.estado_prospecto.findUnique({ where: { nombre: 'descartado' }, select: { id_estado_prospecto: true } })
          : null
        if (plan.discardProspect && !discarded) throw new Error('Falta el estado de prospecto descartado')
        const updated = await transaction.prospecto.updateMany({
          where: { id_prospecto: prospect.id_prospecto, id_estado_prospecto: prospect.id_estado_prospecto },
          data: {
            ...(discarded ? { id_estado_prospecto: discarded.id_estado_prospecto } : {}),
            observaciones: appendNote(prospect.observaciones, closingNote(user.nombre_usuario, at, plan.reason)),
          },
        })
        // Se decidió el alta en Trámites mientras se cerraba: la transacción no escribe nada.
        if (updated.count !== 1) throw new InboxChangedError()
      }

      if (plan.attendAlerts) {
        await transaction.alerta.updateMany({
          where: { id_caso: caseId, fecha_atencion: null },
          data: { fecha_atencion: at, id_usuario_atencion: actor.userId },
        })
      }

      const caseRow = await transaction.caso.findUniqueOrThrow({ where: { id_caso: caseId }, select: { id_conversacion: true } })
      await releaseSilence(transaction, caseRow.id_conversacion)
      return { ok: true, closedAt: at }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown): CloseOutcome => {
      if (error instanceof InboxChangedError) return { ok: false, error: 'changed' }
      throw error
    })
  }

  // La respuesta del empleado: el mensaje que salió y la respuesta enlazada al último mensaje
  // del cliente del caso (decisión 5).
  public async recordOperatorReply(
    caseId: number,
    actor: PanelActor,
    text: string,
    sentAt: Date,
    takeIfUnassigned: boolean,
  ): Promise<{ messageId: number }> {
    return this.prisma.$transaction(async (transaction) => {
      const [origin, query, current] = await Promise.all([
        transaction.origen_mensaje.findUnique({ where: { nombre: 'operador' }, select: { id_origen_mensaje: true } }),
        transaction.mensaje.findFirst({
          where: { id_caso: caseId, origen_mensaje: { is: { nombre: 'cliente' } } },
          orderBy: [{ fecha_hora: 'desc' }, { id_mensaje: 'desc' }],
          select: { id_mensaje: true },
        }),
        transaction.caso.findUnique({ where: { id_caso: caseId }, select: { fecha_toma: true } }),
      ])
      if (!origin) throw new Error('Falta el origen de mensaje operador')
      if (!query || !current) throw new Error('El caso no tiene un mensaje del cliente para responder')

      const sent = await transaction.mensaje.create({
        data: { id_caso: caseId, id_origen_mensaje: origin.id_origen_mensaje, contenido: text, fecha_hora: sentAt },
        select: { id_mensaje: true },
      })
      await transaction.respuesta.create({
        data: {
          id_mensaje_consulta: query.id_mensaje,
          id_usuario: actor.userId,
          id_mensaje_enviado: sent.id_mensaje,
          contenido: text,
          fecha_hora: sentAt,
        },
      })
      if (takeIfUnassigned) {
        await transaction.caso.updateMany({
          where: { id_caso: caseId, fecha_cierre: null, id_usuario_asignado: null },
          data: { id_usuario_asignado: actor.userId, fecha_toma: current.fecha_toma ?? sentAt },
        })
      }
      return { messageId: sent.id_mensaje }
    })
  }

  public async findImage(caseId: number, messageId: number): Promise<InboxImageRef | null> {
    const rows = await this.prisma.$queryRaw<InboxOrderRow[]>(inboxOrderQuery({ limit: 1, offset: 0 }, caseId))
    if (rows.length === 0) return null
    const caseRow = await this.prisma.caso.findUnique({
      where: { id_caso: caseId },
      select: { id_conversacion: true, conversacion: { select: { telefono: { select: { numero: true } } } } },
    })
    if (!caseRow) return null
    const message = await this.prisma.mensaje.findFirst({
      where: {
        id_mensaje: messageId,
        id_imagen_whatsapp: { not: null },
        origen_mensaje: { is: { nombre: 'cliente' } },
        caso: { is: { id_conversacion: caseRow.id_conversacion } },
      },
      select: { id_imagen_whatsapp: true },
    })
    if (!message?.id_imagen_whatsapp) return null
    return { ref: message.id_imagen_whatsapp, phone: caseRow.conversacion.telefono.numero }
  }

  private async entriesFor(ordered: Array<{ caseId: number; severityOrder: number | null }>): Promise<InboxEntry[]> {
    if (ordered.length === 0) return []
    const [records, levels] = await Promise.all([
      this.prisma.caso.findMany({ where: { id_caso: { in: ordered.map((row) => row.caseId) } }, select: entrySelect }),
      this.prisma.nivel_riesgo.findMany({ select: { nombre: true, orden: true } }),
    ])
    return toEntries(ordered, records, levels)
  }
}

// Gravedad por tipo de consulta, armada desde el dominio: un WHEN por tipo con nivel, con los
// nombres como parámetros. Devuelve el nombre del nivel, o NULL.
export function severityByQueryTypeSql(): Prisma.Sql {
  const pairs = queryTypeRiskLevels()
  if (pairs.length === 0) return Prisma.sql`NULL`
  const whens = pairs.map(({ type, level }) => Prisma.sql`WHEN ${type} THEN ${level}`)
  return Prisma.sql`CASE tc.nombre ${Prisma.join(whens, ' ')} END`
}

// Fecha de la solicitud de cambio de teléfono pendiente de cada caso.
const pendingPhoneChangeJoin = Prisma.sql`
    LEFT JOIN (
      SELECT s.id_caso, MIN(s.fecha_solicitud) AS fecha_solicitud
      FROM solicitud_accion s
      JOIN estado_solicitud es ON es.id_estado_solicitud = s.id_estado_solicitud
      JOIN tipo_accion ta ON ta.id_tipo_accion = s.id_tipo_accion
      WHERE es.nombre = 'pendiente' AND ta.nombre = 'cambio de teléfono'
      GROUP BY s.id_caso
    ) sol ON sol.id_caso = c.id_caso`

// Casos sin cerrar derivados o con un prospecto o una solicitud de cambio de teléfono
// pendientes. caseId restringe a un caso, para el detalle.
function inboxWhere(caseId?: number): Prisma.Sql {
  const onlyCase = caseId === undefined ? Prisma.empty : Prisma.sql`AND c.id_caso = ${caseId}`
  return Prisma.sql`
    WHERE c.fecha_cierre IS NULL
      AND (
        c.fecha_derivacion IS NOT NULL
        OR sol.id_caso IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM prospecto p
          JOIN estado_prospecto ep ON ep.id_estado_prospecto = p.id_estado_prospecto
          WHERE p.id_caso = c.id_caso AND ep.nombre = 'pendiente'
        )
      )
      ${onlyCase}`
}

// Orden de la bandeja: gravedad (la más grave entre el nivel del caso, sus alertas sin
// atender y el nivel de su tipo; sin nivel al final), sin tomar primero, mayor espera e id.
export function inboxOrderQuery(page: PageRequest, caseId?: number): Prisma.Sql {
  return Prisma.sql`
    SELECT c.id_caso AS caseId,
      NULLIF(LEAST(
        COALESCE(nc.orden, ${noSeverity}),
        COALESCE(al.orden, ${noSeverity}),
        COALESCE(nt.orden, ${noSeverity})
      ), ${noSeverity}) AS severityOrder
    FROM caso c
    ${pendingPhoneChangeJoin}
    LEFT JOIN tipo_consulta tc ON tc.id_tipo_consulta = c.id_tipo_consulta
    LEFT JOIN nivel_riesgo nc ON nc.id_nivel_riesgo = c.id_nivel_riesgo
    LEFT JOIN nivel_riesgo nt ON nt.nombre = ${severityByQueryTypeSql()}
    LEFT JOIN (
      SELECT a.id_caso, MIN(n.orden) AS orden
      FROM alerta a
      JOIN nivel_riesgo n ON n.id_nivel_riesgo = a.id_nivel_riesgo
      WHERE a.fecha_atencion IS NULL
      GROUP BY a.id_caso
    ) al ON al.id_caso = c.id_caso
    ${inboxWhere(caseId)}
    ORDER BY severityOrder IS NULL, severityOrder, c.fecha_toma IS NULL DESC,
      COALESCE(c.fecha_derivacion, sol.fecha_solicitud), c.id_caso
    LIMIT ${page.limit} OFFSET ${page.offset}`
}

export function inboxCountQuery(): Prisma.Sql {
  return Prisma.sql`SELECT COUNT(*) AS total FROM caso c ${pendingPhoneChangeJoin} ${inboxWhere()}`
}

// MySQL devuelve los enteros calculados (COUNT, LEAST) como BigInt o texto según el tipo.
function toCount(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  throw new Error('La consulta de la bandeja devolvió un número inválido')
}

export function toOrderedCase(row: InboxOrderRow): { caseId: number; severityOrder: number | null } {
  return { caseId: toCount(row.caseId), severityOrder: row.severityOrder === null ? null : toCount(row.severityOrder) }
}

// Arma las entradas en el orden de la consulta de orden. Un caso que se cerró entre las dos
// consultas no está en records y se omite.
export function toEntries(
  ordered: ReadonlyArray<{ caseId: number; severityOrder: number | null }>,
  records: readonly InboxCaseRecord[],
  levels: ReadonlyArray<{ nombre: string; orden: number }>,
): InboxEntry[] {
  const byId = new Map(records.map((record) => [record.id_caso, record]))
  return ordered.flatMap(({ caseId, severityOrder }) => {
    const record = byId.get(caseId)
    return record ? [toInboxEntry(record, severityName(severityOrder, levels))] : []
  })
}

function severityName(order: number | null, levels: ReadonlyArray<{ nombre: string; orden: number }>): RiskLevel | null {
  if (order === null) return null
  const name = levels.find((level) => level.orden === order)?.nombre
  if (!isRiskLevel(name)) throw new Error('Falta un nivel del catálogo nivel_riesgo')
  return name
}

export function toInboxEntry(record: InboxCaseRecord, severity: RiskLevel | null): InboxEntry {
  const [lastMessage] = record.mensaje
  return {
    caseId: record.id_caso,
    conversationId: record.id_conversacion,
    severity,
    customer: toCustomer(record.conversacion.cliente),
    phone: record.conversacion.telefono.numero,
    queryType: toQueryType(record.tipo_consulta?.nombre ?? null),
    handoffReason: record.motivo_derivacion,
    handedOffAt: record.fecha_derivacion,
    takenAt: record.fecha_toma,
    assignee: record.usuario
      ? { id: record.usuario.id_usuario, name: `${record.usuario.nombre} ${record.usuario.apellido}` }
      : null,
    prospectState: toProspectState(record.prospecto?.estado_prospecto.nombre ?? null),
    pendingPhoneChangeAt: record.solicitud_accion[0]?.fecha_solicitud ?? null,
    lastMessage: lastMessage
      ? { text: shorten(lastMessage.contenido), origin: toOrigin(lastMessage.origen_mensaje.nombre), at: lastMessage.fecha_hora }
      : null,
  }
}

export function toInboxMessage(record: InboxMessageRecord): InboxMessage {
  return {
    id: record.id_mensaje,
    caseId: record.id_caso,
    origin: toOrigin(record.origen_mensaje.nombre),
    text: record.contenido,
    at: record.fecha_hora,
    // Solo la marca: la referencia a la imagen no sale del backend.
    hasImage: record.id_imagen_whatsapp !== null,
    author: record.respuesta_enviada?.usuario
      ? { name: `${record.respuesta_enviada.usuario.nombre} ${record.respuesta_enviada.usuario.apellido}` }
      : null,
  }
}

// El cliente de la conversación, si alguien se identificó: nunca se busca por el teléfono.
function toCustomer(record: InboxCaseRecord['conversacion']['cliente']): InboxCustomer | null {
  if (!record) return null
  const person = [record.nombre, record.apellido].filter((part): part is string => Boolean(part)).join(' ')
  return {
    id: record.id_cliente,
    name: record.razon_social ?? (person || null),
    document: record.dni ?? record.cuit,
  }
}

function toQueryType(name: string | null): QueryType | null {
  if (name === null) return null
  if (!isIntent(name) || !isQueryType(name)) throw new Error('Un caso tiene un tipo de consulta fuera de catálogo')
  return name
}

function toOrigin(name: string): MessageOrigin {
  if (name === 'cliente' || name === 'asistente' || name === 'operador') return name
  throw new Error('Un mensaje tiene un origen fuera de catálogo')
}

function shorten(text: string): string {
  return text.length <= lastMessageLength ? text : `${text.slice(0, lastMessageLength - 1)}…`
}

class InboxChangedError extends Error {}

type ActionClient = Pick<Prisma.TransactionClient, 'caso' | '$queryRaw'>

// Lee el estado del caso y si está en la bandeja, con el mismo filtro que la lista.
async function readActionState(client: ActionClient, caseId: number): Promise<InboxActionState | null> {
  const [record, rows] = await Promise.all([
    client.caso.findUnique({ where: { id_caso: caseId }, select: actionStateSelect }),
    client.$queryRaw<InboxOrderRow[]>(inboxOrderQuery({ limit: 1, offset: 0 }, caseId)),
  ])
  return record ? toActionState(record, rows.length > 0) : null
}

export function toActionState(record: InboxActionRecord, inInbox: boolean): InboxActionState {
  return {
    caseId: record.id_caso,
    inInbox,
    handedOff: record.fecha_derivacion !== null,
    assigneeId: record.id_usuario_asignado,
    prospectState: toProspectState(record.prospecto?.estado_prospecto.nombre ?? null),
    unattendedAlerts: record.alerta.length,
    hasCustomerMessage: record.mensaje.length > 0,
    phone: record.conversacion.telefono.numero,
    takenAt: record.fecha_toma,
  }
}

// La línea que el cierre deja en prospecto.observaciones, con el formato de las decisiones de Trámites.
export function closingNote(userName: string, at: Date, reason: string): string {
  return `Caso cerrado desde la bandeja por ${userName} el ${at.toISOString()}. Motivo: ${reason}`
}

function appendNote(previous: string | null, note: string): string {
  return [previous, note].filter(Boolean).join('\n')
}

// confirmado no aparece: un alta confirmada cierra el caso.
function toProspectState(name: string | null): ProspectState | null {
  return name === 'pendiente' || name === 'descartado' ? name : null
}

export function toInboxAlert(record: { tipo_alerta: { nombre: string }; nivel_riesgo: { nombre: string } }): InboxAlert {
  if (!isRiskLevel(record.nivel_riesgo.nombre)) throw new Error('Una alerta tiene un nivel fuera de catálogo')
  return { type: record.tipo_alerta.nombre, level: record.nivel_riesgo.nombre }
}
