import { describe, expect, it, vi } from 'vitest'
import { PrismaDashboardMetricsRepository, type DashboardMetricsDataSource } from './prisma-dashboard-metrics-repository.js'

function dataSourceWithCases(
  findMany: DashboardMetricsDataSource['caso']['findMany'],
): DashboardMetricsDataSource {
  return {
    prospecto: { count: async () => 0 },
    solicitud_accion: { count: async () => 0 },
    alerta: { findMany: async () => [] },
    caso: { findMany },
  }
}

describe('PrismaDashboardMetricsRepository', () => {
  it('cuenta casos derivados abiertos sin responsable ni toma', async () => {
    const findMany = vi.fn(async () => [
      { id_caso: 12, fecha_apertura: new Date(), fecha_cierre: null, fecha_derivacion: new Date() },
      { id_caso: 18, fecha_apertura: new Date(), fecha_cierre: null, fecha_derivacion: new Date() },
    ])
    const dataSource = dataSourceWithCases(findMany)

    await expect(new PrismaDashboardMetricsRepository(dataSource).countUnattendedHandoffs()).resolves.toBe(2)
    expect(findMany).toHaveBeenCalledWith({
      where: {
        fecha_cierre: null,
        fecha_derivacion: { not: null },
        id_usuario_asignado: null,
        fecha_toma: null,
      },
      select: { id_caso: true },
    })
  })

  it('suma prospectos y solicitudes de acción pendientes', async () => {
    const prospecto = vi.fn(async () => 2)
    const solicitudAccion = vi.fn(async () => 3)
    const dataSource: DashboardMetricsDataSource = {
      prospecto: { count: prospecto },
      solicitud_accion: { count: solicitudAccion },
      alerta: { findMany: vi.fn(async () => []) },
      caso: { findMany: async () => [] },
    }

    await expect(new PrismaDashboardMetricsRepository(dataSource).countPendingProcedures()).resolves.toBe(5)
    expect(prospecto).toHaveBeenCalledWith({
      where: { estado_prospecto: { is: { nombre: 'pendiente' } } },
    })
    expect(solicitudAccion).toHaveBeenCalledWith({
      where: { estado_solicitud: { is: { nombre: 'pendiente' } } },
    })
  })

  it('devuelve cero cuando no hay trámites pendientes', async () => {
    const dataSource = dataSourceWithCases(async () => [])

    await expect(new PrismaDashboardMetricsRepository(dataSource).countPendingProcedures()).resolves.toBe(0)
  })

  it('cuenta solo alertas abiertas de riesgo medio, alto o crítico', async () => {
    const alerta = vi.fn(async () => [
      { id_alerta: 1, nivel_riesgo: { nombre: 'crítico' } },
      { id_alerta: 2, nivel_riesgo: { nombre: 'alto' } },
      { id_alerta: 3, nivel_riesgo: { nombre: 'medio' } },
      { id_alerta: 4, nivel_riesgo: { nombre: 'CRÍTICO' } },
    ])
    const dataSource: DashboardMetricsDataSource = {
      prospecto: { count: async () => 0 },
      solicitud_accion: { count: async () => 0 },
      alerta: { findMany: alerta },
      caso: { findMany: async () => [] },
    }

    await expect(new PrismaDashboardMetricsRepository(dataSource).countOpenRiskAlerts()).resolves.toBe(4)
    expect(alerta).toHaveBeenCalledWith({
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
  })

  it('devuelve cero cuando no hay alertas de riesgo abiertas', async () => {
    const dataSource = dataSourceWithCases(async () => [])

    await expect(new PrismaDashboardMetricsRepository(dataSource).countOpenRiskAlerts()).resolves.toBe(0)
  })

  it('calcula el resumen operativo y el volumen horario del día argentino', async () => {
    const findMany = vi.fn(async () => [
      { fecha_apertura: new Date('2026-11-02T08:10:00-03:00'), fecha_cierre: null, fecha_derivacion: null },
      { fecha_apertura: new Date('2026-11-02T08:40:00-03:00'), fecha_cierre: new Date('2026-11-02T09:00:00-03:00'), fecha_derivacion: new Date('2026-11-02T08:41:00-03:00') },
      { fecha_apertura: new Date('2026-11-02T10:00:00-03:00'), fecha_cierre: new Date('2026-11-02T11:00:00-03:00'), fecha_derivacion: null },
      { fecha_apertura: new Date('2026-11-01T23:30:00-03:00'), fecha_cierre: new Date('2026-11-02T09:30:00-03:00'), fecha_derivacion: null },
      { fecha_apertura: new Date('2026-11-01T10:00:00-03:00'), fecha_cierre: null, fecha_derivacion: null },
    ])
    const dataSource = dataSourceWithCases(findMany)

    const summary = await new PrismaDashboardMetricsRepository(dataSource)
      .getOperationalSummary(new Date('2026-11-02T12:00:00-03:00'))

    expect(summary).toMatchObject({
      consultasHoy: 3,
      casosCerrados: 3,
      resueltosPorBot: 2,
      tasaAutomatizacion: 67,
    })
    expect(summary.volumenPorHora).toHaveLength(24)
    expect(summary.volumenPorHora.find((item) => item.hora === '08hs')).toEqual({ hora: '08hs', cantidad: 2 })
    expect(summary.volumenPorHora.find((item) => item.hora === '10hs')).toEqual({ hora: '10hs', cantidad: 1 })
    expect(summary.volumenPorHora.find((item) => item.hora === '09hs')).toEqual({ hora: '09hs', cantidad: 0 })
    expect(summary.volumenPorHora.find((item) => item.hora === '23hs')).toEqual({ hora: '23hs', cantidad: 0 })

    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            fecha_apertura: {
              gte: new Date('2026-11-02T00:00:00-03:00'),
              lt: new Date('2026-11-03T00:00:00-03:00'),
            },
          },
          {
            fecha_cierre: {
              gte: new Date('2026-11-02T00:00:00-03:00'),
              lt: new Date('2026-11-03T00:00:00-03:00'),
            },
          },
        ],
      },
      select: { fecha_apertura: true, fecha_cierre: true, fecha_derivacion: true },
    })
  })

  it('devuelve ceros y volumen horario en cero cuando no hay casos del día', async () => {
    const dataSource = dataSourceWithCases(async () => [])

    const summary = await new PrismaDashboardMetricsRepository(dataSource)
      .getOperationalSummary(new Date('2026-11-02T12:00:00-03:00'))

    expect(summary).toEqual({
      consultasHoy: 0,
      casosCerrados: 0,
      resueltosPorBot: 0,
      tasaAutomatizacion: 0,
      volumenPorHora: Array.from({ length: 24 }, (_, hour) => ({
        hora: `${String(hour).padStart(2, '0')}hs`,
        cantidad: 0,
      })),
    })
  })
})
