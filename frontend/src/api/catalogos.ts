/**
 * Catálogos que los formularios de edición del panel necesitan: ramos,
 * estados de póliza, monedas, compañías y planes. Vienen de
 * `GET /api/catalogos`, con los valores vigentes de la base.
 */

export type OpcionCatalogo = {
  id: number
  name: string
}

export type Catalogos = {
  ramoNames: string[]
  policyStatusNames: string[]
  currencies: Array<{ code: string; name: string }>
  companies: OpcionCatalogo[]
  plans: OpcionCatalogo[]
}

export async function obtenerCatalogos(): Promise<Catalogos> {
  const respuesta = await fetch('/api/catalogos')
  if (!respuesta.ok) {
    throw new Error(`El servidor respondió ${respuesta.status} al consultar los catálogos.`)
  }
  return (await respuesta.json()) as Catalogos
}
