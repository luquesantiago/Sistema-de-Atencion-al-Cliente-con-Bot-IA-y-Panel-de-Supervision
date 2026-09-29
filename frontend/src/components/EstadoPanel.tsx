import type { ReactNode } from 'react'
import { IconoCandado, IconoInfo } from './iconos'

export type TonoEstado = 'neutro' | 'alerta' | 'riesgo'

interface EstadoPanelProps {
  titulo: string
  descripcion: string
  tono?: TonoEstado
  /** Cambia el ícono por el de acceso restringido. */
  restringido?: boolean
  acciones?: ReactNode
}

/**
 * Estados que el panel tiene que mostrar desde el inicio: sin datos todavía,
 * cargando, con error o sin permiso para el rol conectado. El tono nunca es
 * el único aviso: siempre acompaña a un texto.
 */
export default function EstadoPanel({
  titulo,
  descripcion,
  tono = 'neutro',
  restringido = false,
  acciones,
}: EstadoPanelProps) {
  const Icono = restringido ? IconoCandado : IconoInfo

  return (
    <section
      className={`estado estado--${tono}`}
      role={tono === 'riesgo' ? 'alert' : 'status'}
    >
      <span className="estado__icono">
        <Icono className="nav__icono" />
      </span>
      <h2 className="estado__titulo">{titulo}</h2>
      <p className="estado__texto">{descripcion}</p>
      {acciones ? <div className="pagina__acciones">{acciones}</div> : null}
    </section>
  )
}
