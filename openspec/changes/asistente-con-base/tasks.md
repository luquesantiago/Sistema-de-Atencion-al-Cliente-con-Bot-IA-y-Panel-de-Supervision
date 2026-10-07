# Tasks

Los comandos corren desde la raíz del repo, en la WSL, con el stack levantado (`docker compose up -d --build`).

- No se lee ni se muestra el `.env`. Si hace falta saber si una variable está cargada, se le pregunta a Santiago.
- Los SELECT se corren en el contenedor `db` con `docker compose exec db sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "…"'`, con un solo `-e`. No muestran DNI, teléfonos completos ni textos de mensajes.
- Los DNI para las pruebas manuales los elige Santiago y no se escriben en el repo ni en el chat.
- Las llamadas a los endpoints de trámites se hacen desde el contenedor del backend con `node -e` y `fetch` a `http://localhost:3000`.

Ya está en `main` por el PR #18 y no lleva tarea: la conexión a la base (`config.ts` e `index.ts`), `PrismaCustomerRepository` con `findByDni` y `findById`, la clasificación del tipo de cliente con la IA, el flujo del cliente nuevo con la foto, la solicitud de cambio de teléfono y los endpoints de `/api/tramites`. AGENTS.md y `docs/requisitos.md` ya tienen, en esta rama, las reglas 1, 2 y 9 nuevas y el reinicio.

## 1. La cartera y el número vinculado

- [x] 1.1 En `backend/src/infrastructure/prisma-customer-repository.ts`, reemplazar `toCustomer` por la función pura exportada `customerFromRecord` (decisión 2) y cambiar `Customer.id` a `number` en `domain/customer.ts`, `InMemoryCustomerRepository` y las pruebas. Agregar `prisma-customer-repository.test.ts` con registros armados en la prueba, sin base:
  - **permitido:** el cliente con dos pólizas da dos pólizas, con ramo, estado y vencimiento `aaaa-mm-dd`, ordenadas por número aunque el registro venga desordenado;
  - **rechazado o filtrado:** un cliente con `activo = false` da `null`; una póliza con `activo = false` no aparece; un cliente sin DNI (empresa) da `null`; un ramo o un estado fuera del catálogo lanza.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores y `docker compose exec backend npm test` pasa.
- [x] 1.2 Reemplazar `hasLinkedPhone` por `linkedCustomerIds(phone)` en `CustomerRepository`, `PrismaCustomerRepository` (clientes y teléfonos activos) e `InMemoryCustomerRepository`. Cambiar el comentario de `InMemoryCustomerRepository`: es el doble de prueba, y el cargador de `backend/fixtures/clientes-ficticios.json` queda para las pruebas. En `in-memory-customer-repository.test.ts`, sumar:
  - **permitido:** un número vinculado a un cliente da su id; uno vinculado a dos da los dos;
  - **rechazado:** un número sin vínculos da una lista vacía.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores y `docker compose exec backend npm test` pasa.

## 2. Dominio: casos, cierre de la conversación y parámetros

Son funciones puras, sin base ni Groq. Todavía no se usan en el flujo.

- [x] 2.1 Crear `backend/src/domain/conversation.ts` con los tipos de la conversación abierta y de `ConversationChanges`, la interfaz `ConversationStore`, `isQueryType` y la función que elige el caso de cada mensaje (decisión 7). Agregar `conversation.test.ts` con un caso por fila de la tabla de la decisión 7:
  - misma intención, mismo caso; intención distinta, caso nuevo con ese tipo;
  - un caso sin tipo toma el de la primera intención del catálogo;
  - el DNI que crea la solicitud va a un caso nuevo con el tipo «cambio de teléfono», y otra intención después no lo reutiliza;
  - «no sé» y otro DNI van a un caso sin tipo;
  - «no es de seguros» va al caso actual sin cambiarlo;
  - una conversación suspendida usa el caso derivado sin cerrar más reciente;
  - sin casos no cerrados se abre uno sin tipo.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 2.2 En `domain/conversation.ts`, sumar el cierre de la conversación por inactividad y por reinicio, la lista de casos que se cierran (decisión 6) y `parseSettings` (decisión 3). Agregar las pruebas:
  - **inactividad:** con 30 minutos, a los 29 no vence y a los 31 sí; `fecha_fin` es el último mensaje más 30 minutos;
  - **caso derivado cerrado después del plazo:** con el último mensaje de hace 2 horas y el caso derivado cerrado hace 10 minutos, vence, y `fecha_fin` es la hora del cierre;
  - **caso derivado cerrado dentro del plazo:** con el último mensaje de hace 40 minutos y el caso derivado cerrado 5 minutos después de ese mensaje, vence, y `fecha_fin` es el último mensaje más 30 minutos;
  - **reinicio:** `fecha_fin` es el último mensaje, o el cierre de un caso derivado si es posterior;
  - **no vence:** una conversación suspendida, o con un caso derivado sin cerrar, no vence aunque pasen horas;
  - **casos que se cierran:** no se cierran los derivados, los ya cerrados ni los que tienen una alerta sin atender o una solicitud pendiente;
  - **`parseSettings`:** con los valores de la migración de catálogos da 3 y 30; un parámetro ausente, `0`, `-1` o `abc` lanza.

  Verificar: `docker compose exec backend npm test` pasa y `docker compose exec backend npx tsc --noEmit` sin errores.

## 3. Almacén de conversaciones, marca de silencio y trámites

- [x] 3.1 Crear `backend/src/infrastructure/in-memory-conversation-store.ts`, que implementa `ConversationStore` y aplica los cambios sobre una copia que conserva solo si `send` no lanza (decisión 3). Agregar `in-memory-conversation-store.test.ts`:
  - **permitido:** después de `save`, `findOpen` devuelve la conversación con sus casos, sus mensajes en orden, el prospecto y la solicitud pendiente;
  - **rechazado:** si `send` lanza, `save` lanza y `findOpen` devuelve lo mismo que antes.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 3.2 Crear `backend/src/infrastructure/prisma-conversation-store.ts`, con `findOpen`, `settings` y `save` (decisiones 3, 9 y 10):
  - `save` va en una transacción, con `send` al final y un corte a los 20 s, y vuelve a leer `asistente_suspendido` adentro de la transacción: si cambió desde `findOpen`, lanza;
  - los catálogos se buscan por nombre;
  - el número se busca en `telefono` o se crea, sin `cliente_telefono`;
  - el prospecto y la solicitud de cambio de teléfono van en la conversación abierta;
  - el motivo se recorta a 255 caracteres y el nombre declarado, a 200;
  - los errores se envuelven en uno propio sin datos del cliente.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores. Lo que escribe se comprueba con SELECT en el grupo 5.
- [x] 3.3 Marca de silencio de las conversaciones migradas (decisión 5):
  - crear la migración de solo datos `backend/prisma/migrations/<AAAAMMDDHHMMSS>_asistente_suspendido_conversaciones_abiertas/migration.sql`, con la hora en UTC y el SQL del design;
  - en `backend/scripts/migrar-planilla.ts`, cargar `asistente_suspendido: caseRow.closedAt === null` y reemplazar el comentario de la decisión del 06/10;
  - en `docs/migracion.md`, «Conversaciones», sumar que las abiertas quedan con el asistente suspendido porque tienen un caso derivado sin cerrar, y en «Quien no tenga el Excel…», que el asistente no reconoce ningún DNI.

  Antes de aplicarla, Santiago guarda la huella de lo migrado (tarea 5.1). Verificar:
  - `docker compose restart backend` muestra la migración aplicada en `docker compose logs backend`;
  - `docker compose exec backend npx prisma db pull` y `git diff --exit-code backend/prisma/schema.prisma` sin diferencias;
  - con la planilla cargada, `SELECT COUNT(*) FROM conversacion WHERE asistente_suspendido = TRUE` da 7; en una base sin la planilla, da 0;
  - `docker compose exec backend npx tsc --noEmit` sin errores.
- [x] 3.4 Decisiones de trámites (decisión 12):
  - en `prisma-request-management-repository.ts`, `decideProspect` y `decidePhoneChange` ponen `asistente_suspendido = FALSE`, en la transacción del cierre, si la conversación sigue abierta y no le queda otro caso derivado sin cerrar;
  - `RequestManagementRepository` suma el guardado del aviso, y `ManageRequests` lo llama después de un envío exitoso, en la decisión y en `/notificacion`. Si el guardado falla, deja una línea en el log sin texto.

  En `app.test.ts`, sumar al `FakeRequestRepository` el guardado y las pruebas:
  - **permitido:** con el envío exitoso, el aviso queda guardado una vez;
  - **rechazado:** con el envío fallido, no se guarda, y el reintento por `/notificacion` lo guarda.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores y `docker compose exec backend npm test` pasa. La marca se comprueba con SELECT en la tarea 5.3.

## 4. El flujo del asistente sobre el almacén

- [x] 4.1 Reescribir `backend/src/application/process-incoming-message.ts` con el orden de la decisión 11:
  - leer la conversación abierta y los parámetros; con la marca de silencio, guardar el mensaje sin responder;
  - cerrar la conversación por reinicio o por inactividad (decisiones 4 y 6);
  - identificar con `linkedCustomerIds`, la clasificación del tipo de cliente y el DNI, con el tope de `maxDniRetries` y la derivación por `DNI de otra persona`;
  - decidir con las funciones del grupo 2 y las reglas, plantillas y control de `main`;
  - guardar con `save(changes, send)` y, con `save` confirmado, actualizar la etapa en memoria por id de conversación.

  Salen de `CustomerRepository` y de `PrismaCustomerRepository` `recordIncomingPhone`, `hasOpenHandoff`, `recordMessageForOpenHandoff`, `createProspect` y `createPhoneChangeRequest`. Quedan `processedMessageIds`, que se saca si `execute` lanza, y el log sin texto. En `domain/templates.ts`, `prospectHandoffMessage` deja de decir «a la brevedad». Cablear `PrismaConversationStore` en `index.ts`. Verificar: `docker compose exec backend npx tsc --noEmit` sin errores.
- [x] 4.2 Adaptar `backend/src/application/process-incoming-message.test.ts` al almacén en memoria. Las pruebas de `main` tienen que seguir pasando, salvo las que cambian con las specs. Cada regla con su caso permitido y su caso derivado o retenido:
  - **Número vinculado** (RF-ATE-03, RF-CAR-03):
    - vinculado a un solo cliente: «¿cuándo vence mi seguro?» se responde sin pedir el DNI y la conversación queda con ese cliente;
    - vinculado a dos clientes: pide el DNI; con el DNI de uno de ellos responde la consulta guardada; con el DNI de un cliente no vinculado, deriva con `DNI de otra persona`;
    - vinculado solo a un cliente inactivo: se atiende como no vinculado.
  - **Otro DNI:** en una conversación identificada, el DNI del mismo cliente sigue normal y un DNI distinto deriva.
  - **Número no vinculado:** pregunta si ya es cliente y guarda la consulta; una respuesta ajena vuelve a preguntar; una falla de la clasificación deriva.
  - **DNI no reconocido:** vuelve a preguntar si ya es cliente; con `maxDniRetries` 3 deriva al cuarto DNI no reconocido, y con 2, al tercero.
  - **Cambio de teléfono** (RF-CAR-05):
    - cliente existente desde un número no vinculado: queda la solicitud pendiente en un caso propio, sin vincular el número; el cliente recibe el aviso de pendiente y la respuesta a la consulta guardada; el siguiente mensaje se contesta;
    - si ya hay una solicitud pendiente, no se crea otra;
    - el pedido de cambio de teléfono desde un número vinculado pide escribir desde el nuevo, sin silenciar.
  - **Cliente nuevo** (RF-ATE-05):
    - con nombre, DNI y foto queda un prospecto pendiente en el caso derivado de la conversación abierta, no se crea ningún cliente, y no se guarda la imagen;
    - un texto en lugar de la foto vuelve a pedirla; un DNI de un cliente sigue como cliente existente;
    - en una conversación posterior, el mismo DNI sigue sin reconocerse.
  - **Silencio** (RF-DER-03):
    - después de derivar, de mandar a aprobar o del prospecto, otro mensaje no se contesta, no llama al `AiClient` y queda guardado en el caso derivado, también después de un reinicio; una foto queda con el texto del sistema;
    - con la marca en FALSE después del cierre del caso y el último mensaje de hace menos de 30 minutos, sigue en la misma conversación y, si estaba identificado, no vuelve a identificarlo; si el caso derivado se cerró después de cumplido el plazo, abre una conversación nueva y la anterior termina a la hora del cierre;
    - otro número se atiende normal.
  - **Reinicio:** una instancia nueva sobre el mismo almacén termina la conversación que no estaba en silencio y empieza una nueva; la que estaba en silencio sigue en silencio.
  - **Inactividad:**
    - a los 31 minutos, la identificación empieza en una conversación nueva, y los casos no derivados de la anterior quedan cerrados sin responsable, salvo el de una solicitud pendiente;
    - a los 29, sigue en la misma conversación;
    - una conversación con un caso derivado sin cerrar no se cierra.
  - **Casos por intención:**
    - la consulta guardada, los mensajes de la identificación y la respuesta quedan en un caso que toma el tipo de la consulta, con la respuesta enlazada a la consulta;
    - una intención distinta abre un caso nuevo;
    - «no sé» deriva en un caso sin tipo;
    - «no es de seguros» queda en el caso actual sin respuesta;
    - una falla del proveedor al decidir deriva en un caso sin tipo.
  - **Respuestas:**
    - cada mensaje enviado tiene su `respuesta` enviada;
    - una redacción que cambia una fecha queda como `respuesta` no enviada y el caso se deriva con el motivo `redacción rechazada: …`, sin texto del cliente.
  - **Fallas:**
    - si el `WhatsAppClient` falla, no queda nada guardado, la etapa en memoria no cambia y el reintento con el mismo `messageId` hace lo mismo que la primera vez;
    - si el almacén falla al leer o al guardar, `execute` lanza, no se envía nada y el `messageId` no queda marcado.
  - **Datos propios:** ningún pedido al `AiClient` tiene el DNI, aunque el cliente lo escriba.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 4.3 Documentación del flujo nuevo:
  - **AGENTS.md, «Reglas del Parcial 1»:** el asistente guarda cada conversación; el silencio después de derivar dura hasta que se cierre el caso (`asistente_suspendido`). Desvíos que siguen: baja y modificación se derivan sin registrar la solicitud, y los mensajes repetidos se descartan en memoria (después de un reinicio, un reintento de WAHA puede duplicar);
  - **AGENTS.md, «Casos y cierre»:** «El ofrecimiento del cambio de teléfono y la respuesta del cliente forman su propio caso, aunque el cliente diga que no» pasa a «La solicitud de cambio de teléfono forma su propio caso»;
  - **AGENTS.md, paso 4 del Parcial 1:** se borra «Mientras los clientes salgan de los fixtures, que no tienen teléfonos, se manda a aprobar como una baja»;
  - **AGENTS.md, «Decisiones abiertas», audios y fotos:** se suma que la foto del DNI del cliente nuevo y la imagen que llega a una conversación en silencio se procesan sin guardar la imagen;
  - **skill `backend-datos`** (los datos salen de la cartera de la base, y el desvío de los mensajes repetidos) **y skill `verificacion-seguridad`** («un mensaje repetido no puede duplicar mensajes ni efectos»): el desvío provisional.

  Verificar:
  - `git grep -n -e "salgan de los fixture[s]" -e "El ofrecimiento del cambio de teléfon[o]" -- AGENTS.md .claude` sin resultados;
  - `git grep -n "reintento de WAHA" -- AGENTS.md .claude` muestra AGENTS.md y las dos skills.

## 5. Prueba de punta a punta (manual, con Santiago)

- [x] 5.1 **Huella de lo migrado**, antes de la tarea 3.3 y con la planilla cargada. Un solo `-e` empieza con `SET SESSION group_concat_max_len = 1000000;` (el valor por defecto, 1024, corta el texto sin avisar) y devuelve el `MD5` de `GROUP_CONCAT(… ORDER BY id)` de las filas migradas:
  - `cliente`, `poliza`, `telefono`, `cliente_telefono`, `caso`, `mensaje`, `respuesta` y `alerta`;
  - `conversacion`, sin la columna `asistente_suspendido`.

  Se toman las filas con id menor o igual al conteo de la migración (10 conversaciones y casos, 20 mensajes, 10 respuestas, 8 teléfonos, 3 vínculos, 5 alertas). Se anota el resultado, que no muestra datos. Verificar: el SELECT corre y devuelve un hash por tabla.
- [ ] 5.2 **Vincular el celular de la demo**, después de la tarea 4.1, con `docker compose --profile whatsapp up -d` y la sesión de WAHA en `WORKING`. Desde un celular no vinculado:
  1. «hola, ¿cuándo vence mi seguro?» → «¿ya es cliente o es nuevo?»;
  2. «ya soy cliente» → pedido de DNI;
  3. el DNI de un cliente migrado con pólizas → aviso de pendiente y una línea por póliza, cada una diciendo que venció;
  4. «gracias» → cortesía (sigue atendiendo);
  5. aprobar la solicitud con `GET /api/tramites/cambios-telefono` y `POST /api/tramites/cambios-telefono/:id/decision`, sin desvincular números → llega el aviso de aprobación.

  Con SELECT, sin textos ni números completos, verificar: la solicitud aprobada con su `detalle`; el caso de la solicitud cerrado con responsable; el vínculo nuevo en `cliente_telefono`; el aviso guardado como mensaje del asistente en ese caso; una sola conversación abierta para el número.
- [ ] 5.3 **Conversación desde el número vinculado:**
  1. `docker compose restart backend` y «¿y el estado de mis pólizas?» → el estado, sin pedir el DNI ni preguntar si ya es cliente;
  2. «tuve un choque» → mensaje de derivación;
  3. «¿hola?» → nada;
  4. `docker compose restart backend` y «¿hola?» → nada.

  Con SELECT, verificar:
  - la conversación anterior terminó por el reinicio y hay una nueva con cliente y `asistente_suspendido = TRUE`;
  - hay 2 casos: estado de póliza y siniestro, este último derivado con el motivo `intención: siniestro`;
  - los «¿hola?» están en el caso derivado y no tienen respuesta;
  - todas las respuestas del asistente tienen `id_mensaje_enviado`.
- [ ] 5.4 **Cliente nuevo**, desde otro número de prueba: «hola» → «soy nuevo» → nombre → un DNI que no está en la base → foto → aviso de revisión. Verificar con SELECT que hay un prospecto «pendiente» con `dni_declarado` y `nombre_declarado` no nulos (sin mostrarlos), en la conversación abierta del número, con el motivo `cliente nuevo` y `asistente_suspendido = TRUE`, y que la cantidad de filas de `cliente` no cambió. Después, rechazar el prospecto con `POST /api/tramites/prospectos/:id/decision` y verificar que la conversación quedó con `asistente_suspendido = FALSE` y que «hola» vuelve a recibir respuesta.
- [x] 5.5 **Falla del envío contra la base real.** Con `docker compose stop waha`, guardar los conteos de `conversacion`, `caso`, `mensaje`, `respuesta` y `telefono`. Mandar al webhook un aviso con el formato de WAHA, un número ficticio (`5490000000099`) y el texto «hola», desde el contenedor del backend con `node -e` y `fetch`, usando `process.env.WHATSAPP_WEBHOOK_SECRET` (no se lee el `.env`). Verificar:
  - el webhook responde 500 y el log dice que WAHA lo reintenta;
  - los conteos son los mismos;
  - después, `docker compose --profile whatsapp up -d` para levantar WAHA de nuevo.
- [ ] 5.6 **Inactividad contra la base real (opcional, si hay tiempo).** Con el número de la tarea 5.4: escribir, esperar 31 minutos y volver a escribir. Verificar:
  - la identificación empieza de nuevo;
  - con SELECT, la conversación anterior tiene `fecha_fin` igual al último mensaje más 30 minutos;
  - sus casos no derivados quedaron cerrados y sin responsable;
  - hay una conversación nueva abierta para ese número.
- [ ] 5.7 **Lo migrado no cambió.** Repetir el SELECT de la tarea 5.1. Verificar:
  - los hashes son iguales;
  - `SELECT COUNT(*) FROM conversacion WHERE asistente_suspendido = TRUE AND id_conversacion <= 10` da 7.

## 6. Verificaciones globales

- [x] 6.1 Correr las verificaciones de AGENTS.md:
  - `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`;
  - `docker compose exec backend npx prisma generate`, `docker compose exec backend npx tsc --noEmit` y `docker compose exec backend npm test`;
  - `docker compose config --quiet`.

  Verificar: todas terminan sin errores, y `git grep -n -e "hasLinkedPhon[e]" -e "createProspec[t]" -e "createPhoneChangeReques[t]" -- backend/src` sin resultados.
