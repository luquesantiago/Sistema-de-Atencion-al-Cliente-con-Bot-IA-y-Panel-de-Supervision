import type { DashboardGeneralSummary, DashboardMetricsRepository } from '../domain/dashboard-metrics.js'

type PendingStateFilter = {
  estado_prospecto?: { is: { nombre: 'pendiente' } }
  estado_solicitud?: { is: { nombre: 'pendiente' } }
}

type RiskAlertFilter = {
  fecha_atencion: null
  nivel_riesgo: {
    is: {
      nombre: {
        in: [
          'medio', 'Medio', 'MEDIO',
          'alto', 'Alto', 'ALTO',
          'critico', 'Critico', 'CRITICO',
          'crítico', 'Crítico', 'CRÍTICO',
        ]
      }
    }
  }
}

type CountModel = {
  count(args: { where: PendingStateFilter }): Promise<number>
}

type RiskAlertModel = {
  findMany(args: {
    where: RiskAlertFilter
    select: { id_alerta: true; nivel_riesgo: { select: { nombre: true } } }
  }): Promise<Array<{ id_alerta: number; nivel_riesgo: { nombre: string } }>>
}

type CaseModel = {
  count(args: { where: { fecha_cierre?: null | { not: null }; fecha_derivacion?: null } }): Promise<number>
}

export type DashboardMetricsDataSource = {
  prospecto: CountModel
  solicitud_accion: CountModel
  alerta: RiskAlertModel
  caso: CaseModel
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

  public async countOpenRiskAlerts(): Promise<number> {
    const alerts = await this.dataSource.alerta.findMany({
      where: {
        fecha_atencion: null,
        nivel_riesgo: {
          is: {
            nombre: {
              in: [
                'medio', 'Medio', 'MEDIO',
                'alto', 'Alto', 'ALTO',
                'critico', 'Critico', 'CRITICO',
                'crítico', 'Crítico', 'CRÍTICO',
              ],
            },
          },
        },
      },
      select: { id_alerta: true, nivel_riesgo: { select: { nombre: true } } },
    })
    return alerts.length
  }

  public async getGeneralSummary(): Promise<DashboardGeneralSummary> {
    const [totalAbiertos, totalCerrados, totalCasos, casosAutomatizados] = await Promise.all([
      this.dataSource.caso.count({ where: { fecha_cierre: null } }),
      this.dataSource.caso.count({ where: { fecha_cierre: { not: null } } }),
      this.dataSource.caso.count({ where: {} }),
      this.dataSource.caso.count({ where: { fecha_derivacion: null } }),
    ])

    return {
      totalAbiertos,
      totalCerrados,
      tasaAutomatizacionBot: totalCasos === 0 ? 0 : (casosAutomatizados / totalCasos) * 100,
    }
  }
}
