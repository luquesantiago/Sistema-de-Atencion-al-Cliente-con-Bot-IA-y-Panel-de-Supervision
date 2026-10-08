import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Modulo } from '../navigation'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'
import {
  listarClientes,
  obtenerCliente,
  type ClienteDetalle,
  type ClienteLista,
  type DatoPolizaResumen,
} from '../api/clientes'

const LIMITE_PAGINA = 25
const RETRASO_BUSQUEDA_MS = 300

function identificacion(cliente: ClienteLista | ClienteDetalle): string {
  if (cliente.cuit) return `CUIT ${cliente.cuit}`
  if (cliente.dni) return `DNI ${cliente.dni}`
  return 'Sin identificación'
}

function nombreCompleto(cliente: ClienteLista | ClienteDetalle): string {
  if (cliente.razonSocial) return cliente.razonSocial
  const partes = [cliente.firstName, cliente.lastName].filter((parte) => parte !== null && parte !== '')
  return partes.length > 0 ? partes.join(' ') : 'Sin nombre'
}

// Las fechas de la base son aaaa-mm-dd, sin hora: se muestran como dd/mm/aaaa.
function fechaLegible(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

function tonoDeEstado(status: string): string {
  if (status === 'activa') return 'chip chip--exito'
  if (status === 'suspendida por mora') return 'chip chip--alerta'
  return 'chip chip--neutro'
}

function mensajeDeError(error: unknown, textoPorDefecto: string): string {
  return error instanceof Error ? error.message : textoPorDefecto
}

// Una línea por póliza en la lista: número y estado. Nunca un conteo
// suelto: el operador tiene que ver de qué se trata cada póliza.
function resumenDePolizas(polizas: DatoPolizaResumen[]): ReactNode {
  if (polizas.length === 0) {
    return <span className="tabla__sin-datos">Sin pólizas</span>
  }
  return (
    <ul className="tabla__polizas">
      {polizas.map((poliza) => (
        <li key={poliza.number} className="tabla__poliza">
          <span className="tabla__poliza-numero">{poliza.number}</span>
          <span className={tonoDeEstado(poliza.status)}>{poliza.status}</span>
        </li>
      ))}
    </ul>
  )
}

// «Vigencia» de la ficha: con inicio y fin, o solo el vencimiento si la
// fecha de inicio no está cargada.
function vigenciaDe(startDate: string | null, expirationDate: string): string {
  const hasta = fechaLegible(expirationDate)
  return startDate === null ? `Vence ${hasta}` : `${fechaLegible(startDate)} a ${hasta}`
}

/**
 * Cartera de clientes: listado buscable con su ficha en un panel lateral.
 * Los datos vienen solo de `GET /api/clientes` (RF-CAR-01, RF-CAR-02,
 * RF-CAR-03): la lista no inventa nada que la API no devuelva.
 */
export default function BaseClientes({ modulo }: { modulo: Modulo }) {
  const [texto, setTexto] = useState('')
  const [items, setItems] = useState<ClienteLista[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<ClienteDetalle | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null)
  const numeroDeConsulta = useRef(0)
  const numeroDeFicha = useRef(0)

  const cargar = useCallback(async (busqueda: string) => {
    const numero = ++numeroDeConsulta.current
    setCargando(true)
    setError(null)
    try {
      const pagina = await listarClientes({ buscar: busqueda, limit: LIMITE_PAGINA, offset: 0 })
      if (numero !== numeroDeConsulta.current) return
      setItems(pagina.items)
      setTotal(pagina.total)
    } catch (errorDeConsulta) {
      if (numero !== numeroDeConsulta.current) return
      setItems([])
      setTotal(0)
      setError(mensajeDeError(errorDeConsulta, 'No se pudo consultar la cartera de clientes.'))
    } finally {
      if (numero === numeroDeConsulta.current) setCargando(false)
    }
  }, [])

  // Cada cambio de búsqueda vuelve a empezar en offset 0; el retardo evita
  // una consulta por tecla. Las respuestas viejas se descartan por número.
  useEffect(() => {
    const espera = texto.trim() === '' ? 0 : RETRASO_BUSQUEDA_MS
    const temporizador = setTimeout(() => {
      void cargar(texto)
    }, espera)
    return () => clearTimeout(temporizador)
  }, [texto, cargar])

  const mostrarMas = useCallback(async () => {
    setCargandoMas(true)
    setError(null)
    try {
      const pagina = await listarClientes({ buscar: texto, limit: LIMITE_PAGINA, offset: items.length })
      setItems((previos) => [...previos, ...pagina.items])
      setTotal(pagina.total)
    } catch (errorDeConsulta) {
      setError(mensajeDeError(errorDeConsulta, 'No se pudo cargar la siguiente página.'))
    } finally {
      setCargandoMas(false)
    }
  }, [texto, items.length])

  const abrirDetalle = useCallback(async (cliente: ClienteLista) => {
    const numero = ++numeroDeFicha.current
    setSeleccionado(cliente.id)
    setDetalle(null)
    setErrorDetalle(null)
    setCargandoDetalle(true)
    try {
      const ficha = await obtenerCliente(cliente.id)
      if (numero !== numeroDeFicha.current) return
      setDetalle(ficha)
    } catch (errorDeFicha) {
      if (numero !== numeroDeFicha.current) return
      setErrorDetalle(mensajeDeError(errorDeFicha, 'No se pudo cargar la ficha del cliente.'))
    } finally {
      if (numero === numeroDeFicha.current) setCargandoDetalle(false)
    }
  }, [])

  const cerrarDetalle = useCallback(() => {
    numeroDeFicha.current++
    setSeleccionado(null)
    setDetalle(null)
    setErrorDetalle(null)
    setCargandoDetalle(false)
  }, [])

  const clienteDeLista = seleccionado === null ? null : items.find((cliente) => cliente.id === seleccionado) ?? null
  const tituloFicha = detalle !== null ? nombreCompleto(detalle)
    : clienteDeLista !== null ? nombreCompleto(clienteDeLista)
      : 'Detalle del cliente'

  function contenidoDeLaLista(): ReactNode {
    if (cargando && items.length === 0 && error === null) {
      return <EstadoPanel titulo="Cargando la cartera…" descripcion="Consultando los clientes y sus pólizas." />
    }
    if (error !== null) {
      return (
        <EstadoPanel
          tono="riesgo"
          titulo="No se pudo cargar la cartera"
          descripcion={error}
          acciones={
            <button type="button" className="boton boton--primario" onClick={() => void cargar(texto)}>
              Reintentar
            </button>
          }
        />
      )
    }
    if (items.length === 0) {
      const hayBusqueda = texto.trim() !== ''
      return (
        <EstadoPanel
          titulo={hayBusqueda ? `Sin resultados para «${texto.trim()}»` : 'Todavía no hay clientes cargados'}
          descripcion={
            hayBusqueda
              ? 'Probá con otro nombre, DNI o teléfono.'
              : 'Cuando se cargue la planilla histórica, los clientes de la cartera aparecen acá.'
          }
        />
      )
    }

    return (
      <>
        <table className="tabla" aria-label="Clientes de la cartera">
          <thead>
            <tr>
              <th scope="col">Identificación</th>
              <th scope="col">Cliente</th>
              <th scope="col">Teléfonos</th>
              <th scope="col">Pólizas</th>
              <th scope="col">
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((cliente) => {
              const activo = seleccionado === cliente.id
              return (
                <tr
                  key={cliente.id}
                  className={`tabla__fila${activo ? ' tabla__fila--activa' : ''}`}
                  onClick={() => void abrirDetalle(cliente)}
                >
                  <td className="tabla__identificacion">{identificacion(cliente)}</td>
                  <td className="tabla__nombre">{nombreCompleto(cliente)}</td>
                  <td className="tabla__telefonos">
                    {cliente.phones.length > 0 ? cliente.phones.join(' · ') : 'Sin teléfono vinculado'}
                  </td>
                  <td>{resumenDePolizas(cliente.policies)}</td>
                  <td className="tabla__accion">
                    <button
                      type="button"
                      className="tabla__ver"
                      aria-expanded={activo}
                      onClick={(evento) => {
                        evento.stopPropagation()
                        // «Viendo» alterna: tocarlo cierra la ficha, igual que el
                        // botón Cerrar del panel, y vuelve la lista completa.
                        if (activo) {
                          cerrarDetalle()
                          return
                        }
                        void abrirDetalle(cliente)
                      }}
                    >
                      {activo ? 'Viendo' : 'Ver detalle'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="cartera__pie">
          <p className="cartera__conteo" role="status">
            {cargando ? 'Buscando…' : `Mostrando ${items.length} de ${total} clientes`}
          </p>
          {items.length < total ? (
            <button type="button" className="boton" disabled={cargandoMas} onClick={() => void mostrarMas()}>
              {cargandoMas ? 'Cargando…' : 'Mostrar más'}
            </button>
          ) : null}
        </div>
      </>
    )
  }

  return (
    <div className="pagina">
      <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />

      <div className="busqueda">
        <label className="busqueda__etiqueta" htmlFor="busqueda-clientes">
          Buscar cliente
        </label>
        <input
          id="busqueda-clientes"
          className="busqueda__campo"
          type="search"
          autoComplete="off"
          placeholder="Nombre, apellido, razón social, DNI, CUIT o teléfono"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
        />
        <p className="busqueda__pista">
          El texto compara nombre, apellido y razón social. Con dígitos también compara DNI, CUIT y
          teléfono, con o sin puntos.
        </p>
      </div>

      <div className={`cartera${seleccionado !== null ? ' cartera--con-detalle' : ''}`}>
        <div className="cartera__lista" aria-busy={cargando}>
          {contenidoDeLaLista()}
        </div>

        {seleccionado !== null ? (
          <aside className="detalle-panel" aria-label="Detalle del cliente">
            <div className="detalle-panel__encabezado">
              <h2 className="detalle-panel__titulo">{tituloFicha}</h2>
              <button type="button" className="detalle-panel__cerrar" onClick={cerrarDetalle}>
                Cerrar
              </button>
            </div>

            {cargandoDetalle ? (
              <p className="detalle-panel__aviso" role="status">
                Cargando la ficha…
              </p>
            ) : errorDetalle !== null ? (
              <p className="detalle-panel__aviso detalle-panel__aviso--riesgo" role="alert">
                {errorDetalle}
              </p>
            ) : detalle !== null ? (
              <>
                <dl className="detalle-panel__datos">
                  <dt>Identificación</dt>
                  <dd>{identificacion(detalle)}</dd>

                  <dt>Teléfonos</dt>
                  <dd>
                    {detalle.phones.length > 0 ? (
                      <ul className="detalle-panel__telefonos">
                        {detalle.phones.map((telefono) => (
                          <li key={telefono.id}>{telefono.number}</li>
                        ))}
                      </ul>
                    ) : (
                      'Sin teléfono vinculado'
                    )}
                  </dd>
                </dl>

                <section className="detalle-panel__polizas">
                  <h3 className="detalle-panel__subtitulo">Pólizas ({detalle.policies.length})</h3>
                  {detalle.policies.length === 0 ? (
                    <p className="detalle-panel__aviso">Este cliente no tiene pólizas cargadas.</p>
                  ) : (
                    detalle.policies.map((poliza) => (
                      <article key={poliza.number} className="detalle-panel__poliza">
                        <header className="detalle-panel__poliza-encabezado">
                          <h4 className="detalle-panel__poliza-numero">{poliza.number}</h4>
                          <span className={tonoDeEstado(poliza.status)}>{poliza.status}</span>
                        </header>

                        <dl className="detalle-panel__datos">
                          <dt>Cobertura</dt>
                          <dd>{poliza.ramo}</dd>

                          <dt>Vigencia</dt>
                          <dd>{vigenciaDe(poliza.startDate, poliza.expirationDate)}</dd>
                        </dl>

                        {poliza.insuredItem ? (
                          <div className="detalle-panel__bien">
                            <h5 className="detalle-panel__bien-titulo">Bien asegurado</h5>
                            <dl className="detalle-panel__datos">
                              <dt>Descripción</dt>
                              <dd>{poliza.insuredItem.description}</dd>

                              {poliza.insuredItem.plate !== null ? (
                                <>
                                  <dt>Patente</dt>
                                  <dd>{poliza.insuredItem.plate}</dd>
                                </>
                              ) : null}

                              {poliza.insuredItem.brand !== null ? (
                                <>
                                  <dt>Marca</dt>
                                  <dd>{poliza.insuredItem.brand}</dd>
                                </>
                              ) : null}

                              {poliza.insuredItem.model !== null ? (
                                <>
                                  <dt>Modelo</dt>
                                  <dd>{poliza.insuredItem.model}</dd>
                                </>
                              ) : null}

                              {poliza.insuredItem.year !== null ? (
                                <>
                                  <dt>Año</dt>
                                  <dd>{poliza.insuredItem.year}</dd>
                                </>
                              ) : null}

                              {poliza.insuredItem.address !== null ? (
                                <>
                                  <dt>Dirección</dt>
                                  <dd>{poliza.insuredItem.address}</dd>
                                </>
                              ) : null}
                            </dl>
                          </div>
                        ) : null}
                      </article>
                    ))
                  )}
                </section>
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
