export interface DashboardGeneralSummary {
  totalAbiertos: number
  totalCerrados: number
  tasaAutomatizacionBot: number
}

export interface DashboardMetricsRepository {
  countPendingProcedures(): Promise<number>
  countOpenRiskAlerts(): Promise<number>
  getGeneralSummary(): Promise<DashboardGeneralSummary>
}
