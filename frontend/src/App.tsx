import { useState, type ComponentType } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import BandejaAtencion from './pages/BandejaAtencion'
import TramitesAprobar from './pages/TramitesAprobar'
import BaseClientes from './pages/BaseClientes'
import { MODULOS, type Modulo, type ModuloPanel } from './navigation'
import './App.css'

const PAGINAS: Record<ModuloPanel, ComponentType<{ modulo: Modulo }>> = {
  dashboard: Dashboard,
  bandeja: BandejaAtencion,
  tramites: TramitesAprobar,
  clientes: BaseClientes,
}

function App() {
  const [activo, setActivo] = useState<ModuloPanel>('dashboard')
  const modulo = MODULOS.find((item) => item.id === activo) ?? MODULOS[0]
  const Pagina = PAGINAS[activo]

  return (
    <div className="panel">
      <a className="enlace-salto" href="#contenido">
        Ir al contenido
      </a>

      <Sidebar activo={activo} onNavegar={setActivo} />

      <main className="panel__principal" id="contenido">
        <Pagina modulo={modulo} />
      </main>
    </div>
  )
}

export default App
