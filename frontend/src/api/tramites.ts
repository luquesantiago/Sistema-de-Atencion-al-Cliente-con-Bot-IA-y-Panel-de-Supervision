import { leer } from './respuesta'

export type ProspectoPendiente = {
  id: number
  caseId: number
  name: string | null
  dni: string | null
  phone: string
  registeredAt: string
}

export type CambioTelefonoPendiente = {
  id: number
  caseId: number
  customerName: string
  customerDni: string
  requestedPhone: string
  currentPhones: Array<{ id: number; number: string }>
  requestedAt: string
}

/** Un cambio de nombre o apellido pedido por WhatsApp, esperando decisión en Trámites. */
export type CambioDatosPendiente = {
  id: number
  caseId: number
  customerName: string
  customerDni: string
  /** Número de WhatsApp de la conversación, a donde sale el aviso de la decisión. */
  phone: string
  /** El dato que se pide cambiar: nombre o apellido (el teléfono usa otra solicitud). */
  field: 'nombre' | 'apellido'
  /** Lo que vale hoy en la cartera, para comparar antes de decidir. */
  currentValue: string
  /** El valor nuevo que pidió el cliente. */
  value: string
  requestedAt: string
}

export type PaginaTramites<T> = {
  items: T[]
  limit: number
  offset: number
  total?: number
}

export type DecisionTramite = 'aprobar' | 'rechazar'

export type ResultadoProspecto = {
  id: number
  decision: DecisionTramite
  casoId: number
  clienteId?: number
  /** Solo al aprobar: si el aviso del alta salió por WhatsApp. */
  notificationSent?: boolean
  warning?: string
}

export type ResultadoAvisoAlta = {
  id: number
  decision: 'aprobar'
  notificationSent: boolean
  warning?: string
}

export type ResultadoCambioTelefono = {
  id: number
  decision: DecisionTramite
  notificationSent: boolean
  warning?: string
}

/** Mismo resultado que un cambio de teléfono: la decisión avisa al cliente por WhatsApp. */
export type ResultadoCambioDatos = {
  id: number
  decision: DecisionTramite
  notificationSent: boolean
  warning?: string
}

type DecisionProspecto =
  | { decision: 'aprobar'; fundamento: string; nombre: string; apellido: string }
  | { decision: 'rechazar'; fundamento: string }

type DecisionCambioTelefono = {
  decision: DecisionTramite
  fundamento: string
  telefonosADesvincular: number[]
}

/** El dato sale del detalle de la solicitud en el backend; la decisión solo aprueba o rechaza. */
type DecisionCambioDatos = {
  decision: DecisionTramite
  fundamento: string
}

function enviarJson(cuerpo: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  }
}

export async function listarProspectos(
  pagina: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<PaginaTramites<ProspectoPendiente>> {
  const parametros = new URLSearchParams({
    limit: String(pagina.limit),
    offset: String(pagina.offset),
  })
  const respuesta = await fetch(`/api/tramites/prospectos?${parametros.toString()}`, { signal })
  return leer<PaginaTramites<ProspectoPendiente>>(respuesta)
}

export async function listarCambiosTelefono(
  pagina: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<PaginaTramites<CambioTelefonoPendiente>> {
  const parametros = new URLSearchParams({
    limit: String(pagina.limit),
    offset: String(pagina.offset),
  })
  const respuesta = await fetch(`/api/tramites/cambios-telefono?${parametros.toString()}`, { signal })
  return leer<PaginaTramites<CambioTelefonoPendiente>>(respuesta)
}

export async function listarCambiosDatos(
  pagina: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<PaginaTramites<CambioDatosPendiente>> {
  const parametros = new URLSearchParams({
    limit: String(pagina.limit),
    offset: String(pagina.offset),
  })
  const respuesta = await fetch(`/api/tramites/cambios-datos?${parametros.toString()}`, { signal })
  return leer<PaginaTramites<CambioDatosPendiente>>(respuesta)
}

export async function decidirProspecto(id: number, datos: DecisionProspecto): Promise<ResultadoProspecto> {
  return leer<ResultadoProspecto>(
    await fetch(`/api/tramites/prospectos/${encodeURIComponent(String(id))}/decision`, enviarJson(datos)),
  )
}

export async function decidirCambioTelefono(
  id: number,
  datos: DecisionCambioTelefono,
): Promise<ResultadoCambioTelefono> {
  return leer<ResultadoCambioTelefono>(
    await fetch(`/api/tramites/cambios-telefono/${encodeURIComponent(String(id))}/decision`, enviarJson(datos)),
  )
}

export async function decidirCambioDatos(
  id: number,
  datos: DecisionCambioDatos,
): Promise<ResultadoCambioDatos> {
  return leer<ResultadoCambioDatos>(
    await fetch(`/api/tramites/cambios-datos/${encodeURIComponent(String(id))}/decision`, enviarJson(datos)),
export async function reintentarAvisoAlta(id: number): Promise<ResultadoAvisoAlta> {
  return leer<ResultadoAvisoAlta>(
    await fetch(`/api/tramites/prospectos/${encodeURIComponent(String(id))}/notificacion`, {
      method: 'POST',
    }),
  )
}

export async function reintentarNotificacion(id: number): Promise<ResultadoCambioTelefono> {
  return leer<ResultadoCambioTelefono>(
    await fetch(`/api/tramites/cambios-telefono/${encodeURIComponent(String(id))}/notificacion`, {
      method: 'POST',
    }),
  )
}

export async function reintentarNotificacionCambioDatos(id: number): Promise<ResultadoCambioDatos> {
  return leer<ResultadoCambioDatos>(
    await fetch(`/api/tramites/cambios-datos/${encodeURIComponent(String(id))}/notificacion`, {
      method: 'POST',
    }),
  )
}
