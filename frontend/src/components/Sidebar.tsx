import { useState } from 'react'
import { MODULOS, type ModuloPanel } from '../navigation'
import { IconoCandado, IconoModulo, IconoSalir } from './iconos'
import type { UsuarioActual } from '../api/usuarios'

/** Estados posibles de la carga del usuario conectado. */
export type EstadoUsuario = 'cargando' | 'listo' | 'error'

interface SidebarProps {
  activo: ModuloPanel
  onNavegar: (modulo: ModuloPanel) => void
  /** Usuario cargado, o null mientras carga o si falló. */
  usuario: UsuarioActual | null
  estadoUsuario: EstadoUsuario
  onReintentarUsuario: () => void
  onCerrarSesion: () => void
  /** true mientras el contenido principal muestra «Sesión cerrada». */
  sesionCerrada: boolean
  /** Simulado hasta el login del Parcial 2: vuelve a mostrar el panel. */
  onIniciarSesion: () => void
}

function iniciales(nombre: string, apellido: string): string {
  const iniciales = `${nombre.trim().charAt(0)}${apellido.trim().charAt(0)}`
  return iniciales === '' ? '??' : iniciales.toUpperCase()
}

/** "operador" → "Operador", para mostrar el cargo con mayúscula. */
function cargo(rol: string): string {
  const limpio = rol.trim()
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}

function CajaUsuario({
  usuario,
  estadoUsuario,
  onReintentarUsuario,
  onCerrarSesion,
  sesionCerrada,
  onIniciarSesion,
}: Pick<
  SidebarProps,
  | 'usuario'
  | 'estadoUsuario'
  | 'onReintentarUsuario'
  | 'onCerrarSesion'
  | 'sesionCerrada'
  | 'onIniciarSesion'
>) {
  const [confirmando, setConfirmando] = useState(false)

  if (sesionCerrada) {
    return (
      <div className="panel__usuario">
        <span className="usuario__avatar usuario__avatar--cerrado" aria-hidden="true">
          <IconoCandado className="nav__icono" />
        </span>
        <div className="usuario__datos">
          <span className="usuario__nombre">Sesión cerrada</span>
          <button
            type="button"
            className="usuario__entrar"
            onClick={onIniciarSesion}
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  if (estadoUsuario === 'cargando') {
    return (
      <div className="panel__usuario" role="status">
        <span className="usuario__avatar" aria-hidden="true">
          …
        </span>
        <div className="usuario__datos">
          <span className="usuario__nombre">Cargando usuario…</span>
        </div>
      </div>
    )
  }

  if (estadoUsuario === 'error' || usuario === null) {
    return (
      <div className="panel__usuario" role="alert">
        <div className="usuario__datos">
          <span className="usuario__nombre">No se pudo cargar el usuario</span>
        </div>
        <button
          type="button"
          className="usuario__accion"
          onClick={onReintentarUsuario}
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (confirmando) {
    return (
      <div
        className="panel__usuario panel__usuario--confirmacion"
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') setConfirmando(false)
        }}
      >
        <p className="usuario__pregunta">¿Cerrar sesión?</p>
        <div className="usuario__confirmar">
          <button
            type="button"
            className="usuario__accion usuario__accion--riesgo"
            autoFocus
            onClick={() => {
              // Vuelve a la vista normal: si no, la caja queda pegada en la
              // confirmación mientras el panel muestra «Sesión cerrada».
              setConfirmando(false)
              onCerrarSesion()
            }}
          >
            Sí, cerrar
          </button>
          <button
            type="button"
            className="usuario__accion"
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="panel__usuario">
      <span className="usuario__avatar" aria-hidden="true">
        {iniciales(usuario.nombre, usuario.apellido)}
      </span>
      <div className="usuario__datos">
        <span className="usuario__nombre">
          {usuario.nombre} {usuario.apellido}
        </span>
        <span className="usuario__rol">{cargo(usuario.rol)}</span>
      </div>
      <button
        type="button"
        className="usuario__salir"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        onClick={() => setConfirmando(true)}
      >
        <IconoSalir className="nav__icono" />
      </button>
    </div>
  )
}

export default function Sidebar({
  activo,
  onNavegar,
  usuario,
  estadoUsuario,
  onReintentarUsuario,
  onCerrarSesion,
  sesionCerrada,
  onIniciarSesion,
}: SidebarProps) {
  return (
    <nav className="panel__nav" aria-label="Navegación principal">
      <div className="marca">
        <span className="marca__nombre">Seguros Castaño</span>
        <span className="marca__rol">Panel de supervisión</span>
      </div>

      <ul className="nav__grupo">
        <li className="nav__titulo">Módulos</li>
        {MODULOS.map((modulo) => {
          const seleccionado = modulo.id === activo
          return (
            <li key={modulo.id}>
              <button
                type="button"
                className="nav__item"
                aria-current={seleccionado ? 'page' : undefined}
                disabled={sesionCerrada}
                onClick={() => onNavegar(modulo.id)}
              >
                <IconoModulo modulo={modulo.id} className="nav__icono" />
                {modulo.nombre}
              </button>
            </li>
          )
        })}
      </ul>

      <CajaUsuario
        usuario={usuario}
        estadoUsuario={estadoUsuario}
        onReintentarUsuario={onReintentarUsuario}
        onCerrarSesion={onCerrarSesion}
        sesionCerrada={sesionCerrada}
        onIniciarSesion={onIniciarSesion}
      />
    </nav>
  )
}
