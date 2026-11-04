/**
 * Sesión del panel (RF-SUP-07). El backend verifica el usuario y la clave y
 * deja una cookie `httpOnly` que el navegador manda sola en cada pedido a
 * `/api`: el panel nunca ve ni guarda el token.
 */
import { ErrorDeApi, leer } from './respuesta'
import type { RolUsuario } from '../usuario'

/** El usuario con la sesión iniciada, como lo devuelve el backend. */
export type UsuarioSesion = {
  id: number
  usuario: string
  nombre: string
  apellido: string
  rol: RolUsuario
}

/** Lanza `ErrorDeApi` con el mensaje del backend si el usuario o la clave no sirven. */
export async function iniciarSesion(usuario: string, clave: string): Promise<UsuarioSesion> {
  const respuesta = await fetch('/api/sesion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usuario, clave }),
  })
  return leer<UsuarioSesion>(respuesta)
}

/** La sesión vigente al recargar el panel, o `null` si no hay una válida. */
export async function obtenerSesion(): Promise<UsuarioSesion | null> {
  try {
    return await leer<UsuarioSesion>(await fetch('/api/sesion', { cache: 'no-store' }))
  } catch (error) {
    if (error instanceof ErrorDeApi && error.status === 401) return null
    throw error
  }
}

export async function cerrarSesion(): Promise<void> {
  const respuesta = await fetch('/api/sesion/cierre', { method: 'POST' })
  if (!respuesta.ok) throw new ErrorDeApi(respuesta.status, 'No se pudo cerrar la sesión.')
}
