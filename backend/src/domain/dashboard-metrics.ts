export interface DashboardMetricsRepository {
  countPendingProcedures(): Promise<number>
}
