/**
 * Bandeja de Atención (RF-SUP-01, RF-SUP-02, RF-DER-02, RF-DER-03, RF-SUP-04).
 *
 * Es la única capa que habla con `/api/bandeja`: los componentes no hacen fetch
 * por su cuenta y reciben los datos ya tipados. Quién actúa lo decide el
 * backend; el panel nunca lo manda.
 *
 * Las fechas llegan en ISO UTC; la pantalla las pasa a hora argentina. Un caso
 * sin cliente identificado trae `customer: null` y se muestra con el teléfono.
 */
import { ErrorDeApi, leer } from './respuesta'

/** Los cuatro niveles del catálogo `nivel_riesgo`; null es «Sin nivel». */
export type Gravedad = 'crítico' | 'alto' | 'medio' | 'bajo'

/** Lo que el caso tiene pendiente de decidir. */
export type EtiquetaBandeja = 'alta-pendiente' | 'alta-rechazada' | 'pedido-pendiente' | 'cambio-telefono-pendiente'

export type OrigenMensaje = 'cliente' | 'asistente' | 'operador'

export type CasoBandeja = {
  caseId: number
  severity: Gravedad | null
  label: EtiquetaBandeja | null
  /** Nombre (o razón social) y DNI (o CUIT); los datos que faltan llegan null. */
  customer: { id: number; name: string | null; document: string | null } | null
  phone: string
  queryType: string | null
  handoffReason: string | null
  /** Derivado: el asistente está en silencio y el caso se contesta y se cierra desde acá. */
  handedOff: boolean
  /** Recortado a 160 caracteres: el completo está en el detalle. */
  lastMessage: { text: string; origin: OrigenMensaje; at: string } | null
  assignee: { name: string } | null
  /** El responsable es quien usa el panel. */
  assignedToMe: boolean
  takenAt: string | null
  /** Desde la derivación o, si no se derivó, desde la solicitud pendiente. */
  waitingSince: string | null
}

export type PaginaBandeja = {
  items: CasoBandeja[]
  total: number
  limit: number
  offset: number
}

export type MensajeBandeja = {
  id: number
  caseId: number
  origin: OrigenMensaje
  text: string
  at: string
  /** true si el mensaje es del caso elegido; los demás son de la misma conversación. */
  inCase: boolean
  /** El cliente mandó una imagen: se ve con `obtenerImagenMensaje`, no viene acá. */
  hasImage: boolean
  /** El empleado que escribió un mensaje de origen operador. */
  author: { name: string } | null
}

/** Alerta sin atender del caso: hay que revisarla para cerrarlo (RF-SUP-04). */
export type AlertaBandeja = { type: string; level: Gravedad }

export type DetalleCasoBandeja = {
  case: CasoBandeja
  alerts: AlertaBandeja[]
  messages: MensajeBandeja[]
}

export type ResultadoRespuesta =
  | { sent: true; saved: true; messageId: number }
  | { sent: true; saved: false; warning: string }

/** Una página de la bandeja, ya ordenada por el backend. `limit` va de 1 a 100. */
export async function listarBandeja(
  pagina: { limit: number; offset: number },
  signal?: AbortSignal,
): Promise<PaginaBandeja> {
  const parametros = new URLSearchParams({ limit: String(pagina.limit), offset: String(pagina.offset) })
  const respuesta = await fetch(`/api/bandeja?${parametros.toString()}`, { signal })
  return leer<PaginaBandeja>(respuesta)
}

/**
 * Un caso de la bandeja con toda su conversación. Si el caso ya no está en la
 * bandeja (por ejemplo, se cerró), lanza un `ErrorDeApi` con status 404.
 */
export async function obtenerCasoBandeja(idCaso: number, signal?: AbortSignal): Promise<DetalleCasoBandeja> {
  const respuesta = await fetch(`/api/bandeja/${encodeURIComponent(String(idCaso))}`, { signal })
  return leer<DetalleCasoBandeja>(respuesta)
}

function enviarJson(cuerpo: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
}

function rutaCaso(idCaso: number): string {
  return `/api/bandeja/${encodeURIComponent(String(idCaso))}`
}

/** Toma el caso: quien usa el panel pasa a ser el responsable. Devuelve el caso actualizado. */
export async function tomarCaso(idCaso: number): Promise<CasoBandeja> {
  return leer<CasoBandeja>(await fetch(`${rutaCaso(idCaso)}/toma`, { method: 'POST' }))
}

export type ResultadoLiberacion = { caseId: number; releasedAt: string }

/**
 * Deja el caso sin responsable. Un caso derivado sigue derivado: el asistente no
 * vuelve a atender la conversación hasta que se cierre (RF-DER-03).
 */
export async function liberarCaso(idCaso: number): Promise<ResultadoLiberacion> {
  return leer<ResultadoLiberacion>(await fetch(`${rutaCaso(idCaso)}/liberacion`, { method: 'POST' }))
}

/**
 * Le manda un mensaje al cliente por WhatsApp. Si el caso está sin tomar, lo
 * toma. `saved: false` avisa que salió pero no quedó registrado.
 */
export async function contestarCaso(idCaso: number, texto: string): Promise<ResultadoRespuesta> {
  return leer<ResultadoRespuesta>(await fetch(`${rutaCaso(idCaso)}/respuestas`, enviarJson({ texto })))
}

/**
 * Cierra el caso: el asistente vuelve a atender la conversación. El motivo es
 * obligatorio en los casos de alta; `alertasRevisadas`, si tiene alertas sin atender.
 */
export async function cerrarCaso(
  idCaso: number,
  datos: { motivo?: string; alertasRevisadas?: boolean },
): Promise<{ caseId: number; closedAt: string }> {
  return leer<{ caseId: number; closedAt: string }>(await fetch(`${rutaCaso(idCaso)}/cierre`, enviarJson(datos)))
}

/**
 * La imagen que mandó el cliente, traída de WhatsApp en el momento (no se
 * guarda). `null` si ya no está disponible; otros errores lanzan.
 */
export async function obtenerImagenMensaje(idCaso: number, idMensaje: number, signal?: AbortSignal): Promise<Blob | null> {
  const respuesta = await fetch(`${rutaCaso(idCaso)}/mensajes/${encodeURIComponent(String(idMensaje))}/imagen`, {
    signal,
    cache: 'no-store',
  })
  if (respuesta.ok) return respuesta.blob()
  try {
    await leer<never>(respuesta)
  } catch (error) {
    if (error instanceof ErrorDeApi && error.codigo === 'IMAGE_UNAVAILABLE') return null
    throw error
  }
  return null
}
