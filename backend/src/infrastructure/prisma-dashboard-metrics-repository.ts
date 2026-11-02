import type { DashboardMetricsRepository } from '../domain/dashboard-metrics.js'

type PendingStateFilter = {
  estado_prospecto?: { is: { nombre: 'pendiente' } }
  estado_solicitud?: { is: { nombre: 'pendiente' } }
}

type CountModel = {
  count(args: { where: PendingStateFilter }): Promise<number>
}

export type DashboardMetricsDataSource = {
  prospecto: CountModel
  solicitud_accion: CountModel
}

export class PrismaDashboardMetricsRepository implements DashboardMetricsRepository {
  public constructor(private readonly dataSource: DashboardMetricsDataSource) {}

  public async countPendingProcedures(): Promise<number> {
    const [pendingProspects, pendingActionRequests] = await Promise.all([
      this.dataSource.prospecto.count({
        where: { estado_prospecto: { is: { nombre: 'pendiente' } } },
      }),
      this.dataSource.solicitud_accion.count({
        where: { estado_solicitud: { is: { nombre: 'pendiente' } } },
      }),
    ])
    return pendingProspects + pendingActionRequests
  }
}
