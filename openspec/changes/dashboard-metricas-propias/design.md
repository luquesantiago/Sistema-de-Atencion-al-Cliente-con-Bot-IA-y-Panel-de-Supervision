# Design

## Context

El backend usa Express, casos de uso y repositorios Prisma sobre MySQL 8.4. El frontend `Dashboard.tsx` actualmente muestra valores vacíos y debe consumir un contrato común que también pueda ser completado por otros integrantes.

Este change implementa únicamente tres métricas y deja las otras dos en cero de forma explícita y temporal. No se persisten contadores calculados.

## Decisions

### 1. Contrato HTTP

`GET /api/dashboard/metrics` devuelve:

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

Los números del ejemplo son ilustrativos. Todos los valores implementados deben calcularse en tiempo real con Prisma sobre MySQL, excepto `casosDerivadosSinTomar` y `respuestasRetenidas`, que devuelven `0` por compatibilidad mientras sus responsables implementan esas partes.

### 2. Criterios de cálculo

- `alertasRiesgoAbiertas` cuenta alertas con `fecha_atencion IS NULL` cuyo nivel sea `medio`, `alto` o `critico`. Cada alerta se cuenta una sola vez.
- `tramitesPorAprobar` suma prospectos con estado `pendiente` y solicitudes de acción con estado `pendiente`. No cuenta decisiones aprobadas, rechazadas, descartadas ni otros estados finales.
- `resumenGeneral.totalAbiertos` cuenta casos con `fecha_cierre IS NULL`.
- `resumenGeneral.totalCerrados` cuenta casos con `fecha_cierre IS NOT NULL`.
- `resumenGeneral.tasaAutomatizacionBot` se calcula como `(casos con fecha_derivacion IS NULL / total_casos) * 100`. Si no existen casos, la implementación debe representar la ausencia de denominador según el contrato acordado, sin inventar una tasa.

Las agregaciones se ejecutan en backend y no se reconstruyen desde la Bandeja paginada ni desde datos hardcodeados del frontend.

### 3. Transporte y acceso

La ruta se registra en `createApp` y delega en una capa de aplicación/repositorio, manteniendo la separación existente. El acceso sigue el contexto actual del MVP y no recibe un actor o rol desde el cuerpo del request. No se incorpora autenticación Bearer.

### 4. Dashboard

`Dashboard.tsx` carga las métricas al abrirse para el administrador. Mientras espera, muestra un estado de carga estable; si falla la API, muestra un error explícito y no convierte el error en ceros. Cuando responde, reemplaza los valores vacíos de las tarjetas de alertas y trámites y muestra el resumen general con totales y porcentaje.

Los textos permanecen en español, los estados se expresan con texto además de color y se respetan los tokens y componentes definidos en `docs/design.md`.

## Alternatives considered

- **Calcular las métricas en React:** descartado porque la base es la fuente de verdad y las APIs operativas son paginadas.
- **Implementar las cinco métricas en este change:** descartado porque `casosDerivadosSinTomar` y `respuestasRetenidas` pertenecen a otras partes asignadas.
- **Persistir contadores:** descartado porque los valores se deducen de las entidades existentes.
