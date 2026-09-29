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
      'Casos derivados: tomar el caso, ver la conversación completa, contestarle al cliente y cerrarlo, con prioridad, responsable y tiempo de espera.',
  },
  {
    id: 'tramites',
    nombre: 'Trámites por Aprobar',
    descripcion:
      'Cambios de teléfono, bajas, modificaciones de póliza y altas de conductor pendientes de aprobación.',
  },
  {
    id: 'clientes',
    nombre: 'Base de Clientes',
    descripcion: 'Clientes, teléfonos, pólizas, coberturas y vencimientos.',
  },
]
