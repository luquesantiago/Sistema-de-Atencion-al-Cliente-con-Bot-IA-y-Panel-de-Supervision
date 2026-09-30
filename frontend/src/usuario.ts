export type RolUsuario = 'gerente' | 'operador'

export interface UsuarioPanel {
  nombre: string
  iniciales: string
  rol: RolUsuario
}

export function crearUsuario(nombreIngresado: string): UsuarioPanel {
  const nombreNormalizado = nombreIngresado.trim().replace(/\s+/g, ' ')

  const usuarioNormalizado = nombreNormalizado.toLocaleLowerCase('es-AR')

  if (usuarioNormalizado === 'roberto' || usuarioNormalizado === 'roberto castaño') {
    return {
      nombre: 'Roberto Castaño',
      iniciales: 'RC',
      rol: 'gerente',
    }
  }

  const nombre = nombreNormalizado
    .split(' ')
    .map((parte) => parte.charAt(0).toLocaleUpperCase('es-AR') + parte.slice(1))
    .join(' ')
  const partes = nombre.split(' ')
  const iniciales = partes.length > 1
    ? `${partes[0].charAt(0)}${partes[partes.length - 1].charAt(0)}`
    : partes[0].charAt(0)

  return { nombre, iniciales: iniciales.toLocaleUpperCase('es-AR'), rol: 'operador' }
}

export function etiquetaRol(rol: RolUsuario): string {
  return rol === 'gerente' ? 'Gerente' : 'Operador/a'
}