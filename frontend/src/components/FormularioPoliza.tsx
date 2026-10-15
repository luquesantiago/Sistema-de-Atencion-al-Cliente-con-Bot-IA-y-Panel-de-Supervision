import { useEffect, useRef, useState } from 'react'
import type { Catalogos } from '../api/catalogos'
import type { DatoPoliza, EntradaCobertura, EntradaEdicionPoliza } from '../api/clientes'

interface FormularioPolizaProps {
  poliza: DatoPoliza
  catalogos: Catalogos
  ocupado: boolean
  error: string | null
  /** Guarda los datos de la póliza y el set completo de coberturas. */
  onGuardar: (entrada: EntradaEdicionPoliza, coberturas: EntradaCobertura[]) => void
  onCancelar: () => void
}

type FilaCobertura = {
  clave: number
  id?: number
  planId: number | ''
  description: string
  /** Suma asegurada en pesos, como texto; vacío = sin suma. */
  suma: string
}

// Pesos con decimales a centavos enteros, sin error de redondeo raro.
function pesosACentos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!limpio) return null
  const valor = Number(limpio)
  if (!Number.isFinite(valor) || valor < 0) return null
  return Math.round(valor * 100)
}

function centosAPesos(centavos: number | null): string {
  return centavos === null ? '' : (centavos / 100).toFixed(2)
}

/**
 * Formulario de edición de una póliza: datos generales, bien asegurado y
 * coberturas. Las coberturas se mandan completas: las que se quitan quedan
 * dadas de baja en el sistema.
 */
export default function FormularioPoliza({
  poliza,
  catalogos,
  ocupado,
  error,
  onGuardar,
  onCancelar,
}: FormularioPolizaProps) {
  const [numero, setNumero] = useState(poliza.number)
  const [companiaId, setCompaniaId] = useState<string>(poliza.company?.id ?? '')
  const [ramo, setRamo] = useState(poliza.ramo)
  const [estado, setEstado] = useState(poliza.status)
  const [moneda, setMoneda] = useState(poliza.currency)
  const [fechaInicio, setFechaInicio] = useState(poliza.startDate ?? '')
  const [fechaVencimiento, setFechaVencimiento] = useState(poliza.expirationDate)
  const [prima, setPrima] = useState(centosAPesos(poliza.premiumCents))
  const [observaciones, setObservaciones] = useState(poliza.observations ?? '')
  const [bien, setBien] = useState({
    conBien: poliza.insuredItem !== null,
    description: poliza.insuredItem?.description ?? '',
    plate: poliza.insuredItem?.plate ?? '',
    address: poliza.insuredItem?.address ?? '',
    brand: poliza.insuredItem?.brand ?? '',
    model: poliza.insuredItem?.model ?? '',
    year: poliza.insuredItem?.year === null || poliza.insuredItem?.year === undefined
      ? ''
      : String(poliza.insuredItem.year),
  })
  const [coberturas, setCoberturas] = useState<FilaCobertura[]>(
    poliza.coverages.map((cobertura, index) => ({
      clave: index + 1,
      id: cobertura.id,
      planId: cobertura.planId,
      description: cobertura.description ?? '',
      suma: centosAPesos(cobertura.insuredSumCents),
    })),
  )
  const siguienteClave = useRef(poliza.coverages.length + 1)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus()
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
    const entrada: EntradaEdicionPoliza = {
      number: numero.trim(),
      ramo,
      status: estado,
      currency: moneda,
      expirationDate: fechaVencimiento,
      premiumCents: pesosACentos(prima),
      observations: observaciones.trim() ? observaciones.trim() : null,
    }
    if (fechaInicio) entrada.startDate = fechaInicio
    if (companiaId) entrada.companyId = Number(companiaId)
    entrada.insuredItem = bien.conBien
      ? {
          description: bien.description.trim(),
          plate: bien.plate.trim() || null,
          address: bien.address.trim() || null,
          brand: bien.brand.trim() || null,
          model: bien.model.trim() || null,
          year: bien.year ? Number(bien.year) : null,
        }
      : null
    const coberturasFinales: EntradaCobertura[] = coberturas.map((fila) => ({
      ...(fila.id === undefined ? {} : { id: fila.id }),
      planId: Number(fila.planId),
      description: fila.description.trim() ? fila.description.trim() : null,
      insuredSumCents: pesosACentos(fila.suma),
    }))
    onGuardar(entrada, coberturasFinales)
  }

  return (
    <div
      className="modal__atras"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !ocupado) onCancelar()
      }}
    >
      <div
        className="modal modal--ancho"
        role="dialog"
        aria-modal="true"
        aria-labelledby="formulario-poliza-titulo"
        ref={panelRef}
      >
        <h2 className="modal__titulo" id="formulario-poliza-titulo">
          Editar póliza {poliza.number}
        </h2>
        <p className="modal__descripcion">
          Los cambios se aplican a la póliza de la cartera. Al guardar se pide confirmación con el resumen.
        </p>

        <form className="formulario" onSubmit={guardar}>
          <fieldset className="formulario__grupo">
            <legend>Datos de la póliza</legend>
            <div className="formulario__fila">
              <label className="formulario__campo">
                Número
                <input type="text" autoComplete="off" value={numero} onChange={(evento) => setNumero(evento.target.value)} required />
              </label>
              <label className="formulario__campo">
                Compañía
                <select value={companiaId} onChange={(evento) => setCompaniaId(evento.target.value)}>
                  <option value="">Sin cambio</option>
                  {catalogos.companies.map((compania) => (
                    <option key={compania.id} value={compania.id}>
                      {compania.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="formulario__fila">
              <label className="formulario__campo">
                Ramo
                <select value={ramo} onChange={(evento) => setRamo(evento.target.value)} required>
                  {catalogos.ramoNames.map((nombre) => (
                    <option key={nombre} value={nombre}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="formulario__campo">
                Estado
                <select value={estado} onChange={(evento) => setEstado(evento.target.value)} required>
                  {catalogos.policyStatusNames.map((nombre) => (
                    <option key={nombre} value={nombre}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="formulario__campo">
                Moneda
                <select value={moneda} onChange={(evento) => setMoneda(evento.target.value)} required>
                  {catalogos.currencies.map((monedaCatalogo) => (
                    <option key={monedaCatalogo.code} value={monedaCatalogo.code}>
                      {monedaCatalogo.code} — {monedaCatalogo.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="formulario__fila">
              <label className="formulario__campo">
                Inicio de vigencia
                <input type="date" value={fechaInicio} onChange={(evento) => setFechaInicio(evento.target.value)} />
              </label>
              <label className="formulario__campo">
                Vencimiento
                <input
                  type="date"
                  value={fechaVencimiento}
                  onChange={(evento) => setFechaVencimiento(evento.target.value)}
                  required
                />
              </label>
              <label className="formulario__campo">
                Prima mensual
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={prima}
                  onChange={(evento) => setPrima(evento.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>
            <label className="formulario__campo">
              Observaciones
              <textarea
                rows={2}
                value={observaciones}
                onChange={(evento) => setObservaciones(evento.target.value)}
              />
            </label>
          </fieldset>

          <fieldset className="formulario__grupo">
            <legend>Bien asegurado</legend>
            <label className="formulario__opcion">
              <input
                type="checkbox"
                checked={bien.conBien}
                onChange={(evento) => setBien((previo) => ({ ...previo, conBien: evento.target.checked }))}
              />
              Esta póliza asegura un bien (patente, dirección u otro)
            </label>
            {bien.conBien ? (
              <>
                <div className="formulario__fila">
                  <label className="formulario__campo">
                    Descripción
                    <input
                      type="text"
                      autoComplete="off"
                      value={bien.description}
                      onChange={(evento) => setBien((previo) => ({ ...previo, description: evento.target.value }))}
                      required
                    />
                  </label>
                  <label className="formulario__campo">
                    Patente o matrícula
                    <input
                      type="text"
                      autoComplete="off"
                      value={bien.plate}
                      onChange={(evento) => setBien((previo) => ({ ...previo, plate: evento.target.value }))}
                    />
                  </label>
                </div>
                <div className="formulario__fila">
                  <label className="formulario__campo">
                    Marca
                    <input
                      type="text"
                      autoComplete="off"
                      value={bien.brand}
                      onChange={(evento) => setBien((previo) => ({ ...previo, brand: evento.target.value }))}
                    />
                  </label>
                  <label className="formulario__campo">
                    Modelo
                    <input
                      type="text"
                      autoComplete="off"
                      value={bien.model}
                      onChange={(evento) => setBien((previo) => ({ ...previo, model: evento.target.value }))}
                    />
                  </label>
                  <label className="formulario__campo">
                    Año
                    <input
                      type="number"
                      min="1885"
                      max="2100"
                      value={bien.year}
                      onChange={(evento) => setBien((previo) => ({ ...previo, year: evento.target.value }))}
                    />
                  </label>
                </div>
                <label className="formulario__campo">
                  Dirección
                  <input
                    type="text"
                    autoComplete="off"
                    value={bien.address}
                    onChange={(evento) => setBien((previo) => ({ ...previo, address: evento.target.value }))}
                  />
                </label>
              </>
            ) : null}
          </fieldset>

          <fieldset className="formulario__grupo">
            <legend>Coberturas ({coberturas.length})</legend>
            <p className="formulario__ayuda">
              El set se guarda completo: las coberturas que quites quedan dadas de baja.
            </p>
            {coberturas.map((fila, index) => (
              <div className="formulario__cobertura" key={fila.clave}>
                <label className="formulario__campo">
                  Plan
                  <select
                    value={fila.planId}
                    onChange={(evento) =>
                      setCoberturas((previas) =>
                        previas.map((previa, i) =>
                          i === index ? { ...previa, planId: evento.target.value === '' ? '' : Number(evento.target.value) } : previa,
                        ),
                      )
                    }
                    required
                  >
                    <option value="">Elegir plan</option>
                    {catalogos.plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="formulario__campo">
                  Descripción
                  <input
                    type="text"
                    autoComplete="off"
                    value={fila.description}
                    onChange={(evento) =>
                      setCoberturas((previas) =>
                        previas.map((previa, i) => (i === index ? { ...previa, description: evento.target.value } : previa)),
                      )
                    }
                  />
                </label>
                <label className="formulario__campo">
                  Suma asegurada
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={fila.suma}
                    onChange={(evento) =>
                      setCoberturas((previas) =>
                        previas.map((previa, i) => (i === index ? { ...previa, suma: evento.target.value } : previa)),
                      )
                    }
                    placeholder="0.00"
                  />
                </label>
                <button
                  type="button"
                  className="boton boton--peligro-claro"
                  onClick={() => setCoberturas((previas) => previas.filter((_, i) => i !== index))}
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              className="boton"
              onClick={() =>
                setCoberturas((previas) => [
                  ...previas,
                  { clave: siguienteClave.current++, planId: '', description: '', suma: '' },
                ])
              }
            >
              Agregar cobertura
            </button>
          </fieldset>

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
              {ocupado ? 'Guardando…' : 'Continuar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
