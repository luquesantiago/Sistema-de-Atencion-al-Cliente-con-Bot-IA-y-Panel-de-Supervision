// Intenciones que el modelo puede elegir: los valores del catálogo tipo_consulta
// (migraciones 20260928140100, 20260929204929 y 20261007235643), más tres que no son
// tipos de consulta.
export const intents = [
  'saldo',
  'vencimiento',
  'estado de póliza',
  'cobertura',
  'siniestro',
  'cotización',
  'baja',
  'modificación',
  'reclamo',
  'saludo',
  'cambio de teléfono',
  'información de la agencia',
  'no es de seguros',
  // Se entiende, pero el asistente no lo responde: se deriva.
  'otra consulta',
  // No se entiende ni con los mensajes anteriores: se repregunta.
  'no se entiende',
] as const

export type Intent = (typeof intents)[number]

export type AnswerTemplate = 'expirations' | 'statuses' | 'courtesy' | 'agency'

export type IntentAction =
  | { kind: 'answer'; template: AnswerTemplate }
  | { kind: 'approval' }
  | { kind: 'handoff' }
  | { kind: 'clarify' }
  // Contesta, con un texto fijo, que no tiene que ver con la agencia.
  | { kind: 'unrelated' }

export function isIntent(value: unknown): value is Intent {
  return typeof value === 'string' && intents.some((intent) => intent === value)
}

// La acción la decide el código, no el modelo: siniestro y cotización se derivan
// siempre (RF-ATE-04), y lo que no se puede responder con la cartera también.
export function actionForIntent(intent: Intent): IntentAction {
  switch (intent) {
    case 'vencimiento':
      return { kind: 'answer', template: 'expirations' }
    case 'estado de póliza':
      return { kind: 'answer', template: 'statuses' }
    case 'saludo':
      return { kind: 'answer', template: 'courtesy' }
    case 'información de la agencia':
      return { kind: 'answer', template: 'agency' }
    case 'baja':
    case 'modificación':
    case 'cambio de teléfono':
      return { kind: 'approval' }
    case 'no es de seguros':
      return { kind: 'unrelated' }
    case 'no se entiende':
      return { kind: 'clarify' }
    case 'siniestro':
    case 'cotización':
    case 'saldo':
    case 'cobertura':
    case 'reclamo':
    case 'otra consulta':
      return { kind: 'handoff' }
  }
}

// Repreguntas seguidas antes de derivar lo que no se entiende (decisión de Santiago del
// 07/10/2026): al tercer mensaje seguido que no se entiende, se deriva.
export const maxClarifications = 2

export type ClarificationStep = { kind: 'clarify'; notUnderstood: number } | { kind: 'handoff' }

// notUnderstood son las repreguntas seguidas que ya se mandaron.
export function clarificationStep(notUnderstood: number): ClarificationStep {
  if (notUnderstood < maxClarifications) return { kind: 'clarify', notUnderstood: notUnderstood + 1 }
  return { kind: 'handoff' }
}
