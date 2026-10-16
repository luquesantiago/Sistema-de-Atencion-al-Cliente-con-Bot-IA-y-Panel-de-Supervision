import { describe, expect, it } from 'vitest'
import { describeHandoffReason, type HandoffReason } from './handoff.js'

describe('describeHandoffReason', () => {
  // Los textos son los que ya se guardaban en caso.motivo_derivacion: no pueden cambiar.
  it.each<[HandoffReason, string]>([
    [{ kind: 'intent', intent: 'reclamo' }, 'intención: reclamo'],
    [{ kind: 'intent', intent: 'otra consulta' }, 'intención: otra consulta'],
    [{ kind: 'approval', intent: 'baja' }, 'pedido para aprobar: baja'],
    [{ kind: 'new-customer' }, 'cliente nuevo'],
    [{ kind: 'dni-unrecognized' }, 'DNI no reconocido'],
    [{ kind: 'dni-other-person' }, 'DNI de otra persona'],
    [{ kind: 'customer-missing' }, 'cliente identificado inexistente'],
    [{ kind: 'not-understood' }, 'no se entendió la consulta'],
    [{ kind: 'missing-data', data: 'policies' }, 'cliente sin pólizas'],
    [{ kind: 'missing-data', data: 'installments' }, 'póliza sin cuotas registradas'],
    [{ kind: 'missing-data', data: 'agency-info' }, 'datos de la agencia incompletos'],
    [{ kind: 'provider-failure', step: 'customer-status' }, 'falla del proveedor al identificar el tipo de cliente'],
    [{ kind: 'provider-failure', step: 'intent' }, 'falla del proveedor al decidir'],
    [{ kind: 'provider-failure', step: 'rewrite' }, 'falla de la redacción'],
    [{ kind: 'rewrite-rejected', detail: 'cambió una fecha' }, 'redacción rechazada: cambió una fecha'],
  ])('%o se guarda como «%s»', (reason, text) => {
    expect(describeHandoffReason(reason)).toBe(text)
  })
})
