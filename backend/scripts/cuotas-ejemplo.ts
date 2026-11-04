// Generación de las cuotas de ejemplo (docs/migracion.md, «Cuotas de ejemplo»). Son datos
// ficticios: la planilla no registra cuotas ni pagos. La usa cargar-cuotas-ejemplo.ts.
import { monthlyDueDates } from '../src/domain/installments.js'

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

// Una cuota por mes, con la regla del plan de cuotas del dominio (installments.ts). El importe
// es la prima mensual. Las últimas `unpaid` quedan sin pagar; las demás, pagas en su vencimiento.
export function exampleInstallments(policy: ExamplePolicy, unpaid: number): ExampleInstallment[] {
  const premium = policy.monthlyPremium
  if (premium === null) throw new Error(`La póliza ${policy.number} no tiene prima mensual`)
  const dueDates = monthlyDueDates(isoDate(policy.startDate), isoDate(policy.endDate))
    .map((dueDate) => new Date(`${dueDate}T00:00:00Z`))
  return dueDates.map((dueDate, index) => ({
    numero_cuota: index + 1,
    fecha_vencimiento: dueDate,
    importe: premium,
    fecha_pago: index < dueDates.length - unpaid ? dueDate : null,
  }))
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}
