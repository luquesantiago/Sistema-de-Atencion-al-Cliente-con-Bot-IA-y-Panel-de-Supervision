import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { Modulo } from '../navigation'
import EstadoPanel from '../components/EstadoPanel'
import { IconoAlerta, IconoInfo, IconoPausa, IconoReanudar, IconoReloj } from '../components/iconos'
import {
  cerrarCaso,
  contestarCaso,
  liberarCaso,
  listarBandeja,
  obtenerCasoBandeja,
  obtenerImagenMensaje,
  tomarCaso,
  type AlertaBandeja,
  type CasoBandeja,
  type DetalleCasoBandeja,
  type MensajeBandeja,
  type OrigenMensaje,
} from '../api/bandeja'
import { ErrorDeApi } from '../api/respuesta'

const LIMITE_PAGINA = 25
// La bandeja se actualiza sola (decisión 6 del change bandeja-atencion-lectura).
const INTERVALO_ACTUALIZACION_MS = 5000
// El mismo tope que valida el backend (change bandeja-atender-casos, decisión 2).
const LARGO_MAXIMO_RESPUESTA = 4096
const LARGO_MINIMO_MOTIVO = 3
const LARGO_MAXIMO_MOTIVO = 2000

type Prioridad = 'critico' | 'medio' | 'bajo'

const BADGES_PRIORIDAD: Record<Prioridad, { clase: string; Icono: typeof IconoAlerta }> = {
  critico: { clase: 'badge-prioridad badge-prioridad--critico', Icono: IconoAlerta },
  medio: { clase: 'badge-prioridad badge-prioridad--medio', Icono: IconoReloj },
  bajo: { clase: 'badge-prioridad badge-prioridad--bajo', Icono: IconoInfo },
}

const BANNERS_ALERTA: Record<Prioridad, string> = {
  critico: 'alerta-banner alerta-banner--critico',
  medio: 'alerta-banner alerta-banner--revision',
  bajo: 'alerta-banner alerta-banner--resuelto',
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

function fechaHora(iso: string): string {
  return formatoFecha.format(new Date(iso))
}

function nombreDelCaso(caso: CasoBandeja): string {
  if (caso.customer === null) return 'Sin identificar'
  return caso.customer.name ?? 'Cliente sin nombre cargado'
}

function mensajeDeError(error: unknown, textoPorDefecto: string): string {
  return error instanceof Error ? error.message : textoPorDefecto
}

// Búsqueda simple: sin distinguir mayúsculas ni tildes.
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

// El caso todavía no expone la patente de forma directa. Si el dato llega como
// `plate`/`domain` (o dentro de `vehicle`), se usa; si no, queda null.
function patenteEstructurada(caso: CasoBandeja): string | null {
  const patentes: unknown[] = []
  if ('plate' in caso) patentes.push(caso.plate)
  if ('domain' in caso) patentes.push(caso.domain)
  if ('vehicle' in caso && typeof caso.vehicle === 'object' && caso.vehicle !== null) {
    if ('plate' in caso.vehicle) patentes.push(caso.vehicle.plate)
    if ('domain' in caso.vehicle) patentes.push(caso.vehicle.domain)
  }
  const patente = patentes.find((valor): valor is string => typeof valor === 'string' && valor.trim() !== '')
  return patente?.trim() ?? null
}

// Búsqueda por patente: el dato estructurado si existe, y también el texto del
// caso, donde puede aparecer junto con la consulta.
function patenteDelCaso(caso: CasoBandeja): string {
  return [patenteEstructurada(caso), caso.lastMessage?.text, caso.handoffReason]
    .filter((valor): valor is string => typeof valor === 'string')
    .join(' ')
}

// Lo que se puede buscar de un caso: teléfono, nombre del cliente y patente.
function textoDelCaso(caso: CasoBandeja): string {
  return normalizarTexto([caso.phone, caso.customer?.name ?? '', patenteDelCaso(caso)].join(' '))
}

// Prioridad visible de la tarjeta. Respeta los cuatro niveles del DER: el color
// agrupa, pero el texto sigue distinguiendo «Crítico» de «Alto».
function prioridadDelCaso(caso: CasoBandeja): { prioridad: Prioridad; texto: string } {
  if (caso.severity === 'crítico') return { prioridad: 'critico', texto: 'Crítico' }
  if (caso.severity === 'alto') return { prioridad: 'critico', texto: 'Alto' }
  if (caso.label === 'alta-rechazada') return { prioridad: 'medio', texto: 'Revisión' }
  if (caso.label !== null) return { prioridad: 'medio', texto: 'Pendiente' }
  const prioridad: Prioridad = caso.severity === 'medio' ? 'medio' : 'bajo'
  if (caso.queryType === 'baja') return { prioridad, texto: 'Baja' }
  if (caso.queryType === 'vencimiento') return { prioridad, texto: 'Vencimientos' }
  if (caso.severity === 'medio') return { prioridad, texto: 'Medio' }
  if (caso.severity === 'bajo') return { prioridad, texto: 'Bajo' }
  return { prioridad, texto: 'Sin nivel' }
}

function BadgePrioridad({ caso }: { caso: CasoBandeja }) {
  const { prioridad, texto } = prioridadDelCaso(caso)
  const { clase, Icono } = BADGES_PRIORIDAD[prioridad]
  return (
    <span className={clase}>
      <Icono className="badge-prioridad__icono" />
      {texto}
    </span>
  )
}

function detalleAlerta(caso: CasoBandeja): string {
  switch (caso.label) {
    case 'alta-pendiente':
      return 'Alta pendiente de aprobación'
    case 'alta-rechazada':
      return 'Alta rechazada: avisar al cliente'
    case 'pedido-pendiente':
      return 'Pedido pendiente de aprobación'
    case 'cambio-telefono-pendiente':
      return 'Cambio de teléfono pendiente de aprobación'
  }
  switch (caso.queryType) {
    case 'siniestro':
      return 'Siniestro pendiente de revisión'
    case 'reclamo':
      return 'Reclamo pendiente de revisión'
    case 'baja':
      return 'Baja pendiente de aprobación'
    case 'modificación':
      return 'Modificación pendiente de aprobación'
    case 'cotización':
      return 'Cotización pendiente de revisión'
    case 'cobertura':
      return 'Consulta de cobertura pendiente de revisión'
    case 'vencimiento':
      return 'Vencimiento pendiente de seguimiento'
    default:
      return caso.severity === 'crítico'
        ? 'Caso crítico'
        : caso.severity === 'alto'
          ? 'Caso de prioridad alta'
          : caso.severity === 'medio'
            ? 'Caso de prioridad media'
            : 'Caso en seguimiento'
  }
}

// El banner muestra solo el mensaje dinámico; el color sale de la prioridad.
function mensajeAlerta(caso: CasoBandeja, alertas: AlertaBandeja[]): { clase: string; texto: string } {
  const { prioridad } = prioridadDelCaso(caso)
  const prefijo = prioridad === 'critico' ? 'Atención' : prioridad === 'medio' ? 'Revisión' : 'Seguimiento'
  const pendientes =
    alertas.length > 0
      ? ` · ${alertas.length} ${alertas.length === 1 ? 'alerta sin atender' : 'alertas sin atender'}`
      : ''
  return { clase: BANNERS_ALERTA[prioridad], texto: `${prefijo}: ${detalleAlerta(caso)}${pendientes}` }
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

// Documento, teléfono y patente (si el caso la trae) debajo del nombre.
function subtituloDelCaso(caso: CasoBandeja): string {
  const patente = patenteEstructurada(caso)
  const telefono = `Teléfono ${caso.phone}${patente ? ` · Patente ${patente}` : ''}`
  if (caso.customer === null) return `${telefono} · nadie se identificó en la conversación`
  return `${caso.customer.document ?? 'Sin documento'} · ${telefono}`
}

// El caso de un alta (pendiente o rechazada) pide un motivo para cerrarse.
function pideMotivo(caso: CasoBandeja): boolean {
  return caso.label === 'alta-pendiente' || caso.label === 'alta-rechazada'
}

// Por qué no se puede cerrar, o null si quien usa el panel puede cerrarlo.
function motivoSinCierre(caso: CasoBandeja): string | null {
  if (!caso.handedOff) return 'Se decide en Trámites'
  if (caso.assignee !== null && !caso.assignedToMe) return `Lo tiene ${caso.assignee.name}: solo su responsable lo cierra`
  if (!caso.assignedToMe) return 'Intervení el caso para cerrarlo'
  return null
}

type Aviso = { tono: 'exito' | 'alerta' | 'riesgo'; texto: string }

function AvisoAccion({ aviso }: { aviso: Aviso | null }) {
  if (aviso === null) return null
  return (
    <p className={`aviso-accion aviso-accion--${aviso.tono}`} role={aviso.tono === 'riesgo' ? 'alert' : 'status'}>
      {aviso.texto}
    </p>
  )
}

/**
 * La imagen que mandó el cliente: se pide a WhatsApp solo cuando el usuario la quiere ver,
 * no se vuelve a pedir en cada actualización y la URL se libera al salir (decisión 9).
 */
function ImagenDelMensaje({ idCaso, idMensaje }: { idCaso: number; idMensaje: number }) {
  const [estado, setEstado] = useState<'inicial' | 'cargando' | 'no-disponible' | 'error' | { url: string }>('inicial')
  const controlador = useRef<AbortController | null>(null)

  useEffect(() => () => controlador.current?.abort(), [])
  useEffect(() => {
    if (typeof estado !== 'object') return undefined
    return () => URL.revokeObjectURL(estado.url)
  }, [estado])

  async function ver() {
    controlador.current?.abort()
    const propio = new AbortController()
    controlador.current = propio
    setEstado('cargando')
    try {
      const imagen = await obtenerImagenMensaje(idCaso, idMensaje, propio.signal)
      if (propio.signal.aborted) return
      setEstado(imagen === null ? 'no-disponible' : { url: URL.createObjectURL(imagen) })
    } catch {
      if (!propio.signal.aborted) setEstado('error')
    }
  }

  if (typeof estado === 'object') {
    return <img className="hilo__imagen" src={estado.url} alt="Imagen que envió el cliente por WhatsApp" />
  }
  if (estado === 'no-disponible') return <p className="hilo__imagen-aviso">La imagen ya no está disponible.</p>
  return (
    <div className="hilo__imagen-acciones">
      <button type="button" className="boton boton--chico" onClick={() => void ver()} disabled={estado === 'cargando'}>
        {estado === 'cargando' ? 'Trayendo la imagen…' : 'Ver imagen'}
      </button>
      {estado === 'error' ? <span className="hilo__imagen-aviso">No se pudo traer la imagen. Probá de nuevo.</span> : null}
    </div>
  )
}

function MensajeDelHilo({ mensaje, idCaso }: { mensaje: MensajeBandeja; idCaso: number }) {
  const esCliente = mensaje.origin === 'cliente'
  const origen = mensaje.origin === 'operador' && mensaje.author ? `Operador · ${mensaje.author.name}` : ORIGENES[mensaje.origin]
  return (
    <li className={`mensaje-container ${esCliente ? 'cliente' : 'agente'}${mensaje.inCase ? '' : ' mensaje-container--otro-caso'}`}>
      <div className="mensaje-bubble">
        <p className="hilo__texto">{mensaje.text}</p>
        {mensaje.hasImage ? <ImagenDelMensaje idCaso={idCaso} idMensaje={mensaje.id} /> : null}
        <div className="hilo__meta">
          <span className="hilo__origen">{origen}</span>
          <span>{fechaHora(mensaje.at)}</span>
          <span>{mensaje.inCase ? 'Este caso' : `Otro caso (${mensaje.caseId})`}</span>
        </div>
      </div>
    </li>
  )
}

/** Caja para contestarle al cliente: solo en casos derivados (el asistente está en silencio). */
function CajaRespuesta({
  caso,
  borrador,
  ocupado,
  onCambiar,
  onEnviar,
}: {
  caso: CasoBandeja
  borrador: string
  ocupado: boolean
  onCambiar: (texto: string) => void
  onEnviar: () => void
}) {
  const id = useId()
  const deOtro = !caso.assignedToMe && caso.assignee !== null
  const texto = borrador.trim()
  const deshabilitado = deOtro || ocupado

  function alEnviar(evento: FormEvent) {
    evento.preventDefault()
    if (!deshabilitado && texto.length > 0) onEnviar()
  }

  function alTeclear(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.nativeEvent.isComposing) {
      evento.preventDefault()
      if (!deshabilitado && texto.length > 0) onEnviar()
    }
  }

  return (
    <form className="respuesta" onSubmit={alEnviar}>
      <textarea
        id={`${id}-texto`}
        className="respuesta__texto"
        rows={1}
        maxLength={LARGO_MAXIMO_RESPUESTA}
        value={borrador}
        disabled={deshabilitado}
        aria-label="Respuesta al cliente"
        placeholder={deOtro ? `Lo tiene ${caso.assignee?.name ?? 'otra persona'}: solo su responsable contesta` : 'Escribí una respuesta...'}
        onChange={(evento) => onCambiar(evento.target.value)}
        onKeyDown={alTeclear}
      />
      <button type="submit" className="boton boton--primario" disabled={deshabilitado || texto.length === 0}>
        {ocupado ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  )
}

/**
 * Confirmación del cierre: pide el motivo en los casos de alta. El caso con alertas
 * sin atender se cierra dejándolas atendidas a nombre de quien cierra (RF-SUP-04).
 */
function DialogoCierre({
  caso,
  alertas,
  ocupado,
  error,
  onCancelar,
  onConfirmar,
}: {
  caso: CasoBandeja
  alertas: AlertaBandeja[]
  ocupado: boolean
  error: string | null
  onCancelar: () => void
  onConfirmar: (datos: { motivo?: string; alertasRevisadas?: boolean }) => void
}) {
  const id = useId()
  const dialogo = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState('')
  const conMotivo = pideMotivo(caso)
  const motivoValido = !conMotivo || (motivo.trim().length >= LARGO_MINIMO_MOTIVO && motivo.trim().length <= LARGO_MAXIMO_MOTIVO)

  useEffect(() => {
    const elemento = dialogo.current
    if (elemento && !elemento.open) elemento.showModal()
    return () => elemento?.close()
  }, [])

  function alConfirmar(evento: FormEvent) {
    evento.preventDefault()
    if (!motivoValido || ocupado) return
    onConfirmar({
      ...(conMotivo ? { motivo: motivo.trim() } : {}),
      ...(alertas.length > 0 ? { alertasRevisadas: true } : {}),
    })
  }

  return (
    <dialog
      ref={dialogo}
      className="dialogo"
      aria-labelledby={`${id}-titulo`}
      onCancel={(evento) => {
        evento.preventDefault()
        onCancelar()
      }}
    >
      <form className="dialogo__cuerpo" onSubmit={alConfirmar}>
        <h2 className="dialogo__titulo" id={`${id}-titulo`}>
          Cerrar el caso de {nombreDelCaso(caso)}
        </h2>
        <p className="dialogo__texto">
          El caso sale de la bandeja y el asistente vuelve a atender la conversación cuando el cliente escriba. Al
          cliente no se le envía nada.
        </p>
        {caso.label === 'alta-pendiente' ? (
          <p className="dialogo__texto dialogo__texto--alerta">
            El alta pendiente quedará descartada, sin crear el cliente. Usalo si ya lo cargaste a mano o si el caso se
            derivó por error.
          </p>
        ) : null}

        {conMotivo ? (
          <div className="dialogo__campo">
            <label htmlFor={`${id}-motivo`}>Motivo del cierre (obligatorio)</label>
            <textarea
              id={`${id}-motivo`}
              rows={3}
              maxLength={LARGO_MAXIMO_MOTIVO}
              value={motivo}
              required
              aria-describedby={`${id}-motivo-ayuda`}
              onChange={(evento) => setMotivo(evento.target.value)}
            />
            <p className="dialogo__ayuda" id={`${id}-motivo-ayuda`}>
              Queda anotado en el alta, con quién y cuándo cerró. Entre {LARGO_MINIMO_MOTIVO} y {LARGO_MAXIMO_MOTIVO}{' '}
              caracteres.
            </p>
          </div>
        ) : null}

        {error !== null ? (
          <p className="aviso-accion aviso-accion--riesgo" role="alert">
            {error}
          </p>
        ) : null}

        <div className="dialogo__botones">
          <button type="button" className="boton" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={!motivoValido || ocupado}>
            {ocupado ? 'Cerrando…' : 'Cerrar caso'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default function BandejaAtencion({ modulo }: { modulo: Modulo }) {
  const [offset, setOffset] = useState(0)
  const [casos, setCasos] = useState<CasoBandeja[] | null>(null)
  const [total, setTotal] = useState(0)
  const [errorInicial, setErrorInicial] = useState<string | null>(null)
  const [fallaActualizacion, setFallaActualizacion] = useState(false)
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<number | null>(null)
  const [detalle, setDetalle] = useState<DetalleCasoBandeja | null>(null)
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null)
  const [fueraDeBandeja, setFueraDeBandeja] = useState(false)
  const [reintento, setReintento] = useState(0)
  // Acciones: un borrador por caso (sobrevive al sondeo), lo que está en curso y su resultado.
  const [borradores, setBorradores] = useState<Record<number, string>>({})
  const [accion, setAccion] = useState<'tomar' | 'liberar' | 'contestar' | 'cerrar' | null>(null)
  const [avisoCaso, setAvisoCaso] = useState<Aviso | null>(null)
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null)
  const [dialogoCierre, setDialogoCierre] = useState(false)
  const [errorCierre, setErrorCierre] = useState<string | null>(null)

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

  // Después de cada acción se consulta enseguida, sin esperar al sondeo.
  const refrescar = useCallback(() => setReintento((valor) => valor + 1), [])

  const elegir = useCallback((caseId: number) => {
    setSeleccionado(caseId)
    setDetalle(null)
    setErrorDetalle(null)
    setFueraDeBandeja(false)
    setAvisoCaso(null)
    setDialogoCierre(false)
  }, [])

  const cerrarDetalle = useCallback(() => {
    setSeleccionado(null)
    setDetalle(null)
    setErrorDetalle(null)
    setFueraDeBandeja(false)
    setAvisoCaso(null)
    setDialogoCierre(false)
  }, [])

  const ahora = actualizado ?? new Date()
  const consulta = normalizarTexto(busqueda)
  const casosFiltrados =
    casos === null || consulta === '' ? casos : casos.filter((caso) => textoDelCaso(caso).includes(consulta))
  const detalleActual = detalle !== null && detalle.case.caseId === seleccionado ? detalle : null
  const casoDeLista = seleccionado === null ? null : casos?.find((caso) => caso.caseId === seleccionado) ?? null
  const casoDelDetalle = detalleActual?.case ?? casoDeLista

  async function tomar(caso: CasoBandeja) {
    setAccion('tomar')
    setAvisoCaso(null)
    try {
      await tomarCaso(caso.caseId)
      setAvisoCaso({ tono: 'exito', texto: 'Tomaste el caso: ahora sos el responsable.' })
    } catch (error) {
      setAvisoCaso({ tono: 'riesgo', texto: mensajeDeError(error, 'No se pudo tomar el caso.') })
    } finally {
      setAccion(null)
      refrescar()
    }
  }

  async function liberar(caso: CasoBandeja) {
    setAccion('liberar')
    setAvisoCaso(null)
    try {
      await liberarCaso(caso.caseId)
      setAvisoCaso({
        tono: 'exito',
        texto: caso.handedOff
          ? 'Liberaste el caso: ya no sos el responsable. El asistente sigue sin responder hasta que alguien cierre el caso.'
          : 'Liberaste el caso: ya no sos el responsable.',
      })
    } catch (error) {
      setAvisoCaso({ tono: 'riesgo', texto: mensajeDeError(error, 'No se pudo liberar el caso.') })
    } finally {
      setAccion(null)
      refrescar()
    }
  }

  async function contestar(caso: CasoBandeja) {
    const texto = (borradores[caso.caseId] ?? '').trim()
    if (texto.length === 0) return
    setAccion('contestar')
    setAvisoCaso(null)
    try {
      const resultado = await contestarCaso(caso.caseId, texto)
      // Salió por WhatsApp: el borrador se borra aunque no haya quedado registrado.
      setBorradores((anteriores) => ({ ...anteriores, [caso.caseId]: '' }))
      setAvisoCaso(resultado.saved ? null : { tono: 'alerta', texto: resultado.warning })
    } catch (error) {
      setAvisoCaso({ tono: 'riesgo', texto: mensajeDeError(error, 'No se pudo enviar el mensaje.') })
    } finally {
      setAccion(null)
      refrescar()
    }
  }

  async function cerrar(caso: CasoBandeja, datos: { motivo?: string; alertasRevisadas?: boolean }) {
    setAccion('cerrar')
    setErrorCierre(null)
    try {
      await cerrarCaso(caso.caseId, datos)
      setDialogoCierre(false)
      cerrarDetalle()
      setAvisoLista({
        tono: 'exito',
        texto: `Cerraste el caso de ${nombreDelCaso(caso)}. El asistente vuelve a atender la conversación cuando el cliente escriba.`,
      })
    } catch (error) {
      setErrorCierre(mensajeDeError(error, 'No se pudo cerrar el caso.'))
    } finally {
      setAccion(null)
      refrescar()
    }
  }

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
                <button type="button" className="boton boton--primario" onClick={refrescar}>
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
    if (casosFiltrados !== null && casosFiltrados.length === 0) {
      return (
        <div className="bandeja__estado">
          <EstadoPanel
            titulo="Ningún caso coincide con la búsqueda"
            descripcion="Probá con otro teléfono, nombre o patente. Se buscan los casos de esta página."
          />
        </div>
      )
    }

    return (
      <ul className="bandeja__casos" aria-label="Casos, del más grave al menos grave">
        {(casosFiltrados ?? []).map((caso) => (
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
                  <BadgePrioridad caso={caso} />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  function accionesDelCaso(caso: CasoBandeja): ReactNode {
    const sinCierre = motivoSinCierre(caso)
    return (
      <div className="conversacion__acciones" role="group" aria-label="Acciones del caso">
        {caso.assignedToMe ? (
          <button
            type="button"
            className="conversacion__accion conversacion__accion--activa"
            onClick={() => void liberar(caso)}
            disabled={accion !== null}
            aria-busy={accion === 'liberar'}
            aria-pressed="true"
            title="Dejar el caso sin responsable para que lo tome otra persona"
          >
            <IconoReanudar className="conversacion__accion-icono" />
            {accion === 'liberar' ? 'Liberando…' : 'Liberar caso'}
          </button>
        ) : (
          <button
            type="button"
            className="conversacion__accion conversacion__accion--principal"
            onClick={() => void tomar(caso)}
            disabled={caso.assignee !== null || accion !== null}
            aria-busy={accion === 'tomar'}
            title={caso.assignee ? `Lo tiene ${caso.assignee.name}: tiene que liberarlo antes` : undefined}
          >
            <IconoPausa className="conversacion__accion-icono" />
            {accion === 'tomar' ? 'Interviniendo…' : 'Intervenir'}
          </button>
        )}
        <button
          type="button"
          className="conversacion__accion conversacion__accion--cerrar"
          onClick={() => {
            setErrorCierre(null)
            setDialogoCierre(true)
          }}
          disabled={sinCierre !== null || accion !== null}
          title={sinCierre ?? undefined}
          aria-describedby={sinCierre !== null ? `motivo-sin-cierre-${caso.caseId}` : undefined}
        >
          Cerrar caso
        </button>
        {sinCierre !== null ? (
          <span className="visually-hidden" id={`motivo-sin-cierre-${caso.caseId}`}>
            {sinCierre}
          </span>
        ) : null}
      </div>
    )
  }

  function contenidoDeLaConversacion(): ReactNode {
    if (seleccionado === null) {
      return (
        <div className="conversacion__vacia">
          <EstadoPanel
            titulo="Elegí un caso para ver la conversación"
            descripcion="Se muestra completa, con lo que escribió el cliente y lo que le respondieron el asistente y el equipo, en hora argentina."
          />
        </div>
      )
    }

    const caso = casoDelDetalle
    const alertas = detalleActual?.alerts ?? []
    const alerta = caso ? mensajeAlerta(caso, alertas) : null
    return (
      <>
        <header className="chat-header">
          <div className="chat-header__principal">
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
            {caso && !fueraDeBandeja ? accionesDelCaso(caso) : null}
          </div>

          {alerta ? (
            <p className={alerta.clase} role="status">
              {alerta.texto}
            </p>
          ) : null}
        </header>

        <div className="chat-body">
          <AvisoAccion aviso={avisoCaso} />

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
                <MensajeDelHilo key={mensaje.id} mensaje={mensaje} idCaso={detalleActual.case.caseId} />
              ))}
            </ol>
          )}
        </div>

        {caso && caso.handedOff && !fueraDeBandeja ? (
          <CajaRespuesta
            caso={caso}
            borrador={borradores[caso.caseId] ?? ''}
            ocupado={accion === 'contestar'}
            onCambiar={(texto) => setBorradores((anteriores) => ({ ...anteriores, [caso.caseId]: texto }))}
            onEnviar={() => void contestar(caso)}
          />
        ) : null}

        {caso && dialogoCierre ? (
          <DialogoCierre
            caso={caso}
            alertas={alertas}
            ocupado={accion === 'cerrar'}
            error={errorCierre}
            onCancelar={() => setDialogoCierre(false)}
            onConfirmar={(datos) => void cerrar(caso, datos)}
          />
        ) : null}
      </>
    )
  }

  const hasta = offset + (casos?.length ?? 0)
  return (
    <div className={`bandeja-container${seleccionado !== null ? ' bandeja-container--con-caso' : ''}`}>
      <section className="bandeja-lista-panel" aria-busy={casos === null} aria-labelledby="bandeja-titulo">
        <header className="bandeja__lista-encabezado">
          <h1 className="bandeja__titulo" id="bandeja-titulo">
            {modulo.nombre}
          </h1>
          <div className="bandeja__busqueda">
            <input
              className="bandeja__busqueda-campo"
              type="search"
              autoComplete="off"
              aria-label="Buscar por teléfono, nombre o patente"
              placeholder="Buscar por teléfono, nombre o patente..."
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
          </div>
        </header>

        {fallaActualizacion && casos !== null ? (
          <p className="bandeja__aviso" role="status">
            No se pudo actualizar. Se muestran los últimos datos; se vuelve a intentar solo.
          </p>
        ) : null}

        <AvisoAccion aviso={avisoLista} />

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

      <section className="bandeja-detalle-panel" aria-label="Conversación del caso">
        <div className="conversacion">{contenidoDeLaConversacion()}</div>
      </section>
    </div>
  )
}