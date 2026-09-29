import type { Modulo } from '../navigation'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'

export default function TramitesAprobar({ modulo }: { modulo: Modulo }) {
  return (
    <div className="pagina">
      <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />

      <EstadoPanel
        titulo="No hay trámites pendientes de aprobación"
        descripcion="Cada pedido se muestra con el motivo, el estado actual y la autoridad requerida. El cambio de teléfono es un dato de cartera y no una acción crítica, así que no genera la alerta de pedido de acción crítica. Al decidir se registra quién, cuándo y con qué fundamento."
        acciones={
          <span className="chip chip--neutro">
            Autorizan: Administrador y Operadores habilitados
          </span>
        }
      />
    </div>
  )
}
