import type { Modulo } from '../navigation'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'

export default function TramitesAprobar({ modulo }: { modulo: Modulo }) {
  return (
    <div className="pagina">
      <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />

      <EstadoPanel
        titulo="No hay trámites pendientes de aprobación"
        descripcion="Cada baja, modificación de contrato o alta de conductor se muestra con el motivo, el estado actual y la autoridad requerida. Al aprobar se registra quién, cuándo y por qué."
        acciones={
          <span className="chip chip--neutro">
            Autorizan: Administrador y Operadores habilitados
          </span>
        }
      />
    </div>
  )
}
