import { useEffect, useState } from 'react'
import type { Modulo, ModuloPanel } from '../navigation'
import type { RolUsuario } from '../usuario'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'
import {
  IconoAlerta,
  IconoArchivoCheck,
  IconoCampana,
  IconoPausa,
} from '../components/iconos'
import { obtenerMetricasDashboard, type DashboardMetrics } from '../api/dashboard'

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
        <div className="tarjetas tarjetas--kpi">
          <article className="tarjeta tarjeta--kpi">
            <span className="tarjeta__icono tarjeta__icono--rose" aria-hidden="true">
              <IconoCampana />
            </span>
            <span className="tarjeta__etiqueta">Casos derivados sin tomar</span>
            <span className="tarjeta__valor tarjeta__valor--kpi">—</span>
            <span className="tarjeta__nota">60 minutos para alertar, valor provisional.</span>
          </article>

          <article className="tarjeta tarjeta--kpi">
            <span className="tarjeta__icono tarjeta__icono--pink" aria-hidden="true">
              <IconoPausa />
            </span>
            <span className="tarjeta__etiqueta">Respuestas retenidas</span>
            <span className="tarjeta__valor tarjeta__valor--kpi">—</span>
            <span className="tarjeta__nota">Se retienen y derivan, nunca se envían.</span>
          </article>

          <article className="tarjeta tarjeta--kpi">
            <span className="tarjeta__icono tarjeta__icono--amber" aria-hidden="true">
              <IconoArchivoCheck />
            </span>
            <span className="tarjeta__etiqueta">Trámites por aprobar</span>
            <span className="tarjeta__valor tarjeta__valor--kpi">
              {cargandoMetricas ? '…' : (metricas?.tramitesPorAprobar ?? '—')}
            </span>
            <span className="tarjeta__nota">Bajas, contrato y alta de conductor.</span>
          </article>

          <article className="tarjeta tarjeta--kpi">
            <span className="tarjeta__icono tarjeta__icono--red" aria-hidden="true">
              <IconoAlerta />
            </span>
            <span className="tarjeta__etiqueta">Alertas de riesgo abiertas</span>
            <span className="tarjeta__valor tarjeta__valor--kpi">
              {cargandoMetricas ? '…' : (metricas?.alertasRiesgoAbiertas ?? '—')}
            </span>
            <span className="tarjeta__nota">Gravedad y motivo, no solo color.</span>
          </article>
        </div>
      </section>

      {errorMetricas ? (
        <EstadoPanel
          titulo="No se pudieron cargar las métricas"
          descripcion={errorMetricas}
          tono="alerta"
        />
      ) : cargandoMetricas ? (
        <EstadoPanel
          titulo="Cargando métricas"
          descripcion="Estamos consultando los datos actuales de la base."
        />
      ) : (
        <section aria-labelledby="resumen-general-titulo">
          <h2 id="resumen-general-titulo">Resumen general</h2>
          <div className="tarjetas">
            <article className="tarjeta">
              <span className="tarjeta__etiqueta">Casos abiertos</span>
              <span className="tarjeta__valor">{metricas?.resumenGeneral.totalAbiertos ?? '—'}</span>
            </article>
            <article className="tarjeta">
              <span className="tarjeta__etiqueta">Casos cerrados</span>
              <span className="tarjeta__valor">{metricas?.resumenGeneral.totalCerrados ?? '—'}</span>
            </article>
            <article className="tarjeta">
              <span className="tarjeta__etiqueta">Tasa de automatización</span>
              <span className="tarjeta__valor">
                {metricas?.resumenGeneral.tasaAutomatizacionBot ?? '—'}%
              </span>
            </article>
          </div>
        </section>
      )}
    </div>
  )
}
