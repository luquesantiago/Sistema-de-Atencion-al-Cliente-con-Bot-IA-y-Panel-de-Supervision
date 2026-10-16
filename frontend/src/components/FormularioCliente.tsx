import { useEffect, useRef, useState } from 'react'
import type { ClienteDetalle, EntradaAltaCliente, EntradaEdicionCliente } from '../api/clientes'

// El modo define qué entrada entrega el formulario: en alta arma un alta
// completa; en edición, solo los campos modificables de la identidad.
type FormularioClienteProps =
  | {
      modo: 'alta'
      ocupado: boolean
      error: string | null
      onGuardar: (entrada: EntradaAltaCliente) => void
      onCancelar: () => void
    }
  | {
      modo: 'edicion'
      cliente: ClienteDetalle
      ocupado: boolean
      error: string | null
      onGuardar: (entrada: EntradaEdicionCliente) => void
      onCancelar: () => void
    }

/**
 * Formulario de alta y de edición de la identidad del cliente. El DNI se
 * muestra como dato fijo: no se puede modificar (RF-ATE-03). Persona y
 * empresa son formas distintas de cliente y no se convierten entre sí.
 */
export default function FormularioCliente(props: FormularioClienteProps) {
  const { modo, ocupado, error, onGuardar, onCancelar } = props
  // En edición el tipo sale del cliente; en alta lo elige quien carga.
  const cliente = props.modo === 'edicion' ? props.cliente : undefined
  const tipoInicial = modo === 'edicion' ? (cliente?.cuit ? 'empresa' : 'persona') : 'persona'
  const [tipo, setTipo] = useState<'persona' | 'empresa'>(tipoInicial)
  const [dni, setDni] = useState(cliente?.dni ?? '')
  const [apellido, setApellido] = useState(cliente?.lastName ?? '')
  const [nombre, setNombre] = useState(cliente?.firstName ?? '')
  const [cuit, setCuit] = useState(cliente?.cuit ?? '')
  const [razonSocial, setRazonSocial] = useState(cliente?.razonSocial ?? '')
  const [telefono, setTelefono] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, select')?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !ocupado) onCancelar()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [ocupado, onCancelar])

  function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    if (modo === 'alta') {
      const telefonoOpcional = telefono.trim() ? { phone: telefono.trim() } : {}
      if (tipo === 'persona') {
        onGuardar({ kind: 'persona', dni: dni.trim(), lastName: apellido.trim(), firstName: nombre.trim(), ...telefonoOpcional })
      } else {
        onGuardar({ kind: 'empresa', cuit: cuit.trim(), razonSocial: razonSocial.trim(), ...telefonoOpcional })
      }
      return
    }
    if (tipo === 'persona') {
      onGuardar({ lastName: apellido.trim(), firstName: nombre.trim() })
    } else {
      onGuardar({ cuit: cuit.trim(), razonSocial: razonSocial.trim() })
    }
  }

  return (
    <div
      className="modal__atras"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !ocupado) onCancelar()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="formulario-cliente-titulo" ref={panelRef}>
        <h2 className="modal__titulo" id="formulario-cliente-titulo">
          {modo === 'alta' ? 'Nuevo cliente' : 'Editar datos del cliente'}
        </h2>
        <p className="modal__descripcion">
          {modo === 'alta'
            ? 'Cargá los datos del cliente. El DNI o el CUIT lo valida el sistema y no se puede repetir.'
            : 'El DNI identifica al cliente y no se puede modificar.'}
        </p>

        <form className="formulario" onSubmit={guardar}>
          {modo === 'alta' ? (
            <fieldset className="formulario__campo">
              <legend>Tipo de cliente</legend>
              <label className="formulario__opcion">
                <input
                  type="radio"
                  name="tipo-cliente"
                  value="persona"
                  checked={tipo === 'persona'}
                  onChange={() => setTipo('persona')}
                />
                Persona (DNI)
              </label>
              <label className="formulario__opcion">
                <input
                  type="radio"
                  name="tipo-cliente"
                  value="empresa"
                  checked={tipo === 'empresa'}
                  onChange={() => setTipo('empresa')}
                />
                Empresa (CUIT)
              </label>
            </fieldset>
          ) : null}

          {tipo === 'persona' ? (
            <>
              {modo === 'edicion' ? (
                <p className="formulario__solo-lectura">
                  DNI {cliente?.dni ?? ''} (no se puede modificar)
                </p>
              ) : (
                <label className="formulario__campo">
                  DNI
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={dni}
                    onChange={(evento) => setDni(evento.target.value)}
                    required
                  />
                </label>
              )}
              <label className="formulario__campo">
                Apellido
                <input
                  type="text"
                  autoComplete="off"
                  value={apellido}
                  onChange={(evento) => setApellido(evento.target.value)}
                  required
                />
              </label>
              <label className="formulario__campo">
                Nombre
                <input
                  type="text"
                  autoComplete="off"
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value)}
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label className="formulario__campo">
                CUIT
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={cuit}
                  onChange={(evento) => setCuit(evento.target.value)}
                  required
                />
              </label>
              <label className="formulario__campo">
                Razón social
                <input
                  type="text"
                  autoComplete="off"
                  value={razonSocial}
                  onChange={(evento) => setRazonSocial(evento.target.value)}
                  required
                />
              </label>
            </>
          )}

          {modo === 'alta' ? (
            <label className="formulario__campo">
              Teléfono de WhatsApp (opcional)
              <input
                type="tel"
                autoComplete="off"
                placeholder="5491155551234"
                value={telefono}
                onChange={(evento) => setTelefono(evento.target.value)}
              />
            </label>
          ) : null}

          {error !== null ? (
            <p className="formulario__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="modal__acciones">
            <button type="button" className="boton" onClick={onCancelar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" className="boton boton--primario" disabled={ocupado}>
              {ocupado ? 'Guardando…' : modo === 'alta' ? 'Crear cliente' : 'Continuar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
