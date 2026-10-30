import { useEffect, useId, useRef, useState } from 'react'
import type { ClienteDetalle, EntradaAltaCliente, EntradaEdicionCliente } from '../api/clientes'
import Dialogo from './Dialogo'

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
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const [campoConError, setCampoConError] = useState<
    'dni' | 'cuit' | 'apellido' | 'nombre' | 'razonSocial' | 'telefono' | null
  >(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const descripcionId = useId()
  const errorId = useId()
  const errorMostrado = errorLocal ?? error

  useEffect(() => {
    if (errorMostrado !== null) errorRef.current?.focus()
  }, [errorMostrado])

  function limpiarErrorLocal(): void {
    setErrorLocal(null)
    setCampoConError(null)
  }

  function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    setErrorLocal(null)
    setCampoConError(null)

    if (modo === 'alta') {
      if (tipo === 'persona') {
        const dniDigitos = dni.replace(/\D/g, '')
        if (!/^\d{7,8}$/.test(dniDigitos)) {
          setErrorLocal('El DNI debe tener 7 u 8 dígitos.')
          setCampoConError('dni')
          return
        }
        if (!apellido.trim()) {
          setErrorLocal('Ingresá el apellido.')
          setCampoConError('apellido')
          return
        }
        if (!nombre.trim()) {
          setErrorLocal('Ingresá el nombre.')
          setCampoConError('nombre')
          return
        }
      } else {
        const cuitDigitos = cuit.replace(/\D/g, '')
        if (!/^\d{11}$/.test(cuitDigitos)) {
          setErrorLocal('El CUIT debe tener 11 dígitos.')
          setCampoConError('cuit')
          return
        }
        if (!razonSocial.trim()) {
          setErrorLocal('Ingresá la razón social.')
          setCampoConError('razonSocial')
          return
        }
      }
      if (telefono.trim()) {
        const telefonoDigitos = telefono.replace(/\D/g, '')
        if (!/^\d{10,15}$/.test(telefonoDigitos)) {
          setErrorLocal('El teléfono debe tener entre 10 y 15 dígitos.')
          setCampoConError('telefono')
          return
        }
      }

      const telefonoOpcional = telefono.trim() ? { phone: telefono.trim() } : {}
      if (tipo === 'persona') {
        onGuardar({ kind: 'persona', dni: dni.trim(), lastName: apellido.trim(), firstName: nombre.trim(), ...telefonoOpcional })
      } else {
        onGuardar({ kind: 'empresa', cuit: cuit.trim(), razonSocial: razonSocial.trim(), ...telefonoOpcional })
      }
      return
    }

    if (tipo === 'persona') {
      if (!apellido.trim()) {
        setErrorLocal('Ingresá el apellido.')
        setCampoConError('apellido')
        return
      }
      if (!nombre.trim()) {
        setErrorLocal('Ingresá el nombre.')
        setCampoConError('nombre')
        return
      }
      onGuardar({ lastName: apellido.trim(), firstName: nombre.trim() })
    } else {
      const cuitDigitos = cuit.replace(/\D/g, '')
      if (!/^\d{11}$/.test(cuitDigitos)) {
        setErrorLocal('El CUIT debe tener 11 dígitos.')
        setCampoConError('cuit')
        return
      }
      if (!razonSocial.trim()) {
        setErrorLocal('Ingresá la razón social.')
        setCampoConError('razonSocial')
        return
      }
      onGuardar({ cuit: cuit.trim(), razonSocial: razonSocial.trim() })
    }
  }

  return (
    <Dialogo
      tituloId="formulario-cliente-titulo"
      descritoPor={errorMostrado !== null ? errorId : descripcionId}
      onCerrar={onCancelar}
      bloqueado={ocupado}
    >
      <h2 className="modal__titulo" id="formulario-cliente-titulo">
        {modo === 'alta' ? 'Nuevo cliente' : 'Editar datos del cliente'}
      </h2>
      <p className="modal__descripcion" id={descripcionId}>
        {modo === 'alta'
          ? 'Cargá los datos del cliente. El DNI o el CUIT lo valida el sistema y no se puede repetir.'
          : 'El DNI identifica al cliente y no se puede modificar.'}
      </p>

      <form className="formulario" onSubmit={guardar} aria-busy={ocupado || undefined}>
        {modo === 'alta' ? (
          <fieldset className="formulario__campo">
            <legend>Tipo de cliente</legend>
            <label className="formulario__opcion">
              <input
                type="radio"
                name="tipo-cliente"
                value="persona"
                checked={tipo === 'persona'}
                onChange={() => {
                  setTipo('persona')
                  limpiarErrorLocal()
                }}
              />
              Persona (DNI)
            </label>
            <label className="formulario__opcion">
              <input
                type="radio"
                name="tipo-cliente"
                value="empresa"
                checked={tipo === 'empresa'}
                onChange={() => {
                  setTipo('empresa')
                  limpiarErrorLocal()
                }}
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
                  maxLength={15}
                  value={dni}
                  onChange={(evento) => {
                    setDni(evento.target.value)
                    limpiarErrorLocal()
                  }}
                  aria-invalid={campoConError === 'dni' || undefined}
                  aria-describedby={campoConError === 'dni' ? errorId : undefined}
                  required
                />
              </label>
            )}
            <label className="formulario__campo">
              Apellido
              <input
                type="text"
                autoComplete="off"
                maxLength={100}
                value={apellido}
                onChange={(evento) => {
                  setApellido(evento.target.value)
                  limpiarErrorLocal()
                }}
                aria-invalid={campoConError === 'apellido' || undefined}
                aria-describedby={campoConError === 'apellido' ? errorId : undefined}
                required
              />
            </label>
            <label className="formulario__campo">
              Nombre
              <input
                type="text"
                autoComplete="off"
                maxLength={100}
                value={nombre}
                onChange={(evento) => {
                  setNombre(evento.target.value)
                  limpiarErrorLocal()
                }}
                aria-invalid={campoConError === 'nombre' || undefined}
                aria-describedby={campoConError === 'nombre' ? errorId : undefined}
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
                maxLength={15}
                value={cuit}
                onChange={(evento) => {
                  setCuit(evento.target.value)
                  limpiarErrorLocal()
                }}
                aria-invalid={campoConError === 'cuit' || undefined}
                aria-describedby={campoConError === 'cuit' ? errorId : undefined}
                required
              />
            </label>
            <label className="formulario__campo">
              Razón social
              <input
                type="text"
                autoComplete="off"
                maxLength={200}
                value={razonSocial}
                onChange={(evento) => {
                  setRazonSocial(evento.target.value)
                  limpiarErrorLocal()
                }}
                aria-invalid={campoConError === 'razonSocial' || undefined}
                aria-describedby={campoConError === 'razonSocial' ? errorId : undefined}
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
              inputMode="tel"
              autoComplete="off"
              maxLength={20}
              placeholder="5491155551234"
              value={telefono}
              onChange={(evento) => {
                setTelefono(evento.target.value)
                limpiarErrorLocal()
              }}
              aria-invalid={campoConError === 'telefono' || undefined}
              aria-describedby={campoConError === 'telefono' ? errorId : undefined}
            />
          </label>
        ) : null}

        {errorMostrado !== null ? (
          <p className="formulario__error" id={errorId} role="alert" tabIndex={-1} ref={errorRef}>
            {errorMostrado}
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
    </Dialogo>
  )
}
