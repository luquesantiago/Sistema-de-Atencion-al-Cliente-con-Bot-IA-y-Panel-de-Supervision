import { argentinaToday } from './templates.js'

export interface DashboardHourlyVolume {
  hora: string
  cantidad: number
}

export interface DashboardOperationalSummary {
  consultasHoy: number
  casosCerrados: number
  resueltosPorBot: number
  tasaAutomatizacion: number
  volumenPorHora: DashboardHourlyVolume[]
}

export interface DashboardMetricsRepository {
  countPendingProcedures(): Promise<number>
  countOpenRiskAlerts(): Promise<number>
  getOperationalSummary(now: Date): Promise<DashboardOperationalSummary>
}

// Argentina no aplica horario de verano: el día local empieza a las 00:00 -03:00.
// La base guarda UTC, así que el rango se expresa en UTC para filtrar por fecha_apertura y fecha_cierre.
export function argentinaDayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(`${argentinaToday(now)}T00:00:00-03:00`)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}
