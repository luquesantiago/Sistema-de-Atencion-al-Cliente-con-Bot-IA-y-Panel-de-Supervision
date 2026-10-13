import type { Currency, Customer, CustomerPolicy } from './customer.js'
import { argentinaToday } from './templates.js'

// Saldo de las pólizas (design.md, decisión 2): la cuenta sale de las cuotas registradas,
// nunca de la prima mensual (RF-ATE-02).

export type InstallmentGroup = { count: number; cents: number }

export type PolicyBalance = {
  // Sin pagar y con vencimiento anterior a hoy en Argentina.
  overdue: InstallmentGroup
  // Sin pagar y con vencimiento hoy o después.
  upcoming: InstallmentGroup
}

export function policyBalance(policy: CustomerPolicy, now: Date): PolicyBalance {
  const today = argentinaToday(now)
  const balance: PolicyBalance = { overdue: { count: 0, cents: 0 }, upcoming: { count: 0, cents: 0 } }
  for (const installment of policy.installments) {
    if (installment.paid) continue
    const group = installment.dueDate < today ? balance.overdue : balance.upcoming
    group.count += 1
    group.cents += installment.amountCents
  }
  return balance
}

const currencySymbols: Record<Currency, string> = { ARS: '$', USD: 'US$' }

// Siempre el mismo formato, con punto de miles, coma decimal y un espacio común: el control
// de la redacción compara el importe tal cual. Intl.NumberFormat usa un espacio no separable.
export function formatAmount(cents: number, currency: Currency): string {
  const units = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimals = (cents % 100).toString().padStart(2, '0')
  return `${currencySymbols[currency]} ${units},${decimals}`
}

function overdueText(group: InstallmentGroup, currency: Currency): string {
  const installments = group.count === 1 ? '1 cuota vencida sin pagar' : `${group.count} cuotas vencidas sin pagar`
  return `${installments} por ${formatAmount(group.cents, currency)}`
}

function upcomingText(group: InstallmentGroup, currency: Currency): string {
  const installments = group.count === 1 ? '1 cuota por vencer' : `${group.count} cuotas por vencer`
  return `${installments} por ${formatAmount(group.cents, currency)}`
}

function balanceLine(policy: CustomerPolicy, now: Date): string {
  const { overdue, upcoming } = policyBalance(policy, now)
  const prefix = `- ${policy.number} (${policy.ramo}):`
  if (overdue.count > 0 && upcoming.count > 0) {
    return `${prefix} ${overdueText(overdue, policy.currency)} y ${upcomingText(upcoming, policy.currency)}.`
  }
  if (overdue.count > 0) return `${prefix} ${overdueText(overdue, policy.currency)} y ninguna cuota por vencer.`
  if (upcoming.count > 0) return `${prefix} ninguna cuota vencida sin pagar y ${upcomingText(upcoming, policy.currency)}.`
  return `${prefix} no tiene ninguna cuota pendiente de pago.`
}

// null si falta el dato: el cliente no tiene pólizas o alguna no tiene cuotas registradas.
// Entonces la consulta se deriva sin responderla (RF-ATE-02).
export function balanceTemplate(customer: Customer, now: Date): string | null {
  if (customer.policies.length === 0) return null
  if (customer.policies.some((policy) => policy.installments.length === 0)) return null
  const lines = customer.policies.map((policy) => balanceLine(policy, now))
  return [`${customer.firstName}, este es el detalle de las cuotas sin pagar de sus pólizas:`, ...lines].join('\n')
}
