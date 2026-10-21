import { useEffect, useState } from 'react'
import { MODULOS, type ModuloPanel } from '../navigation'
import {
  IconoCerrar,
  IconoEscudo,
  IconoMenu,
  IconoModulo,
  IconoSalir,
} from './iconos'
import { etiquetaRol, type UsuarioPanel } from '../usuario'

interface SidebarProps {
  activo: ModuloPanel
  usuario: UsuarioPanel
  onNavegar: (modulo: ModuloPanel) => void
  onCerrarSesion: () => void
}

function CajaUsuario({
  usuario,
  onCerrarSesion,
}: Pick<SidebarProps, 'usuario' | 'onCerrarSesion'>) {
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
        <span className="usuario__nombre">{usuario.nombre}</span>
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

export default function Sidebar({
  activo,
  usuario,
  onNavegar,
  onCerrarSesion,
}: SidebarProps) {
  const [abierto, setAbierto] = useState(false)

  // Cerrar el menú móvil con Escape (design.md §5 «Navegación»).
  useEffect(() => {
    if (!abierto) return
    function manejarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('keydown', manejarTecla)
    return () => document.removeEventListener('keydown', manejarTecla)
  }, [abierto])

  function navegar(modulo: ModuloPanel) {
    setAbierto(false)
    onNavegar(modulo)
  }

  function cerrarSesion() {
    setAbierto(false)
    onCerrarSesion()
  }

  const modulosVisibles =
    usuario.rol === 'administrador'
      ? MODULOS
      : MODULOS.filter((modulo) => modulo.id !== 'dashboard')

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className="topbar__boton"
          aria-expanded={abierto}
          aria-controls="menu-principal"
          aria-label={abierto ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
          onClick={() => setAbierto((valor) => !valor)}
        >
          {abierto ? <IconoCerrar /> : <IconoMenu />}
        </button>
        <span className="topbar__marca">Seguros Castaño</span>
      </header>

      {abierto ? (
        <div
          className="sidebar-backdrop"
          role="presentation"
          onClick={() => setAbierto(false)}
        />
      ) : null}

      <nav
        id="menu-principal"
        className={`panel__nav${abierto ? ' is-open' : ''}`}
        aria-label="Navegación principal"
      >
        <div className="marca">
          <span className="marca__insignia" aria-hidden="true">
            <IconoEscudo />
          </span>
          <div className="marca__texto">
            <span className="marca__nombre">Seguros Castaño</span>
            <span className="marca__rol">Panel de supervisión</span>
          </div>
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
                  onClick={() => navegar(modulo.id)}
                >
                  <IconoModulo modulo={modulo.id} className="nav__icono" />
                  {modulo.nombre}
                </button>
              </li>
            )
          })}
        </ul>

        <CajaUsuario usuario={usuario} onCerrarSesion={cerrarSesion} />
      </nav>
    </>
  )
}
