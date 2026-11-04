import type { UsuarioSesion } from './api/sesion'

export type RolUsuario = 'administrador' | 'operador'

/** El usuario conectado, armado con lo que devuelve el backend (`/api/sesion`). */
export interface UsuarioPanel {
  id: number
  nombre: string
  iniciales: string
  rol: RolUsuario
}

export function usuarioDesdeSesion(sesion: UsuarioSesion): UsuarioPanel {
  const nombre = `${sesion.nombre} ${sesion.apellido}`.trim().replace(/\s+/g, ' ')
  const iniciales = [sesion.nombre, sesion.apellido]
    .map((parte) => parte.trim().charAt(0))
    .join('')
    .toLocaleUpperCase('es-AR')
  return { id: sesion.id, nombre, iniciales: iniciales || '?', rol: sesion.rol }
}

export function etiquetaRol(rol: RolUsuario): string {
  return rol === 'administrador' ? 'Administrador' : 'Operador/a'
}
