import { describe, expect, it, vi } from 'vitest'
import { PrismaDashboardMetricsRepository, type DashboardMetricsDataSource } from './prisma-dashboard-metrics-repository.js'

describe('PrismaDashboardMetricsRepository', () => {
  it('suma prospectos y solicitudes de acción pendientes', async () => {
    const prospecto = vi.fn(async () => 2)
    const solicitudAccion = vi.fn(async () => 3)
    const dataSource: DashboardMetricsDataSource = {
      prospecto: { count: prospecto },
      solicitud_accion: { count: solicitudAccion },
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
    }

    await expect(new PrismaDashboardMetricsRepository(dataSource).countPendingProcedures()).resolves.toBe(0)
  })
})
