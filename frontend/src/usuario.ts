export type RolUsuario = 'administrador' | 'operador'

export interface UsuarioPanel {
  nombre: string
  iniciales: string
  rol: RolUsuario
}

export function crearUsuario(nombreIngresado: string): UsuarioPanel {
  const nombreNormalizado = nombreIngresado.trim().replace(/\s+/g, ' ')

  const usuarioNormalizado = nombreNormalizado.toLocaleLowerCase('es-AR')

  if (usuarioNormalizado === 'admin') {
    return {
      nombre: 'Administrador',
      iniciales: 'AD',
      rol: 'administrador',
    }
  }

  return { nombre: 'Operador', iniciales: 'OP', rol: 'operador' }
}

export function etiquetaRol(rol: RolUsuario): string {
  return rol === 'administrador' ? 'Administrador' : 'Operador/a'
}