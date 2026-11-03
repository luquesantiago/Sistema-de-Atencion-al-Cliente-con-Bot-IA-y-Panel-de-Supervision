import { describe, expect, it } from 'vitest'
import { RequestManagementError } from './request-management.js'
import { parseAgencySettings, settingDescription, settingMark } from './agency-settings.js'

// Datos ficticios de prueba, no de la agencia.
const valid = {
  address: '  Calle   Ficticia 456 ',
  phone: '11 4000-0000',
  assistancePhone: '0800 555 0000',
  email: 'contacto@ejemplo.com',
  web: 'https://ejemplo.com',
  paymentMethods: ' Transferencia \n\n Alias: EJEMPLO.ALIAS ',
  hours: [
    { day: 6, opens: '09:00', closes: '13:00' },
    { day: 1, opens: '09:00', closes: '18:00' },
  ],
  activeRamoIds: [1, 2, 2],
  activePlanIds: [3],
}

function errorOf(body: unknown): string {
  try {
    parseAgencySettings(body)
  } catch (error) {
    if (error instanceof RequestManagementError && error.statusCode === 400) return error.message
    throw error
  }
  throw new Error('La validación no falló.')
}

describe('parseAgencySettings', () => {
  it('acepta datos válidos y los normaliza', () => {
    expect(parseAgencySettings(valid)).toEqual({
      address: 'Calle Ficticia 456',
      phone: '11 4000-0000',
      assistancePhone: '0800 555 0000',
      email: 'contacto@ejemplo.com',
      web: 'https://ejemplo.com',
      paymentMethods: 'Transferencia\nAlias: EJEMPLO.ALIAS',
      hours: [
        { day: 1, opens: '09:00', closes: '18:00' },
        { day: 6, opens: '09:00', closes: '13:00' },
      ],
      activeRamoIds: [1, 2],
      activePlanIds: [3],
    })
  })

  it('los datos opcionales vacíos o ausentes quedan sin cargar', () => {
    const { assistancePhone: _a, email: _e, ...sinOpcionales } = valid
    expect(parseAgencySettings({ ...sinOpcionales, web: '  ', paymentMethods: null })).toMatchObject({
      assistancePhone: null,
      email: null,
      web: null,
      paymentMethods: null,
    })
  })

  it.each<[string, Record<string, unknown>, RegExp]>([
    ['dirección vacía', { address: '   ' }, /dirección es obligatorio/],
    ['teléfono vacío', { phone: '' }, /teléfono es obligatorio/],
    ['teléfono con letras', { phone: '11 4000-ABCD' }, /solo puede tener números/],
    ['teléfono de grúa inválido', { assistancePhone: 'llamar a Juan' }, /grúa o asistencia solo puede tener números/],
    ['horario invertido', { hours: [{ day: 6, opens: '13:00', closes: '09:00' }] }, /sábado, el cierre tiene que ser posterior/],
    ['horario sin minutos', { hours: [{ day: 1, opens: '9', closes: '18:00' }] }, /lunes tiene que tener la apertura y el cierre en HH:MM/],
    ['día fuera de rango', { hours: [{ day: 8, opens: '09:00', closes: '18:00' }] }, /del 1 \(lunes\) al 7/],
    ['día repetido', { hours: [{ day: 1, opens: '09:00', closes: '12:00' }, { day: 1, opens: '14:00', closes: '18:00' }] }, /dos veces/],
    ['email inválido', { email: 'contacto@' }, /email no tiene un formato válido/],
    ['web sin http', { web: 'ejemplo.com' }, /web tiene que empezar con http/],
    ['más de 255 caracteres', { paymentMethods: 'x'.repeat(256) }, /medios de pago puede tener hasta 255/],
    ['sin ramos activos', { activeRamoIds: [] }, /al menos un ramo activo/],
    ['sin planes activos', { activePlanIds: [] }, /al menos un plan activo/],
    ['sin días con atención', { hours: [] }, /al menos un día con atención/],
    ['ids que no son números', { activePlanIds: ['1'] }, /planes activos tienen que ser una lista/],
    ['un campo de más', { usuario: 'admin' }, /campos no permitidos/],
  ])('rechaza %s', (_caso, cambio, mensaje) => {
    expect(errorOf({ ...valid, ...cambio })).toMatch(mensaje)
  })
})

describe('settingMark', () => {
  it('marca el dato de ejemplo, el sin cargar y el definitivo', () => {
    expect(settingMark('Ficticia 123', 'Dato de ejemplo, la agencia no lo informó: dirección')).toBe('example')
    expect(settingMark(null, 'Sin informar por la agencia: email')).toBe('missing')
    expect(settingMark(null, 'Email de Seguros Castaño que informa el asistente')).toBe('missing')
    expect(settingMark('Calle Ficticia 456', 'Dirección de Seguros Castaño que informa el asistente')).toBeNull()
  })
})

describe('settingDescription', () => {
  const example = { value: 'Ficticia 123', description: 'Dato de ejemplo, la agencia no lo informó: dirección' }

  it('un valor nuevo pasa a la descripción definitiva y deja de ser de ejemplo', () => {
    const description = settingDescription('address', example, 'Calle Ficticia 456')
    expect(settingMark('Calle Ficticia 456', description)).toBeNull()
  })

  it('el mismo valor conserva la marca de ejemplo', () => {
    expect(settingDescription('address', example, 'Ficticia 123')).toBe(example.description)
  })

  it('vaciar un dato opcional lo deja sin informar', () => {
    const description = settingDescription('email', { value: 'contacto@ejemplo.com', description: 'Email de…' }, null)
    expect(description).toMatch(/^Sin informar/)
  })
})
