import { describe, expect, it } from 'vitest'
import { agencyInfoAnswer, type AgencyInfo, type OpeningHours } from './agency-info.js'

const weekdays = (opens: string, closes: string): OpeningHours[] =>
  [1, 2, 3, 4, 5].map((day) => ({ day, opens, closes }))

// Los catálogos de las migraciones, con la dirección y el teléfono de ejemplo.
const today: AgencyInfo = {
  ramos: ['auto', 'moto', 'vida', 'hogar', 'embarcaciones', 'comercio'],
  plans: ['terceros', 'todo riesgo', 'terceros incompletos', 'riesgos incompletos'],
  address: 'Ficticia 123',
  phone: '11 7816-8015',
  hours: weekdays('09:00', '18:00'),
}

describe('agencyInfoAnswer', () => {
  it('con los datos de hoy da el texto y los datos que la redacción tiene que conservar', () => {
    expect(agencyInfoAnswer(today)).toEqual({
      template:
        'Seguros Castaño ofrece seguros de auto, moto, vida, hogar, embarcaciones y comercio. ' +
        'Los planes disponibles son terceros, todo riesgo, terceros incompletos y riesgos incompletos. ' +
        'Nuestra oficina está en Ficticia 123 y nuestro teléfono es 11 7816-8015. ' +
        'Nuestro horario de atención es de lunes a viernes, de 9 a 18 h.',
      literals: [
        'auto', 'moto', 'vida', 'hogar', 'embarcaciones', 'comercio',
        'terceros', 'todo riesgo', 'terceros incompletos', 'riesgos incompletos',
        'Ficticia 123', '11 7816-8015', 'lunes a viernes', '9 a 18',
      ],
    })
  })

  it('un sábado con otro rango suma «y los sábados», aunque los días lleguen desordenados', () => {
    const answer = agencyInfoAnswer({ ...today, hours: [{ day: 6, opens: '09:00', closes: '13:00' }, ...weekdays('09:00', '18:00').reverse()] })
    expect(answer?.template).toContain('Nuestro horario de atención es de lunes a viernes, de 9 a 18 h y los sábados, de 9 a 13 h.')
    expect(answer?.literals.slice(-4)).toEqual(['lunes a viernes', '9 a 18', 'sábados', '9 a 13'])
  })

  it('una hora con minutos se muestra con los minutos', () => {
    expect(agencyInfoAnswer({ ...today, hours: weekdays('09:30', '18:00') })?.template).toContain('de lunes a viernes, de 9:30 a 18 h.')
  })

  it.each<[string, Partial<AgencyInfo>]>([
    ['sin ramos', { ramos: [] }],
    ['sin planes', { plans: [] }],
    ['sin horario', { hours: [] }],
    ['sin dirección', { address: null }],
    ['sin teléfono', { phone: null }],
  ])('%s da null y se deriva', (_case, missing) => {
    expect(agencyInfoAnswer({ ...today, ...missing })).toBeNull()
  })
})
