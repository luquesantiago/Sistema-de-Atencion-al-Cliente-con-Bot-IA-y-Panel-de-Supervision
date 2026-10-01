import { useState } from 'react'
import { MODULOS, type ModuloPanel } from '../navigation'
import { IconoModulo, IconoSalir } from './iconos'
import { etiquetaRol, type UsuarioPanel } from '../usuario'

interface SidebarProps {
  activo: ModuloPanel
  usuario: UsuarioPanel
  onNavegar: (modulo: ModuloPanel) => void
  onCerrarSesion: () => void
}

function CajaUsuario({ usuario, onCerrarSesion }: Pick<SidebarProps, 'usuario' | 'onCerrarSesion'>) {
  const [confirmando, setConfirmando] = useState(false)

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
              // Reinicia la confirmación antes de volver al formulario de ingreso.
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
        {usuario.iniciales}
      </span>
      <div className="usuario__datos">
        <span className="usuario__nombre">
          {usuario.nombre}
        </span>
        <span className="usuario__rol">{etiquetaRol(usuario.rol)}</span>
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

export default function Sidebar({ activo, usuario, onNavegar, onCerrarSesion }: SidebarProps) {
  const modulosVisibles = usuario.rol === 'administrador'
    ? MODULOS
    : MODULOS.filter((modulo) => modulo.id !== 'dashboard')

  return (
    <nav className="panel__nav" aria-label="Navegación principal">
      <div className="marca">
        <span className="marca__nombre">Seguros Castaño</span>
        <span className="marca__rol">Panel de supervisión</span>
      </div>

      <ul className="nav__grupo">
        <li className="nav__titulo">Módulos</li>
        {modulosVisibles.map((modulo) => {
          const seleccionado = modulo.id === activo
          return (
            <li key={modulo.id}>
              <button
                type="button"
                className="nav__item"
                aria-current={seleccionado ? 'page' : undefined}
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
        onCerrarSesion={onCerrarSesion}
      />
    </nav>
  )
}
