import { useCallback, useEffect, useState, type ComponentType } from 'react'
import Sidebar, { type EstadoUsuario } from './components/Sidebar'
import EstadoPanel from './components/EstadoPanel'
import Dashboard from './pages/Dashboard'
import BandejaAtencion from './pages/BandejaAtencion'
import TramitesAprobar from './pages/TramitesAprobar'
import BaseClientes from './pages/BaseClientes'
import { MODULOS, type Modulo, type ModuloPanel } from './navigation'
import { obtenerUsuarioActual, type UsuarioActual } from './api/usuarios'
import './App.css'

const PAGINAS: Record<ModuloPanel, ComponentType<{ modulo: Modulo }>> = {
  dashboard: Dashboard,
  bandeja: BandejaAtencion,
  tramites: TramitesAprobar,
  clientes: BaseClientes,
}

function App() {
  const [activo, setActivo] = useState<ModuloPanel>('dashboard')
  const [usuario, setUsuario] = useState<UsuarioActual | null>(null)
  const [estadoUsuario, setEstadoUsuario] = useState<EstadoUsuario>('cargando')
  const [sesionCerrada, setSesionCerrada] = useState(false)
  const [intento, setIntento] = useState(0)

  const modulo = MODULOS.find((item) => item.id === activo) ?? MODULOS[0]
  const Pagina = PAGINAS[activo]

  useEffect(() => {
    let vigente = true
    obtenerUsuarioActual()
      .then((cargado) => {
        if (!vigente) return
        setUsuario(cargado)
        setEstadoUsuario('listo')
      })
      .catch(() => {
        if (!vigente) return
        setUsuario(null)
        setEstadoUsuario('error')
      })
    return () => {
      vigente = false
    }
  }, [intento])

  const reintentarUsuario = useCallback(() => {
    // El estado de carga se marca acá (en el evento), no dentro del efecto.
    setEstadoUsuario('cargando')
    setIntento((anterior) => anterior + 1)
  }, [])

  return (
    <div className="panel">
      <a className="enlace-salto" href="#contenido">
        Ir al contenido
      </a>

      <Sidebar
        activo={activo}
        onNavegar={setActivo}
        usuario={usuario}
        estadoUsuario={estadoUsuario}
        onReintentarUsuario={reintentarUsuario}
        onCerrarSesion={() => setSesionCerrada(true)}
        sesionCerrada={sesionCerrada}
        onIniciarSesion={() => setSesionCerrada(false)}
      />

      <main className="panel__principal" id="contenido">
        {sesionCerrada ? (
          <div className="pagina">
            <EstadoPanel
              titulo="Sesión cerrada"
              descripcion="Cierre de sesión simulado: todavía no existe login en el sistema."
              acciones={
                <button
                  type="button"
                  className="boton boton--primario"
                  onClick={() => setSesionCerrada(false)}
                >
                  Iniciar sesión
                </button>
              }
            />
          </div>
        ) : (
          <Pagina modulo={modulo} />
        )}
      </main>
    </div>
  )
}

export default App
