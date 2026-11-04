export type ModuloPanel =
  | 'dashboard'
  | 'bandeja'
  | 'tramites'
  | 'clientes'
  | 'configuracion'

/** Lo que se abre al llegar a la Bandeja: un caso puntual o los casos de un cliente. */
export type DestinoBandeja = {
  caseId?: number
  customerId?: number
  clienteNombre?: string
  vista?: 'todos' | 'derivados' | 'sin-tomar'
}

/** Lo que se abre al llegar a Base de Clientes: la ficha de un cliente. */
export type DestinoClientes = {
  customerId: number
}

/** Datos que acompañan a una navegación del panel. */
export type OpcionesNavegacion = { bandeja?: DestinoBandeja; clientes?: DestinoClientes }

export type Navegar = (destino: ModuloPanel, opciones?: OpcionesNavegacion) => void

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
      'Altas, cambios de teléfono y cambios de datos pendientes de revisión y decisión.',
  },
  {
    id: 'clientes',
    nombre: 'Base de Clientes',
    descripcion: 'Clientes, teléfonos, pólizas, coberturas y vencimientos.',
  },
  {
    id: 'configuracion',
    nombre: 'Configuración',
    descripcion:
      'Datos de la agencia que informa el asistente: contacto, grúa, medios de pago, horario, seguros y planes.',
  },
]

/** Módulos que solo ve el administrador. El backend también lo controla (403). */
export const MODULOS_ADMINISTRADOR: readonly ModuloPanel[] = ['dashboard', 'configuracion']
