/**
 * Lee la respuesta JSON de la API del panel. Si el backend responde un error,
 * lanza con su mensaje (`{ error: { message } }`) o con uno genérico.
 */
export async function leer<T>(respuesta: Response): Promise<T> {
  if (!respuesta.ok) {
    let mensaje = `El servidor respondió ${respuesta.status}.`
    try {
      const cuerpo = (await respuesta.json()) as { error?: { message?: string } }
      if (cuerpo.error?.message) mensaje = cuerpo.error.message
    } catch {
      // Sin cuerpo JSON: se usa el mensaje genérico.
    }
    throw new ErrorDeApi(respuesta.status, mensaje)
  }
  return (await respuesta.json()) as T
}

/** Error de la API con el código HTTP, para distinguir un 404 de una falla. */
export class ErrorDeApi extends Error {
  public readonly status: number

  public constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}
