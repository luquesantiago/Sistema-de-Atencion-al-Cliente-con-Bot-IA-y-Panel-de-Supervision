export type ModuloPanel =
  | 'dashboard'
  | 'bandeja'
  | 'tramites'
  | 'clientes'

export interface Modulo {
  id: ModuloPanel
  nombre: string
  descripcion: string
}

export const MODULOS: readonly Modulo[] = [
  {
    id: 'dashboard',
    nombre: 'Dashboard',
    descripcion: 'Estado general de la atención y las alertas del día.',
  },
  {
    id: 'bandeja',
    nombre: 'Bandeja de Atención',
    descripcion:
      'Conversaciones derivadas, con prioridad, responsable y tiempo de espera.',
  },
  {
    id: 'tramites',
    nombre: 'Trámites por Aprobar',
    descripcion:
      'Bajas, modificaciones de contrato y altas de conductor pendientes de aprobación.',
  },
  {
    id: 'clientes',
    nombre: 'Base de Clientes',
    descripcion: 'Clientes, teléfonos, pólizas, coberturas y vencimientos.',
  },
]
