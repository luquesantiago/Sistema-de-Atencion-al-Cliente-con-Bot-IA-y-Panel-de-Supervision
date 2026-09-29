import type { Modulo } from '../navigation'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'

export default function BandejaAtencion({ modulo }: { modulo: Modulo }) {
  return (
    <div className="pagina">
      <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />

      <EstadoPanel
        titulo="No hay casos derivados en la cola"
        descripcion="Acá van a aparecer las conversaciones que el asistente derivó, con prioridad, cliente, último mensaje, responsable y tiempo de espera. Lo que el cliente siga escribiendo queda en el mismo caso."
      />
    </div>
  )
}
