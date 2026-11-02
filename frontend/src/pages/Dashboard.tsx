import { useEffect, useState } from 'react'
import type { Modulo, ModuloPanel } from '../navigation'
import type { RolUsuario } from '../usuario'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'
import { obtenerMetricasDashboard, type DashboardMetrics } from '../api/dashboard'

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
  const [metricas, setMetricas] = useState<DashboardMetrics | null>(null)
  const [cargandoMetricas, setCargandoMetricas] = useState(true)
  const [errorMetricas, setErrorMetricas] = useState<string | null>(null)

  useEffect(() => {
    if (rol === 'operador') return
    const controller = new AbortController()
    obtenerMetricasDashboard(controller.signal)
      .then(setMetricas)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setErrorMetricas(error instanceof Error ? error.message : 'No se pudieron cargar las métricas.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoMetricas(false)
      })
    return () => controller.abort()
  }, [rol])

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
              <span className="tarjeta__valor">
                {cargandoMetricas
                  ? '…'
                  : indicador.etiqueta === 'Trámites por aprobar'
                    ? (metricas?.tramitesPorAprobar ?? '—')
                    : '—'}
              </span>
              <span className="tarjeta__nota">{indicador.nota}</span>
            </article>
          ))}
        </div>
      </section>

      {errorMetricas ? (
        <EstadoPanel
          titulo="No se pudieron cargar las métricas"
          descripcion={errorMetricas}
          tono="alerta"
        />
      ) : (
        <EstadoPanel
          titulo={cargandoMetricas ? 'Cargando métricas' : 'Trámites por aprobar'}
          descripcion={cargandoMetricas
            ? 'Estamos consultando los datos actuales de la base.'
            : `${metricas?.tramitesPorAprobar ?? 0} trámite(s) pendiente(s) de aprobación.`}
        />
      )}
    </div>
  )
}
