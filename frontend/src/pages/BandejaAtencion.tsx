import ChatHeader from '../components/ChatHeader'
import { IconoConversacion } from '../components/iconos'
import type { Modulo } from '../navigation'

export interface ConversacionSeleccionada {
  nombre: string
  vehiculo: string
  patente: string
}

interface BandejaAtencionProps {
  modulo: Modulo
  conversacionSeleccionada?: ConversacionSeleccionada | null
}

export default function BandejaAtencion({
  conversacionSeleccionada = null,
}: BandejaAtencionProps) {
  return (
    <div className="pagina pagina--bandeja">
      <div className="bandeja-layout">
        <aside className="bandeja__lista" aria-label="Lista de conversaciones">
          <header className="bandeja__lista-cabecera">
            <h1 className="bandeja__titulo">Bandeja de Atención</h1>
            <div className="bandeja__busqueda">
              <svg
                className="bandeja__busqueda-icono"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.5 4.5" />
              </svg>
              <input
                type="search"
                aria-label="Buscar conversaciones"
                placeholder="Buscar por nombre o patente..."
              />
            </div>
          </header>
          <div className="bandeja__lista-contenido" role="status">
            <p className="bandeja__lista-vacia">No hay conversaciones para mostrar.</p>
          </div>
        </aside>

        <section className="bandeja__chat" aria-label="Panel de conversación">
          {conversacionSeleccionada === null ? (
            <div className="bandeja__empty-state" role="status">
              <span className="bandeja__empty-state-icono" aria-hidden="true">
                <IconoConversacion />
              </span>
              <p className="bandeja__chat-vacio">
                Seleccioná un contacto de la lista para comenzar la atención
              </p>
            </div>
          ) : (
            <>
              <ChatHeader
                nombre={conversacionSeleccionada.nombre}
                vehiculo={conversacionSeleccionada.vehiculo}
                patente={conversacionSeleccionada.patente}
                previsualizacion={false}
              />
              <div className="bandeja__chat-cuerpo" aria-label="Mensajes de la conversación" />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
