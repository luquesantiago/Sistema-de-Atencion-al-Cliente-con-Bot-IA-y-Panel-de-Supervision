import { leer } from './respuesta'

export type DashboardHourlyVolume = {
  hora: string
  cantidad: number
}

export type DashboardMetrics = {
  casosDerivadosSinTomar: number
  respuestasRetenidas: number
  tramitesPorAprobar: number
  alertasRiesgoAbiertas: number
  consultasHoy: number
  casosCerrados: number
  resueltosPorBot: number
  tasaAutomatizacion: number
  volumenPorHora: DashboardHourlyVolume[]
}

export async function obtenerMetricasDashboard(signal?: AbortSignal): Promise<DashboardMetrics> {
  const respuesta = await fetch('/api/dashboard/metrics', { signal })
  return leer<DashboardMetrics>(respuesta)
}
