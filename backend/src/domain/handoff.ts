import type { Intent } from './intent.js'

export type MissingData = 'policies' | 'installments' | 'agency-info'
export type ProviderFailureStep = 'customer-status' | 'intent' | 'rewrite'

// Motivo de una derivación del asistente (change bandeja-atencion-lectura, decisión 1). Es un
// tipo cerrado para que el nivel de riesgo no dependa de cómo está escrito el motivo; el texto
// que se guarda en caso.motivo_derivacion sale de describeHandoffReason.
export type HandoffReason =
  // La intención se deriva siempre: siniestro, cotización, cobertura, reclamo u otra consulta.
  | { kind: 'intent'; intent: Intent }
  // Baja o modificación: se avisa que queda en revisión (desvío provisional del Parcial 1).
  | { kind: 'approval'; intent: Intent }
  | { kind: 'new-customer' }
  | { kind: 'dni-unrecognized' }
  | { kind: 'dni-other-person' }
  // El cliente de la conversación ya no está en la cartera.
  | { kind: 'customer-missing' }
  | { kind: 'not-understood' }
  | { kind: 'missing-data'; data: MissingData }
  | { kind: 'provider-failure'; step: ProviderFailureStep }
  // El control de la redacción la rechazó: detail es el motivo del control.
  | { kind: 'rewrite-rejected'; detail: string }

const missingDataText: Record<MissingData, string> = {
  policies: 'cliente sin pólizas',
  installments: 'póliza sin cuotas registradas',
  'agency-info': 'datos de la agencia incompletos',
}

const providerFailureText: Record<ProviderFailureStep, string> = {
  'customer-status': 'falla del proveedor al identificar el tipo de cliente',
  intent: 'falla del proveedor al decidir',
  rewrite: 'falla de la redacción',
}

export function describeHandoffReason(reason: HandoffReason): string {
  switch (reason.kind) {
    case 'intent':
      return `intención: ${reason.intent}`
    case 'approval':
      return `pedido para aprobar: ${reason.intent}`
    case 'new-customer':
      return 'cliente nuevo'
    case 'dni-unrecognized':
      return 'DNI no reconocido'
    case 'dni-other-person':
      return 'DNI de otra persona'
    case 'customer-missing':
      return 'cliente identificado inexistente'
    case 'not-understood':
      return 'no se entendió la consulta'
    case 'missing-data':
      return missingDataText[reason.data]
    case 'provider-failure':
      return providerFailureText[reason.step]
    case 'rewrite-rejected':
      return `redacción rechazada: ${reason.detail}`
  }
}
