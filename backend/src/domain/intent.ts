// Intenciones que el modelo puede elegir: los valores del catálogo tipo_consulta
// (migraciones 20260928140100 y 20260929204929), más dos que no son tipos de consulta.
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
  'no es de seguros',
  'no sé',
] as const

export type Intent = (typeof intents)[number]

export type AnswerTemplate = 'expirations' | 'statuses' | 'courtesy'

export type IntentAction =
  | { kind: 'answer'; template: AnswerTemplate }
  | { kind: 'approval' }
  | { kind: 'handoff' }
  | { kind: 'ignore' }

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
    case 'baja':
    case 'modificación':
    case 'cambio de teléfono':
      return { kind: 'approval' }
    case 'no es de seguros':
      return { kind: 'ignore' }
    case 'siniestro':
    case 'cotización':
    case 'saldo':
    case 'cobertura':
    case 'reclamo':
    case 'no sé':
      return { kind: 'handoff' }
  }
}
