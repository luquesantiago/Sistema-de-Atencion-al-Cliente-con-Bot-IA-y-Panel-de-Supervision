import { IconoFichaCliente, IconoPausa } from './iconos'

interface ChatHeaderProps {
  nombre?: string
  vehiculo?: string
  patente?: string
  previsualizacion?: boolean
}

export default function ChatHeader({
  nombre = 'García, Juan Carlos',
  vehiculo = 'Ford Focus 2018',
  patente = 'AA123BB',
  previsualizacion = true,
}: ChatHeaderProps = {}) {
  const inicial = nombre.trim().charAt(0).toLocaleUpperCase('es-AR') || 'C'
  const detalleVehiculo = [vehiculo.trim(), patente.trim() ? `(${patente.trim()})` : '']
    .filter(Boolean)
    .join(' ')

  return (
    <header className="chat-header">
      <div className="chat-header__cliente">
        <span className="chat-header__avatar" aria-hidden="true">{inicial}</span>
        <div className="chat-header__datos">
          <h2 className="chat-header__nombre">{nombre}</h2>
          <p className="chat-header__vehiculo">
            {detalleVehiculo || 'Datos del vehículo pendientes'}
          </p>
        </div>
        {previsualizacion && (
          <span className="chat-header__preview">Vista previa</span>
        )}
      </div>

      <div className="chat-header__acciones" aria-label="Acciones de la conversación">
        <button className="chat-header__accion" type="button">
          <IconoFichaCliente className="chat-header__icono" />
          Ver Ficha en CRM
        </button>
        <button className="chat-header__accion chat-header__accion--advertencia" type="button">
          <IconoPausa className="chat-header__icono" />
          Pausar Bot / Intervenir
        </button>
      </div>
    </header>
  )
}