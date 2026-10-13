// Generación de las cuotas de ejemplo (docs/migracion.md, «Cuotas de ejemplo»). Son datos
// ficticios: la planilla no registra cuotas ni pagos. La usa cargar-cuotas-ejemplo.ts.

export interface ExamplePolicy {
  number: string
  // Columnas DATE: medianoche UTC del día, sin zona horaria.
  startDate: Date
  endDate: Date
  // Prima mensual como texto con dos decimales, o null si la póliza no tiene.
  monthlyPremium: string | null
}

export interface ExampleInstallment {
  numero_cuota: number
  fecha_vencimiento: Date
  importe: string
  fecha_pago: Date | null
}

// Una cuota por mes: la primera vence el día de inicio y las siguientes el mismo día de cada
// mes (el último día si el mes es más corto), mientras sea antes del vencimiento de la póliza.
// El importe es la prima mensual. Las últimas `unpaid` quedan sin pagar; las demás, pagas en
// su vencimiento.
export function exampleInstallments(policy: ExamplePolicy, unpaid: number): ExampleInstallment[] {
  const premium = policy.monthlyPremium
  if (premium === null) throw new Error(`La póliza ${policy.number} no tiene prima mensual`)
  const dueDates: Date[] = []
  for (let month = 0; ; month++) {
    const dueDate = addMonths(policy.startDate, month)
    if (dueDate >= policy.endDate) break
    dueDates.push(dueDate)
  }
  return dueDates.map((dueDate, index) => ({
    numero_cuota: index + 1,
    fecha_vencimiento: dueDate,
    importe: premium,
    fecha_pago: index < dueDates.length - unpaid ? dueDate : null,
  }))
}

function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)))
}
