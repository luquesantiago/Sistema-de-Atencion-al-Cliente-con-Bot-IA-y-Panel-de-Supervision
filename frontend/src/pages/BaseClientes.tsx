import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Modulo } from '../navigation'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'
import ConfirmarCambio, { type LineaConfirmacion } from '../components/ConfirmarCambio'
import FormularioCliente from '../components/FormularioCliente'
import FormularioPoliza from '../components/FormularioPoliza'
import {
  IconoActiva,
  IconoBaja,
  IconoInfo,
  IconoSuspendida,
  IconoVencida,
} from '../components/iconos'
import {
  crearCliente,
  crearPoliza,
  darDeBajaCliente,
  desvincularTelefono,
  editarCliente,
  editarPoliza,
  listarClientes,
  obtenerCliente,
  reemplazarCoberturas,
  vincularTelefono,
  type ClienteDetalle,
  type ClienteLista,
  type DatoPoliza,
  type DatoPolizaResumen,
  type EntradaAltaCliente,
  type EntradaAltaPoliza,
  type EntradaCobertura,
  type EntradaEdicionCliente,
  type EntradaEdicionPoliza,
} from '../api/clientes'
import { obtenerCatalogos, type Catalogos } from '../api/catalogos'

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

// Fecha de hoy en Argentina, aaaa-mm-dd: igual que el backend
// (templates.ts, argentinaToday), aunque el navegador esté en otra zona.
function hoyEnArgentina(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const parte = (tipo: string) => partes.find((item) => item.type === tipo)?.value ?? ''
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

// Misma regla que el asistente (domain/templates.ts): solo una póliza activa
// cuya vigencia ya pasó se muestra como «vencida»; suspendida y dada de baja
// conservan su estado aunque estén vencidas.
function estadoMostrado(poliza: { status: string; expirationDate: string }): string {
  return poliza.status === 'activa' && poliza.expirationDate < hoyEnArgentina()
    ? 'vencida'
    : poliza.status
}

// Color e icono de cada estado. El texto siempre acompaña: nunca solo color.
const ESTADOS_POLIZA: Record<string, {
  clase: string
  texto: string
  icono: (props: { className?: string }) => ReactNode
}> = {
  activa: { clase: 'badge badge--success', texto: 'activa', icono: IconoActiva },
  vencida: { clase: 'badge badge--warning', texto: 'vencida', icono: IconoVencida },
  'suspendida por mora': { clase: 'badge badge--danger', texto: 'suspendida por mora', icono: IconoSuspendida },
  'dada de baja': { clase: 'badge badge--neutro', texto: 'dada de baja', icono: IconoBaja },
}

function badgeDePoliza(poliza: { status: string; expirationDate: string }): ReactNode {
  const estado = estadoMostrado(poliza)
  const { clase, texto, icono: Icono } = ESTADOS_POLIZA[estado] ??
    { clase: 'badge badge--neutro', texto: estado, icono: IconoInfo }
  return (
    <span className={clase}>
      <Icono className="badge__icono" />
      {texto}
    </span>
  )
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
          {badgeDePoliza(poliza)}
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

function pesosDe(centavos: number | null, moneda: string): string | null {
  if (centavos === null) return null
  return `${moneda} ${(centavos / 100).toFixed(2)}`
}

// Una acción pendiente de confirmación. Cada tipo sabe qué llamar y qué
// mensaje dejar después de aplicarse.
type ConfirmacionPendiente =
  | { tipo: 'alta-cliente'; entrada: EntradaAltaCliente; lineas: LineaConfirmacion[] }
  | { tipo: 'editar-cliente'; entrada: EntradaEdicionCliente; lineas: LineaConfirmacion[] }
  | { tipo: 'baja-cliente'; lineas: LineaConfirmacion[] }
  | { tipo: 'vincular-telefono'; phone: string; lineas: LineaConfirmacion[] }
  | { tipo: 'desvincular-telefono'; phoneId: number; numero: string; lineas: LineaConfirmacion[] }
  | { tipo: 'alta-poliza'; entrada: EntradaAltaPoliza; lineas: LineaConfirmacion[] }
  | { tipo: 'editar-poliza'; polizaId: string; entrada: EntradaEdicionPoliza; coberturas: EntradaCobertura[]; lineas: LineaConfirmacion[] }

function tituloDeConfirmacion(confirmacion: ConfirmacionPendiente, cliente: ClienteDetalle | null): string {
  const nombre = cliente ? nombreCompleto(cliente) : ''
  switch (confirmacion.tipo) {
    case 'alta-cliente':
      return 'Crear el cliente en la cartera'
    case 'editar-cliente':
      return `Guardar los cambios de ${nombre}`
    case 'baja-cliente':
      return `Dar de baja a ${nombre}`
    case 'vincular-telefono':
      return 'Vincular el teléfono al cliente'
    case 'desvincular-telefono':
      return `Desvincular ${confirmacion.numero} de ${nombre}`
    case 'alta-poliza':
      return 'Crear la póliza nueva en la cartera'
    case 'editar-poliza':
      return 'Guardar los cambios de la póliza'
  }
}

function descripcionDeConfirmacion(confirmacion: ConfirmacionPendiente): string | undefined {
  switch (confirmacion.tipo) {
    case 'alta-cliente':
      return 'El cliente va a quedar en la cartera con estos datos. El DNI o el CUIT no se puede repetir.'
    case 'alta-poliza':
      return 'La póliza queda en la ficha del cliente con estos datos, su bien y sus coberturas.'
    case 'baja-cliente':
      return 'El cliente deja de aparecer en la cartera. No se borra su historial.'
    case 'editar-cliente':
    case 'vincular-telefono':
    case 'desvincular-telefono':
    case 'editar-poliza':
      return undefined
  }
}

function esPeligroso(confirmacion: ConfirmacionPendiente): boolean {
  return confirmacion.tipo === 'baja-cliente' || confirmacion.tipo === 'desvincular-telefono'
}

/**
 * Cartera de clientes: listado buscable con su ficha en un panel lateral.
 * Además de consultar (RF-CAR-01, RF-CAR-02, RF-CAR-03), el panel da de
 * alta, edita y da de baja clientes, administra sus teléfonos y edita sus
 * pólizas con bien asegurado y coberturas. Cada mutación pide confirmación
 * con el resumen del cambio; el DNI no se modifica nunca.
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

  // Ediciones de cartera.
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null)
  const [modoAlta, setModoAlta] = useState(false)
  const [editandoIdentidad, setEditandoIdentidad] = useState(false)
  const [polizaEditando, setPolizaEditando] = useState<DatoPoliza | null>(null)
  const [altaPoliza, setAltaPoliza] = useState(false)
  const [confirmacion, setConfirmacion] = useState<ConfirmacionPendiente | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null)
  const [errorConfirmacion, setErrorConfirmacion] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [nuevoTelefono, setNuevoTelefono] = useState('')

  const cargar = useCallback(async (busqueda: string, silencioso = false) => {
    const numero = ++numeroDeConsulta.current
    if (!silencioso) setCargando(true)
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
      if (numero === numeroDeConsulta.current && !silencioso) setCargando(false)
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

  const recargarTrasEdicion = useCallback((fichaActualizada: ClienteDetalle | null, mensaje: string) => {
    if (fichaActualizada !== null) setDetalle(fichaActualizada)
    void cargar(texto, true)
    setExito(mensaje)
  }, [texto, cargar])

  // Los catálogos se piden una sola vez y solo hace falta para editar pólizas.
  const asegurarCatalogos = useCallback(async (): Promise<Catalogos | null> => {
    if (catalogos !== null) return catalogos
    try {
      const obtenidos = await obtenerCatalogos()
      setCatalogos(obtenidos)
      return obtenidos
    } catch (errorDeCatalogo) {
      setErrorFormulario(mensajeDeError(errorDeCatalogo, 'No se pudieron cargar los catálogos.'))
      return null
    }
  }, [catalogos])

  const aplicarConfirmacion = useCallback(async () => {
    if (confirmacion === null) return
    setGuardando(true)
    setErrorConfirmacion(null)
    try {
      if (confirmacion.tipo === 'alta-cliente') {
        const creada = await crearCliente(confirmacion.entrada)
        setModoAlta(false)
        setConfirmacion(null)
        setErrorFormulario(null)
        recargarTrasEdicion(creada, `Se creó el cliente ${nombreCompleto(creada)}.`)
        return
      }
      if (detalle === null) return
      switch (confirmacion.tipo) {
        case 'editar-cliente': {
          const editada = await editarCliente(detalle.id, confirmacion.entrada)
          setEditandoIdentidad(false)
          setConfirmacion(null)
          setErrorFormulario(null)
          recargarTrasEdicion(editada, 'Se guardaron los datos del cliente.')
          return
        }
        case 'baja-cliente': {
          await darDeBajaCliente(detalle.id)
          setConfirmacion(null)
          setErrorFormulario(null)
          recargarTrasEdicion(null, `Se dio de baja a ${nombreCompleto(detalle)}.`)
          cerrarDetalle()
          return
        }
        case 'vincular-telefono': {
          const conTelefono = await vincularTelefono(detalle.id, confirmacion.phone)
          setNuevoTelefono('')
          setConfirmacion(null)
          recargarTrasEdicion(conTelefono, `Se vinculó el teléfono ${confirmacion.phone}.`)
          return
        }
        case 'desvincular-telefono': {
          const sinTelefono = await desvincularTelefono(detalle.id, confirmacion.phoneId)
          setConfirmacion(null)
          recargarTrasEdicion(sinTelefono, `Se desvinculó el teléfono ${confirmacion.numero}.`)
          return
        }
        case 'alta-poliza': {
          const creada = await crearPoliza(detalle.id, confirmacion.entrada)
          setAltaPoliza(false)
          setConfirmacion(null)
          setErrorFormulario(null)
          recargarTrasEdicion(creada, `Se creó una póliza nueva de ${nombreCompleto(creada)}.`)
          return
        }
        case 'editar-poliza': {
          const editada = await editarPoliza(confirmacion.polizaId, confirmacion.entrada)
          const conCoberturas = await reemplazarCoberturas(confirmacion.polizaId, confirmacion.coberturas)
          setPolizaEditando(null)
          setConfirmacion(null)
          setErrorFormulario(null)
          recargarTrasEdicion(conCoberturas ?? editada, 'Se guardaron los cambios de la póliza.')
          return
        }
      }
    } catch (errorDeGuardado) {
      setErrorConfirmacion(mensajeDeError(errorDeGuardado, 'No se pudo aplicar el cambio.'))
    } finally {
      setGuardando(false)
    }
  }, [confirmacion, detalle, recargarTrasEdicion, cerrarDetalle])

  function pedirAlta() {
    setErrorFormulario(null)
    setExito(null)
    setModoAlta(true)
  }

  function confirmarAlta(entrada: EntradaAltaCliente) {
    const lineas: LineaConfirmacion[] = entrada.kind === 'persona'
      ? [
          { etiqueta: 'Tipo', antes: '—', despues: 'Persona' },
          { etiqueta: 'DNI', antes: '—', despues: entrada.dni },
          { etiqueta: 'Apellido', antes: '—', despues: entrada.lastName },
          { etiqueta: 'Nombre', antes: '—', despues: entrada.firstName },
        ]
      : [
          { etiqueta: 'Tipo', antes: '—', despues: 'Empresa' },
          { etiqueta: 'CUIT', antes: '—', despues: entrada.cuit },
          { etiqueta: 'Razón social', antes: '—', despues: entrada.razonSocial },
        ]
    if (entrada.kind === 'persona' ? entrada.phone !== undefined : entrada.phone !== undefined) {
      lineas.push({ etiqueta: 'Teléfono', antes: '—', despues: entrada.phone ?? '' })
    }
    setErrorFormulario(null)
    setConfirmacion({ tipo: 'alta-cliente', entrada, lineas })
  }

  function confirmarEdicionCliente(cliente: ClienteDetalle, entrada: EntradaEdicionCliente) {
    const lineas: LineaConfirmacion[] = []
    if ('lastName' in entrada) {
      if (entrada.lastName !== (cliente.lastName ?? '')) {
        lineas.push({ etiqueta: 'Apellido', antes: cliente.lastName ?? '—', despues: entrada.lastName })
      }
      if (entrada.firstName !== (cliente.firstName ?? '')) {
        lineas.push({ etiqueta: 'Nombre', antes: cliente.firstName ?? '—', despues: entrada.firstName })
      }
    } else {
      if (entrada.cuit !== (cliente.cuit ?? '')) {
        lineas.push({ etiqueta: 'CUIT', antes: cliente.cuit ?? '—', despues: entrada.cuit })
      }
      if (entrada.razonSocial !== (cliente.razonSocial ?? '')) {
        lineas.push({ etiqueta: 'Razón social', antes: cliente.razonSocial ?? '—', despues: entrada.razonSocial })
      }
    }
    if (lineas.length === 0) {
      setErrorFormulario('No hay cambios para guardar.')
      return
    }
    setErrorFormulario(null)
    setConfirmacion({ tipo: 'editar-cliente', entrada, lineas })
  }

  function confirmarBajaCliente(cliente: ClienteDetalle) {
    setErrorFormulario(null)
    setConfirmacion({
      tipo: 'baja-cliente',
      lineas: [
        { etiqueta: 'Cliente', antes: nombreCompleto(cliente), despues: 'Dado de baja' },
        { etiqueta: 'Identificación', antes: identificacion(cliente), despues: '—' },
      ],
    })
  }

  function confirmarVinculoTelefono(numero: string) {
    const limpio = numero.trim()
    if (!limpio) return
    setErrorFormulario(null)
    setConfirmacion({
      tipo: 'vincular-telefono',
      phone: limpio,
      lineas: [{ etiqueta: 'Teléfono', antes: 'Sin cambio', despues: limpio }],
    })
  }

  function confirmarDesvinculo(telefono: { id: number; number: string }) {
    setErrorFormulario(null)
    setConfirmacion({
      tipo: 'desvincular-telefono',
      phoneId: telefono.id,
      numero: telefono.number,
      lineas: [{
        etiqueta: 'Teléfono',
        antes: `${telefono.number} (vinculado)`,
        despues: `${telefono.number} (desvinculado de este cliente)`,
      }],
    })
  }

  // El alta nunca escribe en la ficha: todo lo que va a guardar se lista como
  // «— → valor», igual que el resto de las confirmaciones.
  function confirmarAltaPoliza(entrada: EntradaAltaPoliza) {
    const lineas: LineaConfirmacion[] = [
      { etiqueta: 'Categoría', antes: '—', despues: entrada.ramo },
      { etiqueta: 'Estado', antes: '—', despues: entrada.status },
      { etiqueta: 'Moneda', antes: '—', despues: entrada.currency },
      {
        etiqueta: 'Vigencia',
        antes: '—',
        despues: `${fechaLegible(entrada.startDate)} a ${fechaLegible(entrada.expirationDate)}`,
      },
    ]
    const cuota = pesosDe(entrada.premiumCents ?? null, entrada.currency)
    if (cuota !== null) {
      lineas.push({ etiqueta: 'Cuota mensual', antes: '—', despues: cuota })
    }
    if (entrada.insuredItem !== null && entrada.insuredItem !== undefined) {
      lineas.push({ etiqueta: 'Bien asegurado', antes: '—', despues: entrada.insuredItem.description })
    }
    if (entrada.coverages.length > 0) {
      lineas.push({
        etiqueta: 'Coberturas',
        antes: '—',
        despues: `${entrada.coverages.length} activas`,
      })
    }
    setErrorFormulario(null)
    setConfirmacion({ tipo: 'alta-poliza', entrada, lineas })
  }

  async function abrirEdicionPoliza(poliza: DatoPoliza) {
    setExito(null)
    setErrorFormulario(null)
    const catalogosCargados = await asegurarCatalogos()
    if (catalogosCargados === null) return
    setPolizaEditando(poliza)
  }

  // El alta se abre desde la ficha del cliente al que se le carga la póliza.
  async function pedirAltaPoliza() {
    setExito(null)
    setErrorFormulario(null)
    const catalogosCargados = await asegurarCatalogos()
    if (catalogosCargados === null) return
    setAltaPoliza(true)
  }

  function confirmarEdicionPoliza(poliza: DatoPoliza, entrada: EntradaEdicionPoliza, coberturas: EntradaCobertura[]) {
    const lineas: LineaConfirmacion[] = []
    if (entrada.number !== undefined && entrada.number !== poliza.number) {
      lineas.push({ etiqueta: 'Número', antes: poliza.number, despues: entrada.number })
    }
    if (entrada.ramo !== undefined && entrada.ramo !== poliza.ramo) {
      lineas.push({ etiqueta: 'Categoría', antes: poliza.ramo, despues: entrada.ramo })
    }
    if (entrada.status !== undefined && entrada.status !== poliza.status) {
      lineas.push({ etiqueta: 'Estado', antes: poliza.status, despues: entrada.status })
    }
    if (entrada.currency !== undefined && entrada.currency !== poliza.currency) {
      lineas.push({ etiqueta: 'Moneda', antes: poliza.currency, despues: entrada.currency })
    }
    const inicioActual = poliza.startDate ?? ''
    if ((entrada.startDate ?? '') !== inicioActual) {
      lineas.push({
        etiqueta: 'Inicio de vigencia',
        antes: inicioActual ? fechaLegible(inicioActual) : '—',
        despues: entrada.startDate ? fechaLegible(entrada.startDate) : '—',
      })
    }
    if (entrada.expirationDate !== undefined && entrada.expirationDate !== poliza.expirationDate) {
      lineas.push({
        etiqueta: 'Vencimiento',
        antes: fechaLegible(poliza.expirationDate),
        despues: fechaLegible(entrada.expirationDate),
      })
    }
    if ((entrada.premiumCents ?? null) !== poliza.premiumCents) {
      lineas.push({
        etiqueta: 'Cuota mensual',
        antes: pesosDe(poliza.premiumCents, poliza.currency) ?? '—',
        despues: pesosDe(entrada.premiumCents ?? null, entrada.currency ?? poliza.currency) ?? '—',
      })
    }
    if ((entrada.observations ?? null) !== (poliza.observations ?? null)) {
      lineas.push({
        etiqueta: 'Observaciones',
        antes: poliza.observations ?? '—',
        despues: entrada.observations ?? '—',
      })
    }
    if (JSON.stringify(entrada.insuredItem ?? null) !== JSON.stringify(poliza.insuredItem)) {
      lineas.push({
        etiqueta: 'Bien asegurado',
        antes: poliza.insuredItem?.description ?? 'Sin bien',
        despues: entrada.insuredItem?.description ?? 'Sin bien',
      })
    }
    const idsActuales = poliza.coverages.map((cobertura) => cobertura.id).sort((a, b) => a - b).join(',')
    const idsNuevos = coberturas.map((cobertura) => cobertura.id ?? 0).sort((a, b) => a - b).join(',')
    const detalleCoberturas = JSON.stringify(coberturas.map((cobertura) => [cobertura.planId, cobertura.description, cobertura.insuredSumCents]))
    const detalleActual = JSON.stringify(poliza.coverages.map((cobertura) => [cobertura.planId, cobertura.description, cobertura.insuredSumCents]))
    if (idsActuales !== idsNuevos || detalleCoberturas !== detalleActual) {
      const quitadas = poliza.coverages.filter((cobertura) => !coberturas.some((nueva) => nueva.id === cobertura.id)).length
      lineas.push({
        etiqueta: 'Coberturas',
        antes: `${poliza.coverages.length} activas`,
        despues: `${coberturas.length} activas${quitadas > 0 ? ` (se dan de baja ${quitadas})` : ''}`,
      })
    }
    if (lineas.length === 0) {
      setErrorFormulario('No hay cambios para guardar.')
      return
    }
    setErrorFormulario(null)
    setConfirmacion({ tipo: 'editar-poliza', polizaId: poliza.id, entrada, coberturas, lineas })
  }

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
              : 'Cargá un cliente nuevo con el botón de arriba, o migrate la planilla histórica.'
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
                  className="tabla__fila"
                  aria-current={activo ? 'true' : undefined}
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
                      className={`tabla__ver${activo ? ' tabla__ver--activo' : ''}`}
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
      <PageHeader
        titulo={modulo.nombre}
        descripcion={modulo.descripcion}
        acciones={
          <button type="button" className="boton boton--primario" onClick={pedirAlta}>
            Nuevo cliente
          </button>
        }
      />

      {exito !== null ? (
        <p className="aviso-exito" role="status">
          {exito}
        </p>
      ) : null}

      <div className="busqueda">
        <label className="busqueda__etiqueta" htmlFor="busqueda-clientes">
          Buscar cliente
        </label>
        <input
          id="busqueda-clientes"
          className="busqueda__campo"
          type="search"
          autoComplete="off"
          placeholder="Buscar por nombre, apellido o razón social; DNI, CUIT o teléfono (con o sin puntos)"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
        />
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
                <div className="detalle-panel__acciones">
                  <button
                    type="button"
                    className="boton"
                    onClick={() => {
                      setExito(null)
                      setErrorFormulario(null)
                      setEditandoIdentidad(true)
                    }}
                  >
                    Editar datos
                  </button>
                  <button
                    type="button"
                    className="boton boton--peligro"
                    onClick={() => confirmarBajaCliente(detalle)}
                  >
                    Dar de baja
                  </button>
                </div>

                <dl className="detalle-panel__datos">
                  <dt>Identificación</dt>
                  <dd>{identificacion(detalle)}</dd>

                  <dt>Teléfonos</dt>
                  <dd>
                    {detalle.phones.length > 0 ? (
                      <ul className="detalle-panel__telefonos">
                        {detalle.phones.map((telefono) => (
                          <li key={telefono.id} className="detalle-panel__telefono">
                            <span>{telefono.number}</span>
                            <button
                              type="button"
                              className="detalle-panel__telefono-quitar"
                              onClick={() => confirmarDesvinculo(telefono)}
                            >
                              Desvincular
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      'Sin teléfono vinculado'
                    )}
                  </dd>
                </dl>

                <form
                  className="detalle-panel__telefono-alta"
                  onSubmit={(evento) => {
                    evento.preventDefault()
                    confirmarVinculoTelefono(nuevoTelefono)
                  }}
                >
                  <label htmlFor="nuevo-telefono">Agregar teléfono</label>
                  <div className="detalle-panel__telefono-fila">
                    <input
                      id="nuevo-telefono"
                      type="tel"
                      autoComplete="off"
                      placeholder="5491155551234"
                      value={nuevoTelefono}
                      onChange={(evento) => setNuevoTelefono(evento.target.value)}
                    />
                    <button type="submit" className="boton" disabled={nuevoTelefono.trim() === ''}>
                      Vincular
                    </button>
                  </div>
                </form>

                <section className="detalle-panel__polizas">
                  <div className="detalle-panel__polizas-encabezado">
                    <h3 className="detalle-panel__subtitulo">Pólizas ({detalle.policies.length})</h3>
                    <button type="button" className="boton" onClick={() => void pedirAltaPoliza()}>
                      Nueva póliza
                    </button>
                  </div>
                  {detalle.policies.length === 0 ? (
                    <p className="detalle-panel__aviso">Este cliente no tiene pólizas cargadas.</p>
                  ) : (
                    detalle.policies.map((poliza) => {
                      const prima = pesosDe(poliza.premiumCents, poliza.currency)
                      return (
                        <article key={poliza.id} className="detalle-panel__poliza">
                          <header className="detalle-panel__poliza-encabezado">
                            <h4 className="detalle-panel__poliza-numero">{poliza.number}</h4>
                            {badgeDePoliza(poliza)}
                          </header>

                          <dl className="detalle-panel__datos">
                            <dt>Categoría</dt>
                            <dd>{poliza.ramo}</dd>

                            <dt>Vigencia</dt>
                            <dd>{vigenciaDe(poliza.startDate, poliza.expirationDate)}</dd>

                            {prima !== null ? (
                              <>
                                <dt>Cuota mensual</dt>
                                <dd>{prima}</dd>
                              </>
                            ) : null}

                            {poliza.coverages.length > 0 ? (
                              <>
                                <dt>Coberturas</dt>
                                <dd>
                                  <ul className="detalle-panel__coberturas">
                                    {poliza.coverages.map((cobertura) => (
                                      <li key={cobertura.id}>
                                        {cobertura.planName}
                                        {cobertura.description ? ` — ${cobertura.description}` : ''}
                                        {cobertura.insuredSumCents !== null
                                          ? ` (${pesosDe(cobertura.insuredSumCents, poliza.currency)})`
                                          : ''}
                                      </li>
                                    ))}
                                  </ul>
                                </dd>
                              </>
                            ) : null}
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

                          <button
                            type="button"
                            className="boton"
                            onClick={() => void abrirEdicionPoliza(poliza)}
                          >
                            Editar póliza
                          </button>
                        </article>
                      )
                    })
                  )}
                </section>
              </>
            ) : null}
          </aside>
        ) : null}
      </div>

      {modoAlta ? (
        <FormularioCliente
          modo="alta"
          ocupado={guardando}
          error={errorFormulario}
          onGuardar={confirmarAlta}
          onCancelar={() => {
            setModoAlta(false)
            setErrorFormulario(null)
          }}
        />
      ) : null}

      {editandoIdentidad && detalle !== null ? (
        <FormularioCliente
          modo="edicion"
          cliente={detalle}
          ocupado={guardando}
          error={errorFormulario}
          onGuardar={(entrada) => confirmarEdicionCliente(detalle, entrada as EntradaEdicionCliente)}
          onCancelar={() => {
            setEditandoIdentidad(false)
            setErrorFormulario(null)
          }}
        />
      ) : null}

      {altaPoliza && catalogos !== null ? (
        <FormularioPoliza
          modo="alta"
          catalogos={catalogos}
          ocupado={guardando}
          error={errorFormulario}
          onGuardar={confirmarAltaPoliza}
          onCancelar={() => {
            setAltaPoliza(false)
            setErrorFormulario(null)
          }}
        />
      ) : null}

      {polizaEditando !== null && catalogos !== null ? (
        <FormularioPoliza
          modo="edicion"
          poliza={polizaEditando}
          catalogos={catalogos}
          ocupado={guardando}
          error={errorFormulario}
          onGuardar={(entrada, coberturas) => confirmarEdicionPoliza(polizaEditando, entrada, coberturas)}
          onCancelar={() => {
            setPolizaEditando(null)
            setErrorFormulario(null)
          }}
        />
      ) : null}

      {confirmacion !== null ? (
        <div className="modal-superpuesto">
          <ConfirmarCambio
            titulo={tituloDeConfirmacion(confirmacion, detalle)}
            descripcion={descripcionDeConfirmacion(confirmacion)}
            lineas={confirmacion.lineas}
            etiquetaConfirmar={
              confirmacion.tipo === 'baja-cliente' ? 'Confirmar baja'
                : confirmacion.tipo === 'desvincular-telefono' ? 'Confirmar desvinculación'
                  : 'Confirmar cambio'
            }
            peligro={esPeligroso(confirmacion)}
            ocupado={guardando}
            error={errorConfirmacion}
            onConfirmar={() => void aplicarConfirmacion()}
            onCancelar={() => {
              if (guardando) return
              setConfirmacion(null)
              setErrorConfirmacion(null)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
