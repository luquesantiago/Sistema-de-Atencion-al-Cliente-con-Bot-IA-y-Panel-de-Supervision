/**
 * Bandeja de Atención (RF-SUP-01, RF-SUP-02, RF-DER-02).
 *
 * Es la única capa que habla con `GET /api/bandeja`: los componentes no hacen
 * fetch por su cuenta y reciben los datos ya tipados. Es de solo lectura.
 *
 * Las fechas llegan en ISO UTC; la pantalla las pasa a hora argentina. Un caso
 * sin cliente identificado trae `customer: null` y se muestra con el teléfono.
 */
import { leer } from './respuesta'

/** Los cuatro niveles del catálogo `nivel_riesgo`; null es «Sin nivel». */
export type Gravedad = 'crítico' | 'alto' | 'medio' | 'bajo'

/** Lo que el caso tiene pendiente de decidir. */
export type EtiquetaBandeja = 'alta-pendiente' | 'pedido-pendiente' | 'cambio-telefono-pendiente'

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
  /** Recortado a 160 caracteres: el completo está en el detalle. */
  lastMessage: { text: string; origin: OrigenMensaje; at: string } | null
  assignee: { name: string } | null
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
}

export type DetalleCasoBandeja = {
  case: CasoBandeja
  messages: MensajeBandeja[]
}

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
