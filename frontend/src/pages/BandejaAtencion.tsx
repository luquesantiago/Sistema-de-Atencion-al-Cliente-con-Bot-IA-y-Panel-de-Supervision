import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Modulo } from '../navigation'
import EstadoPanel from '../components/EstadoPanel'
import { IconoAlerta, IconoInfo, IconoReloj } from '../components/iconos'
import {
  listarBandeja,
  obtenerCasoBandeja,
  type CasoBandeja,
  type DetalleCasoBandeja,
  type EtiquetaBandeja,
  type Gravedad,
  type OrigenMensaje,
} from '../api/bandeja'
import { ErrorDeApi } from '../api/respuesta'

const LIMITE_PAGINA = 25
// La bandeja se actualiza sola (decisión 6 del change bandeja-atencion-lectura).
const INTERVALO_ACTUALIZACION_MS = 5000

// Los cuatro niveles del DER más «Sin nivel». Se distinguen por texto e ícono, no solo por
// color: crítico es el único chip relleno.
const GRAVEDADES: Record<Gravedad | 'sin-nivel', { texto: string; clase: string; Icono: typeof IconoAlerta | null }> = {
  crítico: { texto: 'Crítico', clase: 'chip chip--riesgo-fuerte', Icono: IconoAlerta },
  alto: { texto: 'Alto', clase: 'chip chip--riesgo', Icono: IconoAlerta },
  medio: { texto: 'Medio', clase: 'chip chip--alerta', Icono: IconoReloj },
  bajo: { texto: 'Bajo', clase: 'chip chip--neutro', Icono: IconoInfo },
  'sin-nivel': { texto: 'Sin nivel', clase: 'chip chip--neutro chip--sin-nivel', Icono: null },
}

const ETIQUETAS: Record<EtiquetaBandeja, string> = {
  'alta-pendiente': 'Alta pendiente · se decide en Trámites',
  'pedido-pendiente': 'Pedido pendiente de aprobación',
  'cambio-telefono-pendiente': 'Cambio de teléfono pendiente · se decide en Trámites',
}

const ORIGENES: Record<OrigenMensaje, string> = {
  cliente: 'Cliente',
  asistente: 'Asistente',
  operador: 'Operador',
}

// Las fechas llegan en UTC y se muestran en hora argentina.
const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const formatoHora = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function fechaHora(iso: string): string {
  return formatoFecha.format(new Date(iso))
}

// «1 h 20 min», contra la hora de la última actualización.
function espera(desde: string | null, ahora: Date): string {
  if (desde === null) return 'Sin dato'
  const minutos = Math.max(0, Math.floor((ahora.getTime() - new Date(desde).getTime()) / 60_000))
  if (minutos < 1) return 'Menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas} h ${minutos % 60} min`
  return `${Math.floor(horas / 24)} d ${horas % 24} h`
}

function nombreDelCaso(caso: CasoBandeja): string {
  if (caso.customer === null) return 'Sin identificar'
  return caso.customer.name ?? 'Cliente sin nombre cargado'
}

function mensajeDeError(error: unknown, textoPorDefecto: string): string {
  return error instanceof Error ? error.message : textoPorDefecto
}

function ChipGravedad({ gravedad }: { gravedad: Gravedad | null }) {
  const { texto, clase, Icono } = GRAVEDADES[gravedad ?? 'sin-nivel']
  return (
    <span className={clase}>
      {Icono ? <Icono className="chip__icono" /> : null}
      {texto}
    </span>
  )
}

function ChipEtiqueta({ etiqueta }: { etiqueta: EtiquetaBandeja | null }) {
  if (etiqueta === null) return null
  return (
    <span className="chip chip--alerta">
      <IconoReloj className="chip__icono" />
      {ETIQUETAS[etiqueta]}
    </span>
  )
}

const formatoDia = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
})

const formatoSoloHora = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
})

// En la tarjeta: la hora si el mensaje es de hoy (en Argentina), si no el día.
function horaCorta(iso: string, ahora: Date): string {
  const fecha = new Date(iso)
  return formatoDia.format(fecha) === formatoDia.format(ahora) ? formatoSoloHora.format(fecha) : formatoDia.format(fecha)
}

function inicial(caso: CasoBandeja): string {
  const nombre = caso.customer?.name?.trim()
  return nombre ? nombre.charAt(0).toUpperCase() : '?'
}

// Documento y teléfono debajo del nombre; sin cliente identificado, solo el teléfono.
function subtituloDelCaso(caso: CasoBandeja): string {
  if (caso.customer === null) return `Teléfono ${caso.phone} · nadie se identificó en la conversación`
  return `${caso.customer.document ?? 'Sin documento'} · Teléfono ${caso.phone}`
}

export default function BandejaAtencion({ modulo }: { modulo: Modulo }) {
  const [offset, setOffset] = useState(0)
  const [casos, setCasos] = useState<CasoBandeja[] | null>(null)
  const [total, setTotal] = useState(0)
  const [errorInicial, setErrorInicial] = useState<string | null>(null)
  const [fallaActualizacion, setFallaActualizacion] = useState(false)
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const [detalle, setDetalle] = useState<DetalleCasoBandeja | null>(null)
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null)
  const [fueraDeBandeja, setFueraDeBandeja] = useState(false)
  const [reintento, setReintento] = useState(0)

  // Sondeo cada 5 segundos: la siguiente consulta se programa al terminar la anterior, así
  // nunca se superponen; con la pestaña oculta no consulta y al volver consulta enseguida.
  useEffect(() => {
    let activo = true
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let controlador: AbortController | null = null

    async function actualizar() {
      clearTimeout(temporizador)
      if (document.hidden) return
      controlador?.abort()
      const propio = new AbortController()
      controlador = propio
      const [lista, caso] = await Promise.allSettled([
        listarBandeja({ limit: LIMITE_PAGINA, offset }, propio.signal),
        seleccionado === null ? Promise.resolve(null) : obtenerCasoBandeja(seleccionado, propio.signal),
      ])
      if (!activo || propio.signal.aborted) return

      if (lista.status === 'fulfilled') {
        setCasos(lista.value.items)
        setTotal(lista.value.total)
        setErrorInicial(null)
        setFallaActualizacion(false)
        setActualizado(new Date())
      } else {
        // Con datos en pantalla se conservan; sin datos, se muestra el error.
        setFallaActualizacion(true)
        setErrorInicial(mensajeDeError(lista.reason, 'No se pudo consultar la bandeja.'))
      }

      if (caso.status === 'fulfilled') {
        if (caso.value !== null) {
          setDetalle(caso.value)
          setFueraDeBandeja(false)
          setErrorDetalle(null)
        }
      } else if (caso.reason instanceof ErrorDeApi && caso.reason.status === 404) {
        setFueraDeBandeja(true)
      } else {
        setErrorDetalle(mensajeDeError(caso.reason, 'No se pudo cargar la conversación.'))
      }

      if (!document.hidden) temporizador = setTimeout(() => void actualizar(), INTERVALO_ACTUALIZACION_MS)
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
      activo = false
      clearTimeout(temporizador)
      controlador?.abort()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [offset, seleccionado, reintento])

  const elegir = useCallback((caseId: number) => {
    setSeleccionado(caseId)
    setDetalle(null)
    setErrorDetalle(null)
    setFueraDeBandeja(false)
  }, [])

  const cerrarDetalle = useCallback(() => {
    setSeleccionado(null)
    setDetalle(null)
    setErrorDetalle(null)
    setFueraDeBandeja(false)
  }, [])

  const ahora = actualizado ?? new Date()
  const detalleActual = detalle !== null && detalle.case.caseId === seleccionado ? detalle : null
  const casoDeLista = seleccionado === null ? null : casos?.find((caso) => caso.caseId === seleccionado) ?? null
  const casoDelDetalle = detalleActual?.case ?? casoDeLista

  function contenidoDeLaLista(): ReactNode {
    if (casos === null) {
      if (errorInicial !== null) {
        return (
          <div className="bandeja__estado">
            <EstadoPanel
              tono="riesgo"
              titulo="No se pudo cargar la bandeja"
              descripcion={errorInicial}
              acciones={
                <button type="button" className="boton boton--primario" onClick={() => setReintento((valor) => valor + 1)}>
                  Reintentar
                </button>
              }
            />
          </div>
        )
      }
      return (
        <div className="bandeja__estado">
          <EstadoPanel titulo="Cargando la bandeja…" descripcion="Consultando los casos derivados y pendientes." />
        </div>
      )
    }
    if (casos.length === 0) {
      return (
        <div className="bandeja__estado">
          <EstadoPanel
            titulo="No hay casos para atender"
            descripcion="Cuando el asistente derive una consulta o quede algo pendiente de aprobación, el caso aparece acá. La bandeja se actualiza sola."
          />
        </div>
      )
    }

    return (
      <ul className="bandeja__casos" aria-label="Casos, del más grave al menos grave">
        {casos.map((caso) => (
          <li key={caso.caseId}>
            <button
              type="button"
              className="tarjeta-caso"
              aria-current={seleccionado === caso.caseId ? 'true' : undefined}
              onClick={() => elegir(caso.caseId)}
            >
              <span className={`avatar${caso.customer === null ? ' avatar--sin-identificar' : ''}`} aria-hidden="true">
                {inicial(caso)}
              </span>
              <span className="tarjeta-caso__cuerpo">
                <span className="tarjeta-caso__fila">
                  <span className="tarjeta-caso__nombre">
                    {caso.customer === null ? `Sin identificar · ${caso.phone}` : nombreDelCaso(caso)}
                  </span>
                  {caso.lastMessage ? (
                    <span className="tarjeta-caso__hora">{horaCorta(caso.lastMessage.at, ahora)}</span>
                  ) : null}
                </span>
                <span className="tarjeta-caso__vista">
                  {caso.lastMessage
                    ? `${ORIGENES[caso.lastMessage.origin]}: ${caso.lastMessage.text}`
                    : 'Sin mensajes'}
                </span>
                <span className="tarjeta-caso__chips">
                  <ChipGravedad gravedad={caso.severity} />
                  <ChipEtiqueta etiqueta={caso.label} />
                </span>
                <span className="tarjeta-caso__pie">
                  <span>
                    {caso.queryType ?? 'Sin tipo'} ·{' '}
                    {caso.assignee ? caso.assignee.name : <span className="bandeja__sin-tomar">Sin tomar</span>}
                  </span>
                  <span>Espera {espera(caso.waitingSince, ahora)}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  function contenidoDeLaConversacion(): ReactNode {
    if (seleccionado === null) {
      return (
        <div className="conversacion__vacia">
          <EstadoPanel
            titulo="Elegí un caso para ver la conversación"
            descripcion="Se muestra completa, con lo que escribió el cliente y lo que le respondió el asistente, en hora argentina."
          />
        </div>
      )
    }

    const caso = casoDelDetalle
    const franjaDeRiesgo = caso?.severity === 'crítico' || caso?.severity === 'alto'
    return (
      <>
        <header className="conversacion__encabezado">
          <button type="button" className="boton conversacion__volver" onClick={cerrarDetalle}>
            Volver a la lista
          </button>
          {caso ? (
            <span className={`avatar${caso.customer === null ? ' avatar--sin-identificar' : ''}`} aria-hidden="true">
              {inicial(caso)}
            </span>
          ) : null}
          <div className="conversacion__datos">
            <h2 className="conversacion__nombre">{caso ? nombreDelCaso(caso) : `Caso ${seleccionado}`}</h2>
            {caso ? <p className="conversacion__sub">{subtituloDelCaso(caso)}</p> : null}
          </div>
          {/* Oculta la conversación; no cierra el caso (eso llega con el change de acciones). */}
          <button type="button" className="detalle-panel__cerrar" onClick={cerrarDetalle}>
            Ocultar
          </button>
        </header>

        {caso ? (
          <div className={`conversacion__franja${franjaDeRiesgo ? ' conversacion__franja--riesgo' : ''}`}>
            <ChipGravedad gravedad={caso.severity} />
            <ChipEtiqueta etiqueta={caso.label} />
            <span className="conversacion__dato">
              Consulta: <strong>{caso.queryType ?? 'Sin tipo'}</strong>
            </span>
            {caso.handoffReason ? (
              <span className="conversacion__dato">
                Motivo: <strong>{caso.handoffReason}</strong>
              </span>
            ) : null}
            <span className="conversacion__dato">
              Responsable:{' '}
              {caso.assignee ? <strong>{caso.assignee.name}</strong> : <span className="bandeja__sin-tomar">Sin tomar</span>}
            </span>
            <span className="conversacion__dato">
              Espera: <strong>{espera(caso.waitingSince, ahora)}</strong>
              {caso.waitingSince ? ` (desde ${fechaHora(caso.waitingSince)})` : ''}
            </span>
          </div>
        ) : null}

        {fueraDeBandeja ? (
          <p className="bandeja__aviso" role="status">
            Este caso ya no está en la bandeja: se cerró o ya no tiene nada pendiente.
            {detalleActual ? ' Se muestra la última conversación cargada.' : ''}
          </p>
        ) : null}

        {errorDetalle !== null && detalleActual === null ? (
          <p className="conversacion__estado detalle-panel__aviso detalle-panel__aviso--riesgo" role="alert">
            {errorDetalle}
          </p>
        ) : detalleActual === null ? (
          fueraDeBandeja ? null : (
            <p className="conversacion__estado detalle-panel__aviso" role="status">
              Cargando la conversación…
            </p>
          )
        ) : detalleActual.messages.length === 0 ? (
          <p className="conversacion__estado detalle-panel__aviso">La conversación no tiene mensajes guardados.</p>
        ) : (
          <ol className="hilo" aria-label="Mensajes de la conversación, del más viejo al más nuevo">
            {detalleActual.messages.map((mensaje) => (
              <li
                key={mensaje.id}
                className={`hilo__mensaje hilo__mensaje--${mensaje.origin}${mensaje.inCase ? '' : ' hilo__mensaje--otro-caso'}`}
              >
                <p className="hilo__texto">{mensaje.text}</p>
                <div className="hilo__meta">
                  <span className="hilo__origen">{ORIGENES[mensaje.origin]}</span>
                  <span>{fechaHora(mensaje.at)}</span>
                  <span>{mensaje.inCase ? 'Este caso' : `Otro caso (${mensaje.caseId})`}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </>
    )
  }

  const desde = offset + 1
  const hasta = offset + (casos?.length ?? 0)
  return (
    <div className={`bandeja${seleccionado !== null ? ' bandeja--con-caso' : ''}`}>
      <section className="bandeja__lista" aria-busy={casos === null} aria-labelledby="bandeja-titulo">
        <header className="bandeja__lista-encabezado">
          <h1 className="bandeja__titulo" id="bandeja-titulo">
            {modulo.nombre}
          </h1>
          <p className="bandeja__resumen">
            {casos === null || casos.length === 0 ? 'Sin casos' : `${desde}–${hasta} de ${total} casos`}
            {actualizado ? ` · actualizada a las ${formatoHora.format(actualizado)}` : ''}
          </p>
        </header>

        {fallaActualizacion && casos !== null ? (
          <p className="bandeja__aviso" role="status">
            No se pudo actualizar. Se muestran los últimos datos; se vuelve a intentar solo.
          </p>
        ) : null}

        {contenidoDeLaLista()}

        {total > LIMITE_PAGINA ? (
          <div className="bandeja__paginas">
            <button
              type="button"
              className="boton"
              disabled={offset === 0}
              onClick={() => setOffset((valor) => Math.max(0, valor - LIMITE_PAGINA))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="boton"
              disabled={hasta >= total}
              onClick={() => setOffset((valor) => valor + LIMITE_PAGINA)}
            >
              Siguiente
            </button>
          </div>
        ) : null}
      </section>

      <section className="conversacion" aria-label="Conversación del caso">
        {contenidoDeLaConversacion()}
      </section>
    </div>
  )
}
