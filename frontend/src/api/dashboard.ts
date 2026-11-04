import { leer } from './respuesta'

export type DashboardHourlyVolume = {
  hora: string
  cantidad: number
}

export type DashboardResponsePeriod = 'semanal' | 'mensual'

export type DashboardResponseDistribution = {
  resueltasPorIA: number
  derivadasOperador: number
  porcentajes: {
    IA: number
    operador: number
  }
  total: number
}

export type DashboardMetrics = {
  casosDerivadosSinTomar: number
  tramitesPorAprobar: number
  alertasRiesgoAbiertas: number
  distribucionRespuestas: DashboardResponseDistribution
  consultasHoy: number
  casosCerrados: number
  resueltosPorBot: number
  tasaAutomatizacion: number
  volumenPorHora: DashboardHourlyVolume[]
}

export async function obtenerMetricasDashboard(
  periodo: DashboardResponsePeriod,
  signal?: AbortSignal,
): Promise<DashboardMetrics> {
  const respuesta = await fetch(`/api/dashboard/metrics?periodo=${periodo}`, { signal })
  return leer<DashboardMetrics>(respuesta)
}
