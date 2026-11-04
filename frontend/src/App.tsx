import { useEffect, useState, type ComponentType } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import BandejaAtencion from './pages/BandejaAtencion'
import TramitesAprobar from './pages/TramitesAprobar'
import BaseClientes from './pages/BaseClientes'
import Login from './pages/Login'
import { listarBandeja } from './api/bandeja'
import { obtenerMetricasDashboard, type DashboardMetrics } from './api/dashboard'
import {
  MODULOS,
  type DestinoBandeja,
  type DestinoClientes,
  type Modulo,
  type ModuloPanel,
  type OpcionesNavegacion,
} from './navigation'
import type { UsuarioPanel } from './usuario'
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
}

function App() {
  const [activo, setActivo] = useState<ModuloPanel>('dashboard')
  const [bandejaInicial, setBandejaInicial] = useState<DestinoBandeja | undefined>(undefined)
  const [clientesInicial, setClientesInicial] = useState<DestinoClientes | undefined>(undefined)
  const [usuario, setUsuario] = useState<UsuarioPanel | null>(null)
  const [metricas, setMetricas] = useState<DashboardMetrics | null>(null)
  const [cargandoMetricas, setCargandoMetricas] = useState(true)
  const [errorMetricas, setErrorMetricas] = useState<string | null>(null)
  const [casosPendientes, setCasosPendientes] = useState<number | null>(null)
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
        obtenerMetricasDashboard(actual.signal),
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
  }, [usuario])

  // El destino de la bandeja o de la base de clientes viaja con la navegación
  // y se descarta al salir de ese módulo.
  function navegar(destino: ModuloPanel, opciones?: OpcionesNavegacion) {
    setBandejaInicial(destino === 'bandeja' ? opciones?.bandeja : undefined)
    setClientesInicial(destino === 'clientes' ? opciones?.clientes : undefined)
    setActivo(destino)
  }

  function manejarIngreso(nuevoUsuario: UsuarioPanel) {
    setUsuario(nuevoUsuario)
    setActivo(nuevoUsuario.rol === 'administrador' ? 'dashboard' : 'bandeja')
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
        <Login onIngresar={manejarIngreso} />
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
          onCerrarSesion={() => setUsuario(null)}
        />

        <main
          className={`panel__principal${activo === 'dashboard' ? ' panel__principal--dashboard' : ''}`}
          id="contenido"
        >
          {activo === 'dashboard' ? (
            <div className="dashboard-manchas" aria-hidden="true">
              <span className="dashboard-mancha dashboard-mancha--superior" />
              <span className="dashboard-mancha dashboard-mancha--inferior" />
              <span className="dashboard-mancha dashboard-mancha--centro" />
            </div>
          ) : null}
          {Pagina === undefined
            ? (
              <Dashboard
                modulo={modulo}
                rol={usuario.rol}
                onNavegar={navegar}
                metricas={metricas}
                cargandoMetricas={cargandoMetricas}
                errorMetricas={errorMetricas}
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
