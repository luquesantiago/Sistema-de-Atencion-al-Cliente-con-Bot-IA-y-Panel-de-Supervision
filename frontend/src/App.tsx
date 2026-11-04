import { useEffect, useRef, useState, type ComponentType } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import BandejaAtencion from './pages/BandejaAtencion'
import TramitesAprobar from './pages/TramitesAprobar'
import BaseClientes from './pages/BaseClientes'
import Configuracion from './pages/Configuracion'
import Login from './pages/Login'
import { listarBandeja } from './api/bandeja'
import {
  obtenerMetricasDashboard,
  type DashboardMetrics,
  type DashboardResponsePeriod,
} from './api/dashboard'
import { EVENTO_SESION_VENCIDA } from './api/respuesta'
import { cerrarSesion, obtenerSesion } from './api/sesion'
import {
  MODULOS,
  type DestinoBandeja,
  type DestinoClientes,
  type Modulo,
  type ModuloPanel,
  type OpcionesNavegacion,
} from './navigation'
import { usuarioDesdeSesion, type RolUsuario, type UsuarioPanel } from './usuario'
import './App.css'

type PropsPagina = {
  modulo: Modulo
  onNavegar: (destino: ModuloPanel, opciones?: OpcionesNavegacion) => void
  bandejaInicial?: DestinoBandeja
  clientesInicial?: DestinoClientes
}

const PAGINAS: Record<Exclude<ModuloPanel, 'dashboard'>, ComponentType<PropsPagina>> = {
  bandeja: BandejaAtencion,
  tramites: TramitesAprobar,
  clientes: BaseClientes,
  configuracion: Configuracion,
}

// El administrador entra al Dashboard; el operador, que no lo ve, a la Bandeja.
function moduloInicial(rol: RolUsuario): ModuloPanel {
  return rol === 'administrador' ? 'dashboard' : 'bandeja'
}

function App() {
  const [activo, setActivo] = useState<ModuloPanel>('dashboard')
  const [navegacionCambiando, setNavegacionCambiando] = useState(false)
  const [bandejaInicial, setBandejaInicial] = useState<DestinoBandeja | undefined>(undefined)
  const [clientesInicial, setClientesInicial] = useState<DestinoClientes | undefined>(undefined)
  const [usuario, setUsuario] = useState<UsuarioPanel | null>(null)
  const [metricas, setMetricas] = useState<DashboardMetrics | null>(null)
  const [cargandoMetricas, setCargandoMetricas] = useState(true)
  const [errorMetricas, setErrorMetricas] = useState<string | null>(null)
  const [casosPendientes, setCasosPendientes] = useState<number | null>(null)
  const [periodoRespuestas, setPeriodoRespuestas] = useState<DashboardResponsePeriod>('semanal')
  // Al cargar, el panel pregunta al backend si ya hay una sesión abierta (cookie httpOnly).
  const [verificando, setVerificando] = useState(true)
  const [sesionVencida, setSesionVencida] = useState(false)
  const temporizadorNavegacion = useRef<number | null>(null)
  const modulo = MODULOS.find((item) => item.id === activo) ?? MODULOS[0]
  const Pagina = activo === 'dashboard' ? undefined : PAGINAS[activo]

  useEffect(() => {
    if (usuario === null) return
    let vigente = true
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let controlador: AbortController | undefined

    async function actualizarContadores() {
      const actual = new AbortController()
      controlador = actual
      const [resultadoMetricas, resultadoBandeja] = await Promise.allSettled([
        obtenerMetricasDashboard(periodoRespuestas, actual.signal),
        listarBandeja({ limit: 1, offset: 0 }, actual.signal),
      ])
      if (!vigente || actual.signal.aborted) return

      if (resultadoMetricas.status === 'fulfilled') {
        setMetricas(resultadoMetricas.value)
        setErrorMetricas(null)
      } else {
        const error = resultadoMetricas.reason
        const mensaje = error instanceof Error ? error.message : 'No se pudieron cargar las métricas.'
        setErrorMetricas(mensaje)
        console.error('No se pudieron actualizar las métricas del Dashboard.', error)
      }

      if (resultadoBandeja.status === 'fulfilled') {
        setCasosPendientes(resultadoBandeja.value.total)
      } else {
        console.error('No se pudo actualizar el contador de la Bandeja de Atención.', resultadoBandeja.reason)
      }

      setCargandoMetricas(false)
      temporizador = setTimeout(() => void actualizarContadores(), 5000)
    }

    void actualizarContadores()
    return () => {
      vigente = false
      if (temporizador !== undefined) clearTimeout(temporizador)
      controlador?.abort()
    }
  }, [usuario, periodoRespuestas])

  // El destino de la bandeja o de la base de clientes viaja con la navegación
  // y se descarta al salir de ese módulo.
  function navegar(destino: ModuloPanel, opciones?: OpcionesNavegacion) {
    if (destino === activo) {
      setBandejaInicial(destino === 'bandeja' ? opciones?.bandeja : undefined)
      setClientesInicial(destino === 'clientes' ? opciones?.clientes : undefined)
      return
    }

    if (temporizadorNavegacion.current !== null) {
      window.clearTimeout(temporizadorNavegacion.current)
    }

    const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (movimientoReducido) {
      setBandejaInicial(destino === 'bandeja' ? opciones?.bandeja : undefined)
      setClientesInicial(destino === 'clientes' ? opciones?.clientes : undefined)
      setActivo(destino)
      setNavegacionCambiando(false)
      return
    }

    setNavegacionCambiando(true)
    temporizadorNavegacion.current = window.setTimeout(() => {
      setBandejaInicial(destino === 'bandeja' ? opciones?.bandeja : undefined)
      setClientesInicial(destino === 'clientes' ? opciones?.clientes : undefined)
      setActivo(destino)
      setNavegacionCambiando(false)
      temporizadorNavegacion.current = null
    }, 90)
  }

  useEffect(() => {
    return () => {
      if (temporizadorNavegacion.current !== null) {
        window.clearTimeout(temporizadorNavegacion.current)
      }
    }
  }, [])

  useEffect(() => {
    let vigente = true
    obtenerSesion()
      .then((sesion) => {
        if (!vigente || sesion === null) return
        const recuperado = usuarioDesdeSesion(sesion)
        setUsuario(recuperado)
        setActivo(moduloInicial(recuperado.rol))
      })
      .catch(() => {
        // Sin respuesta del backend: se muestra el inicio de sesión.
      })
      .finally(() => {
        if (vigente) setVerificando(false)
      })
    return () => {
      vigente = false
    }
  }, [])

  // Cualquier pedido que responde 401 (sesión vencida, cerrada o usuario dado de baja)
  // vuelve a la pantalla de inicio.
  useEffect(() => {
    function alVencer() {
      setSesionVencida(true)
      setUsuario(null)
    }
    window.addEventListener(EVENTO_SESION_VENCIDA, alVencer)
    return () => window.removeEventListener(EVENTO_SESION_VENCIDA, alVencer)
  }, [])

  function manejarIngreso(nuevoUsuario: UsuarioPanel) {
    setSesionVencida(false)
    setUsuario(nuevoUsuario)
    setActivo(moduloInicial(nuevoUsuario.rol))
  }

  async function manejarCierre() {
    try {
      await cerrarSesion()
    } catch {
      // Si el backend no responde, la cookie vence sola a las 8 horas; igual se vuelve al inicio.
    }
    setSesionVencida(false)
    setUsuario(null)
  }

  const capaAmbiental = (
    <div className="ambient-layer" aria-hidden="true">
      <div className="ambient-orb ambient-orb--uno" />
      <div className="ambient-orb ambient-orb--dos" />
    </div>
  )

  if (usuario === null) {
    return (
      <>
        {capaAmbiental}
        <Login onIngresar={manejarIngreso} verificando={verificando} sesionVencida={sesionVencida} />
      </>
    )
  }

  return (
    <>
      {capaAmbiental}
      <div className="panel">
        <a className="enlace-salto" href="#contenido">
          Ir al contenido
        </a>

        <Sidebar
          activo={activo}
          usuario={usuario}
          casosPendientes={casosPendientes}
          tramitesPendientes={metricas?.tramitesPorAprobar ?? null}
          onNavegar={navegar}
          onCerrarSesion={() => void manejarCierre()}
        />

        <main
          className={`panel__principal${activo === 'dashboard' ? ' panel__principal--dashboard' : ''}${navegacionCambiando ? ' panel__principal--saliendo' : ''}`}
          id="contenido"
          key={activo}
        >
          <div className="dashboard-manchas" aria-hidden="true">
            <span className="dashboard-mancha dashboard-mancha--superior" />
            <span className="dashboard-mancha dashboard-mancha--inferior" />
            <span className="dashboard-mancha dashboard-mancha--centro" />
          </div>
          {Pagina === undefined
            ? (
              <Dashboard
                modulo={modulo}
                rol={usuario.rol}
                onNavegar={navegar}
                metricas={metricas}
                cargandoMetricas={cargandoMetricas}
                errorMetricas={errorMetricas}
                periodoRespuestas={periodoRespuestas}
                onCambiarPeriodoRespuestas={setPeriodoRespuestas}
              />
            )
            : (
              <Pagina
                modulo={modulo}
                onNavegar={navegar}
                bandejaInicial={bandejaInicial}
                clientesInicial={clientesInicial}
              />
            )}
        </main>
      </div>
    </>
  )
}

export default App
