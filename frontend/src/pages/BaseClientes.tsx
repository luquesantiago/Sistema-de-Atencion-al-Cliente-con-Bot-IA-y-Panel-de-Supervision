import type { Modulo } from '../navigation'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'

export default function BaseClientes({ modulo }: { modulo: Modulo }) {
  return (
    <div className="pagina">
      <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />

      <EstadoPanel
        titulo="La cartera todavía no está cargada"
        descripcion="Los clientes se identifican por DNI: el teléfono no identifica, porque una persona puede tener varios teléfonos y un teléfono puede pertenecer a varias personas. Las pólizas irresolubles quedan listadas para carga manual."
        acciones={
          <span className="chip chip--alerta">
            2 pólizas pendientes de carga manual
          </span>
        }
      />
    </div>
  )
}
