# Design

## Context

Motivación: ver `proposal.md`. La Bandeja se arma en `PrismaInboxRepository` con dos consultas SQL escritas a mano (`inboxOrderQuery` para el orden y la página, `inboxCountQuery` para el total) y después lee cada caso con Prisma. El detalle (`findConversation`, `findImage`) reutiliza `inboxOrderQuery` restringido a un caso y muestra todos los mensajes de la conversación.

## Goals / Non-Goals

**Goals:** una fila por conversación en el listado, sin cambiar la API, el orden ni el detalle.

**Non-Goals:** cerrar casos por inactividad sin que el cliente escriba (la inactividad sigue evaluándose al llegar el mensaje siguiente); mostrar dentro de la fila la lista de casos de la conversación.

## Decisions

### 1. Elegir el caso representante en SQL, solo en el listado

En el listado (sin `caseId`), la consulta conserva un caso por conversación con una subconsulta correlacionada:

```sql
AND c.id_caso = (
  SELECT c2.id_caso FROM caso c2
  WHERE c2.id_conversacion = c.id_conversacion AND c2.fecha_cierre IS NULL
  ORDER BY c2.fecha_derivacion IS NULL, <sin cambio de teléfono pendiente>, c2.id_caso DESC
  LIMIT 1)
```

- Derivado primero: es el que pide trabajo en la bandeja y el único con acciones. Una conversación tiene a lo sumo uno abierto, porque después de derivar el asistente queda en silencio y lo que escribe el cliente va al mismo caso.
- Después, el que tiene un cambio de teléfono pendiente: es el otro pendiente operativo que muestra la bandeja.
- Si no, el más reciente (`id_caso` mayor): su último mensaje es el último de la charla.
- La misma condición va en el total, así la paginación cuenta conversaciones.
- El detalle por caso no la usa: «Ir al chat» y los enlaces existentes pueden seguir pidiendo cualquier caso abierto.

**Alternativas descartadas:** agrupar en el frontend (rompe el total y la paginación, que vienen del backend); `ROW_NUMBER()` en una subconsulta (más SQL para el mismo resultado y obliga a envolver todo el orden).

### 2. Gravedad de la fila

La fila muestra la gravedad del caso representante. Los tipos con nivel (siniestro, reclamo, cotización, cobertura, baja, modificación) siempre se derivan, así que el derivado, que va primero, ya es el más grave de la conversación.

## Risks / Trade-offs

- [Un cambio de teléfono pendiente y un caso derivado en la misma charla] La fila muestra el derivado; el cambio sigue a la vista en Trámites, que es donde se decide. → Aceptado.
- [Subconsulta correlacionada por fila] La bandeja tiene pocas decenas de casos abiertos y `caso` tiene índice por conversación (`ix_caso_conversacion`). → Sin impacto esperado.
