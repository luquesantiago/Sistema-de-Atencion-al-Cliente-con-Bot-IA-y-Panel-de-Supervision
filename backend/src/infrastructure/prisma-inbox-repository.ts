import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { isQueryType, type MessageOrigin, type QueryType } from '../domain/conversation.js'
import {
  queryTypeRiskLevels,
  type InboxConversation,
  type InboxCustomer,
  type InboxEntry,
  type InboxMessage,
  type InboxPage,
  type InboxRepository,
} from '../domain/inbox.js'
import { isIntent } from '../domain/intent.js'
import type { PageRequest } from '../domain/request-management.js'
import { isRiskLevel, type RiskLevel } from '../domain/risk-level.js'

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
  usuario: { select: { nombre: true, apellido: true } },
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

export type InboxMessageRecord = {
  id_mensaje: number
  id_caso: number
  contenido: string
  fecha_hora: Date
  origen_mensaje: { nombre: string }
}

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
    const messages = await this.prisma.mensaje.findMany({
      where: { caso: { is: { id_conversacion: entry.conversationId } } },
      orderBy: [{ fecha_hora: 'asc' }, { id_mensaje: 'asc' }],
      select: { id_mensaje: true, id_caso: true, contenido: true, fecha_hora: true, origen_mensaje: { select: { nombre: true } } },
    })
    return { entry, messages: messages.map(toInboxMessage) }
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
    assignee: record.usuario ? { name: `${record.usuario.nombre} ${record.usuario.apellido}` } : null,
    hasPendingProspect: record.prospecto?.estado_prospecto.nombre === 'pendiente',
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
