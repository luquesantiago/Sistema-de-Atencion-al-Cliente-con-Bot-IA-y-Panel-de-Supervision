import { describe, expect, it } from 'vitest'
import { findDni, maskDni, parseYesNo } from './dni.js'

describe('findDni', () => {
  it.each(['30111222', '30.111.222', '30 111 222', '30-111-222', 'mi DNI es 30.111.222, gracias'])('reconoce %s', (text) => {
    expect(findDni(text)).toBe('30111222')
  })

  it('reconoce un DNI de 7 dígitos', () => {
    expect(findDni('5.111.222')).toBe('5111222')
  })

  it.each(['¿vence el 15/11/2026?', 'POL-90001', '301112', '301112223', 'hola, ¿cuándo vence?'])('no toma %s como DNI', (text) => {
    expect(findDni(text)).toBeNull()
  })
})

describe('maskDni', () => {
  it.each(['30111222', '30.111.222', '30 111 222', '30-111-222'])('tapa %s', (dni) => {
    expect(maskDni(`mi DNI es ${dni}, ¿cuándo vence?`)).toBe('mi DNI es [DNI], ¿cuándo vence?')
  })

  it('no toca una póliza ni una fecha', () => {
    expect(maskDni('¿POL-90001 vence el 15/11/2026?')).toBe('¿POL-90001 vence el 15/11/2026?')
  })
})

describe('parseYesNo', () => {
  it.each(['sí', 'Si', 'soy nueva', '¡sí, soy nuevo!'])('%s es un sí', (text) => {
    expect(parseYesNo(text)).toBe('yes')
  })

  it.each(['no', 'no soy nuevo', '¿qué?', 'hola', 'sigo esperando'])('%s se toma como un no', (text) => {
    expect(parseYesNo(text)).toBe('no')
  })
})
