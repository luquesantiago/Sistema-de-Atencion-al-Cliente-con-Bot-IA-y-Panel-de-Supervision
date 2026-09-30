import { useState, type ComponentType } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import BandejaAtencion from './pages/BandejaAtencion'
import TramitesAprobar from './pages/TramitesAprobar'
import BaseClientes from './pages/BaseClientes'
import Login from './pages/Login'
import { MODULOS, type Modulo, type ModuloPanel } from './navigation'
import type { UsuarioPanel } from './usuario'
import './App.css'

const PAGINAS: Record<Exclude<ModuloPanel, 'dashboard'>, ComponentType<{ modulo: Modulo }>> = {
  bandeja: BandejaAtencion,
  tramites: TramitesAprobar,
  clientes: BaseClientes,
}

function App() {
  const [activo, setActivo] = useState<ModuloPanel>('dashboard')
  const [usuario, setUsuario] = useState<UsuarioPanel | null>(null)
  const modulo = MODULOS.find((item) => item.id === activo) ?? MODULOS[0]
  const Pagina = activo === 'dashboard' ? undefined : PAGINAS[activo]

  function manejarIngreso(nuevoUsuario: UsuarioPanel) {
    setUsuario(nuevoUsuario)
    setActivo(nuevoUsuario.rol === 'operador' ? 'bandeja' : 'dashboard')
  }

  if (usuario === null) {
    return <Login onIngresar={manejarIngreso} />
  }

  return (
    <div className="panel">
      <a className="enlace-salto" href="#contenido">
        Ir al contenido
      </a>

      <Sidebar
        activo={activo}
        usuario={usuario}
        onNavegar={setActivo}
        onCerrarSesion={() => setUsuario(null)}
      />

      <main className="panel__principal" id="contenido">
        {Pagina === undefined
          ? <Dashboard modulo={modulo} rol={usuario.rol} onNavegar={setActivo} />
          : <Pagina modulo={modulo} />}
      </main>
    </div>
  )
}

export default App
