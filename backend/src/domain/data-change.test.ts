import { describe, expect, it } from 'vitest'
import { dataChangeDetalle, maxDataChangeValueLength, normalizeDataChangeValue, parseDataChangeDetalle, routeDataChange } from './data-change.js'

describe('routeDataChange', () => {
  it('sin campo se pregunta qué dato quiere cambiar', () => {
    expect(routeDataChange({ field: null, value: null })).toEqual({ kind: 'ask-field' })
  })

  it('un teléfono se rutea a la solicitud de cambio de teléfono (regla 9)', () => {
    expect(routeDataChange({ field: 'telefono', value: '11 2222-3333' })).toEqual({ kind: 'phone' })
    // Aunque traiga el valor, el teléfono no se cambia por este flujo.
    expect(routeDataChange({ field: 'telefono', value: null })).toEqual({ kind: 'phone' })
  })

  it('campo sin valor pide el valor nuevo', () => {
    expect(routeDataChange({ field: 'nombre', value: null })).toEqual({ kind: 'ask-value', field: 'nombre' })
    expect(routeDataChange({ field: 'apellido', value: '   ' })).toEqual({ kind: 'ask-value', field: 'apellido' })
  })

  it('campo con valor arma la solicitud', () => {
    expect(routeDataChange({ field: 'nombre', value: 'Juan' })).toEqual({ kind: 'create', field: 'nombre', value: 'Juan' })
    expect(routeDataChange({ field: 'apellido', value: 'García' })).toEqual({ kind: 'create', field: 'apellido', value: 'García' })
  })
})

describe('normalizeDataChangeValue', () => {
  it('recorta y colapsa los espacios', () => {
    expect(normalizeDataChangeValue('  Juan   Pérez  ')).toBe('Juan Pérez')
  })

  it('vacío o sin valor queda null', () => {
    expect(normalizeDataChangeValue(null)).toBeNull()
    expect(normalizeDataChangeValue('   ')).toBeNull()
  })

  it('recorta al largo de la columna del cliente', () => {
    const long = 'a'.repeat(maxDataChangeValueLength + 50)
    expect(normalizeDataChangeValue(long)).toHaveLength(maxDataChangeValueLength)
  })
})

describe('dataChangeDetalle', () => {
  it('escribe una sola línea con un formato fijo', () => {
    expect(dataChangeDetalle('nombre', 'Juan')).toBe('Cambio de nombre a Juan')
    expect(dataChangeDetalle('apellido', 'García')).toBe('Cambio de apellido a García')
  })
})

describe('parseDataChangeDetalle', () => {
  it('lee lo que escribió dataChangeDetalle', () => {
    expect(parseDataChangeDetalle('Cambio de nombre a Juan')).toEqual({ field: 'nombre', value: 'Juan' })
    expect(parseDataChangeDetalle('Cambio de apellido a María José')).toEqual({ field: 'apellido', value: 'María José' })
  })

  it('ignora lo que sigue de la primera línea', () => {
    expect(parseDataChangeDetalle('Cambio de nombre a Juan\nDecisión aprobada.')).toEqual({ field: 'nombre', value: 'Juan' })
  })

  it('un detalle de otro trámite o corrupto queda null', () => {
    expect(parseDataChangeDetalle(null)).toBeNull()
    expect(parseDataChangeDetalle('')).toBeNull()
    expect(parseDataChangeDetalle('Número de WhatsApp solicitado para vincular: 549...')).toBeNull()
    expect(parseDataChangeDetalle('Cambio de telefono a 1122')).toBeNull()
    expect(parseDataChangeDetalle('Cambio de nombre a ')).toBeNull()
  })
})
