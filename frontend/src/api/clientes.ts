/**
 * Cartera de clientes del panel (RF-CAR-01, RF-CAR-02, RF-CAR-03).
 *
 * Es la única capa que habla con `GET /api/clientes`: los componentes no hacen
 * fetch por su cuenta y reciben los datos ya tipados.
 *
 * Una persona tiene DNI y nombre; una empresa tiene CUIT y razón social. Los
 * campos ausentes llegan como `null` y no se inventan valores en su lugar.
 */

// La lista muestra número y estado; la API también trae `ramo` (el tipo de
// póliza), que la ficha presenta como «Cobertura».
export type DatoPolizaResumen = {
  number: string
  ramo: string
  status: string
}

// El bien que asegura la póliza: patente para autos y motos, dirección para
// inmuebles y comercios. Los ramos que no aseguran un bien (vida) traen null.
export type DatoBienAsegurado = {
  description: string
  plate: string | null
  address: string | null
  brand: string | null
  model: string | null
  year: number | null
}

export type DatoPoliza = {
  number: string
  /** El tipo de póliza: el panel lo muestra como «Cobertura». */
  ramo: string
  status: string
  /** Inicio de la vigencia, aaaa-mm-dd. Puede ser null. */
  startDate: string | null
  /** Fecha sin hora, aaaa-mm-dd. */
  expirationDate: string
  insuredItem: DatoBienAsegurado | null
}

export type ClienteLista = {
  id: string
  dni: string | null
  cuit: string | null
  razonSocial: string | null
  firstName: string | null
  lastName: string | null
  phones: string[]
  policies: DatoPolizaResumen[]
}

export type ClienteDetalle = {
  id: string
  dni: string | null
  cuit: string | null
  razonSocial: string | null
  firstName: string | null
  lastName: string | null
  phones: Array<{ id: number; number: string }>
  policies: DatoPoliza[]
}

export type PaginaClientes = {
  items: ClienteLista[]
  total: number
  limit: number
  offset: number
}

export type ConsultaClientes = {
  /** Texto libre: nombre, apellido o razón social; con dígitos también DNI, CUIT y teléfono. */
  buscar?: string
  limit: number
  offset: number
}

/**
 * Trae una página del listado. `offset` arranca en 0 y `limit` no pasa de 100
 * (lo valida el backend). Un `buscar` vacío no se manda, para que el backend
 * resuelva los valores por defecto.
 */
export async function listarClientes(consulta: ConsultaClientes): Promise<PaginaClientes> {
  const parametros = new URLSearchParams({ limit: String(consulta.limit), offset: String(consulta.offset) })
  const texto = consulta.buscar?.trim()
  if (texto) parametros.set('buscar', texto)
  const respuesta = await fetch(`/api/clientes?${parametros.toString()}`)
  return (await leer<PaginaClientes>(respuesta)) as PaginaClientes
}

/** Detalle de un cliente con sus teléfonos y pólizas. */
export async function obtenerCliente(id: string): Promise<ClienteDetalle> {
  const respuesta = await fetch(`/api/clientes/${encodeURIComponent(id)}`)
  return (await leer<ClienteDetalle>(respuesta)) as ClienteDetalle
}

async function leer<T>(respuesta: Response): Promise<T> {
  if (!respuesta.ok) {
    let mensaje = `El servidor respondió ${respuesta.status}.`
    try {
      const cuerpo = (await respuesta.json()) as { error?: { message?: string } }
      if (cuerpo.error?.message) mensaje = cuerpo.error.message
    } catch {
      // Sin cuerpo JSON: se usa el mensaje genérico.
    }
    throw new Error(mensaje)
  }
  return (await respuesta.json()) as T
}
