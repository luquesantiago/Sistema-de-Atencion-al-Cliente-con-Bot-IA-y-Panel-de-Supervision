import { MODULOS, type ModuloPanel } from '../navigation'
import { IconoModulo } from './iconos'
import { etiquetaRol, type UsuarioPanel } from '../usuario'

interface SidebarProps {
  activo: ModuloPanel
  usuario: UsuarioPanel
  onNavegar: (modulo: ModuloPanel) => void
  onCerrarSesion: () => void
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

      <section className="perfil" aria-label="Usuario conectado">
        <span className="perfil__avatar" aria-hidden="true">{usuario.iniciales}</span>
        <span className="perfil__datos">
          <span className="perfil__nombre">{usuario.nombre}</span>
          <span className="perfil__rol">{etiquetaRol(usuario.rol)}</span>
        </span>
        <button className="perfil__salir" type="button" onClick={onCerrarSesion}>
          Cerrar sesión
        </button>
      </section>

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

      <div className="panel__pie">
        <p>La atención humana atiende de lunes a viernes de 9 a 18.</p>
      </div>
    </nav>
  )
}
