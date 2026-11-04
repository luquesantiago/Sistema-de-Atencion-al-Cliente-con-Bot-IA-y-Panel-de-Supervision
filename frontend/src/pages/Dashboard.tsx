import type { Modulo, Navegar } from '../navigation'
import type { RolUsuario } from '../usuario'
import PageHeader from '../components/PageHeader'
import EstadoPanel from '../components/EstadoPanel'
import {
  IconoAlerta,
  IconoArchivoCheck,
  IconoCampana,
  IconoIrBandeja,
  IconoPausa,
} from '../components/iconos'
import type {
  DashboardHourlyVolume,
  DashboardMetrics,
  DashboardResponsePeriod,
} from '../api/dashboard'

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
  onNavegar: Navegar
  metricas: DashboardMetrics | null
  cargandoMetricas: boolean
  errorMetricas: string | null
  periodoRespuestas: DashboardResponsePeriod
  onCambiarPeriodoRespuestas: (periodo: DashboardResponsePeriod) => void
}

export default function Dashboard({
  modulo,
  rol,
  onNavegar,
  metricas,
  cargandoMetricas,
  errorMetricas,
  periodoRespuestas,
  onCambiarPeriodoRespuestas,
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
  const distribucion = metricas?.distribucionRespuestas
  const porcentajeIA = distribucion?.porcentajes.IA ?? 0
  const porcentajeOperador = distribucion?.porcentajes.operador ?? 0
  const descripcionGrafico = volumenPorHora.length > 0
    ? volumenPorHora.map((item) => `${item.hora}: ${item.cantidad}`).join('; ')
    : 'No hay consultas registradas hoy.'

  return (
    <div className="pagina">
      <PageHeader titulo={modulo.nombre} descripcion={modulo.descripcion} />

      <section aria-label="Indicadores del día">
        <div className="tarjetas tarjetas--kpi">
          <article className="tarjeta tarjeta--kpi tarjeta--kpi-resumen">
            <span className="tarjeta__icono tarjeta__icono--pink" aria-hidden="true">
              <IconoPausa />
            </span>
            <span className="tarjeta__etiqueta">Resumen operativo del día</span>
            {cargandoMetricas ? (
              <span className="tarjeta__nota tarjeta__nota--pie">Cargando resumen diario…</span>
            ) : (
              <>
                <dl className="kpi-resumen">
                  <div>
                    <dt>Consultas</dt>
                    <dd key={`consultas-${consultasHoy}`}>{consultasHoy}</dd>
                  </div>
                  <div>
                    <dt>Cerrados</dt>
                    <dd key={`cerrados-${casosCerrados}`}>{casosCerrados}</dd>
                  </div>
                  <div>
                    <dt>Resueltos por IA</dt>
                    <dd key={`ia-${resueltosPorBot}`}>{resueltosPorBot}</dd>
                  </div>
                  <div>
                    <dt>Automatización</dt>
                    <dd key={`automatizacion-${tasaAutomatizacion}`}>{tasaAutomatizacion}%</dd>
                  </div>
                </dl>
                <div
                  className="kpi-resumen__barra"
                  role="progressbar"
                  aria-label="Automatización"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={tasaAutomatizacion}
                >
                  <span style={{ width: `${tasaAutomatizacion}%` }} />
                </div>
              </>
            )}
          </article>

          <article className="tarjeta tarjeta--kpi">
            <span className="tarjeta__icono tarjeta__icono--rose" aria-hidden="true">
              <IconoCampana />
            </span>
            <button
              className="tarjeta__accion-kpi"
              type="button"
              aria-label="Ir a casos derivados sin tomar en Bandeja de Atención"
              title="Ir a Sin tomar"
              onClick={() => onNavegar('bandeja', { bandeja: { vista: 'sin-tomar' } })}
            >
              <IconoIrBandeja />
            </button>
            <span className="tarjeta__etiqueta">Casos derivados sin tomar</span>
            <span key={`sin-tomar-${metricas?.casosDerivadosSinTomar ?? 'cargando'}`} className="tarjeta__valor tarjeta__valor--kpi">
              {cargandoMetricas ? '…' : (metricas?.casosDerivadosSinTomar ?? '—')}
            </span>
            <span className="tarjeta__nota tarjeta__nota--pie">Casos derivados abiertos sin responsable.</span>
          </article>

          <article className="tarjeta tarjeta--kpi">
            <span className="tarjeta__icono tarjeta__icono--amber" aria-hidden="true">
              <IconoArchivoCheck />
            </span>
            <span className="tarjeta__etiqueta">Trámites por aprobar</span>
            <span key={`tramites-${metricas?.tramitesPorAprobar ?? 'cargando'}`} className="tarjeta__valor tarjeta__valor--kpi">
              {cargandoMetricas ? '…' : (metricas?.tramitesPorAprobar ?? '—')}
            </span>
            <span className="tarjeta__nota tarjeta__nota--pie">Bajas, contrato y alta de conductor.</span>
          </article>

          <article className="tarjeta tarjeta--kpi">
            <span className="tarjeta__icono tarjeta__icono--red" aria-hidden="true">
              <IconoAlerta />
            </span>
            <span className="tarjeta__etiqueta">Alertas de riesgo abiertas</span>
            <span key={`alertas-${metricas?.alertasRiesgoAbiertas ?? 'cargando'}`} className="tarjeta__valor tarjeta__valor--kpi">
              {cargandoMetricas ? '…' : (metricas?.alertasRiesgoAbiertas ?? '—')}
            </span>
            <span className="tarjeta__nota tarjeta__nota--pie">Gravedad y motivo, no solo color.</span>
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
              aria-describedby="volumen-chats-datos"
            >
              <title>Volumen de chats de hoy por hora</title>
              <desc>{descripcionGrafico}</desc>
              <defs>
                <linearGradient id="degradado-volumen-chats" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-dashboard-chart-wine)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--color-dashboard-chart-wine)" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="degradado-linea-chats" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--color-dashboard-chart-wine)" />
                  <stop offset="100%" stopColor="var(--color-dashboard-chart-rose)" />
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
            <ul
              className="visually-hidden"
              id="volumen-chats-datos"
              aria-label="Datos por hora del volumen de chats"
            >
              {volumenPorHora.length > 0 ? (
                volumenPorHora.map((item) => (
                  <li key={item.hora}>
                    {item.hora}: {item.cantidad} {item.cantidad === 1 ? 'consulta' : 'consultas'}
                  </li>
                ))
              ) : (
                <li>No hay consultas registradas hoy.</li>
              )}
            </ul>
          </article>

          <article
            className="panel-dashboard panel-dashboard--resumen"
            aria-labelledby="resumen-operativo-titulo"
          >
            <div className="panel-respuestas__encabezado">
              <div>
                <h2 id="resumen-operativo-titulo">Resumen operativo</h2>
              </div>
              <div className="panel-respuestas__periodos" role="group" aria-label="Período de distribución">
                <button
                  className={periodoRespuestas === 'semanal' ? 'panel-respuestas__periodo panel-respuestas__periodo--activo' : 'panel-respuestas__periodo'}
                  type="button"
                  aria-pressed={periodoRespuestas === 'semanal'}
                  onClick={() => onCambiarPeriodoRespuestas('semanal')}
                >
                  Semanal
                </button>
                <button
                  className={periodoRespuestas === 'mensual' ? 'panel-respuestas__periodo panel-respuestas__periodo--activo' : 'panel-respuestas__periodo'}
                  type="button"
                  aria-pressed={periodoRespuestas === 'mensual'}
                  onClick={() => onCambiarPeriodoRespuestas('mensual')}
                >
                  Mensual
                </button>
              </div>
            </div>

            {distribucion?.total ? (
              <div
                key={`${periodoRespuestas}-${distribucion.total}-${distribucion.resueltasPorIA}-${distribucion.derivadasOperador}`}
                className="panel-respuestas__contenido"
              >
                <div
                  className="panel-respuestas__dona"
                  role="img"
                  aria-label={`${porcentajeIA}% resuelta por IA y ${porcentajeOperador}% derivada al operador`}
                  style={{
                    background: `conic-gradient(var(--color-success-text) 0 ${porcentajeIA}%, var(--color-secondary) ${porcentajeIA}% 100%)`,
                  }}
                >
                  <div className="panel-respuestas__centro">
                    <strong>{porcentajeIA}%</strong>
                    <span>IA</span>
                  </div>
                </div>
                <dl className="panel-respuestas__leyenda">
                  <div>
                    <dt><span className="panel-respuestas__punto panel-respuestas__punto--ia" />IA</dt>
                    <dd>{porcentajeIA}%</dd>
                    <small>{distribucion.resueltasPorIA} respuestas</small>
                  </div>
                  <div>
                    <dt><span className="panel-respuestas__punto panel-respuestas__punto--operador" />Operador</dt>
                    <dd>{porcentajeOperador}%</dd>
                    <small>{distribucion.derivadasOperador} respuestas</small>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="panel-respuestas__vacio">Sin respuestas registradas en este período.</p>
            )}
          </article>
        </section>
      )}
    </div>
  )
}
