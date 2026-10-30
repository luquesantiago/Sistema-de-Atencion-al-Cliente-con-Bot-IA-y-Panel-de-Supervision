import { useEffect, useId, useRef, type ReactNode } from 'react'
import Dialogo from './Dialogo'

// Una línea del resumen: el campo con su valor actual y el nuevo.
export type LineaConfirmacion = {
  etiqueta: string
  antes: string
  despues: string
}

interface ConfirmarCambioProps {
  titulo: string
  /** Aclaración corta del alcance del cambio, por ejemplo a quién afecta. */
  descripcion?: ReactNode
  /** Campo por campo: qué cambia, de qué valor a cuál. */
  lineas: LineaConfirmacion[]
  etiquetaConfirmar?: string
  /** Pinta el botón de confirmar en rojo: se usa para bajas y rechazos. */
  peligro?: boolean
  /** Mientras la petición está en vuelco se bloquean los botones. */
  ocupado?: boolean
  error?: string | null
  /** Se usa cuando la confirmación se abre encima de otro diálogo. */
  superpuesto?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/**
 * Diálogo de confirmación antes de mutar cartera. Muestra qué va a cambiar
 * campo por campo (valor actual → valor nuevo) y pide confirmación explícita:
 * nunca muta sin que el operador lo confirme.
 */
export default function ConfirmarCambio({
  titulo,
  descripcion,
  lineas,
  etiquetaConfirmar = 'Confirmar cambio',
  peligro = false,
  ocupado = false,
  error = null,
  superpuesto = false,
  onConfirmar,
  onCancelar,
}: ConfirmarCambioProps) {
  const errorRef = useRef<HTMLParagraphElement>(null)
  const descripcionId = useId()
  const errorId = useId()
  const descritoPor = [descripcion !== undefined ? descripcionId : null, error !== null ? errorId : null]
    .filter((id): id is string => id !== null)
    .join(' ')

  useEffect(() => {
    if (error !== null) errorRef.current?.focus()
  }, [error])

  return (
    <Dialogo
      tituloId="confirmar-titulo"
      descritoPor={descritoPor || undefined}
      onCerrar={onCancelar}
      bloqueado={ocupado}
      superpuesto={superpuesto}
    >
      <h2 className="modal__titulo" id="confirmar-titulo">
        {titulo}
      </h2>
      {descripcion !== undefined ? (
        <p className="modal__descripcion" id={descripcionId}>
          {descripcion}
        </p>
      ) : null}

      <dl className="modal__resumen">
        {lineas.map((linea) => (
          <div className="modal__linea" key={linea.etiqueta}>
            <dt>{linea.etiqueta}</dt>
            <dd>
              <span className="modal__antes">{linea.antes}</span>
              <span aria-hidden="true"> → </span>
              <span className="modal__despues">{linea.despues}</span>
            </dd>
          </div>
        ))}
      </dl>

      {error !== null ? (
        <p className="modal__error" id={errorId} role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      ) : null}

      <div className="modal__acciones">
        <button type="button" className="boton" onClick={onCancelar} disabled={ocupado}>
          Cancelar
        </button>
        <button
          type="button"
          className={`boton ${peligro ? 'boton--peligro' : 'boton--primario'}`}
          onClick={onConfirmar}
          disabled={ocupado}
        >
          {ocupado ? 'Aplicando…' : etiquetaConfirmar}
        </button>
      </div>
    </Dialogo>
  )
}
