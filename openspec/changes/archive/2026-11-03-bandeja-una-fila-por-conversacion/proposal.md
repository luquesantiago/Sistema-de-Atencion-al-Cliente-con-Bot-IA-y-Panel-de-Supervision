# Proposal

## Why

Desde que la pestaña «Todos» lista todos los casos abiertos (change `bandeja-todos-los-chats-abiertos`), la Bandeja muestra una fila por caso. Como el asistente abre un caso por consulta, una misma charla en la que el cliente preguntó saldo, estado y vencimiento aparece tres veces, con el mismo cliente, el mismo teléfono y la misma conversación al abrirla. El operador ve duplicados y tiene que adivinar cuál fila es la que importa.

## What Changes

- La Bandeja muestra **una fila por conversación** que tenga algún caso sin cerrar.
- La fila representa al caso más relevante de esa conversación: primero el derivado; si no hay, el que tiene una solicitud de cambio de teléfono pendiente; si no, el más reciente. La gravedad, el tipo, la etiqueta, el responsable, la espera y las acciones (tomar, contestar, cerrar) son los de ese caso.
- El total y la paginación cuentan conversaciones, no casos. El orden de la bandeja no cambia.
- El detalle sigue mostrando la conversación completa, y se puede seguir pidiendo por cualquier caso abierto (por ejemplo, desde «Ir al chat»).
- «Ir al chat» de Base de Clientes ya cuenta las filas que devuelve la bandeja: un cliente con varios casos en una sola charla abre esa charla directamente.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `panel-supervision`: el requirement «Bandeja de atención de casos abiertos» pasa a mostrar una fila por conversación (RF-SUP-01, RF-SUP-02).

## Impact

- Backend: la consulta de orden y la de total de `PrismaInboxRepository` eligen un caso por conversación. El detalle por caso no cambia. Sin cambios en la API ni en la base.
- Frontend: sin cambios de contrato; se ajustan los textos que hablan de «casos» en la lista.
- AGENTS.md: la descripción de la Bandeja y de «Ir al chat».
