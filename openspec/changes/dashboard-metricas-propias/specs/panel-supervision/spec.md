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
  "resumenGeneral": {
    "totalAbiertos": 10,
    "totalCerrados": 45,
    "tasaAutomatizacionBot": 78.5
  }
}
```

Los valores numéricos del ejemplo son ilustrativos, excepto los dos campos de compatibilidad que SHALL permanecer en `0` en este change.

#### Scenario: Métricas calculadas desde la base
- **WHEN** existen alertas, trámites y casos con distintos estados en MySQL
- **THEN** el endpoint devuelve los conteos y la tasa calculados desde esos registros, sin valores hardcodeados

#### Scenario: Campos todavía no implementados
- **WHEN** se consulta el endpoint antes de que estén implementadas las métricas de otros integrantes
- **THEN** `casosDerivadosSinTomar` y `respuestasRetenidas` aparecen con valor numérico `0` y el resto del contrato permanece disponible

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

### Requirement: El resumen general calcula estado y automatización

El sistema SHALL devolver en `resumenGeneral` los casos abiertos, los casos cerrados y `tasaAutomatizacionBot`, calculada como `(casos con fecha_derivacion IS NULL / total_casos) * 100` (RF-SUP-05).

#### Scenario: Casos abiertos y cerrados
- **WHEN** existen casos con `fecha_cierre IS NULL` y casos con `fecha_cierre IS NOT NULL`
- **THEN** `totalAbiertos` y `totalCerrados` reflejan cada conjunto sin duplicar casos

#### Scenario: Tasa de automatización
- **WHEN** existen casos con y sin `fecha_derivacion`
- **THEN** `tasaAutomatizacionBot` es el porcentaje de casos cuya `fecha_derivacion IS NULL` sobre el total de casos

#### Scenario: Sin casos
- **WHEN** no existen casos
- **THEN** el endpoint no divide por cero ni presenta una tasa inventada

### Requirement: El Dashboard muestra estados de carga y error

El sistema SHALL conectar las tarjetas de alertas de riesgo abiertas y trámites por aprobar y la sección de resumen general al endpoint, mostrando estados explícitos de carga y error (RF-SUP-05).

#### Scenario: Carga inicial
- **WHEN** el administrador abre el Dashboard antes de recibir la respuesta
- **THEN** las superficies asignadas muestran un estado de carga y no muestran datos ficticios

#### Scenario: Error del endpoint
- **WHEN** falla la consulta de métricas
- **THEN** el Dashboard informa el error sin reemplazarlo por conteos cero

#### Scenario: Métricas disponibles
- **WHEN** el endpoint responde correctamente
- **THEN** las tarjetas y el resumen muestran los valores recibidos y actualizados
