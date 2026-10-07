# Design

## Context

Estado de `main` en `3583b56`, después del PR #18 (el porqué del change está en `proposal.md`):

- `ProcessIncomingMessage` (`backend/src/application/process-incoming-message.ts`) guarda en un `Map` por número la etapa de cada conversación (`awaiting_customer_status`, `awaiting_dni`, `awaiting_new_customer_name`, `awaiting_new_customer_dni`, `awaiting_new_customer_photo`, `identified` y `silenced`) y en un `Set` los ids procesados.
  - Si `execute` lanza, restaura la etapa anterior y saca la marca del id, y el webhook responde 500.
  - Un número con `cliente_telefono` activo pide el DNI; uno sin vínculo recibe `customerStatusQuestion` y la respuesta la clasifica `AiClient.classifyCustomerStatus` (con el DNI tapado).
  - El tope de DNI está fijo en el código (`maxUnrecognizedDnis = 4`).
  - Un DNI no reconocido vuelve a `customerStatusQuestion`.
  - Un cliente existente desde un número no vinculado recibe `phoneChangePendingMessage`, se crea la solicitud y la conversación queda en silencio.
- `PrismaCustomerRepository` (`infrastructure/prisma-customer-repository.ts`) implementa `CustomerRepository`:
  - `findByDni` y `findById` filtran `activo` y mapean con `toCustomer`, que lanza si falta el DNI, sin ordenar las pólizas. `Customer.id` es un `string`;
  - `hasLinkedPhone`, `recordIncomingPhone`, `hasOpenHandoff` y `recordMessageForOpenHandoff`;
  - `createProspect` y `createPhoneChangeRequest` abren cada uno una conversación nueva, ya suspendida, con un caso derivado y un mensaje con un texto del sistema.
- `ManageRequests` y `PrismaRequestManagementRepository` sirven los endpoints `/api/tramites/*` (`backend/README.md`). La decisión cierra el caso a nombre del usuario de prueba `operador`, no toca `asistente_suspendido` y, en el cambio de teléfono, avisa por WhatsApp después de confirmar, sin guardar el aviso.
- El webhook entrega las fotos (`media: 'image'`); audios y otros archivos se siguen ignorando.
- `index.ts` crea un solo `PrismaClient` con `PrismaMariaDb` y las variables `DATABASE_*` de `config.ts`.
- `backend/fixtures/clientes-ficticios.json` y su cargador siguen, y AGENTS.md los reserva para las pruebas.
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
  - 10 conversaciones, una por caso. Las 7 abiertas tienen su caso derivado, tomado y sin cerrar, y `asistente_suspendido = FALSE`, por una decisión del equipo del 06/10 que este change reemplaza.
  - 3 vínculos en `cliente_telefono`: Juan García con dos números y María del Carmen López con uno. Ningún número migrado está compartido entre clientes vinculados.
  - Toda la cartera está vencida por fecha.
  - Ana Fernández y Luisa Martínez no tienen pólizas.

## Goals / Non-Goals

**Goals:**
- Que el flujo de `main` guarde cada conversación en la base y que el silencio sobreviva a un reinicio.
- Que las reglas nuevas (caso de cada mensaje, cierre de la conversación y parámetros) sean funciones puras del dominio, con pruebas.
- Que la demo muestre la identificación por número vinculado, la respuesta con la cartera y la derivación.

**Non-Goals:**
- Tomar, cerrar o reabrir casos desde la bandeja, y responder desde el panel.
- Alertas, verificación, fuera de horario y auditoría.
- Registrar `solicitud_accion` para baja, modificación y alta de conductor.
- Cambiar el esquema: no hay tablas, columnas ni valores de catálogo nuevos.
- Que la etapa de la identificación sobreviva a un reinicio (decisión 4).

## Decisions

### 1. Conexión a la base

Ya está en `main`: `config.ts` pide `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` y `DATABASE_NAME`, e `index.ts` crea un solo `PrismaClient` con `allowPublicKeyRetrieval: true`, que es solo para desarrollo (skill `backend-datos`). El script de la planilla sigue con su propia conexión. No se agrega `prisma-client.ts`.

### 2. La cartera, con Prisma

`CustomerRepository` queda solo con lecturas de la cartera:

- **`findByDni(dni)` y `findById(id)`:** traen el cliente con sus pólizas, su ramo y su estado.
- **`linkedCustomerIds(phone)`:** los ids de los clientes activos vinculados al número por `cliente_telefono`, con `telefono.activo`. Reemplaza a `hasLinkedPhone`. Con un solo id, el número identifica (regla 1); con varios, pide el DNI; sin ninguno, es un número no vinculado.
- **Mapeo:** una función pura, `customerFromRecord`, reemplaza a `toCustomer` y convierte la fila al `Customer` del dominio. Así el filtro y las validaciones se prueban sin base.
  - Devuelve `null` si el cliente tiene `activo = FALSE` o no tiene DNI, como una empresa.
  - Deja afuera las pólizas con `activo = FALSE`.
  - Valida el ramo y el estado con `isRamo` e `isPolicyStatus`. Si un valor no está, lanza: los catálogos del código y de la base se separaron, y es un error (500).
  - Pasa `fecha_vencimiento` (columna `DATE`) a `aaaa-mm-dd` sin convertir de zona horaria, igual que hizo el script con las fechas de la planilla.
  - Ordena las pólizas por número.
- **`Customer.id`** pasa de `string` a `number` (`id_cliente`).
- **Salen de `CustomerRepository`** `hasLinkedPhone`, `recordIncomingPhone`, `hasOpenHandoff`, `recordMessageForOpenHandoff`, `createProspect` y `createPhoneChangeRequest`: lo que escriben pasa al almacén (decisión 3), dentro de la conversación abierta.
- **`InMemoryCustomerRepository`** queda como doble de prueba, con `linkedCustomerIds` y sin los métodos que salen. El cargador de `backend/fixtures/clientes-ficticios.json` y su prueba se quedan.

### 3. El almacén de conversaciones

Hay una interfaz del dominio, `ConversationStore` (`domain/conversation.ts`), y dos implementaciones: `PrismaConversationStore` (infraestructura) e `InMemoryConversationStore` (doble de prueba). La interfaz tiene tres métodos:

- **`findOpen(phone)`:** busca la conversación abierta del número: la más reciente con `fecha_fin` NULL (pregunta 34, una por número, controlado en el código). Si existe, devuelve:
  - el id, `id_cliente`, `asistente_suspendido` y `fecha_inicio`;
  - sus casos, cada uno con id, tipo (un `Intent` del catálogo o `null`), si está derivado, si está cerrado, la fecha de cierre y si tiene algo pendiente: una alerta sin `fecha_atencion` o una solicitud en estado «pendiente»;
  - sus mensajes en orden (`fecha_hora`, después `id_mensaje`), con id, caso, origen, texto y fecha;
  - si tiene una solicitud pendiente de cambio de teléfono para ese número y el cliente de la conversación.
- **`settings()`:** devuelve `{ maxDniRetries, inactivityMinutes }`. Los lee de `parametro_configuracion` con una función pura, `parseSettings`, que exige enteros positivos y lanza si falta uno o no es válido.
- **`save(changes, send)`:** aplica en una transacción los cambios que decidió el flujo para ese mensaje (`ConversationChanges`, un valor plano) y, al final y adentro de la transacción, llama a `send`, el envío por WhatsApp, si hay algo que enviar. Si `send` o una escritura lanzan, no queda nada guardado. Los cambios pueden ser:
  - **cerrar la conversación anterior** (decisión 6): `fecha_fin` y `fecha_cierre` de sus casos;
  - **la conversación:** la existente o una nueva. Para una nueva, busca el número en `telefono` y, si no está, lo crea, sin `cliente_telefono` (RF-CAR-03);
  - **`id_cliente`**, cuando el cliente queda identificado;
  - **el mensaje del cliente**, en un caso existente o en uno nuevo, con o sin tipo. Para una foto, el texto es el del sistema (decisión 9);
  - **el tipo de un caso sin tipo**;
  - **los mensajes del asistente:** por cada texto, `mensaje` con origen «asistente» y `respuesta` con `id_usuario` NULL, `id_mensaje_consulta` (el mensaje que responde) e `id_mensaje_enviado`. Un mismo mensaje del cliente puede tener dos (el aviso de la solicitud y la respuesta a la consulta guardada, decisión 10);
  - **la redacción rechazada:** `respuesta` sin `id_mensaje_enviado`;
  - **la derivación:** `caso.fecha_derivacion`, `caso.motivo_derivacion` y `conversacion.asistente_suspendido = TRUE`;
  - **el prospecto** (decisión 9);
  - **la solicitud de cambio de teléfono** (decisión 10).

  Los ids de los catálogos (`tipo_consulta`, `origen_mensaje`, `estado_prospecto`, `estado_solicitud`, `tipo_accion`) se buscan por nombre, como en el script de la planilla. Los textos se recortan al largo de la columna: 255 en el motivo y 200 en el nombre declarado.

  `PrismaConversationStore.save` usa `prisma.$transaction(async (tx) => …, { timeout: 20_000 })`. Los 20 s son una elección técnica, no un valor de negocio: alcanzan para las escrituras y un envío a WAHA. `send` puede enviar más de un texto, en orden.

  `InMemoryConversationStore` aplica los cambios sobre una copia y la conserva solo si `send` no lanza, así imita la transacción.

**Alternativa descartada:** que `ProcessIncomingMessage` escriba tabla por tabla, como hoy `createProspect` y `createPhoneChangeRequest`. Mezclaba las reglas con Prisma, obligaba a una base para probar el flujo (pregunta 10: dobles en memoria) y abría conversaciones aparte.

### 4. La etapa de la identificación queda en memoria, por conversación

Decisión de Santiago del 07/10/2026: si se reinicia el backend, la conversación vuelve a empezar.

- El `Map` de `ProcessIncomingMessage` pasa a tener como clave el id de la conversación abierta, no el número. Guarda la etapa de `main` (sin `silenced`, que sale de la base), la consulta guardada, los DNI no reconocidos, el nombre y el DNI del cliente nuevo y el cliente identificado.
- La etapa se actualiza solo después de que `save` confirma. Si `save` lanza, no cambia.
- Una conversación abierta que no está en silencio y no tiene etapa en memoria es de antes del reinicio: termina (decisión 6) y el mensaje abre una nueva.
- La entrada del `Map` se borra cuando la conversación termina.

**Alternativas descartadas:**
- Reconstruir la etapa con la última plantilla que mandó el asistente: sobrevive al reinicio, pero ata la base a los textos de las plantillas, y para el Parcial 1 no hace falta.
- Volver a clasificar con la IA las respuestas guardadas: más lento, gasta cuota y puede dar otro resultado.

### 5. Silencio con `asistente_suspendido` (pregunta 32)

- Derivar, mandar a aprobar una baja o una modificación, y registrar el prospecto ponen `conversacion.asistente_suspendido = TRUE` en la misma transacción que la derivación del caso. La solicitud de cambio de teléfono no lo toca (decisión 10).
- Antes de cualquier otra cosa, incluso antes de mirar el reinicio o la inactividad (decisiones 4 y 6), si la conversación abierta está suspendida, el mensaje del cliente se guarda en el caso derivado sin cerrar más reciente, o en el caso no cerrado más reciente si no hay uno derivado, o en un caso nuevo sin tipo si todos están cerrados. No se envía nada ni se llama al proveedor. Con la marca en TRUE la conversación no vence.
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
- **Contrato para el cierre de casos:** quien cierre el último caso derivado sin cerrar de una conversación abierta pone `asistente_suspendido = FALSE` en la misma transacción. Este change lo cumple en las decisiones de trámites (decisión 12); la bandeja lo cumplirá en su change (E17).
- **La inactividad** mira la marca y las fechas del caso, como dice E23 (decisión 6). Mientras se cumpla el contrato, las dos señales coinciden.
- **El change simplificar-esquema** ya no puede eliminar la columna.

**Alternativa descartada por Santiago:** deducir el silencio de «la conversación tiene un caso derivado sin cerrar», sin usar la marca.

### 6. Cierre de la conversación, cuando el número vuelve a escribir

Cuando llega un mensaje de un número con una conversación abierta y sin la marca de silencio, una función pura decide si la conversación termina:

- **Inactividad (E23):** pasaron más de `inactivityMinutes` desde el último mensaje (o desde `fecha_inicio`, si no tiene mensajes) y no hay un caso con `fecha_derivacion` y sin `fecha_cierre`. `fecha_fin` es la hora en que se cumplió el plazo (último mensaje más los minutos) o, si después se cerró un caso derivado, la hora del cierre más reciente. Ejemplo: con el último mensaje a las 10:00 y el caso derivado cerrado a las 15:00, un mensaje a las 15:10 abre una conversación nueva, y la anterior termina a las 15:00 (decisión de Santiago del 07/10/2026).
- **Reinicio (decisión 4):** la conversación no tiene etapa en memoria. `fecha_fin` es la hora del último mensaje o, si después se cerró un caso derivado, la hora del cierre más reciente.

En los dos casos, los casos no derivados, no cerrados y sin nada pendiente reciben `fecha_cierre` con esa hora, sin responsable; el mensaje se procesa como el primero de una conversación nueva, y todo va en la misma transacción que el mensaje nuevo. Así `fecha_fin` nunca queda antes del cierre de un caso.

**Alternativa descartada:** una tarea periódica. Agregaba un proceso aparte del webhook. La consecuencia es que una conversación figura abierta hasta que el número vuelve a escribir; la bandeja tendrá que calcular si venció para mostrarla.

### 7. El caso de cada mensaje (un caso por consulta)

Una función pura de `domain/conversation.ts` decide el caso de cada mensaje. «Caso actual» es el caso no cerrado más reciente de la conversación.

| Situación | Caso del mensaje |
|---|---|
| No hay conversación abierta, o no hay ningún caso no cerrado | caso nuevo sin tipo |
| Conversación suspendida | el caso derivado sin cerrar más reciente; si no hay, el caso actual; si no hay, uno nuevo sin tipo (decisión 5) |
| Antes de identificarse (pregunta de si ya es cliente, DNI, datos del cliente nuevo) | el caso actual |
| El DNI que crea la solicitud de cambio de teléfono | un caso nuevo con el tipo «cambio de teléfono», que lleva la solicitud y el aviso de pendiente (decisión 10) |
| Consulta guardada que se responde al identificarse | el caso de la consulta guardada, que toma el tipo si la intención es del catálogo. Si es «no sé», ese caso se deriva sin tipo. Si es «no es de seguros», va la bienvenida, como hoy, y el caso sigue sin tipo |
| Identificado, la intención es del catálogo y el caso actual no está derivado | si el caso actual no tiene tipo, lo toma; si tiene la misma intención, sigue en ese; si es otra, se abre un caso nuevo con ese tipo. El caso de cambio de teléfono no se reutiliza para otra intención |
| Identificado, «no sé», una falla del proveedor al decidir, el cliente identificado que ya no está en la cartera u otro DNI | el caso actual, si no tiene tipo; si no, un caso nuevo sin tipo. En los dos casos se deriva |
| Identificado, «no es de seguros» | el caso actual, sin cambiarle nada |

- La respuesta del asistente va al caso del mensaje que responde.
- La respuesta a la consulta guardada tiene `id_mensaje_consulta` igual al mensaje de esa consulta, aunque el mensaje que la disparó sea otro.
- `isQueryType(intent)` dice si la intención está en `tipo_consulta`: todas menos «no es de seguros» y «no sé».

### 8. Mensajes, respuestas y motivo (pregunta 37)

- Cada texto que envía el asistente se guarda dos veces, como dice el DER (redundancia aceptada): una fila en `mensaje` con origen «asistente» y una en `respuesta`, enlazada con `id_mensaje_enviado`.
- La redacción que rechaza `checkRewrite` se guarda como `respuesta` del mensaje consultado, con el texto del modelo y sin `id_mensaje_enviado`. No se crea `verificacion` (RF-VER-02 sigue afuera). Después va la respuesta de derivación, como siempre.
- `motivo_derivacion` es el mismo texto corto que hoy va al log:
  - `DNI no reconocido`;
  - `DNI de otra persona`;
  - `cliente nuevo`;
  - `intención: <intención>`;
  - `falla del proveedor al decidir`;
  - `falla del proveedor al identificar el tipo de cliente`;
  - `cliente sin pólizas`;
  - `falla de la redacción`;
  - `redacción rechazada: <motivo>`;
  - `cliente identificado inexistente`;
  - `pedido para aprobar: <intención>`, para baja y modificación.

  Ninguno lleva texto del cliente.
- `mensaje.fecha_hora` y `respuesta.fecha_hora` salen del reloj inyectado, en UTC. Dentro del mismo milisegundo, el orden lo da `id_mensaje`.

### 9. Prospecto (RF-ATE-05)

Con la foto que llega en la etapa «esperando la foto» se guarda un `prospecto` en el caso actual de la conversación abierta:

- `id_estado_prospecto` es «pendiente»;
- `nombre_declarado` es el texto tal como lo escribió la persona (comentario de `prospecto` en la migración inicial), recortado a 200 solo si es más largo;
- `dni_declarado` es el DNI que dio en la etapa «esperando el DNI del cliente nuevo», en dígitos, como lo devuelve `findDni` en `main`;
- `id_telefono` queda NULL, porque el número de contacto es el de la conversación;
- `id_cliente` queda NULL.

La foto queda como `mensaje` del cliente con el texto de `main`, «El cliente envió una foto de su DNI por WhatsApp. La imagen no se almacena en el sistema.» (texto del sistema con origen «cliente», aceptado por Santiago el 07/10/2026). Una imagen en una conversación en silencio queda con el texto de `messageTextForCase`. En la misma transacción se deriva con el motivo `cliente nuevo` y la marca de silencio. No se crea ningún `cliente`.

`prospectHandoffMessage` deja de decir «a la brevedad» (AGENTS.md: no prometer tiempos).

Si el DNI del cliente nuevo es de un cliente de la cartera, no hay prospecto: desde un número no vinculado se sigue con la decisión 10; desde un número vinculado, si el cliente está entre los vinculados queda identificado, y si no se deriva con `DNI de otra persona`.

### 10. Cambio de teléfono desde un número no vinculado (RF-CAR-05)

Cuando la persona dijo que ya es cliente desde un número no vinculado y da el DNI de un cliente activo:

- si no hay una solicitud pendiente de ese cliente para ese número, `save` crea una `solicitud_accion` con `tipo_accion` «cambio de teléfono», estado «pendiente» y el `detalle` de `main` («Número de WhatsApp solicitado para vincular: …»), en un caso nuevo con `tipo_consulta` «cambio de teléfono», sin `fecha_derivacion`. El DNI va a ese caso (decisión 7);
- `conversacion.id_cliente` queda completo y la etapa en memoria pasa a «identificado»; la marca de silencio no cambia;
- el asistente envía `phoneChangePendingMessage` y después, en el mismo envío, atiende la consulta guardada (decisión 7) o, si no había, la bienvenida. Si la consulta guardada se deriva, la derivación es de su caso, no del de la solicitud;
- si ya hay una solicitud pendiente, no se crea otra, y el aviso y lo demás son iguales.

El caso de la solicitud queda abierto y sin responsable hasta que un operador decide: tiene una solicitud pendiente, así que la inactividad no lo cierra. Lo cierra la decisión, con el operador como responsable (regla de «Casos y cierre»).

**Alternativa descartada por Santiago:** dejar la conversación en silencio hasta la decisión, como hace hoy `main`. La consulta del cliente quedaba sin respuesta, y casi ningún número está vinculado.

### 11. Orden de cada mensaje y fallas (pregunta 35)

1. Si el id del mensaje ya se procesó en esta ejecución del backend, se descarta, como hoy.
2. Se leen la conversación abierta, los parámetros y, si hace falta, los clientes vinculados al número y el cliente. Una falla de la base lanza: 500 y WAHA reintenta.
3. Se decide qué hacer, con las mismas reglas, plantillas y control de `main`. Las llamadas a Groq (clasificación del tipo de cliente, intención y redacción) van acá, antes de abrir la transacción, para no tenerla abierta durante el pedido. Una falla de Groq sigue derivando.
4. `store.save(changes, send)`. Si el envío por WhatsApp o la base fallan, no queda nada guardado, `execute` saca la marca del id y lanza, y el webhook responde 500. El reintento de WAHA arranca desde el mismo estado. Groq puede elegir otra intención en el reintento, y es aceptable.
5. Con `save` confirmado, se actualiza la etapa en memoria (decisión 4).

La cola por remitente de `http/app.ts` asegura que dos mensajes del mismo chat no se procesen a la vez, así que la lectura del paso 2 sigue valiendo en el paso 4. La cola agrupa por el id del chat (`content.from`), no por el número: ver «Risks / Trade-offs».

**Alternativa descartada por Santiago:** guardar el id del mensaje de WhatsApp en `mensaje`, con UNIQUE. Daba una idempotencia que sobrevive al reinicio, pero cambiaba el esquema.

### 12. Decisiones de trámites

En `PrismaRequestManagementRepository`:

- **La marca de silencio:** `decideProspect` y `decidePhoneChange`, en la misma transacción en que cierran el caso, ponen `asistente_suspendido = FALSE` si la conversación sigue abierta y no le queda otro caso derivado sin cerrar (contrato de la decisión 5).
- **La conversación del trámite:** el listado y la decisión ya buscan el caso por la solicitud o el prospecto, así que funcionan igual con la conversación abierta del número.

En `ManageRequests`:

- **El aviso guardado:** cuando el aviso del cambio de teléfono sale por WhatsApp, el repositorio guarda un `mensaje` con origen «asistente» y ese texto en el caso de la solicitud (decisión de Santiago del 07/10/2026). No lleva `respuesta`, porque no responde un mensaje del cliente. Si el envío falla, no se guarda, y el reintento por `/notificacion` lo guarda cuando sale.

### 13. Pruebas (pregunta 10)

- **Funciones puras**, con Vitest: `customerFromRecord`, el caso de cada mensaje, el cierre de la conversación y `parseSettings`. Cada una prueba el caso permitido y el derivado o rechazado.
- **Flujo:** `process-incoming-message.test.ts` usa `InMemoryCustomerRepository`, `InMemoryConversationStore`, el `AiClient` y el `WhatsAppClient` falsos y un reloj fijo, con clientes ficticios definidos en la prueba. El reinicio se prueba con una instancia nueva de `ProcessIncomingMessage` sobre el mismo almacén.
- **Trámites:** `app.test.ts` sigue con su `FakeRequestRepository` y suma el aviso guardado.
- **Prisma:** `PrismaCustomerRepository`, `PrismaConversationStore` y la marca de las decisiones se verifican en las tareas manuales con SELECT en el contenedor `db`. Se corren con `--default-character-set=utf8mb4` y un solo `-e`, sin mostrar DNI, teléfonos completos ni textos de mensajes.

## Risks / Trade-offs

- [Sin la bandeja nadie cierra un caso derivado que no sea un prospecto: la conversación queda en silencio para siempre] → Es lo próximo que hace Santiago. Mientras tanto, en las pruebas manuales cada rama que deriva usa otro número o queda para el final. Las ramas se cubren con las pruebas de Vitest.
- [Un reinicio termina las conversaciones que no estaban en silencio y una persona a mitad de identificarse vuelve a empezar] → Decisión de Santiago (decisión 4). Queda escrito en AGENTS.md.
- [Después de un reinicio, un reintento de WAHA de un mensaje ya procesado se procesa de nuevo y puede duplicar] → Riesgo aceptado (decisión 11). Pasa solo si el backend se reinicia entre el envío y la respuesta 200 al webhook.
- [El envío sale pero la transacción no confirma: el cliente recibió un mensaje que no está guardado y el reintento lo repite] → Riesgo aceptado. Es raro: la confirmación es lo único que queda después del envío.
- [El aviso de la decisión sale y falla el guardado del mensaje] → La decisión ya está confirmada. Se deja una línea en el log sin texto; el aviso no se reenvía.
- [La transacción queda abierta durante el envío a WAHA] → Corte a los 20 s. Las transacciones de números distintos tocan filas distintas.
- [Una conversación figura abierta hasta que el número vuelve a escribir] → Para el asistente no cambia nada. La bandeja tendrá que calcular el vencimiento (decisión 6).
- [Un cliente que escribe desde un número no vinculado queda identificado por DNI aunque la solicitud se rechace después] → El DNI coincidió en esa conversación, como cualquier identificación por DNI (regla 2). La próxima conversación vuelve a preguntar.
- [Un número vinculado a un solo cliente lo identifica sin DNI: quien tenga ese teléfono ve los datos de ese cliente] → Propuesta del equipo sin validar por la agencia, escrita en «Decisiones abiertas» de AGENTS.md. Un número compartido sigue pidiendo el DNI, y dar otro DNI deriva.
- [Sin la planilla cargada no se reconoce ningún DNI] → Queda escrito en `docs/migracion.md`. La demo corre en una máquina con la planilla.
- [Los mensajes guardados tienen el DNI tal como lo escribió el cliente] → El tratamiento de datos sensibles es una decisión abierta (`proposal.md`). El DNI sigue sin salir a Groq y sin aparecer en el log.
- [Un parámetro mal cargado en `parametro_configuracion` deja al asistente respondiendo 500] → `parseSettings` lanza con un mensaje claro en el log. Los valores vienen de la migración de catálogos.
- [La cola agrupa por chat: si el mismo número llegara una vez como `@lid` y otra como `@c.us`, dos mensajes podrían procesarse a la vez y la lectura del paso 2 quedaría vieja] → WhatsApp usa un solo id por chat. Si aparece, se agrupa por número en `app.ts`. Como las decisiones de trámites ya cambian la marca en paralelo, `save` vuelve a leer `asistente_suspendido` adentro de la transacción y, si cambió, lanza para que el reintento arranque del estado nuevo (skill `backend-datos`: leer y mutar en la misma operación).
- [`console.error(error)` del manejador de errores de `app.ts` puede volcar al log los argumentos de un error de Prisma, con texto del cliente] → `PrismaConversationStore` envuelve sus errores en uno propio con un mensaje sin datos, para que el log siga sin texto ni DNI.
- [Un ramo o un estado de la base que no está en el dominio responde 500 y el cliente se queda sin respuesta] → Es un error de programación: los catálogos del código salen de las migraciones. Se ve en el log y se corrige el código.
- [La baja y la modificación siguen sin `solicitud_accion`] → Quedan como casos derivados, con el motivo `pedido para aprobar: …`, para que el operador los vea.

## Migration Plan

1. Traer la rama y correr `docker compose restart backend`, que aplica la migración de datos. Con la planilla cargada, marca las 7 conversaciones abiertas; sin la planilla, no cambia nada.
2. Si después se carga la planilla en una base nueva, el script ya marca las conversaciones abiertas.
3. Las conversaciones abiertas por `createProspect` o `createPhoneChangeRequest` de `main` en bases de desarrollo quedan como están: el almacén toma la más reciente con `fecha_fin` NULL.
4. Para volver atrás se revierte el merge. Con las 7 marcas en TRUE, el código de `main` (`hasOpenHandoff`) deja esas conversaciones en silencio, que es lo que corresponde porque tienen un caso derivado sin cerrar. Las conversaciones, casos y mensajes que haya guardado el asistente quedan en la base.

## Open Questions

- El change de la bandeja tiene que cumplir el contrato de la decisión 5 (poner `asistente_suspendido` en FALSE al cerrar el último caso derivado) y calcular el vencimiento de la sesión (decisión 6). No cambia nada de este change.
