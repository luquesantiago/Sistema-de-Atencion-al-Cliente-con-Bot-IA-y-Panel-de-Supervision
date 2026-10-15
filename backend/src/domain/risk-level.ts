import { isQueryType, type QueryType } from './conversation.js'
import type { HandoffReason } from './handoff.js'

// Valores del catálogo nivel_riesgo (migración 20260928140100), del más grave al menos grave:
// el mismo orden que su campo `orden`.
export const riskLevels = ['crítico', 'alto', 'medio', 'bajo'] as const

export type RiskLevel = (typeof riskLevels)[number]

// Lo que el proveedor de IA dice de un siniestro: grave si hay personas heridas, riesgo de
// vida o una emergencia en curso. Solo puede subir el nivel (change bandeja-atencion-lectura).
export type Urgency = 'grave' | 'normal'

export function isRiskLevel(value: unknown): value is RiskLevel {
  return riskLevels.some((level) => level === value)
}

// El más grave de los niveles; null si no hay ninguno.
export function mostSevere(levels: ReadonlyArray<RiskLevel | null>): RiskLevel | null {
  let found: RiskLevel | null = null
  for (const level of levels) {
    if (level !== null && (found === null || riskLevels.indexOf(level) < riskLevels.indexOf(found))) found = level
  }
  return found
}

// Nivel por tipo de consulta (decisión del equipo del 15/10/2026). Los tipos que el asistente
// responde no tienen nivel propio: si se derivan, el nivel sale del motivo.
export function queryTypeRiskLevel(type: QueryType | null): RiskLevel | null {
  switch (type) {
    case 'siniestro':
    case 'reclamo':
      return 'alto'
    case 'cotización':
    case 'cobertura':
    case 'baja':
    case 'modificación':
      return 'medio'
    case 'cambio de teléfono':
      return 'bajo'
    case 'saldo':
    case 'vencimiento':
    case 'estado de póliza':
    case 'saludo':
    case 'información de la agencia':
    case null:
      return null
  }
}

// Nivel por motivo de la derivación (decisión del equipo del 15/10/2026).
export function reasonRiskLevel(reason: HandoffReason): RiskLevel {
  switch (reason.kind) {
    case 'intent':
    case 'approval':
      return (isQueryType(reason.intent) ? queryTypeRiskLevel(reason.intent) : null) ?? 'bajo'
    case 'new-customer':
    case 'dni-unrecognized':
    case 'dni-other-person':
    case 'customer-missing':
    case 'rewrite-rejected':
      return 'medio'
    case 'not-understood':
    case 'missing-data':
    case 'provider-failure':
      return 'bajo'
  }
}

// El nivel que queda en el caso al derivar: el más grave entre el del motivo y el del tipo de
// la consulta. La urgencia solo cuenta en un siniestro y solo lo sube de alto a crítico: un
// siniestro nunca queda por debajo de alto, diga lo que diga el modelo.
export function handoffRiskLevel(input: {
  reason: HandoffReason
  caseType: QueryType | null
  urgency: Urgency | null
}): RiskLevel {
  const { reason, caseType, urgency } = input
  const isClaim = caseType === 'siniestro' || (reason.kind === 'intent' && reason.intent === 'siniestro')
  if (isClaim && urgency === 'grave') return 'crítico'
  return mostSevere([reasonRiskLevel(reason), queryTypeRiskLevel(caseType)]) ?? 'bajo'
}

