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
import type { DashboardHourlyVolume, DashboardMetrics } from '../api/dashboard'

const GRAFICO_ANCHO = 500
const GRAFICO_ALTO = 150
const GRAFICO_BASE = 126
const GRAFICO_TOPE = 12
const GRAFICO_MAXIMO_ETIQUETAS = 8

type PuntoGrafico = {
  x: number
  y: number
  hora: string
  cantidad: number
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100
}

function construirPuntos(volumen: DashboardHourlyVolume[]): PuntoGrafico[] {
  const maximo = Math.max(1, ...volumen.map((item) => item.cantidad))
  const paso = volumen.length > 1 ? GRAFICO_ANCHO / (volumen.length - 1) : GRAFICO_ANCHO
  return volumen.map((item, indice) => ({
    x: redondear(indice * paso),
    y: redondear(GRAFICO_BASE - (item.cantidad / maximo) * (GRAFICO_BASE - GRAFICO_TOPE)),
    hora: item.hora,
    cantidad: item.cantidad,
  }))
}

function curvaSuavizada(puntos: PuntoGrafico[]): string {
  if (puntos.length === 0) return ''
  if (puntos.length === 1) return `M ${puntos[0].x} ${puntos[0].y}`
  let trazo = `M ${puntos[0].x} ${puntos[0].y}`
  for (let i = 0; i < puntos.length - 1; i += 1) {
    const anterior = puntos[i - 1] ?? puntos[i]
    const actual = puntos[i]
    const siguiente = puntos[i + 1]
    const posterior = puntos[i + 2] ?? siguiente
    const cp1x = redondear(actual.x + (siguiente.x - anterior.x) / 6)
    const minimo = Math.min(actual.y, siguiente.y)
    const maximo = Math.max(actual.y, siguiente.y)
    const cp1y = Math.min(maximo, Math.max(minimo, redondear(actual.y + (siguiente.y - anterior.y) / 6)))
    const cp2x = redondear(siguiente.x - (posterior.x - actual.x) / 6)
    const cp2ySinLimite = Math.min(maximo, Math.max(minimo, redondear(siguiente.y - (posterior.y - actual.y) / 6)))
    const cp2y = actual.y <= siguiente.y
      ? Math.max(cp1y, cp2ySinLimite)
      : Math.min(cp1y, cp2ySinLimite)
    trazo += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${siguiente.x} ${siguiente.y}`
  }
  return trazo
}

function pasoEtiquetas(cantidad: number): number {
  return Math.max(1, Math.ceil(cantidad / GRAFICO_MAXIMO_ETIQUETAS))
}

interface DashboardProps {
  modulo: Modulo
  rol: RolUsuario
  onNavegar: (modulo: ModuloPanel) => void
  metricas: DashboardMetrics | null
  cargandoMetricas: boolean
  errorMetricas: string | null
}

export default function Dashboard({
  modulo,
  rol,
  onNavegar,
  metricas,
  cargandoMetricas,
  errorMetricas,
}: DashboardProps) {
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

  const volumenPorHora = metricas?.volumenPorHora ?? []
  const puntosGrafico = construirPuntos(volumenPorHora)
  const trazoGrafico = curvaSuavizada(puntosGrafico)
  const areaGrafico = puntosGrafico.length > 0
    ? `${trazoGrafico} L ${GRAFICO_ANCHO} ${GRAFICO_BASE} L 0 ${GRAFICO_BASE} Z`
    : ''
  const pasoEtiquetasGrafico = pasoEtiquetas(puntosGrafico.length)
  const etiquetasGrafico = puntosGrafico.filter(
    (_, indice) => indice % pasoEtiquetasGrafico === 0 || indice === puntosGrafico.length - 1,
  )
  const consultasHoy = metricas?.consultasHoy ?? '—'
  const casosCerrados = metricas?.casosCerrados ?? '—'
  const resueltosPorBot = metricas?.resueltosPorBot ?? '—'
  const tasaAutomatizacion = Math.round(metricas?.tasaAutomatizacion ?? 0)
  const estadoAutomatizacion = tasaAutomatizacion >= 60 ? 'Óptimo' : 'Moderado'

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
        <section className="dashboard-inferior" aria-label="Análisis de la jornada">
          <article
            className="panel-dashboard panel-dashboard--grafico"
            aria-labelledby="volumen-chats-titulo"
          >
            <h2 id="volumen-chats-titulo">Volumen de chats por hora</h2>
            <p className="panel-dashboard__nota">Consultas registradas hoy por hora.</p>
            <svg
              className="grafico-chats"
              viewBox={`0 0 ${GRAFICO_ANCHO} ${GRAFICO_ALTO}`}
              role="img"
              aria-label="Volumen de chats de hoy por hora"
            >
              <defs>
                <linearGradient id="degradado-volumen-chats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7a1f35" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#7a1f35" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="degradado-linea-chats" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#7a1f35" />
                  <stop offset="100%" stopColor="#c24468" />
                </linearGradient>
              </defs>
              <g className="grafico-chats__guias" aria-hidden="true">
                <line x1={0} y1={50} x2={GRAFICO_ANCHO} y2={50} />
                <line x1={0} y1={88} x2={GRAFICO_ANCHO} y2={88} />
              </g>
              {areaGrafico ? <path d={areaGrafico} fill="url(#degradado-volumen-chats)" /> : null}
              {trazoGrafico ? (
                <path
                  d={trazoGrafico}
                  fill="none"
                  stroke="url(#degradado-linea-chats)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              ) : null}
              <line
                className="grafico-chats__base"
                x1={0}
                y1={GRAFICO_BASE}
                x2={GRAFICO_ANCHO}
                y2={GRAFICO_BASE}
              />
              <g className="grafico-chats__eje">
                {etiquetasGrafico.map((punto, indice) => (
                  <text
                    key={punto.hora}
                    x={punto.x}
                    y={GRAFICO_ALTO - 4}
                    textAnchor={indice === 0 ? 'start' : indice === etiquetasGrafico.length - 1 ? 'end' : 'middle'}
                  >
                    {punto.hora}
                  </text>
                ))}
              </g>
            </svg>
          </article>

          <article
            className="panel-dashboard panel-dashboard--resumen"
            aria-labelledby="resumen-operativo-titulo"
          >
            <h2 id="resumen-operativo-titulo">Resumen operativo</h2>
            <dl className="resumen-operativo">
              <div className="resumen-operativo__fila">
                <dt>Consultas de hoy</dt>
                <dd>{consultasHoy}</dd>
              </div>
              <div className="resumen-operativo__fila">
                <dt>Casos cerrados</dt>
                <dd>{casosCerrados}</dd>
              </div>
              <div className="resumen-operativo__fila">
                <dt>Resueltos por bot</dt>
                <dd>{resueltosPorBot}</dd>
              </div>
            </dl>

            <div className="resumen-operativo__automatizacion">
              <div className="resumen-operativo__barra-encabezado">
                <span>Tasa de automatización</span>
                <span className={`estado-automatizacion estado-automatizacion--${tasaAutomatizacion >= 60 ? 'optimo' : 'moderado'}`}>
                  {estadoAutomatizacion}
                </span>
              </div>
              <div
                className="barra-progreso"
                role="progressbar"
                aria-label="Tasa de automatización del bot"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={tasaAutomatizacion}
              >
                <span
                  className="barra-progreso__relleno"
                  style={{ width: `${tasaAutomatizacion}%` }}
                />
              </div>
              <span className="resumen-operativo__porcentaje">{tasaAutomatizacion}%</span>
            </div>
          </article>
        </section>
      )}
    </div>
  )
}
