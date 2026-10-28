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
}

export type ResultadoCambioTelefono = {
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

export async function reintentarNotificacion(id: number): Promise<ResultadoCambioTelefono> {
  return leer<ResultadoCambioTelefono>(
    await fetch(`/api/tramites/cambios-telefono/${encodeURIComponent(String(id))}/notificacion`, {
      method: 'POST',
    }),
  )
}
