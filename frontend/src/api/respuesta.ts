/** Evento que avisa que la sesión venció: `App` vuelve a la pantalla de inicio. */
export const EVENTO_SESION_VENCIDA = 'sesion-vencida'

/**
 * Lee la respuesta JSON de la API del panel. Si el backend responde un error,
 * lanza con su mensaje (`{ error: { message } }`) o con uno genérico. Un 401
 * fuera de las rutas de sesión significa que la sesión venció o se cerró.
 */
export async function leer<T>(respuesta: Response): Promise<T> {
  if (!respuesta.ok) {
    if (respuesta.status === 401 && !esRutaDeSesion(respuesta.url)) {
      window.dispatchEvent(new Event(EVENTO_SESION_VENCIDA))
    }
    let mensaje = `El servidor respondió ${respuesta.status}.`
    let codigo: string | null = null
    try {
      const cuerpo = (await respuesta.json()) as { error?: { message?: string; code?: string } }
      if (cuerpo.error?.message) mensaje = cuerpo.error.message
      if (cuerpo.error?.code) codigo = cuerpo.error.code
    } catch {
      // Sin cuerpo JSON: se usa el mensaje genérico.
    }
    throw new ErrorDeApi(respuesta.status, mensaje, codigo)
  }
  return (await respuesta.json()) as T
}

// El login y la consulta de la sesión responden 401 sin que haya una sesión que venza.
function esRutaDeSesion(url: string): boolean {
  if (!url) return false
  return new URL(url, window.location.origin).pathname.startsWith('/api/sesion')
}

/**
 * Error de la API con el código HTTP, para distinguir un 404 de una falla, y el
 * código del backend (por ejemplo `IMAGE_UNAVAILABLE`) cuando viene.
 */
export class ErrorDeApi extends Error {
  public readonly status: number
  public readonly codigo: string | null

  public constructor(status: number, mensaje: string, codigo: string | null = null) {
    super(mensaje)
    this.status = status
    this.codigo = codigo
  }
}
