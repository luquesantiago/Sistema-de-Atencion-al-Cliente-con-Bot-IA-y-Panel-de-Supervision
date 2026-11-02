## ADDED Requirements

### Requirement: El endpoint devuelve las métricas asignadas del Dashboard

El sistema SHALL ofrecer `GET /api/dashboard/metrics` con una respuesta JSON cuyos valores asignados se calculen en tiempo real mediante Prisma sobre MySQL, y SHALL devolver `casosDerivadosSinTomar` y `respuestasRetenidas` como `0` mientras esas métricas sean implementadas por sus responsables (RF-SUP-05).

La respuesta SHALL tener esta estructura:

```json
{
  "casosDerivadosSinTomar": 0,
  "respuestasRetenidas": 0,
  "tramitesPorAprobar": 4,
  "alertasRiesgoAbiertas": 1,
  "consultasHoy": 10,
  "casosCerrados": 6,
  "resueltosPorBot": 8,
  "tasaAutomatizacion": 80,
  "volumenPorHora": [
    { "hora": "00hs", "cantidad": 0 },
    { "hora": "08hs", "cantidad": 3 },
    { "hora": "09hs", "cantidad": 5 }
  ]
}
```

Los valores numéricos del ejemplo son ilustrativos, excepto los dos campos de compatibilidad que SHALL permanecer en `0` en este change. `volumenPorHora` SHALL contener las 24 horas del día argentino, en orden, incluidas las horas sin consultas con `cantidad: 0`; el ejemplo abrevia el array.

#### Scenario: Métricas calculadas desde la base
- **WHEN** existen alertas, trámites y casos con distintos estados en MySQL
- **THEN** el endpoint devuelve los conteos y la tasa calculados desde esos registros, sin valores hardcodeados

#### Scenario: Campos todavía no implementados
- **WHEN** se consulta el endpoint antes de que estén implementadas las métricas de otros integrantes
- **THEN** `casosDerivadosSinTomar` y `respuestasRetenidas` aparecen con valor numérico `0` y el resto del contrato permanece disponible

### Requirement: El Dashboard presenta una fila superior de cuatro tarjetas KPI

El sistema SHALL mostrar en la fila superior del Dashboard cuatro tarjetas KPI en una única grilla responsive: una columna en móvil, dos desde 640 px y cuatro desde 1024 px. Cada tarjeta SHALL incluir un ícono en contenedor con fondo semántico suave, etiqueta, valor destacado y subtexto, respetando los tokens de `docs/design.md` (RF-SUP-05).

El orden SHALL ser: «Casos derivados sin tomar», «Respuestas retenidas», «Trámites por aprobar» y «Alertas de riesgo abiertas».

Las tarjetas «Trámites por aprobar» y «Alertas de riesgo abiertas» SHALL mostrar los valores recibidos del endpoint. Las tarjetas «Casos derivados sin tomar» y «Respuestas retenidas» SHALL mostrar `—` como valor provisional mientras sus métricas no estén implementadas.

#### Scenario: Fila de KPI responsive
- **WHEN** el administrador abre el Dashboard en un ancho de móvil, tablet o escritorio
- **THEN** las cuatro tarjetas se distribuyen en una, dos o cuatro columnas respectivamente, sin cambiar su orden

#### Scenario: Tarjetas conectadas a la API
- **WHEN** el endpoint devuelve `tramitesPorAprobar` y `alertasRiesgoAbiertas`
- **THEN** esas tarjetas muestran los valores recibidos con el valor en tipografía destacada y junto a su subtexto

#### Scenario: Métricas todavía no implementadas
- **WHEN** se muestra la fila superior antes de implementar `casosDerivadosSinTomar` y `respuestasRetenidas`
- **THEN** sus tarjetas muestran `—` y conservan los subtextos «60 minutos para alertar, valor provisional.» y «Se retienen y derivan, nunca se envían.»

### Requirement: Las alertas de riesgo abiertas se cuentan por nivel

El sistema SHALL contar en `alertasRiesgoAbiertas` las alertas con `fecha_atencion IS NULL` cuyos niveles sean `medio`, `alto` o `critico`, sin contar alertas ya atendidas (RF-SUP-05).

#### Scenario: Alerta abierta de nivel permitido
- **WHEN** existe una alerta sin `fecha_atencion` con nivel `medio`, `alto` o `critico`
- **THEN** se incluye una vez en `alertasRiesgoAbiertas`

#### Scenario: Alerta atendida o nivel no incluido
- **WHEN** una alerta tiene `fecha_atencion` o su nivel no es `medio`, `alto` ni `critico`
- **THEN** no se incluye en `alertasRiesgoAbiertas`

### Requirement: Los trámites pendientes se agrupan en un total

El sistema SHALL calcular `tramitesPorAprobar` como la suma de prospectos y solicitudes de acción cuyo estado de catálogo sea `pendiente` (RF-SUP-05).

#### Scenario: Prospectos y solicitudes pendientes
- **WHEN** existen prospectos pendientes y solicitudes de acción pendientes
- **THEN** el endpoint suma ambos tipos en `tramitesPorAprobar`

#### Scenario: Trámite ya decidido
- **WHEN** un prospecto o una solicitud de acción está aprobado, rechazado, descartado u otro estado no pendiente
- **THEN** no se incluye en `tramitesPorAprobar`

### Requirement: El resumen operativo se calcula sobre la jornada actual

El sistema SHALL calcular el resumen operativo usando exclusivamente el día de hoy en `America/Argentina/Buenos_Aires`, convertido al rango UTC equivalente para comparar con las columnas `DateTime` de MySQL (RF-SUP-05).

- `consultasHoy` SHALL contar los casos con `fecha_apertura` dentro del rango de hoy.
- `casosCerrados` SHALL contar los casos con `fecha_cierre` dentro del rango de hoy, aunque se hayan creado otro día.
- `resueltosPorBot` SHALL contar los casos creados hoy cuyo `fecha_derivacion` sea `NULL`.
- `tasaAutomatizacion` SHALL ser `Math.round((resueltosPorBot / consultasHoy) * 100)` y SHALL devolver `0` cuando `consultasHoy` sea `0`.

#### Scenario: Casos de hoy y de otros días
- **WHEN** existen casos creados hoy, casos creados ayer y casos cerrados hoy
- **THEN** `consultasHoy` y `resueltosPorBot` solo consideran los creados hoy, mientras que `casosCerrados` considera los cerrados hoy sin importar cuándo se crearon

#### Scenario: Tasa de automatización
- **WHEN** `consultasHoy` es mayor que `0`
- **THEN** `tasaAutomatizacion` es el porcentaje redondeado de casos creados hoy sin `fecha_derivacion` sobre `consultasHoy`

#### Scenario: Sin consultas hoy
- **WHEN** no existen casos creados hoy
- **THEN** `consultasHoy`, `resueltosPorBot` y `tasaAutomatizacion` devuelven `0` sin dividir por cero

### Requirement: El volumen por hora agrupa las consultas de hoy

El sistema SHALL devolver `volumenPorHora` como un array ordenado con las 24 horas del día argentino (`00hs` a `23hs`) y la cantidad de casos creados hoy en cada hora, incluyendo `cantidad: 0` para las horas sin consultas (RF-SUP-05).

#### Scenario: Consultas distribuidas en el día
- **WHEN** existen casos creados hoy a distintas horas argentinas
- **THEN** cada caso se cuenta una sola vez en la hora que le corresponde

#### Scenario: Horas sin consultas
- **WHEN** no hay casos creados hoy en una hora determinada
- **THEN** esa hora aparece en `volumenPorHora` con `cantidad: 0`

#### Scenario: Cambio de día en Argentina
- **WHEN** en UTC ya es el día siguiente pero en Argentina todavía es el día anterior
- **THEN** la agregación sigue el día argentino y no el día UTC

### Requirement: La sección inferior divide gráfico y resumen operativo

El sistema SHALL organizar la sección inferior del Dashboard en una grilla de tres columnas con `gap` y `margin-top` de `1.5rem`: el bloque «Volumen de chats por hora» SHALL ocupar dos columnas y el bloque «Resumen operativo» una columna. Por debajo de 1024 px ambos bloques SHALL pasar a una sola columna (RF-SUP-05).

El bloque «Volumen de chats por hora» SHALL usar SVG inline nativo con `viewBox="0 0 500 150"` y SHALL calcular dinámicamente desde `volumenPorHora` los puntos, el `<path>` de área suavizada y las etiquetas del eje X. No SHALL contener coordenadas ni cantidades hardcodeadas. Una hora con `cantidad: 0` SHALL representarse sobre la base del gráfico. SHALL mantener el `<linearGradient>` con el color de marca `var(--color-primary)` y SHALL implementarse con SVG nativo y CSS plano en `App.css`, sin librerías de gráficos ni dependencias visuales adicionales.

Los íconos SHALL provenir de componentes SVG inline de `frontend/src/components/iconos.tsx`, y `frontend/package.json` no SHALL incluir `lucide-react` ni librerías de íconos, gráficos o estilos. Si falta un ícono, se agrega como componente SVG inline en ese archivo.

El bloque «Resumen operativo» SHALL mostrar los valores recibidos del endpoint: «Consultas de hoy» con `consultasHoy`, «Casos cerrados» con `casosCerrados` y «Resueltos por bot» con `resueltosPorBot`. SHALL incluir una barra de progreso horizontal cuyo ancho sea `tasaAutomatizacion%` y un indicador textual de estado «Óptimo» cuando la tasa sea mayor o igual a 60 % o «Moderado» en caso contrario.

#### Scenario: Grilla de la sección inferior
- **WHEN** el administrador abre el Dashboard en escritorio
- **THEN** el gráfico ocupa dos tercios de la fila inferior y el resumen operativo el tercio restante

#### Scenario: Gráfico dinámico
- **WHEN** el endpoint devuelve `volumenPorHora` con distintas cantidades
- **THEN** el trazo y las etiquetas del eje X cambian según esos datos y no según coordenadas fijas

#### Scenario: Hora sin consultas
- **WHEN** una entrada de `volumenPorHora` tiene `cantidad: 0`
- **THEN** su punto se dibuja sobre la base del gráfico, sin inventar un valor

#### Scenario: Adaptación responsive
- **WHEN** el ancho disponible es menor a 1024 px
- **THEN** el gráfico y el resumen operativo se apilan en una sola columna

#### Scenario: Progreso de automatización óptimo
- **WHEN** `tasaAutomatizacion` es mayor o igual a 60
- **THEN** la barra se rellena con ese porcentaje y el indicador muestra «Óptimo»

#### Scenario: Progreso de automatización moderado
- **WHEN** `tasaAutomatizacion` es menor a 60
- **THEN** la barra se rellena con ese porcentaje y el indicador muestra «Moderado»

### Requirement: El Dashboard muestra estados de carga y error

El sistema SHALL conectar las tarjetas de alertas de riesgo abiertas y trámites por aprobar y la sección inferior al endpoint, mostrando estados explícitos de carga y error (RF-SUP-05).

#### Scenario: Carga inicial
- **WHEN** el administrador abre el Dashboard antes de recibir la respuesta
- **THEN** las superficies asignadas muestran un estado de carga y no muestran datos ficticios

#### Scenario: Error del endpoint
- **WHEN** falla la consulta de métricas
- **THEN** el Dashboard informa el error sin reemplazarlo por conteos cero

#### Scenario: Métricas disponibles
- **WHEN** el endpoint responde correctamente
- **THEN** las tarjetas, el gráfico y el resumen operativo muestran los valores recibidos y actualizados
