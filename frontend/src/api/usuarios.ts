/**
 * Datos del usuario conectado al panel.
 *
 * En el Parcial 1 no hay login: el backend atribuye todo al usuario de prueba
 * `operador`. Esta capa es la única que trae esos datos, para que los
 * componentes no los guarden por su cuenta.
 */
export interface UsuarioActual {
  id: number
  nombreUsuario: string
  nombre: string
  apellido: string
  /** Nombre del rol en la base, por ejemplo "operador". */
  rol: string
}

/**
 * PROVISORIO (parte 1 del cambio): dato fijo mientras no existe el endpoint
 * `GET /api/usuarios/actual`. En la parte 2 esta función pasa a hacer fetch
 * y se elimina el valor y el retardo de abajo.
 */
const USUARIO_PROVISIONAL: UsuarioActual = {
  id: 1,
  nombreUsuario: 'operador',
  nombre: 'Operadora',
  apellido: 'Graciela',
  rol: 'operadora Prueba',
}

export async function obtenerUsuarioActual(): Promise<UsuarioActual> {
  // Retardo solo para que se vea el estado de carga; no es una llamada real.
  await new Promise((resuelto) => setTimeout(resuelto, 400))
  return USUARIO_PROVISIONAL
}
