# Proposal

## Why

La API de la Bandeja actualmente excluye los casos abiertos que no están derivados y no tienen un pendiente operativo. Eso impide que la pestaña «Todos» muestre las conversaciones que el asistente atendió sin derivar, aunque siguen abiertas (`fecha_cierre IS NULL`) y forman parte del historial operativo que el panel debe permitir consultar.

El frontend ya distingue los casos mediante `handedOff`, pero no puede mostrar esos casos si `GET /api/bandeja` no los devuelve. La consulta del backend y el filtro de pestañas deben compartir el mismo contrato: «Todos» recibe todos los casos abiertos y «Derivados» selecciona los que tienen fecha de derivación.

## What Changes

- `GET /api/bandeja` devuelve todos los casos abiertos, definidos por `caso.fecha_cierre IS NULL`, incluidos los casos atendidos por el asistente sin derivación ni pendiente operativo.
- `PrismaInboxRepository` conserva la ordenación, paginación, filtro opcional por cliente y cálculo de gravedad para todos los casos abiertos.
- El campo `handedOff` de la respuesta se calcula exclusivamente como `caso.fecha_derivacion IS NOT NULL`.
- El frontend mantiene la pestaña «Todos» sin restricción por derivación y usa «Derivados» para filtrar `handedOff === true`.
- El detalle de un caso abierto devuelto por la API debe seguir siendo consultable, sin confundir un caso no derivado con uno que puede recibir respuestas de operador.

## Capabilities

### Modified Capabilities

- `panel-supervision`: la Bandeja incluye todos los casos abiertos y expone su estado de derivación para que las pestañas los separen (RF-SUP-01, RF-SUP-02).

## Impact

- **Backend:** cambia el filtro de la consulta SQL de `PrismaInboxRepository`; se mantienen los tipos y el mapeo de `handedOff`.
- **Frontend:** se verifica el filtro combinado de pestaña y búsqueda, y se conserva la restricción de acciones operativas para casos no derivados según el estado recibido.
- **Pruebas:** se agregan casos para un caso abierto derivado, uno abierto no derivado, uno abierto con pendiente y uno cerrado; también se verifica que `handedOff` dependa únicamente de `fecha_derivacion`.
- **Base de datos:** no hay migraciones, tablas ni columnas nuevas.

## Open Questions

- No se modifica la decisión abierta sobre si el asistente continúa respondiendo después de una derivación; este change solo amplía la lectura de la Bandeja.
