import {
  argentinaDayRange,
  type DashboardHourlyVolume,
  type DashboardMetricsRepository,
  type DashboardOperationalSummary,
  type DashboardResponseDistribution,
  type DashboardResponsePeriod,
} from '../domain/dashboard-metrics.js'

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

type CaseRow = {
  fecha_apertura: Date
  fecha_cierre: Date | null
  fecha_derivacion: Date | null
  id_caso?: number
}

type CaseModel = {
  findMany(args: {
    where: {
      fecha_cierre?: null
      fecha_derivacion?: { not: null }
      id_usuario_asignado?: null
      fecha_toma?: null
      fecha_apertura?: { gte: Date; lt: Date }
      OR?: [
        { fecha_apertura: { gte: Date; lt: Date } },
        { fecha_cierre: { gte: Date; lt: Date } },
      ]
    }
    select: { fecha_apertura?: true; fecha_cierre?: true; fecha_derivacion?: true; id_caso?: true }
  }): Promise<CaseRow[]>
}

export type DashboardMetricsDataSource = {
  prospecto: CountModel
  solicitud_accion: CountModel
  alerta: RiskAlertModel
  caso: CaseModel
}

const HOURS_OF_DAY = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, '0')}hs`,
)

const argentinaHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  hourCycle: 'h23',
})

function hourlyVolume(dates: Date[]): DashboardHourlyVolume[] {
  const counts = new Map(HOURS_OF_DAY.map((hora) => [hora, 0]))
  for (const date of dates) {
    const hora = `${argentinaHour.format(date)}hs`
    const current = counts.get(hora)
    if (current !== undefined) counts.set(hora, current + 1)
  }
  return HOURS_OF_DAY.map((hora) => ({ hora, cantidad: counts.get(hora) ?? 0 }))
}

function argentinaDateParts(now: Date): { year: number; month: number; day: number } {
  const parts = argentinaHourDate.formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  return { year, month, day }
}

const argentinaHourDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function argentinaPeriodRange(now: Date, period: DashboardResponsePeriod): { start: Date; end: Date } {
  const { year, month, day } = argentinaDateParts(now)
  if (period === 'mensual') {
    const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00-03:00`)
    const nextMonth = month === 12
      ? new Date(`${year + 1}-01-01T00:00:00-03:00`)
      : new Date(`${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00-03:00`)
    return { start, end: nextMonth }
  }

  const start = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-03:00`)
  start.setUTCDate(start.getUTCDate() - 6)
  const end = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00-03:00`)
  end.setUTCDate(end.getUTCDate() + 1)
  return {
    start,
    end,
  }
}

export class PrismaDashboardMetricsRepository implements DashboardMetricsRepository {
  public constructor(private readonly dataSource: DashboardMetricsDataSource) {}

  public async countUnattendedHandoffs(): Promise<number> {
    const cases = await this.dataSource.caso.findMany({
      where: {
        fecha_cierre: null,
        fecha_derivacion: { not: null },
        id_usuario_asignado: null,
        fecha_toma: null,
      },
      select: { id_caso: true },
    })
    return cases.length
  }

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

  public async getOperationalSummary(now: Date): Promise<DashboardOperationalSummary> {
    const { start, end } = argentinaDayRange(now)
    const cases = await this.dataSource.caso.findMany({
      where: {
        OR: [
          { fecha_apertura: { gte: start, lt: end } },
          { fecha_cierre: { gte: start, lt: end } },
        ],
      },
      select: { fecha_apertura: true, fecha_cierre: true, fecha_derivacion: true },
    })

    const createdToday = cases.filter(
      (item) => item.fecha_apertura >= start && item.fecha_apertura < end,
    )
    const consultasHoy = createdToday.length
    const resueltosPorBot = createdToday.filter((item) => item.fecha_derivacion === null).length
    const casosCerrados = cases.filter(
      (item) => item.fecha_cierre !== null && item.fecha_cierre >= start && item.fecha_cierre < end,
    ).length
    const tasaAutomatizacion =
      consultasHoy === 0 ? 0 : Math.round((resueltosPorBot / consultasHoy) * 100)

    return {
      consultasHoy,
      casosCerrados,
      resueltosPorBot,
      tasaAutomatizacion,
      volumenPorHora: hourlyVolume(createdToday.map((item) => item.fecha_apertura)),
    }
  }

  public async getResponseDistribution(
    now: Date,
    period: DashboardResponsePeriod,
  ): Promise<DashboardResponseDistribution> {
    const { start, end } = argentinaPeriodRange(now, period)
    const cases = await this.dataSource.caso.findMany({
      where: { fecha_apertura: { gte: start, lt: end } },
      select: { fecha_apertura: true, fecha_derivacion: true },
    })

    const resueltasPorIA = cases.filter((item) => item.fecha_derivacion === null).length
    const derivadasOperador = cases.length - resueltasPorIA
    const porcentajeIA = cases.length === 0 ? 0 : Math.round((resueltasPorIA / cases.length) * 100)

    return {
      resueltasPorIA,
      derivadasOperador,
      porcentajes: {
        IA: porcentajeIA,
        operador: cases.length === 0 ? 0 : 100 - porcentajeIA,
      },
      total: cases.length,
    }
  }
}
