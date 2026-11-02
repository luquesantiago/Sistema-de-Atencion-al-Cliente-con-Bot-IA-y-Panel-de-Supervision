import { describe, expect, it, vi } from 'vitest'
import { PrismaDashboardMetricsRepository, type DashboardMetricsDataSource } from './prisma-dashboard-metrics-repository.js'

describe('PrismaDashboardMetricsRepository', () => {
  it('suma prospectos y solicitudes de acción pendientes', async () => {
    const prospecto = vi.fn(async () => 2)
    const solicitudAccion = vi.fn(async () => 3)
    const dataSource: DashboardMetricsDataSource = {
      prospecto: { count: prospecto },
      solicitud_accion: { count: solicitudAccion },
      alerta: { findMany: vi.fn(async () => []) },
      caso: { count: async () => 0 },
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
    const dataSource: DashboardMetricsDataSource = {
      prospecto: { count: async () => 0 },
      solicitud_accion: { count: async () => 0 },
      alerta: { findMany: async () => [] },
      caso: { count: async () => 0 },
    }

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
      caso: { count: async () => 0 },
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
    const dataSource: DashboardMetricsDataSource = {
      prospecto: { count: async () => 0 },
      solicitud_accion: { count: async () => 0 },
      alerta: { findMany: async () => [] },
      caso: { count: async () => 0 },
    }

    await expect(new PrismaDashboardMetricsRepository(dataSource).countOpenRiskAlerts()).resolves.toBe(0)
  })

  it('calcula casos abiertos, cerrados y tasa de automatización', async () => {
    const caso = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.fecha_cierre === null) return 3
      if (where.fecha_cierre !== undefined) return 2
      if (where.fecha_derivacion === null) return 4
      return 5
    })
    const dataSource: DashboardMetricsDataSource = {
      prospecto: { count: async () => 0 },
      solicitud_accion: { count: async () => 0 },
      alerta: { findMany: async () => [] },
      caso: { count: caso },
    }

    await expect(new PrismaDashboardMetricsRepository(dataSource).getGeneralSummary()).resolves.toEqual({
      totalAbiertos: 3,
      totalCerrados: 2,
      tasaAutomatizacionBot: 80,
    })
    expect(caso).toHaveBeenCalledWith({ where: { fecha_cierre: null } })
    expect(caso).toHaveBeenCalledWith({ where: { fecha_cierre: { not: null } } })
    expect(caso).toHaveBeenCalledWith({ where: {} })
    expect(caso).toHaveBeenCalledWith({ where: { fecha_derivacion: null } })
  })

  it('devuelve tasa cero cuando no hay casos', async () => {
    const dataSource: DashboardMetricsDataSource = {
      prospecto: { count: async () => 0 },
      solicitud_accion: { count: async () => 0 },
      alerta: { findMany: async () => [] },
      caso: { count: async () => 0 },
    }

    await expect(new PrismaDashboardMetricsRepository(dataSource).getGeneralSummary()).resolves.toEqual({
      totalAbiertos: 0,
      totalCerrados: 0,
      tasaAutomatizacionBot: 0,
    })
  })
})
