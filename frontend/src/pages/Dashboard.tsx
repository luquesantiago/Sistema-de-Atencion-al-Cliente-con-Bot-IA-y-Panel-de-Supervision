import type { Modulo, ModuloPanel } from '../navigation'
import type { RolUsuario } from '../usuario'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'

const INDICADORES = [
  {
    etiqueta: 'Casos derivados sin tomar',
    nota: '60 minutos para alertar, valor provisional.',
  },
  {
    etiqueta: 'Respuestas retenidas',
    nota: 'Se retienen y derivan; nunca se envían.',
  },
  {
    etiqueta: 'Trámites por aprobar',
    nota: 'Bajas, contrato y alta de conductor.',
  },
  {
    etiqueta: 'Alertas de riesgo abiertas',
    nota: 'Gravedad y motivo, no solo color.',
  },
]

interface DashboardProps {
  modulo: Modulo
  rol: RolUsuario
  onNavegar: (modulo: ModuloPanel) => void
}

export default function Dashboard({ modulo, rol, onNavegar }: DashboardProps) {
  if (rol === 'operador') {
    return (
      <div className="pagina">
        <PageHeader
          titulo="Tu espacio de atención"
          descripcion="Gestioná las conversaciones derivadas y continuá la atención de cada cliente."
        />
        <section className="operativo" aria-labelledby="operativo-titulo">
          <div>
            <h2 className="operativo__titulo" id="operativo-titulo">Atención de clientes</h2>
            <p className="operativo__texto">
              La bandeja reúne los casos que requieren seguimiento del equipo. Desde allí podés
              revisar cada conversación, responder y cerrar los casos a tu cargo.
            </p>
          </div>
          <button
            className="boton boton--primario"
            type="button"
            onClick={() => onNavegar('bandeja')}
          >
            Ir a Bandeja de Atención
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="pagina">
      <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />

      <section aria-label="Indicadores del día">
        <div className="tarjetas">
          {INDICADORES.map((indicador) => (
            <article className="tarjeta" key={indicador.etiqueta}>
              <span className="tarjeta__etiqueta">{indicador.etiqueta}</span>
              <span className="tarjeta__valor">—</span>
              <span className="tarjeta__nota">{indicador.nota}</span>
            </article>
          ))}
        </div>
      </section>

      <EstadoPanel
        titulo="Todavía no hay datos para mostrar"
        descripcion="Los indicadores se completan cuando la cartera y la cola de derivaciones estén cargadas. No se muestran valores de ejemplo para no confundirlos con datos reales."
      />
    </div>
  )
}
