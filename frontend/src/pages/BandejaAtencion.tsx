import { useEffect, useState } from 'react'
import ChatHeader from '../components/ChatHeader'
import { IconoConversacion } from '../components/iconos'
import type { Modulo } from '../navigation'
import {
  listarBandeja,
  obtenerCasoBandeja,
  type CasoBandeja,
  type DetalleCasoBandeja,
  type EtiquetaBandeja,
} from '../api/bandeja'

const LIMITE_PAGINA = 25
const INTERVALO_ACTUALIZACION_MS = 5000

const FORMATO_DIA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
})

const FORMATO_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  dateStyle: 'short',
  timeStyle: 'short',
})

const ETIQUETAS: Record<EtiquetaBandeja, string> = {
  'alta-pendiente': 'Alta pendiente · se decide en Trámites',
  'alta-rechazada': 'Alta rechazada · avisar al cliente',
  'pedido-pendiente': 'Pedido pendiente de aprobación',
  'cambio-telefono-pendiente': 'Cambio de teléfono pendiente · se decide en Trámites',
}

const ORIGENES = {
  cliente: 'Cliente',
  asistente: 'Asistente',
  operador: 'Operador',
} as const

function nombreDelCaso(caso: CasoBandeja): string {
  if (caso.customer === null) return 'Sin identificar'
  return caso.customer.name ?? 'Cliente sin nombre cargado'
}

function inicialDelCaso(caso: CasoBandeja): string {
  if (caso.customer === null) return '?'
  return nombreDelCaso(caso).trim().charAt(0).toLocaleUpperCase('es-AR') || '?'
}

function estiloEstado(caso: CasoBandeja): { texto: string; estilo: 'critico' | 'revision' | 'resuelto' } {
  if (caso.severity === 'crítico') return { texto: 'Alerta Crítica', estilo: 'critico' }
  if (caso.severity === 'bajo' && caso.label === null) return { texto: 'Resuelto', estilo: 'resuelto' }
  return { texto: 'Revisión', estilo: 'revision' }
}

function coincideConBusqueda(caso: CasoBandeja, texto: string): boolean {
  const contenido = [
    nombreDelCaso(caso),
    caso.phone,
    caso.queryType ?? '',
    caso.lastMessage?.text ?? '',
  ].join(' ').toLocaleLowerCase('es-AR')
  return contenido.includes(texto)
}

function horaCorta(fechaIso: string): string {
  const fecha = new Date(fechaIso)
  return FORMATO_DIA.format(fecha) === FORMATO_DIA.format(new Date())
    ? FORMATO_HORA.format(fecha)
    : FORMATO_DIA.format(fecha)
}

function fechaCorta(fechaIso: string): string {
  return FORMATO_FECHA_HORA.format(new Date(fechaIso))
}

function textoEspera(fecha: string | null): string {
  if (fecha === null) return 'Sin dato de espera'
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 60_000))
  if (minutos < 1) return 'Menos de 1 min'
  if (minutos < 60) return `${minutos} min de espera`
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min de espera`
}

export default function BandejaAtencion({ modulo }: { modulo: Modulo }) {
  const [casos, setCasos] = useState<CasoBandeja[] | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const [detalle, setDetalle] = useState<DetalleCasoBandeja | null>(null)
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)

  useEffect(() => {
    let vigente = true
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let controlador: AbortController | null = null

    async function actualizar() {
      clearTimeout(temporizador)
      if (document.hidden) return

      controlador?.abort()
      const propio = new AbortController()
      controlador = propio

      try {
        const pagina = await listarBandeja(
          { limit: LIMITE_PAGINA, offset: 0 },
          propio.signal,
        )
        if (!vigente || propio.signal.aborted) return
        setCasos(pagina.items)
        setError(null)
        setSeleccionado((actual) => (
          actual !== null && pagina.items.some((caso) => caso.caseId === actual)
            ? actual
            : null
        ))
      } catch (errorDeCarga) {
        if (!vigente || propio.signal.aborted) return
        setError(errorDeCarga instanceof Error ? errorDeCarga.message : 'No se pudo cargar la bandeja.')
      }

      if (vigente && !document.hidden) {
        temporizador = setTimeout(() => void actualizar(), INTERVALO_ACTUALIZACION_MS)
      }
    }

    function alCambiarVisibilidad() {
      if (document.hidden) {
        clearTimeout(temporizador)
        controlador?.abort()
      } else {
        void actualizar()
      }
    }

    void actualizar()
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      vigente = false
      clearTimeout(temporizador)
      controlador?.abort()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [reintento])

  useEffect(() => {
    if (seleccionado === null) return undefined

    const controlador = new AbortController()
    let vigente = true
    void obtenerCasoBandeja(seleccionado, controlador.signal)
      .then((respuesta) => {
        if (!vigente || controlador.signal.aborted) return
        setDetalle(respuesta)
        setErrorDetalle(null)
      })
      .catch((errorDeCarga: unknown) => {
        if (!vigente || controlador.signal.aborted) return
        setErrorDetalle(errorDeCarga instanceof Error
          ? errorDeCarga.message
          : 'No se pudo cargar la conversación.')
      })

    return () => {
      vigente = false
      controlador.abort()
    }
  }, [seleccionado])

  const textoBusqueda = busqueda.trim().toLocaleLowerCase('es-AR')
  const casosVisibles = (casos ?? []).filter((caso) => coincideConBusqueda(caso, textoBusqueda))
  const casoSeleccionado = casos?.find((caso) => caso.caseId === seleccionado) ?? null

  return (
    <div className="pagina pagina--bandeja">
      <div className="bandeja-layout">
        <aside className="bandeja__lista" aria-label="Lista de conversaciones">
          <header className="bandeja__lista-cabecera">
            <h1 className="bandeja__titulo">{modulo.nombre}</h1>
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
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
              />
            </div>
          </header>

          <div className="bandeja__lista-contenido">
            {error !== null && (
              <div className="bandeja__estado" role="alert">
                <p>No se pudo actualizar la bandeja: {error}</p>
                <button
                  type="button"
                  className="boton"
                  onClick={() => setReintento((anterior) => anterior + 1)}
                >
                  Reintentar
                </button>
              </div>
            )}

            {casos === null ? (
              <p className="bandeja__lista-vacia" role="status">
                {error === null ? 'Cargando conversaciones...' : 'No se pudo cargar la bandeja.'}
              </p>
            ) : casosVisibles.length === 0 ? (
              <p className="bandeja__lista-vacia" role="status">
                {casos.length === 0
                  ? 'No hay conversaciones para mostrar.'
                  : 'No hay conversaciones que coincidan con la búsqueda.'}
              </p>
            ) : (
              <ul className="bandeja__casos" aria-label="Conversaciones disponibles">
                {casosVisibles.map((caso) => {
                  const estado = estiloEstado(caso)
                  return (
                    <li key={caso.caseId}>
                      <button
                        type="button"
                        className="tarjeta-caso"
                        aria-current={seleccionado === caso.caseId ? 'true' : undefined}
                        onClick={() => {
                          setSeleccionado(caso.caseId)
                          setDetalle(null)
                          setErrorDetalle(null)
                        }}
                      >
                        <span
                          className={`avatar tarjeta-caso__avatar tarjeta-caso__avatar--${estado.estilo}${caso.customer === null ? ' avatar--sin-identificar' : ''}`}
                          aria-hidden="true"
                        >
                          {inicialDelCaso(caso)}
                        </span>
                        <span className="tarjeta-caso__cuerpo">
                          <span className="tarjeta-caso__fila">
                            <span className="tarjeta-caso__nombre">
                              {caso.customer === null ? `Sin identificar · ${caso.phone}` : nombreDelCaso(caso)}
                            </span>
                            {caso.lastMessage && (
                              <time className="tarjeta-caso__hora" dateTime={caso.lastMessage.at}>
                                {horaCorta(caso.lastMessage.at)}
                              </time>
                            )}
                          </span>
                          <span className="tarjeta-caso__vista">
                            {caso.lastMessage
                              ? `${ORIGENES[caso.lastMessage.origin]}: ${caso.lastMessage.text}`
                              : 'Sin mensajes'}
                          </span>
                          <span className="tarjeta-caso__chips">
                            <span className={`tarjeta-caso__badge tarjeta-caso__badge--${estado.estilo}`}>
                              {estado.texto}
                            </span>
                            {caso.takenAt === null && (
                              <span className="tarjeta-caso__badge tarjeta-caso__badge--nuevo">Nuevo</span>
                            )}
                            {caso.label && <span className="chip chip--alerta">{ETIQUETAS[caso.label]}</span>}
                          </span>
                          <span className="tarjeta-caso__pie">
                            <span>{caso.queryType ?? 'Sin tipo'} · {caso.assignee?.name ?? 'Sin tomar'}</span>
                            <span>{textoEspera(caso.waitingSince)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className="bandeja__chat" aria-label="Panel de conversación">
          {casoSeleccionado === null ? (
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
                nombre={nombreDelCaso(casoSeleccionado)}
                vehiculo=""
                patente=""
                previsualizacion={false}
              />
              <div className="bandeja__chat-cuerpo" aria-label="Mensajes de la conversación">
                {errorDetalle !== null ? (
                  <p className="conversacion__estado" role="alert">{errorDetalle}</p>
                ) : detalle === null ? (
                  <p className="conversacion__estado" role="status">Cargando conversación...</p>
                ) : detalle.messages.length === 0 ? (
                  <p className="conversacion__estado" role="status">Esta conversación todavía no tiene mensajes.</p>
                ) : (
                  <ol className="hilo">
                    {detalle.messages.map((mensaje) => (
                      <li
                        key={mensaje.id}
                        className={`hilo__mensaje hilo__mensaje--${mensaje.origin}${mensaje.inCase ? '' : ' hilo__mensaje--otro-caso'}`}
                      >
                        <p className="hilo__texto">{mensaje.text}</p>
                        {mensaje.hasImage && (
                          <p className="hilo__imagen-aviso">El cliente adjuntó una imagen.</p>
                        )}
                        <div className="hilo__meta">
                          <span className="hilo__origen">
                            {mensaje.origin === 'operador' && mensaje.author
                              ? `Operador · ${mensaje.author.name}`
                              : ORIGENES[mensaje.origin]}
                          </span>
                          <time dateTime={mensaje.at}>{fechaCorta(mensaje.at)}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}