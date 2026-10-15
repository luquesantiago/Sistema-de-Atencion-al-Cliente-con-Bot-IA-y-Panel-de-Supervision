import { describe, expect, it } from 'vitest'
import { queryTypeRiskLevels } from '../domain/inbox.js'
import {
  inboxCountQuery,
  inboxOrderQuery,
  severityByQueryTypeSql,
  toEntries,
  toInboxEntry,
  toInboxMessage,
  toOrderedCase,
  type InboxCaseRecord,
} from './prisma-inbox-repository.js'

// Filas armadas en la prueba, sin base. Datos ficticios.
function record(overrides: Partial<InboxCaseRecord> = {}): InboxCaseRecord {
  return {
    id_caso: 12,
    id_conversacion: 4,
    fecha_derivacion: new Date('2026-10-15T13:00:00.000Z'),
    fecha_toma: null,
    motivo_derivacion: 'intención: reclamo',
    tipo_consulta: { nombre: 'reclamo' },
    usuario: null,
    prospecto: null,
    solicitud_accion: [],
    conversacion: {
      telefono: { numero: '5491100000001' },
      cliente: { id_cliente: 7, dni: '99000001', cuit: null, razon_social: null, nombre: 'Ana', apellido: 'Prueba' },
    },
    mensaje: [{ contenido: 'me cobraron de más', fecha_hora: new Date('2026-10-15T13:00:00.000Z'), origen_mensaje: { nombre: 'cliente' } }],
    ...overrides,
  }
}

const levels = [
  { nombre: 'crítico', orden: 1 },
  { nombre: 'alto', orden: 2 },
  { nombre: 'medio', orden: 3 },
  { nombre: 'bajo', orden: 4 },
]

describe('consultas de la bandeja', () => {
  it('el CASE tiene un WHEN por cada tipo con nivel y los nombres van como parámetros', () => {
    const query = severityByQueryTypeSql()
    const pairs = queryTypeRiskLevels()
    expect(query.sql.match(/WHEN \? THEN \?/g)).toHaveLength(pairs.length)
    expect(query.values).toEqual(pairs.flatMap(({ type, level }) => [type, level]))
    for (const { type } of pairs) expect(query.sql).not.toContain(type)
  })

  it('la consulta de orden pagina en la base, con el límite y el desplazamiento como parámetros', () => {
    const query = inboxOrderQuery({ limit: 25, offset: 50 })
    expect(query.sql).toContain('ORDER BY severityOrder IS NULL, severityOrder, c.fecha_toma IS NULL DESC')
    expect(query.sql).toMatch(/LIMIT \? OFFSET \?\s*$/)
    expect(query.values.slice(-2)).toEqual([25, 50])
  })

  it('solo cuenta alertas sin atender y casos sin cerrar', () => {
    const query = inboxOrderQuery({ limit: 25, offset: 0 })
    expect(query.sql).toContain('WHERE a.fecha_atencion IS NULL')
    expect(query.sql).toContain('WHERE c.fecha_cierre IS NULL')
    expect(inboxCountQuery().sql).toContain('WHERE c.fecha_cierre IS NULL')
  })

  it('el detalle restringe la consulta a un caso', () => {
    const query = inboxOrderQuery({ limit: 1, offset: 0 }, 12)
    expect(query.sql).toContain('AND c.id_caso = ?')
    expect(query.values).toContain(12)
  })

  it('lee los números que MySQL devuelve como BigInt o texto', () => {
    expect(toOrderedCase({ caseId: 12n, severityOrder: '2' })).toEqual({ caseId: 12, severityOrder: 2 })
    expect(toOrderedCase({ caseId: 12, severityOrder: null })).toEqual({ caseId: 12, severityOrder: null })
  })
})

describe('toInboxEntry', () => {
  it('una fila derivada con cliente, responsable y último mensaje se mapea completa', () => {
    const entry = toInboxEntry(record({
      fecha_toma: new Date('2026-10-15T13:10:00.000Z'),
      usuario: { nombre: 'Graciela', apellido: 'Castaño' },
    }), 'alto')
    expect(entry).toEqual({
      caseId: 12,
      conversationId: 4,
      severity: 'alto',
      customer: { id: 7, name: 'Ana Prueba', document: '99000001' },
      phone: '5491100000001',
      queryType: 'reclamo',
      handoffReason: 'intención: reclamo',
      handedOffAt: new Date('2026-10-15T13:00:00.000Z'),
      takenAt: new Date('2026-10-15T13:10:00.000Z'),
      assignee: { name: 'Graciela Castaño' },
      hasPendingProspect: false,
      pendingPhoneChangeAt: null,
      lastMessage: { text: 'me cobraron de más', origin: 'cliente', at: new Date('2026-10-15T13:00:00.000Z') },
    })
  })

  it('una empresa muestra la razón social y el CUIT', () => {
    const entry = toInboxEntry(record({
      conversacion: {
        telefono: { numero: '5491100000002' },
        cliente: { id_cliente: 8, dni: null, cuit: '30999000001', razon_social: 'Empresa Inventada SA', nombre: null, apellido: null },
      },
    }), 'alto')
    expect(entry.customer).toEqual({ id: 8, name: 'Empresa Inventada SA', document: '30999000001' })
  })

  it('una conversación sin cliente da customer null, aunque el teléfono esté vinculado', () => {
    const entry = toInboxEntry(record({ conversacion: { telefono: { numero: '5491100000001' }, cliente: null } }), 'bajo')
    expect(entry.customer).toBeNull()
    expect(entry.phone).toBe('5491100000001')
  })

  it('el prospecto pendiente, la solicitud pendiente y el último mensaje recortado', () => {
    const long = 'a'.repeat(200)
    const entry = toInboxEntry(record({
      prospecto: { estado_prospecto: { nombre: 'pendiente' } },
      solicitud_accion: [{ fecha_solicitud: new Date('2026-10-15T12:00:00.000Z') }],
      mensaje: [{ contenido: long, fecha_hora: new Date('2026-10-15T13:00:00.000Z'), origen_mensaje: { nombre: 'asistente' } }],
    }), null)
    expect(entry.hasPendingProspect).toBe(true)
    expect(entry.pendingPhoneChangeAt).toEqual(new Date('2026-10-15T12:00:00.000Z'))
    expect(entry.lastMessage?.text).toHaveLength(160)
    expect(entry.lastMessage?.text.endsWith('…')).toBe(true)
    expect(entry.severity).toBeNull()
  })

  it('un tipo de consulta o un origen fuera de catálogo lanza', () => {
    expect(() => toInboxEntry(record({ tipo_consulta: { nombre: 'inventado' } }), null)).toThrow()
    expect(() => toInboxMessage({ id_mensaje: 1, id_caso: 1, contenido: 'x', fecha_hora: new Date(), origen_mensaje: { nombre: 'bot' } })).toThrow()
  })
})

describe('toEntries', () => {
  it('respeta el orden de la consulta de orden y traduce la gravedad', () => {
    const entries = toEntries(
      [{ caseId: 2, severityOrder: 1 }, { caseId: 1, severityOrder: null }],
      [record({ id_caso: 1 }), record({ id_caso: 2 })],
      levels,
    )
    expect(entries.map((entry) => [entry.caseId, entry.severity])).toEqual([[2, 'crítico'], [1, null]])
  })

  it('omite un caso que se cerró entre las dos consultas', () => {
    expect(toEntries([{ caseId: 9, severityOrder: 2 }], [], levels)).toEqual([])
  })
})
