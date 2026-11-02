export interface DashboardMetricsRepository {
  countPendingProcedures(): Promise<number>
  countOpenRiskAlerts(): Promise<number>
}
