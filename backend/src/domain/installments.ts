// Plan de cuotas de una póliza (RF-CAR-02): una cuota por mes de la vigencia, con la prima
// mensual como importe. Es un supuesto del equipo mientras la agencia no informe sus cuotas
// (AGENTS.md, «Decisiones abiertas»). Lo usan el alta de póliza del panel y los scripts de
// cuotas de ejemplo y de la demo, para que la regla sea una sola.

export type PlannedInstallment = {
  number: number
  // Fecha sin hora, aaaa-mm-dd.
  dueDate: string
  amountCents: number
  paid: boolean
}

// La primera vence el día de inicio y las siguientes el mismo día de cada mes (el último
// día si el mes es más corto), mientras venzan antes del vencimiento de la póliza.
export function monthlyDueDates(startDate: string, endDate: string): string[] {
  const dueDates: string[] = []
  for (let month = 0; ; month++) {
    const dueDate = addMonths(startDate, month)
    if (dueDate >= endDate) break
    dueDates.push(dueDate)
  }
  return dueDates
}

// Vencida: con vencimiento anterior a hoy en Argentina, igual que en el saldo (balance.ts).
export function overdueInstallments(dueDates: readonly string[], today: string): number {
  return dueDates.filter((dueDate) => dueDate < today).length
}

// Cuántas de las cuotas ya vencidas están pagas lo declara quien carga: el sistema no supone
// pagos ni deuda. null si la cantidad es válida; si no, el motivo del rechazo.
export function paidInstallmentsProblem(overdue: number, paid: number | undefined): string | null {
  if (paid === undefined) {
    return overdue === 0 ? null : `Indique cuántas de las ${overdue} cuotas ya vencidas están pagas.`
  }
  if (paid <= overdue) return null
  return overdue === 0
    ? 'La póliza no tiene cuotas vencidas: no puede tener cuotas pagas.'
    : `Las cuotas pagas no pueden ser más que las ${overdue} cuotas ya vencidas.`
}

// Las primeras `paid` cuotas quedan pagas y las demás sin pagar.
export function installmentPlan(
  policy: { startDate: string; endDate: string; premiumCents: number },
  paid: number,
): PlannedInstallment[] {
  return monthlyDueDates(policy.startDate, policy.endDate).map((dueDate, index) => ({
    number: index + 1,
    dueDate,
    amountCents: policy.premiumCents,
    paid: index < paid,
  }))
}

// Suma meses a una fecha aaaa-mm-dd; si el día no existe en el mes de destino, cae el último.
export function addMonths(isoDate: string, months: number): string {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number)
  const targetMonth = month - 1 + months
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10)
}
