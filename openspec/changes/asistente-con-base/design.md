# Design

## Context

Estado actual (el porqué está en `proposal.md`):

- `ProcessIncomingMessage` (`backend/src/application/process-incoming-message.ts`) guarda en dos `Map` en memoria el estado de cada número (`awaiting_dni`, `awaiting_new_customer_answer`, `awaiting_name`, `identified` y `silenced`) y los ids procesados.
  - Si `execute` lanza, restaura la foto del estado y saca la marca del id, y el webhook responde 500.
  - Los clientes salen de `customerRepositoryFrom…` (`infrastructure/in-memory-customer-repository.ts`), que lee el JSON de clientes ficticios de `backend/fixtures/`.
  - El backend no se conecta a la base: solo lo hace `scripts/migrar-planilla.ts`, con `PrismaMariaDb` y las variables `DATABASE_*` que ya pone el compose.
- Lo que dice el esquema vigente (comentarios de la migración inicial):
  - `conversacion` es una sesión por número. `id_cliente` queda NULL hasta que la persona se identifica, y `asistente_suspendido` es la marca de que el asistente dejó de responder después de una derivación.
  - `caso` tiene `id_tipo_consulta` NULL mientras no se conoce la intención, y su estado sale de las fechas: abierto, derivado (`fecha_derivacion`), en atención (`fecha_toma`) o cerrado (`fecha_cierre`).
  - `mensaje` exige un caso.
  - `respuesta` exige el mensaje que responde (`id_mensaje_consulta`), y `id_mensaje_enviado` solo se completa si la respuesta salió.
  - `telefono` también guarda números que no están vinculados a nadie.
  - `prospecto` es uno por caso.
  - `parametro_configuracion` tiene `max_intentos_dni` = 3 (reintentos antes de derivar) y `minutos_inactividad_sesion` = 30.
  - La base no guarda el id del mensaje de WhatsApp.
- Lo migrado (`docs/migracion.md`):
  - 10 conversaciones, una por caso. Las 7 abiertas tienen su caso derivado, tomado y sin cerrar.
  - Todas tienen `asistente_suspendido = FALSE`, por una decisión del equipo del 06/10, que este change reemplaza.
  - Toda la cartera está vencida por fecha.
  - Ana Fernández y Luisa Martínez no tienen pólizas.

## Goals / Non-Goals

**Goals:**
- Que el flujo de hoy (el mismo de `asistente-respuestas-limitadas`) corra con la cartera de la base y sobreviva a un reinicio, sin cambiar textos ni la tabla de intenciones.
- Que las reglas nuevas (etapa de identificación, caso de cada mensaje, inactividad y parámetros) sean funciones puras del dominio, con pruebas.
- Que se pueda probar con el teléfono la lectura de la cartera antes de tocar lo que se guarda.

**Non-Goals:**
- Tomar, cerrar o reabrir casos, y responder desde el panel.
- Alertas, verificación, fuera de horario y auditoría.
- Registrar `solicitud_accion` o el ofrecimiento del cambio de teléfono.
- Cambiar el esquema: no hay tablas, columnas ni valores de catálogo nuevos.

## Decisions

### 1. Conexión a la base

- `config.ts` suma `database: { host, port, user, password, name }`, que sale de `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` y `DATABASE_NAME` y es obligatorio, como las demás variables.
- `infrastructure/prisma-client.ts` crea el `PrismaClient` con `PrismaMariaDb` y las mismas opciones que el script de la planilla, incluido `allowPublicKeyRetrieval: true`, que es solo para desarrollo (skill `backend-datos`).
- `index.ts` crea un solo cliente.
- El script de la planilla sigue con su propia conexión. Unificarlas no hace falta para este change.

### 2. La cartera, con Prisma

`infrastructure/prisma-customer-repository.ts` implementa `CustomerRepository`:

- **`findByDni` y `findById`:** traen el cliente con sus pólizas, su ramo y su estado.
- **Mapeo:** una función pura, `customerFromRecord`, convierte la fila al `Customer` del dominio. Así el filtro y las validaciones se prueban sin base.
  - Devuelve `null` si el cliente tiene `activo = FALSE` o no tiene DNI, como una empresa.
  - Deja afuera las pólizas con `activo = FALSE`.
  - Valida el ramo y el estado con `isRamo` e `isPolicyStatus`. Si un valor no está, lanza: los catálogos del código y de la base se separaron, y es un error (500).
  - Pasa `fecha_vencimiento` (columna `DATE`) a `aaaa-mm-dd` sin convertir de zona horaria, igual que hizo el script con las fechas de la planilla.
  - Ordena las pólizas por número.
- **`Customer.id`** pasa de `string` a `number` (`id_cliente`). `customer.ts` no cambia en lo demás.
- **Se borran** el JSON de clientes ficticios de `backend/fixtures/`, la función que lo carga, `parseCustomerFixtures` y la prueba `in-memory-customer-repository.test.ts`.
- **`InMemoryCustomerRepository`** queda, con su comentario cambiado, como doble de prueba: las pruebas del flujo arman sus clientes ficticios.

Primer paso, para probar con el teléfono (tareas 1.x): `index.ts` usa este repositorio mientras `ProcessIncomingMessage` todavía guarda el estado en memoria.

### 3. El almacén de conversaciones

Hay una interfaz del dominio, `ConversationStore` (`domain/conversation.ts`), y dos implementaciones: `PrismaConversationStore` (infraestructura) y `InMemoryConversationStore` (doble de prueba). La interfaz tiene tres métodos:

- **`findOpen(phone)`:** busca la conversación abierta del número: la más reciente con `fecha_fin` NULL (pregunta 34, una por número, controlado en el código). Si existe, devuelve:
  - el id, `id_cliente` y `asistente_suspendido`;
  - sus casos, cada uno con id, tipo (un `Intent` del catálogo o `null`), si está derivado, si está cerrado y si tiene algo pendiente: una alerta sin `fecha_atencion` o una solicitud en estado «pendiente»;
  - sus mensajes en orden (`fecha_hora`, después `id_mensaje`), con id, caso, origen y texto.
- **`settings()`:** devuelve `{ maxDniRetries, inactivityMinutes }`. Los lee de `parametro_configuracion` con una función pura, `parseSettings`, que exige enteros positivos y lanza si falta uno o no es válido.
- **`save(changes, send)`:** aplica en una transacción los cambios que decidió el flujo para ese mensaje (`ConversationChanges`, un valor plano) y, al final y adentro de la transacción, llama a `send`, el envío por WhatsApp, si hay algo que enviar. Si `send` o una escritura lanzan, no queda nada guardado. Los cambios pueden ser:
  - **cerrar la conversación vencida** (decisión 6): `fecha_fin` y `fecha_cierre` de sus casos;
  - **la conversación:** la existente o una nueva. Para una nueva, busca el número en `telefono` y, si no está, lo crea, sin `cliente_telefono` (RF-CAR-03);
  - **`id_cliente`**, cuando se reconoce el DNI;
  - **el mensaje del cliente**, en un caso existente o en uno nuevo, con o sin tipo;
  - **el tipo de un caso sin tipo**;
  - **el mensaje del asistente:** `mensaje` con origen «asistente» y `respuesta` con `id_usuario` NULL, `id_mensaje_consulta` (el mensaje que responde) e `id_mensaje_enviado`;
  - **la redacción rechazada:** `respuesta` sin `id_mensaje_enviado`;
  - **la derivación:** `caso.fecha_derivacion`, `caso.motivo_derivacion` y `conversacion.asistente_suspendido = TRUE`;
  - **el prospecto.**

  Los ids de los catálogos (`tipo_consulta`, `origen_mensaje`, `estado_prospecto`) se buscan por nombre, como en el script de la planilla. Los textos se recortan al largo de la columna: 255 en el motivo y 200 en el nombre declarado.

  `PrismaConversationStore.save` usa `prisma.$transaction(async (tx) => …, { timeout: 20_000 })`. Los 20 s son una elección técnica, no un valor de negocio: alcanzan para las escrituras y un envío a WAHA.

  `InMemoryConversationStore` aplica los cambios sobre una copia y la conserva solo si `send` no lanza, así imita la transacción.

**Alternativa descartada:** que `ProcessIncomingMessage` escriba tabla por tabla. Mezclaba las reglas con Prisma y obligaba a una base para probar el flujo (pregunta 10: dobles en memoria).

### 4. La etapa de identificación se reconstruye

Una función pura de `domain/identification.ts` reproduce la máquina de estados de hoy antes del DNI. Usa la misma transición para los mensajes guardados y para el mensaje nuevo, con `findDni` y `parseYesNo` y sin el proveedor de IA.

- **Entrada:** los mensajes del cliente de los casos no cerrados de la conversación abierta, si la conversación no tiene `id_cliente`. En esa conversación ningún DNI se reconoció, porque si no `id_cliente` estaría completo, así que cada DNI guardado cuenta como no reconocido.
- **Salida:**
  - la etapa: esperando el DNI, esperando el sí o el no, o esperando el nombre;
  - la consulta guardada: id y texto del primer mensaje sin DNI que no fue la respuesta a «¿es cliente nuevo?»;
  - los DNI no reconocidos;
  - el último DNI no reconocido tal como lo escribió la persona (el texto que reconoció `findDni`, por ejemplo `30.111.222`), que se usa para el prospecto.
- **Tope:** se deriva cuando los DNI no reconocidos llegan a `1 + maxDniRetries` (4 con el valor de hoy).
- **Casos cerrados:** sus mensajes no cuentan. Si un operador cierra el caso derivado por DNI no reconocido, la identificación vuelve a empezar.

El estado `identified` es `conversacion.id_cliente`. El estado `silenced` es `asistente_suspendido` (decisión 5). En memoria quedan solo `processedMessageIds` y la cola por remitente de `http/app.ts`.

### 5. Silencio con `asistente_suspendido` (pregunta 32)

- Derivar y mandar a aprobar ponen `conversacion.asistente_suspendido = TRUE` en la misma transacción que la derivación del caso.
- Antes de cualquier otra cosa, incluso antes de mirar la inactividad (decisión 6), si la conversación abierta está suspendida, el mensaje del cliente se guarda en el caso derivado sin cerrar más reciente, o en el caso no cerrado más reciente si no hay uno derivado, o en un caso nuevo sin tipo si todos están cerrados. No se envía nada ni se llama al proveedor. Con la marca en TRUE la conversación no vence, aunque no quede ningún caso derivado abierto: lo resuelve quien cierre el caso (contrato de abajo).
- **Conversaciones migradas:**
  - una migración de solo datos, `backend/prisma/migrations/<AAAAMMDDHHMMSS>_asistente_suspendido_conversaciones_abiertas/migration.sql`, empieza con `SET NAMES utf8mb4;` y hace:

    ```sql
    UPDATE conversacion c
       SET c.asistente_suspendido = TRUE
     WHERE c.fecha_fin IS NULL
       AND EXISTS (SELECT 1 FROM caso k
                    WHERE k.id_conversacion = c.id_conversacion
                      AND k.fecha_derivacion IS NOT NULL
                      AND k.fecha_cierre IS NULL);
    ```

    En una base sin la planilla no cambia nada. En una base con la planilla marca las 7 conversaciones abiertas;
  - como la migración corre al levantar el backend, una planilla cargada después no queda marcada. Por eso `migrar-planilla.ts` pasa a cargar `asistente_suspendido: caseRow.closedAt === null` y se actualiza `docs/migracion.md`.
- **Contrato para el cierre de casos** (la bandeja, otro change, E17): quien cierre el último caso derivado sin cerrar de una conversación abierta pone `asistente_suspendido = FALSE` en la misma transacción. Este change solo prueba que con FALSE el asistente vuelve a atender.
- **La inactividad** mira las fechas del caso, como dice E23 (decisión 6). Mientras se cumpla el contrato, las dos señales coinciden.
- **El change simplificar-esquema** ya no puede eliminar la columna.

**Alternativa descartada por Santiago:** deducir el silencio de «la conversación tiene un caso derivado sin cerrar», sin usar la marca.

### 6. Inactividad, cuando el número vuelve a escribir (E23)

Cuando llega un mensaje de un número con una conversación abierta y sin la marca de silencio, una función pura decide si la sesión venció. El plazo corre solo desde el último mensaje (o desde `fecha_inicio`, si no tiene mensajes), como dice E23 («vencimiento del plazo configurado sin mensajes»). Vence si pasaron más de `inactivityMinutes` desde el último mensaje y la conversación no tiene un caso con `fecha_derivacion` y sin `fecha_cierre`. Si venció:

- `fecha_fin` es la hora en que se cumplió el plazo (último mensaje más los minutos). Si después se cerró un caso derivado de la conversación, es la hora del cierre más reciente: la conversación siguió abierta hasta que se cerró el caso, como dicen el DER y el comentario de `conversacion` en la migración inicial. Así `fecha_fin` nunca queda antes del cierre de un caso. Ejemplo: con el último mensaje a las 10:00 y el caso derivado cerrado a las 15:00, un mensaje a las 15:10 abre una conversación nueva y pide el DNI, y la anterior termina a las 15:00 (decisión de Santiago del 07/10/2026);
- los casos no derivados, no cerrados y sin nada pendiente reciben `fecha_cierre` con esa hora, sin responsable;
- el mensaje se procesa como el primero de una conversación nueva, así que se pide el DNI y el mensaje queda como consulta guardada.

Todo va en la misma transacción que el mensaje nuevo.

**Alternativa descartada:** una tarea periódica. Agregaba un proceso aparte del webhook. La consecuencia es que una conversación figura abierta hasta que el número vuelve a escribir; la bandeja tendrá que calcular si venció para mostrarla.

### 7. El caso de cada mensaje (un caso por consulta)

Una función pura de `domain/conversation.ts` decide el caso de cada mensaje. «Caso actual» es el caso no cerrado más reciente de la conversación.

| Situación | Caso del mensaje |
|---|---|
| No hay conversación abierta, o no hay ningún caso no cerrado | caso nuevo sin tipo |
| Conversación suspendida | el caso derivado sin cerrar más reciente; si no hay, el caso actual; si no hay, uno nuevo sin tipo (decisión 5) |
| Antes de identificarse (pedido de DNI, sí o no, nombre) | el caso actual |
| Consulta guardada que se responde con el DNI reconocido | el caso de la consulta guardada, que toma el tipo si la intención es del catálogo. Si es «no sé», ese caso se deriva sin tipo. Si es «no es de seguros», va la bienvenida, como hoy, y el caso sigue sin tipo |
| Identificado, la intención es del catálogo y el caso actual no está derivado | si el caso actual no tiene tipo, lo toma; si tiene la misma intención, sigue en ese; si es otra, se abre un caso nuevo con ese tipo |
| Identificado, «no sé», una falla del proveedor al decidir o el cliente identificado que ya no está en la cartera | el caso actual, si no tiene tipo; si no, un caso nuevo sin tipo. En los dos casos se deriva |
| Identificado, «no es de seguros» | el caso actual, sin cambiarle nada |

- La respuesta del asistente va al caso del mensaje que responde.
- La respuesta a la consulta guardada tiene `id_mensaje_consulta` igual al mensaje de esa consulta, aunque el mensaje que la disparó sea el DNI.
- `isQueryType(intent)` dice si la intención está en `tipo_consulta`: todas menos «no es de seguros» y «no sé».

### 8. Mensajes, respuestas y motivo (pregunta 37)

- Cada texto que envía el asistente se guarda dos veces, como dice el DER (redundancia aceptada): una fila en `mensaje` con origen «asistente» y una en `respuesta`, enlazada con `id_mensaje_enviado`.
- La redacción que rechaza `checkRewrite` se guarda como `respuesta` del mensaje consultado, con el texto del modelo y sin `id_mensaje_enviado`. No se crea `verificacion` (RF-VER-02 sigue afuera). Después va la respuesta de derivación, como siempre.
- `motivo_derivacion` es el mismo texto corto que hoy va al log:
  - `DNI no reconocido`;
  - `cliente nuevo`;
  - `intención: <intención>`;
  - `falla del proveedor al decidir`;
  - `cliente sin pólizas`;
  - `falla de la redacción`;
  - `redacción rechazada: <motivo>`;
  - `cliente identificado inexistente`;
  - `pedido para aprobar: <intención>`, para baja, modificación y cambio de teléfono.

  Ninguno lleva texto del cliente.
- `mensaje.fecha_hora` y `respuesta.fecha_hora` salen del reloj inyectado, en UTC. Dentro del mismo milisegundo, el orden lo da `id_mensaje`.

### 9. Prospecto (RF-ATE-05)

Con el mensaje que llega en la etapa «esperando el nombre» se guarda un `prospecto` en el caso de ese mensaje:

- `id_estado_prospecto` es «pendiente»;
- `nombre_declarado` es el texto tal como lo escribió la persona (comentario de `prospecto` en la migración inicial), recortado a 200 solo si es más largo;
- `dni_declarado` es el último DNI no reconocido tal como lo escribió (decisión 4), recortado a 15;
- `id_telefono` queda NULL, porque el número de contacto es el de la conversación;
- `id_cliente` queda NULL.

En la misma transacción se deriva con el motivo `cliente nuevo`. No se crea ningún `cliente`.

### 10. Orden de cada mensaje y fallas (pregunta 35)

1. Si el id del mensaje ya se procesó en esta ejecución del backend, se descarta, como hoy.
2. Se leen la conversación abierta, los parámetros y, si hace falta, el cliente. Una falla de la base lanza: 500 y WAHA reintenta.
3. Se decide qué hacer, con las mismas reglas, plantillas y control de hoy. Las llamadas a Groq van acá, antes de abrir la transacción, para no tenerla abierta durante el pedido. Una falla de Groq sigue derivando.
4. `store.save(changes, send)`. Si el envío por WhatsApp o la base fallan, no queda nada guardado, `execute` saca la marca del id y lanza, y el webhook responde 500. El reintento de WAHA arranca desde el mismo estado. Groq puede elegir otra intención en el reintento, y es aceptable.

La cola por remitente de `http/app.ts` asegura que dos mensajes del mismo chat no se procesen a la vez, así que la lectura del paso 2 sigue valiendo en el paso 4. La cola agrupa por el id del chat (`content.from`), no por el número: ver «Risks / Trade-offs».

**Alternativa descartada por Santiago:** guardar el id del mensaje de WhatsApp en `mensaje`, con UNIQUE. Daba una idempotencia que sobrevive al reinicio, pero cambiaba el esquema.

### 11. Pruebas (pregunta 10)

- **Funciones puras**, con Vitest: `customerFromRecord`, la etapa de identificación, el caso de cada mensaje, el vencimiento de la sesión y `parseSettings`. Cada una prueba el caso permitido y el derivado o rechazado.
- **Flujo:** `process-incoming-message.test.ts` usa `InMemoryCustomerRepository`, `InMemoryConversationStore`, el `AiClient` y el `WhatsAppClient` falsos y un reloj fijo. El reinicio se prueba con una instancia nueva de `ProcessIncomingMessage` sobre el mismo almacén.
- **Prisma:** `PrismaCustomerRepository` y `PrismaConversationStore` se verifican en las tareas manuales con SELECT en el contenedor `db`. Se corren con `--default-character-set=utf8mb4` y un solo `-e`, sin mostrar DNI, teléfonos completos ni textos de mensajes.

## Risks / Trade-offs

- [Sin la bandeja nadie cierra un caso: una conversación derivada queda en silencio para siempre] → Es lo próximo que hace Santiago. Mientras tanto, en las pruebas manuales cada rama que deriva usa otro número o queda para el final. Las ramas se cubren con las pruebas de Vitest.
- [Después de un reinicio, un reintento de WAHA de un mensaje ya procesado se procesa de nuevo y puede duplicar] → Riesgo aceptado (decisión 10). Pasa solo si el backend se reinicia entre el envío y la respuesta 200 al webhook.
- [El envío sale pero la transacción no confirma: el cliente recibió un mensaje que no está guardado y el reintento lo repite] → Riesgo aceptado. Es raro: la confirmación es lo único que queda después del envío.
- [La transacción queda abierta durante el envío a WAHA] → Corte a los 20 s. Las transacciones de números distintos tocan filas distintas.
- [Una conversación figura abierta hasta que el número vuelve a escribir] → Para el asistente no cambia nada. La bandeja tendrá que calcular el vencimiento (decisión 6).
- [Sin la planilla cargada no se reconoce ningún DNI] → Queda escrito en AGENTS.md y en `docs/migracion.md`. La demo corre en una máquina con la planilla.
- [Los mensajes guardados tienen el DNI tal como lo escribió el cliente] → El tratamiento de datos sensibles es una decisión abierta (`proposal.md`). El DNI sigue sin salir a Groq y sin aparecer en el log.
- [Un parámetro mal cargado en `parametro_configuracion` deja al asistente respondiendo 500] → `parseSettings` lanza con un mensaje claro en el log. Los valores vienen de la migración de catálogos.
- [La cola agrupa por chat: si el mismo número llegara una vez como `@lid` y otra como `@c.us`, dos mensajes podrían procesarse a la vez y la lectura del paso 2 quedaría vieja] → WhatsApp usa un solo id por chat. Si aparece, se agrupa por número en `app.ts`. Cuando la bandeja cierre casos en paralelo, `save` tendrá que volver a leer la marca adentro de la transacción (skill `backend-datos`: leer y mutar en la misma operación).
- [`console.error(error)` del manejador de errores de `app.ts` puede volcar al log los argumentos de un error de Prisma, con texto del cliente] → `PrismaConversationStore` envuelve sus errores en uno propio con un mensaje sin datos, para que el log siga sin texto ni DNI.
- [Un ramo o un estado de la base que no está en el dominio responde 500 y el cliente se queda sin respuesta] → Es un error de programación: los catálogos del código salen de las migraciones. Se ve en el log y se corrige el código.
- [El cambio de teléfono y las acciones críticas siguen sin `solicitud_accion`] → Quedan como casos derivados, con el motivo `pedido para aprobar: …`, para que el operador los vea.

## Migration Plan

1. Traer la rama y correr `docker compose restart backend`, que aplica la migración de datos. Con la planilla cargada, marca las 7 conversaciones abiertas; sin la planilla, no cambia nada.
2. Si después se carga la planilla en una base nueva, el script ya marca las conversaciones abiertas.
3. Para volver atrás se revierte el merge. Las 7 marcas en TRUE no molestan al código anterior, que no las lee. Las conversaciones, casos y mensajes que haya guardado el asistente quedan en la base.

## Open Questions

- El change de la bandeja tiene que cumplir el contrato de la decisión 5 (poner `asistente_suspendido` en FALSE al cerrar el último caso derivado) y calcular el vencimiento de la sesión (decisión 6). No cambia nada de este change.
