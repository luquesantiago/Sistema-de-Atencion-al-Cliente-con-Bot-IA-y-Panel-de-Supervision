import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  guardarConfiguracion,
  obtenerConfiguracion,
  previsualizarConfiguracion,
  type CambiosConfiguracion,
  type CampoTexto,
  type ConfiguracionAgencia,
  type ItemCatalogo,
  type MarcaDato,
  type VistaPrevia,
} from '../api/configuracion'
import { ErrorDeApi } from '../api/respuesta'
import ConfirmarCambio, { type LineaConfirmacion } from '../components/ConfirmarCambio'
import EstadoPanel from '../components/EstadoPanel'
import { IconoInfo } from '../components/iconos'
import PageHeader from '../components/PageHeader'
import type { Modulo } from '../navigation'

interface ConfiguracionProps {
  modulo: Modulo
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

const ETIQUETAS: Record<CampoTexto, string> = {
  address: 'Dirección',
  phone: 'Teléfono',
  email: 'Email',
  web: 'Web',
  assistancePhone: 'Teléfono de grúa o asistencia',
  paymentMethods: 'Medios de pago',
}

// Qué hace el asistente mientras el dato no está cargado (spec «Datos sin cargar»).
const SIN_CARGAR: Record<CampoTexto, string> = {
  address: 'Sin la dirección, el asistente deriva las consultas sobre la agencia.',
  phone: 'Sin el teléfono, el asistente deriva las consultas sobre la agencia.',
  email: 'Mientras no se cargue, el asistente no lo menciona.',
  web: 'Mientras no se cargue, el asistente no la menciona.',
  assistancePhone: 'Mientras no se cargue, el asistente deriva los pedidos de grúa sin dar un teléfono.',
  paymentMethods: 'Mientras no se carguen, el asistente deriva las consultas sobre cómo pagar.',
}

const CAMPOS: readonly CampoTexto[] = ['address', 'phone', 'email', 'web', 'assistancePhone', 'paymentMethods']

const MAX_TEXTO = 255

type DiaBorrador = { day: number; atiende: boolean; opens: string; closes: string }

type Borrador = {
  textos: Record<CampoTexto, string>
  dias: DiaBorrador[]
  ramos: number[]
  planes: number[]
}

function borradorDesde(config: ConfiguracionAgencia): Borrador {
  const texto = (campo: CampoTexto) => config[campo] ?? ''
  return {
    textos: {
      address: texto('address'),
      phone: texto('phone'),
      email: texto('email'),
      web: texto('web'),
      assistancePhone: texto('assistancePhone'),
      paymentMethods: texto('paymentMethods'),
    },
    dias: DIAS.map((_, indice) => {
      const day = indice + 1
      const horario = config.hours.find((item) => item.day === day)
      return horario
        ? { day, atiende: true, opens: horario.opens, closes: horario.closes }
        : { day, atiende: false, opens: '09:00', closes: '18:00' }
    }),
    ramos: config.ramos.filter((item) => item.active).map((item) => item.id),
    planes: config.plans.filter((item) => item.active).map((item) => item.id),
  }
}

// Lo que se manda al backend: los textos vacíos quedan sin cargar.
function cambiosDesde(borrador: Borrador): CambiosConfiguracion {
  const texto = (campo: CampoTexto) => borrador.textos[campo].trim() || null
  return {
    address: texto('address'),
    phone: texto('phone'),
    email: texto('email'),
    web: texto('web'),
    assistancePhone: texto('assistancePhone'),
    paymentMethods: texto('paymentMethods'),
    hours: borrador.dias.filter((dia) => dia.atiende).map(({ day, opens, closes }) => ({ day, opens, closes })),
    activeRamoIds: [...borrador.ramos].sort((a, b) => a - b),
    activePlanIds: [...borrador.planes].sort((a, b) => a - b),
  }
}

function textoHorario(dia: { atiende: boolean; opens: string; closes: string } | undefined): string {
  return dia?.atiende ? `${dia.opens} a ${dia.closes}` : 'Sin atención'
}

// Campo por campo, el valor actual y el nuevo, para la confirmación.
function lineasDeCambio(config: ConfiguracionAgencia, cambios: CambiosConfiguracion): LineaConfirmacion[] {
  const lineas: LineaConfirmacion[] = []
  for (const campo of CAMPOS) {
    if ((config[campo] ?? null) !== cambios[campo]) {
      lineas.push({ etiqueta: ETIQUETAS[campo], antes: config[campo] ?? 'Sin cargar', despues: cambios[campo] ?? 'Sin cargar' })
    }
  }
  DIAS.forEach((nombre, indice) => {
    const day = indice + 1
    const antes = config.hours.find((item) => item.day === day)
    const despues = cambios.hours.find((item) => item.day === day)
    const textoAntes = textoHorario(antes && { atiende: true, ...antes })
    const textoDespues = textoHorario(despues && { atiende: true, ...despues })
    if (textoAntes !== textoDespues) lineas.push({ etiqueta: `Horario del ${nombre.toLocaleLowerCase('es-AR')}`, antes: textoAntes, despues: textoDespues })
  })
  const catalogo = (items: ItemCatalogo[], activos: number[], tipo: string) => {
    for (const item of items) {
      const activo = activos.includes(item.id)
      if (activo !== item.active) {
        lineas.push({ etiqueta: `${tipo} ${item.name}`, antes: item.active ? 'Activo' : 'Inactivo', despues: activo ? 'Activo' : 'Inactivo' })
      }
    }
  }
  catalogo(config.ramos, cambios.activeRamoIds, 'Seguro de')
  catalogo(config.plans, cambios.activePlanIds, 'Plan')
  return lineas
}

function MarcaDelDato({ marca }: { marca: MarcaDato }) {
  if (marca === 'example') {
    return (
      <span className="badge badge--warning">
        <IconoInfo />
        Dato de ejemplo
      </span>
    )
  }
  if (marca === 'missing') {
    return (
      <span className="badge badge--neutro">
        <IconoInfo />
        Sin cargar
      </span>
    )
  }
  return null
}

function ayudaDe(campo: CampoTexto, marca: MarcaDato): string | null {
  if (marca === 'example') return 'La agencia todavía no informó el dato real.'
  if (marca === 'missing') return SIN_CARGAR[campo]
  return null
}

function BloqueVistaPrevia({ titulo, texto, sinTexto }: { titulo: string; texto: string | null; sinTexto: string }) {
  return (
    <div className="configuracion__bloque">
      <h3 className="configuracion__bloque-titulo">{titulo}</h3>
      {texto ? <p className="configuracion__mensaje">{texto}</p> : <p className="formulario__ayuda">{sinTexto}</p>}
    </div>
  )
}

export default function Configuracion({ modulo }: ConfiguracionProps) {
  const [config, setConfig] = useState<ConfiguracionAgencia | null>(null)
  const [errorCarga, setErrorCarga] = useState<ErrorDeApi | Error | null>(null)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<VistaPrevia | null>(null)
  const [errorVistaPrevia, setErrorVistaPrevia] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    const control = new AbortController()
    obtenerConfiguracion(control.signal)
      .then((datos) => {
        setConfig(datos)
        setBorrador(borradorDesde(datos))
        setVistaPrevia(datos.preview)
      })
      .catch((error: unknown) => {
        if (control.signal.aborted) return
        setErrorCarga(error instanceof Error ? error : new Error('No se pudo cargar la configuración.'))
      })
    return () => control.abort()
  }, [])

  const cambios = useMemo(() => (borrador ? cambiosDesde(borrador) : null), [borrador])
  const lineas = useMemo(() => (config && cambios ? lineasDeCambio(config, cambios) : []), [config, cambios])

  // La vista previa se pide al backend un rato después de cada cambio, sin guardar nada.
  useEffect(() => {
    if (!config || !cambios) return
    const control = new AbortController()
    const espera = setTimeout(() => {
      if (lineas.length === 0) {
        setVistaPrevia(config.preview)
        setErrorVistaPrevia(null)
        return
      }
      previsualizarConfiguracion(cambios, control.signal)
        .then((previa) => {
          setVistaPrevia(previa)
          setErrorVistaPrevia(null)
        })
        .catch((error: unknown) => {
          if (control.signal.aborted) return
          setErrorVistaPrevia(error instanceof Error ? error.message : 'No se pudo armar la vista previa.')
        })
    }, 400)
    return () => {
      clearTimeout(espera)
      control.abort()
    }
  }, [config, cambios, lineas.length])

  function cambiarTexto(campo: CampoTexto, valor: string) {
    setAviso(null)
    setBorrador((actual) => actual && { ...actual, textos: { ...actual.textos, [campo]: valor } })
  }

  function cambiarDia(day: number, cambio: Partial<DiaBorrador>) {
    setAviso(null)
    setBorrador((actual) => actual && {
      ...actual,
      dias: actual.dias.map((dia) => (dia.day === day ? { ...dia, ...cambio } : dia)),
    })
  }

  function alternar(lista: 'ramos' | 'planes', id: number) {
    setAviso(null)
    setBorrador((actual) => {
      if (!actual) return actual
      const ids = actual[lista]
      return { ...actual, [lista]: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] }
    })
  }

  function revisar(evento?: FormEvent) {
    evento?.preventDefault()
    if (lineas.length === 0) return
    setErrorGuardado(null)
    setConfirmando(true)
  }

  async function guardar() {
    if (!cambios) return
    setGuardando(true)
    setErrorGuardado(null)
    try {
      const guardada = await guardarConfiguracion(cambios)
      setConfig(guardada)
      setBorrador(borradorDesde(guardada))
      setVistaPrevia(guardada.preview)
      setConfirmando(false)
      setAviso('Cambios guardados. El asistente los usa desde el próximo mensaje.')
    } catch (error) {
      setErrorGuardado(error instanceof Error ? error.message : 'No se pudo guardar la configuración.')
    } finally {
      setGuardando(false)
    }
  }

  if (errorCarga) {
    const sinPermiso = errorCarga instanceof ErrorDeApi && errorCarga.status === 403
    return (
      <div className="pagina">
        <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />
        <EstadoPanel
          titulo={sinPermiso ? 'Solo para el administrador' : 'No se pudo cargar la configuración'}
          descripcion={sinPermiso ? 'Tu perfil no puede ver ni cambiar la configuración de la agencia.' : errorCarga.message}
          tono={sinPermiso ? 'neutro' : 'riesgo'}
          restringido={sinPermiso}
        />
      </div>
    )
  }

  if (!config || !borrador) {
    return (
      <div className="pagina">
        <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />
        <EstadoPanel titulo="Cargando la configuración" descripcion="Trayendo los datos de la agencia que informa el asistente." />
      </div>
    )
  }

  const planesDesactivados = config.plans.filter((plan) => plan.active && !borrador.planes.includes(plan.id))

  const campo = (nombre: CampoTexto, opciones: { tipo?: string; multilinea?: boolean; ayuda?: string; obligatorio?: boolean } = {}): ReactNode => {
    const marca = config.marks[nombre]
    const ayuda = [ayudaDe(nombre, marca), opciones.ayuda].filter(Boolean).join(' ')
    const ayudaId = `ayuda-${nombre}`
    const propiedades = {
      value: borrador.textos[nombre],
      maxLength: MAX_TEXTO,
      required: opciones.obligatorio,
      'aria-describedby': ayuda ? ayudaId : undefined,
    }
    return (
      <label className="formulario__campo">
        <span className="configuracion__etiqueta">
          {ETIQUETAS[nombre]}
          {opciones.obligatorio ? <span className="formulario__ayuda">(obligatorio)</span> : null}
          <MarcaDelDato marca={marca} />
        </span>
        {opciones.multilinea ? (
          <textarea rows={3} {...propiedades} onChange={(evento) => cambiarTexto(nombre, evento.target.value)} />
        ) : (
          <input type={opciones.tipo ?? 'text'} autoComplete="off" {...propiedades} onChange={(evento) => cambiarTexto(nombre, evento.target.value)} />
        )}
        {ayuda ? <span className="formulario__ayuda" id={ayudaId}>{ayuda}</span> : null}
      </label>
    )
  }

  return (
    <div className="pagina">
      <PageHeader
        titulo={modulo.nombre}
        descripcion="Los datos de la agencia que informa el asistente por WhatsApp. Se usan desde el próximo mensaje, sin reiniciar el sistema."
        acciones={(
          <button type="button" className="boton boton--primario" onClick={() => revisar()} disabled={lineas.length === 0}>
            {lineas.length === 0 ? 'Sin cambios' : `Revisar y guardar (${lineas.length})`}
          </button>
        )}
      />

      {aviso ? <p className="cartera__aviso cartera__aviso--info" role="status">{aviso}</p> : null}

      <div className="configuracion">
        <form className="formulario configuracion__formulario" onSubmit={revisar} noValidate>
          <fieldset className="formulario__grupo">
            <legend>Contacto</legend>
            <div className="formulario__fila">
              {campo('address', { obligatorio: true })}
              {campo('phone', { tipo: 'tel', obligatorio: true })}
            </div>
            <div className="formulario__fila">
              {campo('email', { tipo: 'email' })}
              {campo('web', { tipo: 'url', ayuda: 'Con http:// o https://.' })}
            </div>
          </fieldset>

          <fieldset className="formulario__grupo">
            <legend>Asistencia y pagos</legend>
            {campo('assistancePhone', { tipo: 'tel', ayuda: 'El asistente lo da en el pedido de grúa y además deriva el caso.' })}
            {campo('paymentMethods', {
              multilinea: true,
              ayuda: `Tal cual lo va a leer el cliente (alias, CBU, lugares de pago). Hasta ${MAX_TEXTO} caracteres: van ${borrador.textos.paymentMethods.length}.`,
            })}
          </fieldset>

          <fieldset className="formulario__grupo">
            <legend>Horario de atención</legend>
            <p className="formulario__ayuda">Horario de Argentina. Fuera de este horario el asistente contesta igual y los casos derivados esperan a la apertura.</p>
            {borrador.dias.map((dia) => {
              const nombre = DIAS[dia.day - 1] ?? ''
              return (
                <div className="configuracion__dia" key={dia.day}>
                  <label className="formulario__opcion">
                    <input type="checkbox" checked={dia.atiende} onChange={(evento) => cambiarDia(dia.day, { atiende: evento.target.checked })} />
                    {nombre}
                  </label>
                  {dia.atiende ? (
                    <div className="configuracion__horas">
                      <label className="formulario__campo">
                        <span className="visually-hidden">Apertura del {nombre.toLocaleLowerCase('es-AR')}</span>
                        <input type="time" value={dia.opens} onChange={(evento) => cambiarDia(dia.day, { opens: evento.target.value })} />
                      </label>
                      <span aria-hidden="true">a</span>
                      <label className="formulario__campo">
                        <span className="visually-hidden">Cierre del {nombre.toLocaleLowerCase('es-AR')}</span>
                        <input type="time" value={dia.closes} onChange={(evento) => cambiarDia(dia.day, { closes: evento.target.value })} />
                      </label>
                    </div>
                  ) : (
                    <span className="formulario__ayuda">Sin atención</span>
                  )}
                </div>
              )
            })}
          </fieldset>

          <fieldset className="formulario__grupo">
            <legend>Seguros y planes que se ofrecen</legend>
            <p className="formulario__ayuda">Tiene que quedar al menos uno de cada uno. Desactivar no borra nada: deja de ofrecerse.</p>
            <div className="configuracion__catalogos">
              <div className="configuracion__catalogo" role="group" aria-label="Seguros">
                <h3 className="configuracion__bloque-titulo">Seguros</h3>
                {config.ramos.map((ramo) => (
                  <label className="formulario__opcion" key={ramo.id}>
                    <input type="checkbox" checked={borrador.ramos.includes(ramo.id)} onChange={() => alternar('ramos', ramo.id)} />
                    {ramo.name}
                  </label>
                ))}
              </div>
              <div className="configuracion__catalogo" role="group" aria-label="Planes">
                <h3 className="configuracion__bloque-titulo">Planes</h3>
                {config.plans.map((plan) => (
                  <label className="formulario__opcion" key={plan.id}>
                    <input type="checkbox" checked={borrador.planes.includes(plan.id)} onChange={() => alternar('planes', plan.id)} />
                    {plan.name}
                  </label>
                ))}
              </div>
            </div>
          </fieldset>
        </form>

        <aside className="configuracion__vista-previa" aria-labelledby="vista-previa-titulo">
          <h2 className="configuracion__titulo" id="vista-previa-titulo">Vista previa</h2>
          <p className="formulario__ayuda">
            Lo que contesta el asistente con estos datos. La información de la agencia la redacta con otras palabras sin cambiar los
            datos; la grúa y los medios de pago salen tal cual.
          </p>
          {errorVistaPrevia ? (
            <p className="formulario__error" role="alert">
              Para guardar, corregí: {errorVistaPrevia}
            </p>
          ) : null}
          <div aria-live="polite">
            <BloqueVistaPrevia
              titulo="Información de la agencia"
              texto={vistaPrevia?.agencyInfo ?? null}
              sinTexto="Faltan datos: el asistente deriva estas consultas."
            />
            <BloqueVistaPrevia
              titulo="Pedido de grúa o asistencia"
              texto={vistaPrevia?.assistance ?? null}
              sinTexto="Sin teléfono cargado: el asistente deriva el pedido con el mensaje habitual."
            />
            <BloqueVistaPrevia
              titulo="Medios de pago"
              texto={vistaPrevia?.paymentMethods ?? null}
              sinTexto="Sin cargar: el asistente deriva la consulta."
            />
          </div>
        </aside>
      </div>

      {confirmando ? (
        <ConfirmarCambio
          titulo="Confirmar los cambios de la configuración"
          descripcion={
            planesDesactivados.length > 0
              ? `Los planes desactivados (${planesDesactivados.map((plan) => plan.name).join(', ')}) dejan de ofrecerse y no se pueden elegir en coberturas nuevas; las coberturas que ya existen no cambian.`
              : 'El asistente usa estos datos desde el próximo mensaje.'
          }
          lineas={lineas}
          etiquetaConfirmar="Guardar cambios"
          ocupado={guardando}
          error={errorGuardado}
          onConfirmar={() => void guardar()}
          onCancelar={() => setConfirmando(false)}
        />
      ) : null}
    </div>
  )
}
