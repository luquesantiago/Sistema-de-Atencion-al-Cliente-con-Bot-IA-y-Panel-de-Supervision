import { describe, expect, it } from 'vitest'
import { policyBalance } from '../src/domain/balance.js'
import type { CustomerPolicy } from '../src/domain/customer.js'
import { demoCustomers, type DemoPolicy } from './datos-demo.js'

const today = '2026-11-03'
const now = new Date('2026-11-03T15:00:00Z')
const phones = { customer: '5491100000101', shared: '5491100000102' }

function findPolicy(number: string): DemoPolicy {
  const found = demoCustomers(today, phones).flatMap((customer) => customer.policies).find((item) => item.number === number)
  if (!found) throw new Error(`falta ${number}`)
  return found
}

function balanceOf(number: string) {
  const demo = findPolicy(number)
  const policy: CustomerPolicy = {
    number: demo.number,
    ramo: demo.ramo,
    status: demo.status,
    expirationDate: demo.endDate,
    currency: demo.currency,
    installments: demo.installments,
  }
  return policyBalance(policy, now)
}

describe('demoCustomers', () => {
  it('POL-00001 tiene cuotas vencidas sin pagar y por vencer', () => {
    expect(balanceOf('POL-00001')).toEqual({ overdue: { count: 2, cents: 90_000_00 }, upcoming: { count: 8, cents: 360_000_00 } })
  })

  it('POL-00002 está al día: solo cuotas por vencer, en dólares', () => {
    expect(findPolicy('POL-00002').currency).toBe('USD')
    expect(balanceOf('POL-00002').overdue.count).toBe(0)
    expect(balanceOf('POL-00002').upcoming.count).toBe(9)
  })

  it('POL-00003 venció por fecha y tiene todo pago', () => {
    expect(findPolicy('POL-00003').endDate < today).toBe(true)
    expect(balanceOf('POL-00003')).toEqual({ overdue: { count: 0, cents: 0 }, upcoming: { count: 0, cents: 0 } })
  })

  it('POL-00005 no tiene prima ni cuotas: el saldo se deriva', () => {
    expect(findPolicy('POL-00005').premiumCents).toBeNull()
    expect(findPolicy('POL-00005').installments).toEqual([])
  })

  it('POL-00006 está suspendida por mora con 3 cuotas vencidas sin pagar', () => {
    expect(findPolicy('POL-00006').status).toBe('suspendida por mora')
    expect(balanceOf('POL-00006').overdue.count).toBe(3)
  })

  it('el número compartido queda en Martín y Sofía, y el del cliente solo en Lucía', () => {
    const customers = demoCustomers(today, phones)
    expect(customers.filter((item) => item.phones.includes(phones.shared)).map((item) => item.firstName)).toEqual(['Martín', 'Sofía'])
    expect(customers.filter((item) => item.phones.includes(phones.customer)).map((item) => item.firstName)).toEqual(['Lucía'])
  })

  it('Elena está dada de baja y Carlos no tiene teléfono ni pólizas', () => {
    const customers = demoCustomers(today, phones)
    expect(customers.find((item) => item.firstName === 'Elena')?.active).toBe(false)
    expect(customers.find((item) => item.firstName === 'Carlos')).toMatchObject({ phones: [], policies: [] })
  })

  it('las pólizas van de POL-00001 a POL-00006 y los DNI son de la serie 991000xx', () => {
    const customers = demoCustomers(today, phones)
    expect(customers.flatMap((item) => item.policies).map((item) => item.number).sort())
      .toEqual(['POL-00001', 'POL-00002', 'POL-00003', 'POL-00004', 'POL-00005', 'POL-00006'])
    expect(customers.every((item) => /^991000\d\d$/.test(item.dni) && item.lastName === 'Demo')).toBe(true)
  })

  it('rechaza un número con algo más que dígitos, sin mostrarlo completo', () => {
    expect(() => demoCustomers(today, { ...phones, customer: '+54 9 11 5555-0101' }))
      .toThrow('DEMO_TELEFONO_CLIENTE (terminado en …101) tiene que tener solo dígitos y hasta 15.')
  })

  it('rechaza un número de más de 15 dígitos', () => {
    expect(() => demoCustomers(today, { ...phones, shared: '5491100000102999' })).toThrow('DEMO_TELEFONO_COMPARTIDO')
  })

  it('rechaza dos números iguales', () => {
    expect(() => demoCustomers(today, { customer: phones.customer, shared: phones.customer }))
      .toThrow('tienen que ser números distintos')
  })
})
