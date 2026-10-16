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
// póliza, que la ficha presenta como «Categoría») y `expirationDate`, con el
// que se calcula si la póliza está vencida.

import { leer } from './respuesta'

export type DatoPolizaResumen = {
  number: string
  ramo: string
  status: string
  /** Fecha sin hora, aaaa-mm-dd. */
  expirationDate: string
}

// El bien que asegura la póliza: patente para autos y motos, matrícula para
// embarcaciones, dirección para inmuebles y comercios. Las pólizas de vida no
// aseguran un bien y traen null.
export type DatoBienAsegurado = {
  description: string
  plate: string | null
  address: string | null
  brand: string | null
  model: string | null
  year: number | null
}

// Cobertura activa de la póliza, como la muestra la ficha para poder
// editarla. Los importes van en centavos enteros.
export type DatoCobertura = {
  id: number
  planId: number
  planName: string
  description: string | null
  insuredSumCents: number | null
}

export type DatoPoliza = {
  /** Id numérico de la póliza, el que usan las ediciones del panel. */
  id: string
  number: string
  /** El tipo de póliza: el panel lo muestra como «Categoría». */
  ramo: string
  status: string
  /** Código de moneda, por ejemplo ARS. */
  currency: string
  /** Compañía dueña del registro; puede faltar en los datos de prueba. */
  company: { id: string; name: string } | null
  /** Inicio de la vigencia, aaaa-mm-dd. Puede ser null. */
  startDate: string | null
  /** Fecha sin hora, aaaa-mm-dd. */
  expirationDate: string
  /** Cuota mensual en centavos; null si no está cargada. */
  premiumCents: number | null
  observations: string | null
  insuredItem: DatoBienAsegurado | null
  coverages: DatoCobertura[]
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
// Entradas de las ediciones del panel: el backend las valida y normaliza.
// El DNI no se puede modificar nunca: es el identificador del cliente.

export type EntradaAltaCliente =
  | { kind: 'persona'; dni: string; lastName: string; firstName: string; phone?: string }
  | { kind: 'empresa'; cuit: string; razonSocial: string; phone?: string }

export type EntradaEdicionCliente =
  | { lastName: string; firstName: string }
  | { cuit: string; razonSocial: string }

export type EntradaEdicionPoliza = {
  number?: string
  ramo?: string
  status?: string
  currency?: string
  /** Fechas sin hora, aaaa-mm-dd. */
  startDate?: string
  expirationDate?: string
  /** Cuota mensual en centavos; null la borra. */
  premiumCents?: number | null
  observations?: string | null
  /** null desconecta el bien; objeto lo crea o lo actualiza. */
  insuredItem?: DatoBienAsegurado | null
}

export type EntradaCobertura = {
  id?: number
  planId: number
  description: string | null
  insuredSumCents: number | null
}

// Alta de una póliza de un cliente que ya existe: el contrato es obligatorio
// completo y las coberturas vienen de una, aunque estén vacías. Sin número
// ni compañía: los asigna el sistema (POL-<siguiente>, Seguros Castaño).
export type EntradaAltaPoliza = {
  ramo: string
  status: string
  currency: string
  /** Fechas sin hora, aaaa-mm-dd. */
  startDate: string
  expirationDate: string
  premiumCents?: number | null
  observations?: string | null
  insuredItem?: DatoBienAsegurado | null
  coverages: EntradaCobertura[]
}

/** Alta de un cliente desde el panel. Devuelve la ficha creada. */
export async function crearCliente(entrada: EntradaAltaCliente): Promise<ClienteDetalle> {
  return enviar('/api/clientes', { method: 'POST', body: JSON.stringify(entrada) })
}

/** Edita el nombre y apellido de una persona, o el CUIT y la razón social de una empresa. */
export async function editarCliente(id: string, entrada: EntradaEdicionCliente): Promise<ClienteDetalle> {
  return enviar(`/api/clientes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(entrada) })
}

/** Baja lógica: el cliente deja de aparecer en la cartera. */
export async function darDeBajaCliente(id: string): Promise<{ id: string }> {
  return enviar(`/api/clientes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Vincula un teléfono al cliente; el número se guarda normalizado. */
export async function vincularTelefono(id: string, phone: string): Promise<ClienteDetalle> {
  return enviar(`/api/clientes/${encodeURIComponent(id)}/telefonos`, {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

/** Desvincula el teléfono solo de ese cliente: otros clientes pueden compartirlo. */
export async function desvincularTelefono(id: string, phoneId: number): Promise<ClienteDetalle> {
  return enviar(`/api/clientes/${encodeURIComponent(id)}/telefonos/${phoneId}`, { method: 'DELETE' })
}

/** Da de alta una póliza del cliente con su bien y sus coberturas. Devuelve la ficha. */
export async function crearPoliza(clienteId: string, entrada: EntradaAltaPoliza): Promise<ClienteDetalle> {
  return enviar(`/api/clientes/${encodeURIComponent(clienteId)}/polizas`, {
    method: 'POST',
    body: JSON.stringify(entrada),
  })
}

/** Edita datos de la póliza y su bien asegurado. Devuelve la ficha del dueño. */
export async function editarPoliza(id: string, entrada: EntradaEdicionPoliza): Promise<ClienteDetalle> {
  return enviar(`/api/polizas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(entrada) })
}

/** Reemplaza el set de coberturas: las quitadas quedan dadas de baja. */
export async function reemplazarCoberturas(id: string, coverages: EntradaCobertura[]): Promise<ClienteDetalle> {
  return enviar(`/api/polizas/${encodeURIComponent(id)}/coberturas`, {
    method: 'PUT',
    body: JSON.stringify({ coverages }),
  })
}

async function enviar<T>(path: string, init: RequestInit): Promise<T> {
  const respuesta = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })
  return (await leer<T>(respuesta)) as T
}

