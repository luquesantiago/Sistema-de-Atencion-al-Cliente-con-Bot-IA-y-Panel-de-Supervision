import { MODULOS, type ModuloPanel } from '../navigation'
import { IconoModulo } from './iconos'

interface SidebarProps {
  activo: ModuloPanel
  onNavegar: (modulo: ModuloPanel) => void
}

export default function Sidebar({ activo, onNavegar }: SidebarProps) {
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
        <p>Todo se atribuye al usuario de prueba operador.</p>
        <p>La atención humana atiende de lunes a viernes de 9 a 18.</p>
      </div>
    </nav>
  )
}
