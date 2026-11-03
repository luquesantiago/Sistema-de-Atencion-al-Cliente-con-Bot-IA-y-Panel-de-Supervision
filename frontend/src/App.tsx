import { useEffect, useState, type ComponentType } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import BandejaAtencion from './pages/BandejaAtencion'
import TramitesAprobar from './pages/TramitesAprobar'
import BaseClientes from './pages/BaseClientes'
import Configuracion from './pages/Configuracion'
import Login from './pages/Login'
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
  const [bandejaInicial, setBandejaInicial] = useState<DestinoBandeja | undefined>(undefined)
  const [clientesInicial, setClientesInicial] = useState<DestinoClientes | undefined>(undefined)
  const [usuario, setUsuario] = useState<UsuarioPanel | null>(null)
  // Al cargar, el panel pregunta al backend si ya hay una sesión abierta (cookie httpOnly).
  const [verificando, setVerificando] = useState(true)
  const [sesionVencida, setSesionVencida] = useState(false)
  const modulo = MODULOS.find((item) => item.id === activo) ?? MODULOS[0]
  const Pagina = activo === 'dashboard' ? undefined : PAGINAS[activo]

  // El destino de la bandeja o de la base de clientes viaja con la navegación
  // y se descarta al salir de ese módulo.
  function navegar(destino: ModuloPanel, opciones?: OpcionesNavegacion) {
    setBandejaInicial(destino === 'bandeja' ? opciones?.bandeja : undefined)
    setClientesInicial(destino === 'clientes' ? opciones?.clientes : undefined)
    setActivo(destino)
  }

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
          onNavegar={navegar}
          onCerrarSesion={() => void manejarCierre()}
        />

        <main className="panel__principal" id="contenido">
          {Pagina === undefined
            ? <Dashboard modulo={modulo} rol={usuario.rol} onNavegar={navegar} />
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
