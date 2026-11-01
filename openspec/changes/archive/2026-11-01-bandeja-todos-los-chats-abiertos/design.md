# Design

## Context

La Bandeja actual se implementó para listar casos abiertos derivados o con un prospecto o solicitud de cambio de teléfono pendiente. Esa condición está centralizada en `inboxWhere` dentro de `PrismaInboxRepository` y también se usa para contar y localizar el detalle.

El panel ahora tiene dos vistas sobre la misma colección:

- «Todos»: todos los casos abiertos.
- «Derivados»: solo los casos cuyo `fecha_derivacion` no es nulo.

La propiedad pública `handedOff` ya representa esa condición en `toInboxEntry` y `toItem`, por lo que no se agrega otro estado ni se interpreta el texto de `motivo_derivacion`.

## Decisions

### 1. Fuente de verdad del conjunto de la Bandeja

La consulta de orden, la consulta del total y la consulta del detalle usan como condición común:

```sql
WHERE c.fecha_cierre IS NULL
```

No se agrega una condición que exija `c.fecha_derivacion IS NOT NULL`, un pendiente de prospecto o una solicitud de cambio de teléfono. Los casos cerrados quedan excluidos.

### 2. Estado de derivación

El mapeo mantiene:

```ts
handedOff: record.fecha_derivacion !== null
```

`motivo_derivacion`, el responsable, la gravedad y el último mensaje no sustituyen este cálculo.

### 3. Pestañas y búsqueda

El frontend filtra cada caso con:

```ts
const cumplePestana = filtroPestana === 'todos' || caso.handedOff === true
const cumpleBusqueda = consulta === '' || textoDelCaso(caso).includes(consulta)
return cumplePestana && cumpleBusqueda
```

La búsqueda sigue admitiendo casos sin cliente identificado mediante el acceso opcional al cliente.

### 4. Acciones sobre casos no derivados

La ampliación es de lectura. Un caso no derivado no se transforma en derivado ni habilita respuestas de operador por aparecer en «Todos». Las acciones existentes deben continuar respetando las validaciones del caso de uso y del backend.

## Alternatives considered

- **Mantener el filtro actual y resolverlo solo en el frontend:** descartado porque los chats no derivados no llegarían a la página, al total ni al detalle.
- **Inferir la derivación desde `motivo_derivacion`:** descartado porque el estado canónico es `fecha_derivacion`; el motivo puede ser nulo en casos derivados migrados.
- **Crear un endpoint separado para chats del bot:** descartado porque duplicaría paginación, orden y contrato de lectura de la Bandeja.
