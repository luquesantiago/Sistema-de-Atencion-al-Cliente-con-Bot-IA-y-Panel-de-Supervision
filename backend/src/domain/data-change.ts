import type { DataChangeExtraction } from './ai-client.js'

// Ruteo de un pedido de cambio de datos personales (change cambio-datos-cliente). Reglas
// puras: el modelo solo dice campo y valor, y acá se decide qué hace el flujo. El valor se
// normaliza acá para que el detalle de la solicitud sea de una sola línea y entre en
// cliente.nombre / cliente.apellido (VARCHAR(100)).

// Los campos que se pueden cambiar por este flujo: el teléfono no, que se rutea a la
// solicitud de cambio de teléfono (regla 9).
export type DataChangeTargetField = 'nombre' | 'apellido'

export const maxDataChangeValueLength = 100

export type DataChangeRoute =
  // No se sabe qué dato cambiar: se le pregunta (caso A).
  | { kind: 'ask-field' }
  // Se sabe el campo pero falta el valor nuevo: se le pide (caso A continuado).
  | { kind: 'ask-value'; field: DataChangeTargetField }
  // Es un teléfono: se usa la lógica existente del cambio de teléfono (regla 9), que le
  // pide que escriba desde el nuevo número. No se registra ninguna solicitud.
  | { kind: 'phone' }
  // Nombre o apellido con valor: se crea la solicitud en Trámites (caso C).
  | { kind: 'create'; field: DataChangeTargetField; value: string }

export function routeDataChange(extraction: DataChangeExtraction): DataChangeRoute {
  const { field } = extraction
  if (field === null) return { kind: 'ask-field' }
  if (field === 'telefono') return { kind: 'phone' }
  const value = normalizeDataChangeValue(extraction.value)
  if (value === null) return { kind: 'ask-value', field }
  return { kind: 'create', field, value }
}

// Valor nuevo en una sola línea y hasta el largo de la columna del cliente; null si no hay.
export function normalizeDataChangeValue(value: string | null): string | null {
  if (value === null) return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length === 0) return null
  return normalized.slice(0, maxDataChangeValueLength)
}

// El detalle de la solicitud, de una sola línea con un formato fijo que escribe solo este
// sistema: la lista de Trámites lo vuelve a leer para mostrar el campo y el valor.
export function dataChangeDetalle(field: DataChangeTargetField, value: string): string {
  return `Cambio de ${field} a ${value}`
}

const detallePattern = /^Cambio de (nombre|apellido) a (.+)$/

// El campo y el valor de un detalle escrito por dataChangeDetalle; null si el detalle no
// tiene ese formato (una solicitud corrupta no se puede decidir).
export function parseDataChangeDetalle(detalle: string | null): { field: DataChangeTargetField; value: string } | null {
  if (detalle === null) return null
  const match = detallePattern.exec(detalle.split('\n')[0] ?? '')
  if (!match) return null
  const [, field, value] = match
  if (field !== 'nombre' && field !== 'apellido') return null
  const normalized = normalizeDataChangeValue(value ?? '')
  if (normalized === null) return null
  return { field, value: normalized }
}
