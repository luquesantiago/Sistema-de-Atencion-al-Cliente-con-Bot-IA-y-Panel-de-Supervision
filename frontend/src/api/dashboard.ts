import { leer } from './respuesta'

export type DashboardMetrics = {
  casosDerivadosSinTomar: number
  respuestasRetenidas: number
  tramitesPorAprobar: number
  alertasRiesgoAbiertas: number
  resumenGeneral: {
    totalAbiertos: number
    totalCerrados: number
    tasaAutomatizacionBot: number
  }
}

export async function obtenerMetricasDashboard(signal?: AbortSignal): Promise<DashboardMetrics> {
  const respuesta = await fetch('/api/dashboard/metrics', { signal })
  return leer<DashboardMetrics>(respuesta)
}
