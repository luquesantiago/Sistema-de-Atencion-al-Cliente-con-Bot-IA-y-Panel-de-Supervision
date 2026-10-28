import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import type { Modulo, ModuloPanel } from '../navigation'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'
import ConfirmarCambio, { type LineaConfirmacion } from '../components/ConfirmarCambio'
import { IconoAlerta, IconoReloj } from '../components/iconos'
import { ErrorDeApi } from '../api/respuesta'
import { obtenerCasoBandeja, obtenerImagenMensaje } from '../api/bandeja'
import {
  decidirCambioTelefono,
  decidirProspecto,
  listarCambiosTelefono,
  listarProspectos,
  reintentarNotificacion,
  type CambioTelefonoPendiente,
  type DecisionTramite,
  type ProspectoPendiente,
} from '../api/tramites'

const LIMITE_PAGINA = 25
const LARGO_MINIMO_FUNDAMENTO = 3
const LARGO_MAXIMO_FUNDAMENTO = 2000
const LARGO_MAXIMO_NOMBRE = 100

type Seccion = 'prospectos' | 'telefonos'
type TramitePendiente =
  | { tipo: 'prospecto'; fecha: string; prospecto: ProspectoPendiente }
  | { tipo: 'cambio'; fecha: string; cambio: CambioTelefonoPendiente }
type Aviso = {
  tono: 'exito' | 'alerta' | 'riesgo'
  texto: string
  notificacionId?: number
  accion?: {
    etiqueta: string
    onClick: () => void
  }
}

type ConfirmacionProspecto = {
  tipo: 'prospecto'
  decision: DecisionTramite
  prospecto: ProspectoPendiente
  fundamento: string
  nombre: string
  apellido: string
  lineas: LineaConfirmacion[]
}

type ConfirmacionTelefono = {
  tipo: 'telefono'
  decision: DecisionTramite
  cambio: CambioTelefonoPendiente
  fundamento: string
  telefonosADesvincular: number[]
  lineas: LineaConfirmacion[]
}

type Confirmacion = ConfirmacionProspecto | ConfirmacionTelefono

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

function mensajeDeError(error: unknown, textoPorDefecto: string): string {
  return error instanceof Error ? error.message : textoPorDefecto
}

function nombreDeclarado(prospecto: ProspectoPendiente): string {
  return prospecto.name?.trim() || 'Sin nombre declarado'
}

function inicial(nombre: string): string {
  return nombre.trim().charAt(0).toLocaleUpperCase('es-AR') || '?'
}

function dividirNombre(nombre: string | null): { nombre: string; apellido: string } {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return { nombre: '', apellido: '' }
  if (partes.length === 1) return { nombre: partes[0], apellido: '' }
  return { nombre: partes.slice(0, -1).join(' '), apellido: partes[partes.length - 1] }
}

function Telefono({ numero }: { numero: string }) {
  return <span className="tramite__telefono">{numero}</span>
}

function AvisoPanel({
  aviso,
  reintentando,
  onReintentar,
}: {
  aviso: Aviso
  reintentando: boolean
  onReintentar: () => void
}) {
  return (
    <div className={`tramites-aviso tramites-aviso--${aviso.tono}`} role={aviso.tono === 'riesgo' ? 'alert' : 'status'}>
      <span>{aviso.texto}</span>
      {aviso.notificacionId !== undefined ? (
        <button type="button" className="boton boton--chico" onClick={onReintentar} disabled={reintentando}>
          {reintentando ? 'Reintentando…' : 'Reintentar aviso'}
        </button>
      ) : null}
      {aviso.accion !== undefined ? (
        <button type="button" className="boton boton--chico" onClick={aviso.accion.onClick}>
          {aviso.accion.etiqueta}
        </button>
      ) : null}
    </div>
  )
}

function FotoDni({ idCaso }: { idCaso: number }) {
  const [estado, setEstado] = useState<'inicial' | 'cargando' | 'sin-foto' | 'no-disponible' | 'error' | { url: string }>('inicial')

  useEffect(() => {
    if (typeof estado !== 'object') return undefined
    return () => URL.revokeObjectURL(estado.url)
  }, [estado])

  async function verFoto() {
    setEstado('cargando')
    try {
      const detalle = await obtenerCasoBandeja(idCaso)
      const mensaje = detalle.messages.find((item) => item.hasImage && item.inCase) ??
        detalle.messages.find((item) => item.hasImage)
      if (mensaje === undefined) {
        setEstado('sin-foto')
        return
      }
      const imagen = await obtenerImagenMensaje(idCaso, mensaje.id)
      setEstado(imagen === null ? 'no-disponible' : { url: URL.createObjectURL(imagen) })
    } catch {
      setEstado('error')
    }
  }

  if (typeof estado === 'object') {
    return <img className="tramite__foto" src={estado.url} alt="Foto del DNI enviada por la persona" />
  }

  return (
    <div className="tramite__foto-acciones">
      <button type="button" className="boton boton--chico" onClick={() => void verFoto()} disabled={estado === 'cargando'}>
        {estado === 'cargando' ? 'Trayendo la foto…' : 'Ver foto del DNI'}
      </button>
      <span className="tramite__ayuda">
        {estado === 'sin-foto'
          ? 'La conversación no tiene una foto guardada.'
          : estado === 'no-disponible'
            ? 'La imagen ya no está disponible en WhatsApp.'
            : estado === 'error'
              ? 'No se pudo traer la foto. Probá de nuevo.'
              : 'Se pide a WhatsApp en el momento y no se guarda.'}
      </span>
    </div>
  )
}

function DetalleProspecto({
  prospecto,
  ocupado,
  error,
  onAprobar,
  onRechazar,
}: {
  prospecto: ProspectoPendiente
  ocupado: boolean
  error: string | null
  onAprobar: (datos: { nombre: string; apellido: string; fundamento: string }) => void
  onRechazar: (fundamento: string) => void
}) {
  const id = useId()
  const nombreDividido = dividirNombre(prospecto.name)
  const [nombre, setNombre] = useState(nombreDividido.nombre)
  const [apellido, setApellido] = useState(nombreDividido.apellido)
  const [fundamento, setFundamento] = useState('')

  const tieneDni = (prospecto.dni ?? '').trim() !== ''
  const nombreValido = nombre.trim().length > 0 && nombre.trim().length <= LARGO_MAXIMO_NOMBRE
  const apellidoValido = apellido.trim().length > 0 && apellido.trim().length <= LARGO_MAXIMO_NOMBRE
  const fundamentoValido =
    fundamento.trim().length >= LARGO_MINIMO_FUNDAMENTO && fundamento.trim().length <= LARGO_MAXIMO_FUNDAMENTO
  const puedeAprobar = tieneDni && nombreValido && apellidoValido && fundamentoValido && !ocupado

  function alAprobar(evento: FormEvent) {
    evento.preventDefault()
    if (!puedeAprobar) return
    onAprobar({ nombre: nombre.trim(), apellido: apellido.trim(), fundamento: fundamento.trim() })
  }

  return (
    <article className="tramite-detalle">
      <header className="tramite-detalle__cabecera">
        <div className="tramite-detalle__identidad">
          <span className="avatar avatar--grande" aria-hidden="true">{inicial(nombreDeclarado(prospecto))}</span>
          <div>
            <p className="tramite-detalle__tipo">Alta de cliente nuevo</p>
            <h2 className="tramite-detalle__titulo">{nombreDeclarado(prospecto)}</h2>
            <p className="tramite-detalle__subtitulo">Caso {prospecto.caseId} · Solicitado el {fechaHora(prospecto.registeredAt)}</p>
          </div>
        </div>
        <span className="badge badge--warning">
          <IconoReloj className="badge__icono" />
          Pendiente
        </span>
      </header>

      <dl className="tramite-detalle__datos">
        <div>
          <dt>DNI declarado</dt>
          <dd>{prospecto.dni ?? 'No informado'}</dd>
        </div>
        <div>
          <dt>Teléfono de la conversación</dt>
          <dd><Telefono numero={prospecto.phone} /></dd>
        </div>
        <div>
          <dt>Autoridad requerida</dt>
          <dd>Administrador u operador habilitado</dd>
        </div>
        <div>
          <dt>Estado actual</dt>
          <dd>Prospecto pendiente, sin cliente creado</dd>
        </div>
      </dl>

      <section className="tramite-detalle__bloque" aria-labelledby={`${id}-foto`}>
        <h3 className="tramite-detalle__subtitulo-fuerte" id={`${id}-foto`}>Documento respaldatorio</h3>
        <FotoDni idCaso={prospecto.caseId} />
      </section>

      <form className="tramite-detalle__formulario" onSubmit={alAprobar}>
        <fieldset className="tramite-detalle__grupo">
          <legend>Revisión del alta</legend>
          <p className="tramite-detalle__ayuda">
            El DNI no se puede modificar. Corregí el nombre y el apellido si la declaración no coincide con la foto.
          </p>
          {!tieneDni ? (
            <p className="tramites-aviso tramites-aviso--alerta" role="status">
              Este prospecto no tiene DNI declarado. No se puede aprobar el alta hasta que el dato esté disponible.
            </p>
          ) : null}
          <div className="tramite-detalle__fila">
            <label className="formulario__campo">
              Nombre
              <input
                value={nombre}
                maxLength={LARGO_MAXIMO_NOMBRE}
                disabled={ocupado}
                aria-invalid={!nombreValido}
                onChange={(evento) => setNombre(evento.target.value)}
              />
            </label>
            <label className="formulario__campo">
              Apellido
              <input
                value={apellido}
                maxLength={LARGO_MAXIMO_NOMBRE}
                disabled={ocupado}
                aria-invalid={!apellidoValido}
                onChange={(evento) => setApellido(evento.target.value)}
              />
            </label>
          </div>
          <label className="formulario__campo">
            Fundamento de la decisión (obligatorio)
            <textarea
              rows={3}
              value={fundamento}
              maxLength={LARGO_MAXIMO_FUNDAMENTO}
              disabled={ocupado}
              aria-invalid={!fundamentoValido}
              aria-describedby={`${id}-fundamento-ayuda`}
              onChange={(evento) => setFundamento(evento.target.value)}
            />
          </label>
          <p className="tramite-detalle__ayuda" id={`${id}-fundamento-ayuda`}>
            Queda registrado quién decide, cuándo y con qué fundamento. Entre {LARGO_MINIMO_FUNDAMENTO} y{' '}
            {LARGO_MAXIMO_FUNDAMENTO} caracteres.
          </p>
        </fieldset>

        {error !== null ? <p className="tramites-aviso tramites-aviso--riesgo" role="alert">{error}</p> : null}

        <div className="tramite-detalle__acciones">
          <button
            type="button"
            className="boton boton--peligro-claro"
            disabled={!fundamentoValido || ocupado}
            onClick={() => onRechazar(fundamento.trim())}
          >
            Rechazar alta
          </button>
          <button type="submit" className="boton boton--primario" disabled={!puedeAprobar}>
            {ocupado ? 'Aplicando…' : 'Aprobar alta'}
          </button>
        </div>
      </form>
    </article>
  )
}

function DetalleCambioTelefono({
  cambio,
  ocupado,
  error,
  onAprobar,
  onRechazar,
}: {
  cambio: CambioTelefonoPendiente
  ocupado: boolean
  error: string | null
  onAprobar: (datos: { fundamento: string; telefonosADesvincular: number[] }) => void
  onRechazar: (fundamento: string) => void
}) {
  const id = useId()
  const [fundamento, setFundamento] = useState('')
  const [seleccionados, setSeleccionados] = useState<number[]>([])
  const fundamentoValido =
    fundamento.trim().length >= LARGO_MINIMO_FUNDAMENTO && fundamento.trim().length <= LARGO_MAXIMO_FUNDAMENTO
  const puedeAprobar = fundamentoValido && !ocupado

  function alternarTelefono(idTelefono: number) {
    setSeleccionados((previos) =>
      previos.includes(idTelefono) ? previos.filter((item) => item !== idTelefono) : [...previos, idTelefono],
    )
  }

  function alAprobar(evento: FormEvent) {
    evento.preventDefault()
    if (!puedeAprobar) return
    onAprobar({ fundamento: fundamento.trim(), telefonosADesvincular: seleccionados })
  }

  return (
    <article className="tramite-detalle">
      <header className="tramite-detalle__cabecera">
        <div className="tramite-detalle__identidad">
          <span className="avatar avatar--grande" aria-hidden="true">{inicial(cambio.customerName)}</span>
          <div>
            <p className="tramite-detalle__tipo">Cambio de teléfono</p>
            <h2 className="tramite-detalle__titulo">{cambio.customerName}</h2>
            <p className="tramite-detalle__subtitulo">Caso {cambio.caseId} · Solicitado el {fechaHora(cambio.requestedAt)}</p>
          </div>
        </div>
        <span className="badge badge--warning">
          <IconoReloj className="badge__icono" />
          Pendiente
        </span>
      </header>

      <dl className="tramite-detalle__datos">
        <div>
          <dt>DNI</dt>
          <dd>{cambio.customerDni}</dd>
        </div>
        <div>
          <dt>Número solicitado</dt>
          <dd><Telefono numero={cambio.requestedPhone} /></dd>
        </div>
        <div>
          <dt>Autoridad requerida</dt>
          <dd>Administrador u operador habilitado</dd>
        </div>
        <div>
          <dt>Estado actual</dt>
          <dd>Vinculación pendiente, sin cambios en la cartera</dd>
        </div>
      </dl>

      <form className="tramite-detalle__formulario" onSubmit={alAprobar}>
        <fieldset className="tramite-detalle__grupo">
          <legend>Teléfonos actuales del cliente</legend>
          <p className="tramite-detalle__ayuda">
            Marcá cuáles se desvinculan al aprobar. Podés no seleccionar ninguno; el número nuevo se vincula igual.
          </p>
          {cambio.currentPhones.length === 0 ? (
            <p className="tramite-detalle__ayuda">El cliente no tiene otros teléfonos vinculados.</p>
          ) : (
            <ul className="tramite-telefonos">
              {cambio.currentPhones.map((telefono) => (
                <li key={telefono.id}>
                  <label className="tramite-telefono-opcion">
                    <input
                      type="checkbox"
                      checked={seleccionados.includes(telefono.id)}
                      disabled={ocupado}
                      onChange={() => alternarTelefono(telefono.id)}
                    />
                    <span>{telefono.number}</span>
                    <span className="tramite-telefono-opcion__nota">Desvincular</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <label className="formulario__campo">
          Fundamento de la decisión (obligatorio)
          <textarea
            rows={3}
            value={fundamento}
            maxLength={LARGO_MAXIMO_FUNDAMENTO}
            disabled={ocupado}
            aria-invalid={!fundamentoValido}
            aria-describedby={`${id}-fundamento-ayuda`}
            onChange={(evento) => setFundamento(evento.target.value)}
          />
        </label>
        <p className="tramite-detalle__ayuda" id={`${id}-fundamento-ayuda`}>
          Al aprobar se vincula el número nuevo y se avisa al cliente por WhatsApp. La decisión queda auditada con
          quién, cuándo y con qué fundamento.
        </p>

        {error !== null ? <p className="tramites-aviso tramites-aviso--riesgo" role="alert">{error}</p> : null}

        <div className="tramite-detalle__acciones">
          <button
            type="button"
            className="boton boton--peligro-claro"
            disabled={!fundamentoValido || ocupado}
            onClick={() => onRechazar(fundamento.trim())}
          >
            Rechazar cambio
          </button>
          <button type="submit" className="boton boton--primario" disabled={!puedeAprobar}>
            {ocupado ? 'Aplicando…' : 'Aprobar cambio'}
          </button>
        </div>
      </form>
    </article>
  )
}

export default function TramitesAprobar({
  modulo,
  onNavegar,
}: {
  modulo: Modulo
  onNavegar: (destino: ModuloPanel) => void
}) {
  const [prospectos, setProspectos] = useState<ProspectoPendiente[]>([])
  const [cargandoProspectos, setCargandoProspectos] = useState(true)
  const [cargandoMasProspectos, setCargandoMasProspectos] = useState(false)
  const [hayMasProspectos, setHayMasProspectos] = useState(false)
  const [errorProspectos, setErrorProspectos] = useState<string | null>(null)
  const [cambios, setCambios] = useState<CambioTelefonoPendiente[]>([])
  const [cargandoCambios, setCargandoCambios] = useState(true)
  const [cargandoMasCambios, setCargandoMasCambios] = useState(false)
  const [hayMasCambios, setHayMasCambios] = useState(false)
  const [errorCambios, setErrorCambios] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<{ seccion: Seccion; id: number } | null>(null)
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorDecision, setErrorDecision] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [reintentando, setReintentando] = useState(false)

  const cargarProspectos = useCallback(async (desde = 0, sumar = false) => {
    if (sumar) setCargandoMasProspectos(true)
    else setCargandoProspectos(true)
    setErrorProspectos(null)
    try {
      const pagina = await listarProspectos({ limit: LIMITE_PAGINA, offset: desde })
      setProspectos((previos) => (sumar ? [...previos, ...pagina.items] : pagina.items))
      setHayMasProspectos(pagina.items.length === LIMITE_PAGINA)
    } catch (error) {
      setErrorProspectos(mensajeDeError(error, 'No se pudieron consultar las altas pendientes.'))
    } finally {
      if (sumar) setCargandoMasProspectos(false)
      else setCargandoProspectos(false)
    }
  }, [])

  const cargarCambios = useCallback(async (desde = 0, sumar = false) => {
    if (sumar) setCargandoMasCambios(true)
    else setCargandoCambios(true)
    setErrorCambios(null)
    try {
      const pagina = await listarCambiosTelefono({ limit: LIMITE_PAGINA, offset: desde })
      setCambios((previos) => (sumar ? [...previos, ...pagina.items] : pagina.items))
      setHayMasCambios(pagina.items.length === LIMITE_PAGINA)
    } catch (error) {
      setErrorCambios(mensajeDeError(error, 'No se pudieron consultar los cambios de teléfono.'))
    } finally {
      if (sumar) setCargandoMasCambios(false)
      else setCargandoCambios(false)
    }
  }, [])

  useEffect(() => {
    const temporizador = setTimeout(() => {
      void cargarProspectos()
      void cargarCambios()
    }, 0)
    return () => clearTimeout(temporizador)
  }, [cargarProspectos, cargarCambios])

  function recargar() {
    void cargarProspectos()
    void cargarCambios()
  }

  function cargarMas() {
    if (hayMasProspectos) void cargarProspectos(prospectos.length, true)
    if (hayMasCambios) void cargarCambios(cambios.length, true)
  }

  const tramites: TramitePendiente[] = [
    ...prospectos.map((prospecto): TramitePendiente => ({
      tipo: 'prospecto',
      fecha: prospecto.registeredAt,
      prospecto,
    })),
    ...cambios.map((cambio): TramitePendiente => ({
      tipo: 'cambio',
      fecha: cambio.requestedAt,
      cambio,
    })),
  ].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())

  const hayMasTramites = hayMasProspectos || hayMasCambios
  const cargandoMasTramites = cargandoMasProspectos || cargandoMasCambios
  const erroresTramites = [errorProspectos, errorCambios].filter((error): error is string => error !== null)

  const prospectoSeleccionado =
    seleccion?.seccion === 'prospectos' ? prospectos.find((item) => item.id === seleccion.id) ?? null : null
  const cambioSeleccionado =
    seleccion?.seccion === 'telefonos' ? cambios.find((item) => item.id === seleccion.id) ?? null : null

  function pedirAprobarProspecto(prospecto: ProspectoPendiente, datos: { nombre: string; apellido: string; fundamento: string }) {
    setErrorDecision(null)
    setConfirmacion({
      tipo: 'prospecto',
      decision: 'aprobar',
      prospecto,
      ...datos,
      lineas: [
        { etiqueta: 'Alta', antes: 'Pendiente', despues: 'Cliente creado' },
        { etiqueta: 'Nombre revisado', antes: nombreDeclarado(prospecto), despues: `${datos.nombre} ${datos.apellido}` },
        { etiqueta: 'DNI', antes: prospecto.dni ?? 'No informado', despues: prospecto.dni ?? 'No informado' },
        { etiqueta: 'Teléfono', antes: prospecto.phone, despues: 'Vinculado al cliente' },
        { etiqueta: 'Fundamento', antes: '—', despues: datos.fundamento },
      ],
    })
  }

  function pedirRechazarProspecto(prospecto: ProspectoPendiente, fundamento: string) {
    setErrorDecision(null)
    setConfirmacion({
      tipo: 'prospecto',
      decision: 'rechazar',
      prospecto,
      fundamento,
      nombre: '',
      apellido: '',
      lineas: [
        { etiqueta: 'Alta', antes: 'Pendiente', despues: 'Rechazada, sin crear cliente' },
        { etiqueta: 'Caso', antes: `Caso ${prospecto.caseId}`, despues: 'Queda en la Bandeja a tu cargo' },
        { etiqueta: 'Fundamento', antes: '—', despues: fundamento },
      ],
    })
  }

  function pedirAprobarCambio(
    cambio: CambioTelefonoPendiente,
    datos: { fundamento: string; telefonosADesvincular: number[] },
  ) {
    const numeros = cambio.currentPhones
      .filter((telefono) => datos.telefonosADesvincular.includes(telefono.id))
      .map((telefono) => telefono.number)
    setErrorDecision(null)
    setConfirmacion({
      tipo: 'telefono',
      decision: 'aprobar',
      cambio,
      ...datos,
      lineas: [
        { etiqueta: 'Número nuevo', antes: 'Sin vincular', despues: cambio.requestedPhone },
        { etiqueta: 'Cliente', antes: cambio.customerName, despues: cambio.customerName },
        {
          etiqueta: 'Teléfonos que se desvinculan',
          antes: 'Vinculados',
          despues: numeros.length > 0 ? numeros.join(', ') : 'Ninguno',
        },
        { etiqueta: 'Aviso al cliente', antes: '—', despues: `WhatsApp a ${cambio.requestedPhone}` },
        { etiqueta: 'Fundamento', antes: '—', despues: datos.fundamento },
      ],
    })
  }

  function pedirRechazarCambio(cambio: CambioTelefonoPendiente, fundamento: string) {
    setErrorDecision(null)
    setConfirmacion({
      tipo: 'telefono',
      decision: 'rechazar',
      cambio,
      fundamento,
      telefonosADesvincular: [],
      lineas: [
        { etiqueta: 'Número solicitado', antes: cambio.requestedPhone, despues: 'Sin cambios en la cartera' },
        { etiqueta: 'Cliente', antes: cambio.customerName, despues: cambio.customerName },
        { etiqueta: 'Aviso al cliente', antes: '—', despues: `WhatsApp a ${cambio.requestedPhone}` },
        { etiqueta: 'Fundamento', antes: '—', despues: fundamento },
      ],
    })
  }

  async function aplicarConfirmacion() {
    if (confirmacion === null) return
    setGuardando(true)
    setErrorDecision(null)
    try {
      if (confirmacion.tipo === 'prospecto') {
        if (confirmacion.decision === 'aprobar') {
          const resultado = await decidirProspecto(confirmacion.prospecto.id, {
            decision: 'aprobar',
            fundamento: confirmacion.fundamento,
            nombre: confirmacion.nombre,
            apellido: confirmacion.apellido,
          })
          setAviso({
            tono: 'exito',
            texto: `Se aprobó el alta de ${confirmacion.nombre} ${confirmacion.apellido}. El cliente${resultado.clienteId ? ` #${resultado.clienteId}` : ''} quedó creado y el teléfono vinculado.`,
          })
        } else {
          const resultado = await decidirProspecto(confirmacion.prospecto.id, {
            decision: 'rechazar',
            fundamento: confirmacion.fundamento,
          })
          setAviso({
            tono: 'alerta',
            texto: `Se rechazó el alta. El caso ${resultado.casoId} quedó en la Bandeja a tu cargo para explicarle al cliente.`,
            accion: { etiqueta: 'Ir a la Bandeja', onClick: () => onNavegar('bandeja') },
          })
        }
        setSeleccion(null)
        void cargarProspectos()
      } else {
        const resultado = await decidirCambioTelefono(confirmacion.cambio.id, {
          decision: confirmacion.decision,
          fundamento: confirmacion.fundamento,
          telefonosADesvincular: confirmacion.telefonosADesvincular,
        })
        if (resultado.notificationSent) {
          setAviso({
            tono: 'exito',
            texto: `Se ${confirmacion.decision === 'aprobar' ? 'aprobó' : 'rechazó'} el cambio de ${confirmacion.cambio.requestedPhone}. El cliente recibió el aviso por WhatsApp.`,
          })
        } else {
          setAviso({
            tono: 'alerta',
            texto: `La decisión quedó registrada, pero no se pudo avisar al cliente por WhatsApp.`,
            notificacionId: resultado.id,
          })
        }
        setSeleccion(null)
        void cargarCambios()
      }
      setConfirmacion(null)
    } catch (error) {
      setErrorDecision(mensajeDeError(error, 'No se pudo aplicar la decisión.'))
      if (error instanceof ErrorDeApi && error.status === 409) recargar()
    } finally {
      setGuardando(false)
    }
  }

  async function reintentarAviso() {
    if (aviso?.notificacionId === undefined) return
    setReintentando(true)
    try {
      const resultado = await reintentarNotificacion(aviso.notificacionId)
      if (resultado.notificationSent) {
        setAviso({ tono: 'exito', texto: 'El aviso al cliente se envió por WhatsApp.' })
      } else {
        setAviso({
          tono: 'riesgo',
          texto: 'Todavía no se pudo enviar el aviso al cliente por WhatsApp. La decisión sigue registrada.',
          notificacionId: resultado.id,
        })
      }
    } catch (error) {
      setAviso({
        tono: 'riesgo',
        texto: mensajeDeError(error, 'No se pudo reintentar el aviso al cliente.'),
        notificacionId: aviso.notificacionId,
      })
    } finally {
      setReintentando(false)
    }
  }

  function listaTramites() {
    if ((cargandoProspectos || cargandoCambios) && tramites.length === 0) {
      return <p className="tramites__estado" role="status">Cargando trámites pendientes…</p>
    }
    if (erroresTramites.length > 0 && tramites.length === 0) {
      return (
        <div className="tramites__estado tramites__estado--error" role="alert">
          <p>{erroresTramites.join(' ')}</p>
          <button type="button" className="boton" onClick={recargar}>Reintentar</button>
        </div>
      )
    }
    if (tramites.length === 0) {
      return (
        <div className="tramites__vacio">
          <IconoReloj className="tramites__vacio-icono" />
          <p className="tramites__vacio-titulo">No hay trámites pendientes</p>
          <p className="tramites__vacio-texto">Las altas y los cambios de teléfono aparecen acá para aprobar o rechazar.</p>
        </div>
      )
    }
    return (
      <>
        {erroresTramites.length > 0 ? (
          <div className="tramites__estado tramites__estado--error" role="alert">
            <p>{erroresTramites.join(' ')}</p>
            <button type="button" className="boton" onClick={recargar}>Reintentar</button>
          </div>
        ) : null}
        <ul className="tramites__lista">
          {tramites.map((tramite) => tramite.tipo === 'prospecto' ? (
            <li key={`prospecto-${tramite.prospecto.id}`}>
              <button
                type="button"
                className="tramite-card"
                aria-current={seleccion?.seccion === 'prospectos' && seleccion.id === tramite.prospecto.id ? 'true' : undefined}
                onClick={() => setSeleccion({ seccion: 'prospectos', id: tramite.prospecto.id })}
              >
                <span className="avatar" aria-hidden="true">{inicial(nombreDeclarado(tramite.prospecto))}</span>
                <span className="tramite-card__cuerpo">
                  <span className="tramite-card__fila">
                    <span className="tramite-card__titulo">{nombreDeclarado(tramite.prospecto)}</span>
                    <span className="tramite-card__fecha">{fechaHora(tramite.prospecto.registeredAt)}</span>
                  </span>
                  <span className="tramite-card__meta">DNI {tramite.prospecto.dni ?? 'sin informar'} · {tramite.prospecto.phone}</span>
                  <span className="badge badge--warning">Alta pendiente</span>
                </span>
              </button>
            </li>
          ) : (
            <li key={`cambio-${tramite.cambio.id}`}>
              <button
                type="button"
                className="tramite-card"
                aria-current={seleccion?.seccion === 'telefonos' && seleccion.id === tramite.cambio.id ? 'true' : undefined}
                onClick={() => setSeleccion({ seccion: 'telefonos', id: tramite.cambio.id })}
              >
                <span className="avatar" aria-hidden="true">{inicial(tramite.cambio.customerName)}</span>
                <span className="tramite-card__cuerpo">
                  <span className="tramite-card__fila">
                    <span className="tramite-card__titulo">{tramite.cambio.customerName}</span>
                    <span className="tramite-card__fecha">{fechaHora(tramite.cambio.requestedAt)}</span>
                  </span>
                  <span className="tramite-card__meta">DNI {tramite.cambio.customerDni} · Nuevo: {tramite.cambio.requestedPhone}</span>
                  <span className="badge badge--warning">Cambio de teléfono</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  }

  const detalle = prospectoSeleccionado !== null ? (
    <DetalleProspecto
      key={`prospecto-${prospectoSeleccionado.id}`}
      prospecto={prospectoSeleccionado}
      ocupado={guardando}
      error={errorDecision}
      onAprobar={(datos) => pedirAprobarProspecto(prospectoSeleccionado, datos)}
      onRechazar={(fundamento) => pedirRechazarProspecto(prospectoSeleccionado, fundamento)}
    />
  ) : cambioSeleccionado !== null ? (
    <DetalleCambioTelefono
      key={`cambio-${cambioSeleccionado.id}`}
      cambio={cambioSeleccionado}
      ocupado={guardando}
      error={errorDecision}
      onAprobar={(datos) => pedirAprobarCambio(cambioSeleccionado, datos)}
      onRechazar={(fundamento) => pedirRechazarCambio(cambioSeleccionado, fundamento)}
    />
  ) : seleccion !== null ? (
    <EstadoPanel
      titulo="El trámite ya no está pendiente"
      descripcion="Puede haberlo decidido otra persona o haberse cerrado el caso. Actualizá la lista para ver el estado."
      tono="alerta"
      acciones={<button type="button" className="boton" onClick={recargar}>Actualizar</button>}
    />
  ) : (
    <EstadoPanel
      titulo="Elegí un trámite para revisarlo"
      descripcion="A la izquierda están todos los trámites pendientes. En el detalle vas a ver los datos, la autoridad requerida y las acciones de aprobar o rechazar."
      acciones={<span className="badge badge--neutro"><IconoAlerta className="badge__icono" />Requiere fundamento</span>}
    />
  )

  return (
    <div className="pagina">
      <PageHeader
        titulo={modulo.nombre}
        descripcion={modulo.descripcion}
        acciones={
          <>
            <span className="badge badge--neutro">Autorizan: Administrador y operadores habilitados</span>
            <button type="button" className="boton" onClick={recargar}>Actualizar</button>
          </>
        }
      />

      {aviso !== null ? (
        <AvisoPanel
          aviso={aviso}
          reintentando={reintentando}
          onReintentar={() => void reintentarAviso()}
        />
      ) : null}

      <div className={`tramites-layout${seleccion !== null ? ' tramites-layout--con-detalle' : ''}`}>
        <section className="tramites-lista-panel" aria-label="Trámites pendientes de aprobación">
          {listaTramites()}

          <footer className="tramites__pie">
            <span className="tramites__conteo">
              {tramites.length} {tramites.length === 1 ? 'trámite pendiente' : 'trámites pendientes'}
            </span>
            {hayMasTramites ? (
              <button
                type="button"
                className="boton boton--chico"
                disabled={cargandoMasTramites}
                onClick={cargarMas}
              >
                {cargandoMasTramites ? 'Cargando…' : 'Cargar más'}
              </button>
            ) : null}
          </footer>
        </section>

        <section className="tramites-detalle-panel" aria-label="Detalle del trámite">
          {seleccion !== null ? (
            <button type="button" className="tramites__volver" onClick={() => setSeleccion(null)}>
              Volver a la lista
            </button>
          ) : null}
          {detalle}
        </section>
      </div>

      {confirmacion !== null ? (
        <ConfirmarCambio
          titulo={
            confirmacion.tipo === 'prospecto'
              ? confirmacion.decision === 'aprobar'
                ? 'Aprobar el alta del cliente'
                : 'Rechazar el alta del cliente'
              : confirmacion.decision === 'aprobar'
                ? 'Aprobar el cambio de teléfono'
                : 'Rechazar el cambio de teléfono'
          }
          descripcion={
            confirmacion.tipo === 'prospecto'
              ? confirmacion.decision === 'aprobar'
                ? 'Se crea el cliente con el DNI declarado y se vincula el teléfono de la conversación.'
                : 'No se crea ningún cliente. El caso queda abierto en la Bandeja para explicarle el rechazo al cliente.'
              : confirmacion.decision === 'aprobar'
                ? 'El número nuevo queda vinculado al cliente. El aviso sale por WhatsApp y se guarda en el caso.'
                : 'No cambia ningún vínculo telefónico. El cliente recibe el aviso de rechazo por WhatsApp.'
          }
          lineas={confirmacion.lineas}
          etiquetaConfirmar={
            confirmacion.tipo === 'prospecto'
              ? confirmacion.decision === 'aprobar'
                ? 'Aprobar alta'
                : 'Rechazar alta'
              : confirmacion.decision === 'aprobar'
                ? 'Aprobar cambio'
                : 'Rechazar cambio'
          }
          peligro={confirmacion.decision === 'rechazar'}
          ocupado={guardando}
          error={errorDecision}
          onConfirmar={() => void aplicarConfirmacion()}
          onCancelar={() => {
            if (!guardando) {
              setConfirmacion(null)
              setErrorDecision(null)
            }
          }}
        />
      ) : null}
    </div>
  )
}
