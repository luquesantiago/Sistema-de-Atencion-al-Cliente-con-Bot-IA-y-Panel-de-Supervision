import type { Modulo } from '../navigation'
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

export default function Dashboard({ modulo }: { modulo: Modulo }) {
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
