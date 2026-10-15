# Design

## Context

Estado de `main` en `a998469`, con `asistente-responde-saldo` mergeado. El porqué está en `proposal.md` y el comportamiento, en las specs del change.

- **La derivación.** Todas las derivaciones del asistente pasan por `handoffIn` (`application/process-incoming-message.ts`), que recibe el motivo como texto libre («intención: reclamo», «DNI no reconocido», «falla de la redacción», …) y lo deja en `turn.changes.handoff`. `PrismaConversationStore.save` escribe `caso.fecha_derivacion`, `caso.motivo_derivacion` y `conversacion.asistente_suspendido`. Nadie escribe `caso.id_nivel_riesgo`.
- **Los motivos que existen hoy:** `intención: <siniestro|cotización|cobertura|reclamo|otra consulta>`, `pedido para aprobar: <baja|modificación>`, `cliente nuevo`, `DNI no reconocido`, `DNI de otra persona`, `cliente identificado inexistente`, `no se entendió la consulta`, `cliente sin pólizas`, `póliza sin cuotas registradas`, `datos de la agencia incompletos`, `falla del proveedor al identificar el tipo de cliente`, `falla del proveedor al decidir`, `falla de la redacción` y `redacción rechazada: <detalle>`.
- **La clasificación.** `AiClient.classifyIntent` devuelve una `Intent`. `OpenAiCompatibleClient` la pide con `response_format` `json_schema` estricto, con una sola propiedad, `intencion`, y lanza si el valor no está en la lista. Se llama en dos lugares: con el cliente identificado (decide la acción) y antes de identificarse (solo para saber si piden la información de la agencia).
- **El cambio de teléfono** crea un caso nuevo de tipo «cambio de teléfono» y, si el cliente no tiene ya una solicitud pendiente para ese número, una `solicitud_accion` pendiente con `fecha_solicitud`. No deriva ni silencia.
- **Los casos migrados** (`docs/migracion.md`): los siete abiertos están derivados y tomados a la hora de apertura, con responsable (Roberto o Graciela), sin motivo y sin `id_nivel_riesgo`; sus alertas están cargadas como atendidas (`fecha_atencion` no nula), así que no aportan gravedad.
- **El catálogo `nivel_riesgo`**: crítico (orden 1), alto (2), medio (3), bajo (4). Se busca por nombre, como los demás catálogos del almacén.
- **El panel.** `ManageCustomers` + `PrismaCustomerRepository` + `GET /api/clientes` es el patrón de lectura del panel: caso de uso que valida, repositorio que devuelve tipos del dominio, mapeo de filas en funciones puras probadas sin base, y en el frontend un módulo `api/` que es lo único que hace `fetch`. `pages/BandejaAtencion.tsx` es un `EstadoPanel` fijo.

## Goals / Non-Goals

**Goals:**
- Que la regla del nivel de riesgo y la de las etiquetas de la bandeja sean funciones puras del dominio, con sus pruebas, y no vivan en el handler, en el prompt ni en el componente.
- Que el orden de la bandeja lo resuelva la base, antes de paginar, sin copiar a mano la tabla de niveles por tipo de consulta.
- Que la IA no pueda bajar el nivel de un siniestro ni cambiar la acción con la urgencia.
- Que el texto de `motivo_derivacion` que ya se guarda no cambie.

**Non-Goals:**
- Recalcular el nivel de un caso después de derivarlo.
- Cargar niveles en los casos migrados: la bandeja los calcula al leer, con el tipo de consulta.
- Avisos en tiempo real desde el backend (websockets o SSE): la bandeja se actualiza con sondeo (decisión 6).

## Decisions

### 1. El motivo de la derivación pasa a ser un tipo cerrado

`domain/handoff.ts` (nuevo) define `HandoffReason`, una unión con un `kind` por motivo de la lista de «Context» (`intent` con la intención, `approval` con baja o modificación, `new-customer`, `dni-unrecognized`, `dni-other-person`, `customer-missing`, `not-understood`, `missing-data` y `provider-failure` con su detalle, `rewrite-rejected` con el detalle del control). `describeHandoffReason(reason)` devuelve exactamente el texto que hoy se guarda en `motivo_derivacion`. `handoffIn`, `handoffIdentifying` y `handoffUntyped` reciben un `HandoffReason` en lugar de un texto.

*Alternativa descartada:* **calcular el nivel a partir del texto** («empieza con "intención: "…»): un cambio de redacción del motivo cambiaría el nivel sin que ninguna prueba de tipos lo note.

### 2. El nivel de riesgo, en el dominio

`domain/risk-level.ts` (nuevo) exporta:

- `riskLevels = ['crítico', 'alto', 'medio', 'bajo']` y `RiskLevel`, en orden de gravedad, con `mostSevere(levels)` que ignora los `null`;
- `queryTypeRiskLevel(type: QueryType | null): RiskLevel | null`: siniestro y reclamo, alto; cotización, cobertura, baja y modificación, medio; cambio de teléfono, bajo; los demás, `null`;
- `reasonRiskLevel(reason: HandoffReason): RiskLevel`: la tabla de motivos del proposal;
- `handoffRiskLevel({ reason, caseType, urgency })`: el más grave entre los dos anteriores y, solo si `caseType` es siniestro y `urgency` es `grave`, crítico.

`caseType` es el tipo de la consulta que se deriva: la intención en los caminos con intención, el tipo del caso actual cuando se deriva por una redacción rechazada o un dato ausente, y `null` mientras la persona se identifica. `ConversationChanges.handoff` suma `riskLevel: RiskLevel`, y `phoneChangeRequest` suma `riskLevel` con el valor de `queryTypeRiskLevel('cambio de teléfono')`.

`PrismaConversationStore.save` escribe `caso.id_nivel_riesgo` en el mismo `update` de la derivación y, en el cambio de teléfono, en el caso de la solicitud solo cuando crea la solicitud. El id sale de `catalogIds` buscando por nombre; si falta, lanza `ConversationStoreError`, como con los otros catálogos.

*Alternativas descartadas:*
- **Que el almacén calcule el nivel**: la regla quedaría en la capa de datos y sin prueba de dominio (AGENTS.md).
- **Una tabla de configuración con los niveles**: el DER no la tiene y el design no agrega tablas; si la agencia pide cambiarlos seguido, se plantea aparte.

### 3. La urgencia viaja con la intención

`AiClient.classifyIntent` pasa a devolver `{ intent: Intent; urgency: Urgency | null }`, con `Urgency = 'grave' | 'normal'`. El esquema estricto suma `urgencia` (`enum: ['grave', 'normal']`) a las propiedades requeridas: el modo estricto exige que todas estén en `required`. Las instrucciones explican qué es grave (la lista de la spec) y piden `normal` para toda intención que no sea siniestro.

Al leer la respuesta: si `intencion` no está en la lista, lanza como hoy; si `urgencia` falta o no está en la lista, devuelve `urgency: null`, sin lanzar, porque la intención sigue siendo válida y el piso de alto ya cubre ese caso. El flujo solo pasa la urgencia a `handoffRiskLevel`; `actionForIntent` no la recibe, así que no puede cambiar la acción. La llamada de antes de identificarse ignora la urgencia.

*Alternativa descartada:* **una segunda llamada solo para los siniestros**: suma latencia y otra falla posible justo en el caso más urgente, y la clasificación ya tiene el mensaje y el contexto.

### 4. La bandeja: la base filtra, ordena y pagina

`domain/inbox.ts` (nuevo) define `InboxEntry` (caso, conversación, gravedad, cliente identificado o `null`, teléfono, tipo de consulta, motivo, fecha de derivación, fecha de toma, responsable, si tiene prospecto pendiente, fecha de la solicitud de cambio de teléfono pendiente y último mensaje) y `InboxRepository` (`listPage(page)` → `{ entries, total }` y `findConversation(caseId)`). Exporta además las reglas que no necesita la base:

- `inboxLabel(entry)`: `'alta-pendiente'` si tiene prospecto pendiente; `'pedido-pendiente'` si está derivado y es de baja o modificación; `'cambio-telefono-pendiente'` si tiene la solicitud pendiente; si no, `null`;
- `waitingSince(entry)`: la fecha de derivación o, si no hay, la de la solicitud;
- `queryTypeRiskLevels()`: los pares tipo de consulta → nivel que salen de `queryTypeRiskLevel` (decisión 2), para que el repositorio arme la consulta sin copiar la tabla.

`PrismaInboxRepository.listPage` hace dos consultas:

1. **Orden y página, con `$queryRaw`** (Prisma no ordena por una expresión calculada). Filtro: `caso.fecha_cierre` nulo y (`fecha_derivacion` no nula, o un `prospecto` pendiente, o una `solicitud_accion` pendiente de tipo «cambio de teléfono»). Gravedad: el menor `nivel_riesgo.orden` entre el nivel del caso, las alertas del caso con `fecha_atencion` nula y el nivel de su tipo de consulta; el último sale de un `CASE` armado con `Prisma.sql` a partir de `queryTypeRiskLevels()`, con los nombres como parámetros, nunca concatenados. Sin ninguno, `NULL`. Orden: gravedad con `NULL` al final, `fecha_toma IS NULL` primero, `COALESCE(fecha_derivacion, fecha_solicitud)` ascendente e `id_caso` ascendente, para que sea estable entre páginas. `LIMIT`/`OFFSET` en la misma consulta y un `COUNT` con el mismo filtro para `total`. Devuelve los ids en orden con su gravedad.
2. **Los datos de esos casos, con `findMany`** por id: conversación, teléfono, cliente, tipo, responsable, prospecto, solicitud y el último mensaje (por `fecha_hora` e `id_mensaje`, recortado a 160 caracteres). Se reordenan según la primera consulta.

El cliente sale de `conversacion.id_cliente`, nunca de los teléfonos vinculados: así un caso como CASO-003 queda «Sin identificar». La construcción de la consulta (el `CASE` y el filtro) y el mapeo de filas a `InboxEntry` son funciones exportadas y probadas sin base, como en `prisma-customer-repository`; el orden contra la base se verifica a mano (tareas).

`application/manage-inbox.ts` (nuevo) valida la paginación (1 a 100, desplazamiento no negativo, 25 por defecto) y pide la página al repositorio. El detalle valida el id, comprueba con el mismo filtro que el caso está en la bandeja (si no, 404) y devuelve la conversación entera ordenada por `fecha_hora` e `id_mensaje`, con `inCase` en los mensajes del caso elegido.

*Alternativas descartadas:*
- **Traer todos los casos abiertos y ordenar en memoria**: funciona con pocos casos, pero la página la decide el backend después de leer todo, y cada actualización automática (decisión 6) leería la bandeja entera.
- **Guardar la gravedad completa en `caso.id_nivel_riesgo`** (también la de los migrados, con un script) para ordenar con un `orderBy` de Prisma: las alertas sin atender cambian sin que cambie el caso, y modifica datos migrados para algo que se calcula al leer.
- **Copiar la tabla de niveles por tipo en el SQL**: dos lugares que mantener iguales; por eso el `CASE` se arma desde el dominio.

### 5. API

- `GET /api/bandeja?limit=&offset=` → `{ items, total, limit, offset }`. Cada ítem: `caseId`, `severity` (`'crítico' | 'alto' | 'medio' | 'bajo' | null`), `label`, `customer` (`{ id, name, document } | null`), `phone`, `queryType`, `handoffReason`, `lastMessage` (`{ text, origin, at } | null`), `assignee` (`{ name } | null`), `takenAt`, `waitingSince`.
- `GET /api/bandeja/:idCaso` → `{ case: <ítem>, messages: [{ id, caseId, origin, text, at, inCase }] }`.
- Las fechas van en ISO UTC; el frontend las pasa a hora argentina. Los errores usan el formato de `/api/clientes` (`VALIDATION_ERROR` 400, `NOT_FOUND` 404).
- `createApp` recibe `ManageInbox` como un parámetro más; `index.ts` lo arma con `PrismaInboxRepository`.

### 6. Pantalla y actualización automática

`api/bandeja.ts` (nuevo) es lo único que llama a la API. `BandejaAtencion.tsx` sigue el mock de la propuesta (decisión de Santiago del 15/10/2026): dos columnas de alto completo, como una aplicación de mensajería.

- **Izquierda, la lista de casos** en tarjetas, en el orden de la API: inicial del cliente (o «?» sin identificar), nombre o teléfono, hora del último mensaje, vista previa del último mensaje y, debajo, los chips de gravedad y de pendiente, el responsable (o «Sin tomar») y la espera. El mock no tiene responsable ni espera; la skill `frontend-panel` los pide.
- **Derecha, la conversación** del caso elegido, ocupando el resto: encabezado con el cliente, su documento y el teléfono; una franja con la gravedad, el motivo y lo pendiente; y los mensajes como burbujas, el cliente a la izquierda y el asistente y el operador a la derecha, con el origen escrito. Sin caso elegido, un estado vacío.
- Del mock quedan afuera la caja para escribir, las plantillas, «Pausar Bot / Intervenir» (son acciones: change siguiente), «Ver Ficha en CRM», el buscador y los casos resueltos (la bandeja solo muestra casos abiertos).
- Cada columna se desplaza sola. En pantallas chicas se ve una columna por vez, con «Volver a la lista».
- Estados de carga, error y vacío con `EstadoPanel`, y dimensiones estables para que la lista no salte al refrescar.

**Actualización automática por sondeo cada 5 segundos.** Después de cada respuesta se programa la siguiente (`setTimeout`, no `setInterval`), así nunca hay dos pedidos superpuestos; se cancela con `AbortController` al salir de la pantalla o cambiar de página. Mientras la pestaña está oculta (`document.hidden`) no consulta, y al volver consulta enseguida. Se refrescan la página actual y, si hay uno elegido, el detalle del caso. Se conserva el caso elegido; si deja de estar en la bandeja, el detalle lo avisa en lugar de desaparecer. Si una actualización falla, quedan los últimos datos y un aviso discreto «No se pudo actualizar», sin vaciar la tabla. La espera se recalcula en cada actualización.

*Alternativa descartada:* **avisos del backend en tiempo real (SSE o websockets)**: llegan al instante, pero hacen falta un bus de eventos entre el almacén de conversaciones y el HTTP, reconexión y configurar el proxy de Vite. Con 5 segundos el operador ve el caso casi enseguida, reusando los mismos endpoints. Si hace falta menos demora, se cambia el transporte sin tocar la API.

**Tonos** (skill `frontend-panel` y tokens de `index.css`): los cuatro niveles del DER se distinguen por texto, icono y color, nunca solo por color, y no se usa un semáforo de tres colores:

| Gravedad | Chip | Icono |
|---|---|---|
| Crítico | relleno rojo (`--riesgo` de fondo, texto blanco), modificador nuevo `chip--riesgo-fuerte` | alerta |
| Alto | `chip--riesgo` (rojo suave) | alerta |
| Medio | `chip--alerta` (ámbar) | reloj |
| Bajo | `chip--neutro` | información |
| Sin nivel | `chip--neutro` con borde punteado | sin icono, texto «Sin nivel» |

Las etiquetas de pendiente («Alta pendiente · se decide en Trámites», etc.) van en ámbar (`chip--alerta`), el tono de «pendiente» de la skill, en su propia columna para no confundirse con la gravedad. «Sin tomar» va en texto destacado, no en rojo. Los iconos nuevos se suman a `components/iconos.tsx`.

- Las fechas se formatean con `Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })`; la espera, como «1 h 20 min».
- La conversación resalta los mensajes del caso elegido y marca con texto los de otros casos de la misma conversación. No hay botones de acción.

### 7. Documentación

AGENTS.md, en «Parcial 1: alcance y flujo», suma la bandeja de solo lectura y la tabla de niveles de riesgo como decisión del equipo del 15/10/2026, y aclara que la urgencia del siniestro solo sube el nivel.

## Risks / Trade-offs

- [El modelo marca normal un siniestro grave] → queda alto, que igual es el segundo nivel; el operador ve el mensaje en la bandeja. El piso lo pone el código, no el modelo.
- [El modelo marca grave lo que no lo es] → el caso sube a crítico de más. Se acepta: ante la duda, más grave.
- [El nivel queda fijo al derivar] → lo que el cliente escriba en silencio no lo cambia. Recalcularlo exigiría clasificar mensajes en silencio, que hoy no salen al proveedor de IA (RF-DER-03).
- [SQL escrito a mano para el orden] → no hay pruebas contra la base en el proyecto; mitigación: la construcción de la consulta se prueba sin base, el `CASE` sale del dominio y el orden se verifica a mano con la base migrada (tarea 5.1).
- [Sondeo cada 5 segundos] → cada panel abierto hace dos consultas cada 5 segundos; para una agencia con tres usuarios es poco. Se pausa con la pestaña oculta.
- [Cambia la firma de `classifyIntent`] → hay que tocar los dobles de prueba (`app.test.ts`, `process-incoming-message.test.ts`); no hay otros consumidores.
- [Los mensajes muestran DNI en claro en el panel] → el panel es interno y la Base de Clientes ya muestra el DNI; el tratamiento de datos sensibles sigue en «Decisiones abiertas».
- [Casos que se acumulan] → mientras no exista «cerrar» (próximo change), los derivados que no sean altas quedan para siempre en la bandeja.

## Migration Plan

Sin migración de base. Al desplegar, los casos derivados antes del cambio tienen `id_nivel_riesgo` nulo y la bandeja les calcula la gravedad por el tipo de consulta (o «Sin nivel»). Para volver atrás alcanza con revertir el PR: la columna `id_nivel_riesgo` ya existía y los valores escritos no molestan.
