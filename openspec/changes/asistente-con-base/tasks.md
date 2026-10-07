# Tasks

Los comandos corren desde la raíz del repo, en la WSL, con el stack levantado (`docker compose up -d --build`).

- No se lee ni se muestra el `.env`. Si hace falta saber si una variable está cargada, se le pregunta a Santiago.
- Los SELECT se corren en el contenedor `db` con `docker compose exec db sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "…"'`, con un solo `-e`. No muestran DNI, teléfonos completos ni textos de mensajes.
- Los DNI para las pruebas manuales los elige Santiago y no se escriben en el repo ni en el chat.

Los `git grep` llevan un corchete en el patrón (`ficticio[s]`) para no encontrarse a sí mismos en este archivo.

## 1. La cartera sale de la base (se prueba con el teléfono antes de seguir)

En este grupo el estado de la conversación sigue en memoria. Solo cambia de dónde salen los clientes.

- [ ] 1.1 Conexión (decisión 1):
  - sumar `database` a `backend/src/infrastructure/config.ts`, con `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` y `DATABASE_NAME` obligatorias;
  - crear `backend/src/infrastructure/prisma-client.ts` con `PrismaMariaDb` y las opciones del script de la planilla.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores.
- [ ] 1.2 Crear `backend/src/infrastructure/prisma-customer-repository.ts`, con `findByDni`, `findById` y la función pura `customerFromRecord` (decisión 2), y cambiar `Customer.id` a `number`. Agregar `prisma-customer-repository.test.ts` con registros armados en la prueba, sin base:
  - **permitido:** el cliente con dos pólizas da dos pólizas, con ramo, estado y vencimiento `aaaa-mm-dd`, ordenadas por número;
  - **rechazado o filtrado:** un cliente con `activo = false` da `null`; una póliza con `activo = false` no aparece; un cliente sin DNI (empresa) da `null`; un ramo o un estado fuera del catálogo lanza.

  Verificar: `docker compose exec backend npm test` pasa.
- [ ] 1.3 Borrar `backend/fixtures/` (el JSON de clientes ficticios), el cargador y `parseCustomerFixtures` de `in-memory-customer-repository.ts`, y su prueba. `InMemoryCustomerRepository` queda como doble de prueba, con el comentario cambiado. Pasar a número los ids de los clientes de `process-incoming-message.test.ts` y cablear `PrismaCustomerRepository` en `index.ts`. Documentación de este paso:
  - **AGENTS.md, línea 64 (paso 2) y línea 69 (cambio de teléfono):** cambiar la aclaración de que no aplica porque los clientes de prueba no tienen teléfonos por que el ofrecimiento todavía no está (va en el change del cambio de teléfono) y, mientras tanto, el cambio de teléfono se manda a aprobar como una baja;
  - **AGENTS.md, línea 77:** el asistente identifica y responde con la cartera de la base y, sin la planilla cargada, no reconoce ningún DNI. Por ahora el estado de la conversación sigue en memoria (la tarea 4.3 deja el texto final);
  - **skill `backend-datos`, línea 66:** los datos salen de la cartera de la base;
  - **`docs/migracion.md`, «Quien no tenga el Excel…»:** sumar que el asistente no reconoce ningún DNI.

  Verificar:
  - `docker compose exec backend npx tsc --noEmit` sin errores y `docker compose exec backend npm test` pasa;
  - `git grep -n -e "clientes-ficticio[s]" -e "customerRepositoryFrom[F]ixtures" -e "salgan de los fixture[s]" -- . ':!openspec/changes/archive'` sin resultados.
- [ ] 1.4 **Prueba con el teléfono (manual, con Santiago).** Santiago confirma que tiene la planilla cargada y la clave de Groq en su `.env`. Se levanta `docker compose --profile whatsapp up -d` con la sesión de WAHA en `WORKING`. Como el silencio todavía está en memoria, entre una rama que deriva y la siguiente se corre `docker compose restart backend`. Cada paso deja su línea en `docker compose logs backend`:
  1. «hola, ¿cuándo vence mi seguro?» → pedido de DNI (`DNI_REQUESTED`);
  2. el DNI de un cliente migrado con pólizas → `ANSWER_SENT`: una línea por póliza, cada una diciendo que venció, con la fecha de la planilla;
  3. después de reiniciar, el DNI de Ana Fernández o de Luisa Martínez y la pregunta por el vencimiento → `HANDOFF_SENT` (`cliente sin pólizas`);
  4. después de reiniciar, un DNI que no está en la base → `NEW_CUSTOMER_ASKED`.

## 2. Dominio: identificación, casos, inactividad y parámetros

Son funciones puras, sin base ni Groq. Todavía no se usan en el flujo.

- [ ] 2.1 Crear `backend/src/domain/identification.ts` con la transición de la etapa antes del DNI y la reconstrucción a partir de los mensajes del cliente (decisión 4). Agregar `identification.test.ts`:
  - el primer mensaje sin DNI queda como consulta guardada y un segundo no la reemplaza;
  - un DNI no reconocido pasa a esperar el sí o el no; «no» o «¿qué?» vuelven a esperar el DNI y conservan la consulta;
  - «sí» pasa a esperar el nombre, y el último DNI no reconocido queda para el prospecto tal como se escribió (`30.111.222` queda `30.111.222`);
  - un DNI como respuesta al sí o al no cuenta como intento;
  - **derivado:** con `maxDniRetries` 3 se deriva al cuarto DNI no reconocido, y con 2, al tercero (el tope sale del parámetro);
  - los mensajes de un caso cerrado no cuentan;
  - reconstruir mensaje por mensaje da lo mismo que aplicar la transición uno por uno.

  Verificar: `docker compose exec backend npm test` pasa.
- [ ] 2.2 Crear `backend/src/domain/conversation.ts` con los tipos de la conversación abierta y de `ConversationChanges`, la interfaz `ConversationStore`, `isQueryType` y la función que elige el caso de cada mensaje (decisión 7). Agregar `conversation.test.ts` con un caso por fila de la tabla de la decisión 7:
  - misma intención, mismo caso; intención distinta, caso nuevo con ese tipo;
  - un caso sin tipo toma el de la primera intención del catálogo;
  - «no sé» va a un caso sin tipo;
  - «no es de seguros» va al caso actual sin cambiarlo;
  - una conversación suspendida usa el caso derivado sin cerrar más reciente;
  - sin casos no cerrados se abre uno sin tipo.

  Verificar: `docker compose exec backend npm test` pasa.
- [ ] 2.3 En `domain/conversation.ts`, sumar el vencimiento de la sesión y la lista de casos que se cierran (decisión 6), y `parseSettings` (decisión 3). Agregar las pruebas:
  - **inactividad:** con 30 minutos, a los 29 no vence y a los 31 sí; `fecha_fin` es el último mensaje más 30 minutos;
  - **caso derivado cerrado después del plazo:** con el último mensaje de hace 2 horas y el caso derivado cerrado hace 10 minutos, vence, y `fecha_fin` es la hora del cierre, no el último mensaje más 30 minutos;
  - **caso derivado cerrado dentro del plazo:** con el último mensaje de hace 40 minutos y el caso derivado cerrado 5 minutos después de ese mensaje, vence, y `fecha_fin` es el último mensaje más 30 minutos;
  - **no vence:** una conversación con un caso derivado sin cerrar no vence aunque pasen horas;
  - **casos que se cierran:** no se cierran los derivados, los ya cerrados ni los que tienen una alerta sin atender o una solicitud pendiente;
  - **`parseSettings`:** con los valores de la migración de catálogos da 3 y 30; un parámetro ausente, `0`, `-1` o `abc` lanza.

  Verificar: `docker compose exec backend npm test` pasa y `docker compose exec backend npx tsc --noEmit` sin errores.

## 3. Almacén de conversaciones y marca de silencio

- [ ] 3.1 Crear `backend/src/infrastructure/in-memory-conversation-store.ts`, que implementa `ConversationStore` y aplica los cambios sobre una copia que conserva solo si `send` no lanza (decisión 3). Agregar `in-memory-conversation-store.test.ts`:
  - **permitido:** después de `save`, `findOpen` devuelve la conversación con sus casos y mensajes en orden;
  - **rechazado:** si `send` lanza, `save` lanza y `findOpen` devuelve lo mismo que antes.

  Verificar: `docker compose exec backend npm test` pasa.
- [ ] 3.2 Crear `backend/src/infrastructure/prisma-conversation-store.ts`, con `findOpen`, `settings` y `save` (decisión 3):
  - `save` va en una transacción, con `send` al final y un corte a los 20 s;
  - los catálogos se buscan por nombre;
  - el número se busca en `telefono` o se crea, sin `cliente_telefono`;
  - el motivo se recorta a 255 caracteres y el nombre declarado, a 200.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores. Lo que escribe se comprueba con SELECT en el grupo 5.
- [ ] 3.3 Marca de silencio de las conversaciones migradas (decisión 5):
  - crear la migración de solo datos `backend/prisma/migrations/<AAAAMMDDHHMMSS>_asistente_suspendido_conversaciones_abiertas/migration.sql`, con la hora en UTC y el SQL del design;
  - en `backend/scripts/migrar-planilla.ts`, cargar `asistente_suspendido: caseRow.closedAt === null` y reemplazar el comentario de la decisión del 06/10;
  - en `docs/migracion.md`, «Conversaciones», sumar que las abiertas quedan con el asistente suspendido porque tienen un caso derivado sin cerrar.

  Antes de aplicarla, Santiago guarda la huella de lo migrado (tarea 5.1). Verificar:
  - `docker compose restart backend` muestra la migración aplicada en `docker compose logs backend`;
  - `docker compose exec backend npx prisma db pull` y `git diff --exit-code backend/prisma/schema.prisma` sin diferencias;
  - con la planilla cargada, `SELECT COUNT(*) FROM conversacion WHERE asistente_suspendido = TRUE` da 7; en una base sin la planilla, da 0;
  - `docker compose exec backend npx tsc --noEmit` sin errores.

## 4. El flujo del asistente sobre el almacén

- [ ] 4.1 Reescribir `backend/src/application/process-incoming-message.ts` con el orden de la decisión 10:
  - leer la conversación abierta y los parámetros;
  - decidir con las funciones de los grupos 2 y 3 y las reglas, plantillas y control de hoy;
  - guardar con `save(changes, send)`.

  Se van los `Map` de estados. Quedan `processedMessageIds`, que se saca si `execute` lanza, y el log sin texto. Cablear `PrismaConversationStore` en `index.ts`. Verificar: `docker compose exec backend npx tsc --noEmit` sin errores.
- [ ] 4.2 Adaptar `backend/src/application/process-incoming-message.test.ts` al almacén en memoria. Las pruebas de hoy tienen que seguir pasando, salvo las del reinicio, que cambian. Sumar un caso permitido y uno derivado o retenido por regla:
  - **Reinicio:** una instancia nueva sobre el mismo almacén atiende a un cliente identificado sin pedirle el DNI y sigue la identificación desde donde estaba: la consulta guardada, los intentos, y si esperaba el sí o el nombre.
  - **Silencio** (RF-DER-03):
    - después de derivar o de mandar a aprobar, otro mensaje no se contesta, no llama al `AiClient` y queda guardado en el caso derivado, también después de un reinicio;
    - con el caso derivado cerrado y la marca de la conversación en FALSE, si el último mensaje es de hace menos de 30 minutos, el asistente vuelve a atender en la misma conversación sin pedir el DNI; si es de hace más y el caso derivado se cerró después de cumplido el plazo, pide el DNI en una conversación nueva y la anterior termina a la hora del cierre del caso;
    - con la marca en TRUE y sin ningún caso derivado abierto, sigue en silencio y el mensaje va a un caso no cerrado;
    - otro número se atiende normal.
  - **Inactividad:**
    - a los 31 minutos, un cliente identificado recibe el pedido de DNI en una conversación nueva, y los casos no derivados de la anterior quedan cerrados sin responsable;
    - a los 29, sigue en la misma conversación;
    - una conversación con un caso derivado sin cerrar no se cierra.
  - **Cliente nuevo:**
    - con «sí» y el nombre queda un prospecto pendiente, con el nombre y el DNI no reconocido tal como se escribieron, en el caso derivado, y no se crea ningún cliente;
    - en una conversación posterior, el mismo DNI sigue sin reconocerse.
  - **Casos por intención:**
    - la consulta guardada, el pedido de DNI, el DNI y la respuesta quedan en un caso que toma el tipo de la consulta, con la respuesta enlazada a la consulta;
    - una intención distinta abre un caso nuevo;
    - «no sé» deriva en un caso sin tipo;
    - «no es de seguros» queda en el caso actual sin respuesta;
    - una consulta guardada que resulta «no es de seguros» recibe la bienvenida y su caso sigue sin tipo; si resulta «no sé», ese caso se deriva sin tipo;
    - una falla del proveedor al decidir deriva en un caso sin tipo.
  - **Respuestas:**
    - cada mensaje enviado tiene su `respuesta` enviada;
    - una redacción que cambia una fecha queda como `respuesta` no enviada y el caso se deriva con el motivo `redacción rechazada: …`, sin texto del cliente.
  - **Fallas:**
    - si el `WhatsAppClient` falla, no queda nada guardado y el reintento con el mismo `messageId` hace lo mismo que la primera vez;
    - si el almacén falla al leer o al guardar, `execute` lanza, no se envía nada y el `messageId` no queda marcado.
  - **El número no identifica** (RF-CAR-03): un número que tuvo una conversación anterior con el cliente identificado, ya terminada, recibe el pedido de DNI en la conversación nueva.
  - **Datos propios:** ningún pedido al `AiClient` tiene el DNI, aunque el cliente lo escriba.

  Verificar: `docker compose exec backend npm test` pasa.
- [ ] 4.3 Documentación del flujo nuevo:
  - **AGENTS.md, línea 77:** el texto final. El asistente identifica y responde con la cartera de la base y guarda cada conversación. El silencio después de derivar dura hasta que se cierre el caso (`asistente_suspendido`). El cliente nuevo queda como prospecto. Sin la planilla no se reconoce ningún DNI. Desvíos que siguen: baja, modificación y cambio de teléfono se derivan sin registrar la solicitud, y los mensajes repetidos se descartan en memoria.
  - **skill `backend-datos`, línea 65, y skill `verificacion-seguridad`, línea 62** («un mensaje repetido no puede duplicar mensajes ni efectos»): sumar el desvío provisional. Los repetidos se descartan en memoria, y después de un reinicio un reintento de WAHA puede duplicar.

  Verificar:
  - `git grep -n -e "hasta que se reinicia el backend" -e "no lee ni escribe la base" -- AGENTS.md .claude` sin resultados;
  - `git grep -n "reintento de WAHA" -- AGENTS.md .claude` muestra AGENTS.md y las dos skills;
  - `git diff main -- AGENTS.md` cambia solo las líneas 64, 69 y 77.

## 5. Prueba de punta a punta (manual, con Santiago)

- [ ] 5.1 **Huella de lo migrado**, antes de la tarea 3.3 y con la planilla cargada. Un solo `-e` empieza con `SET SESSION group_concat_max_len = 1000000;` (el valor por defecto, 1024, corta el texto sin avisar) y devuelve el `MD5` de `GROUP_CONCAT(… ORDER BY id)` de las filas migradas:
  - `cliente`, `poliza`, `telefono`, `cliente_telefono`, `caso`, `mensaje`, `respuesta` y `alerta`;
  - `conversacion`, sin la columna `asistente_suspendido`.

  Se toman las filas con id menor o igual al conteo de la migración (10 conversaciones y casos, 20 mensajes, 10 respuestas, 8 teléfonos, 5 alertas). Se anota el resultado, que no muestra datos. Verificar: el SELECT corre y devuelve un hash por tabla.
- [ ] 5.2 **Conversación real** desde un teléfono de prueba, después de la tarea 4.1, con `docker compose --profile whatsapp up -d`. Cada paso deja su línea en el log:
  1. «hola, ¿cuándo vence mi seguro?» → pedido de DNI;
  2. el DNI de un cliente migrado con pólizas → una línea por póliza, cada una diciendo que venció;
  3. «gracias» → cortesía;
  4. `docker compose restart backend` y «¿y el estado de mis pólizas?» → el estado, sin volver a pedir el DNI;
  5. «tuve un choque» → mensaje de derivación;
  6. «¿hola?» → nada;
  7. `docker compose restart backend` y «¿hola?» → nada.

  Con SELECT, sin textos ni números completos, verificar:
  - la conversación del teléfono (últimos 4 dígitos) tiene cliente y `asistente_suspendido = TRUE`;
  - hay 4 casos: vencimiento, saludo, estado de póliza y siniestro, este último derivado con el motivo `intención: siniestro`;
  - por cada caso, la cantidad de mensajes por origen;
  - los «¿hola?» están en el caso derivado y no tienen respuesta;
  - todas las respuestas del asistente tienen `id_mensaje_enviado`;
  - el número está en `telefono` y no tiene filas en `cliente_telefono`.
- [ ] 5.3 **Otras ramas**, desde otro número de prueba (cada rama que deriva deja ese número en silencio hasta que exista la bandeja):
  - un DNI que no está en la base → «¿Es usted cliente nuevo?» → «sí» → nombre → derivación. Verificar con SELECT que hay un prospecto «pendiente» con `dni_declarado` y `nombre_declarado` no nulos (sin mostrarlos) y el motivo `cliente nuevo`, y que la cantidad de filas de `cliente` no cambió.

  Si Santiago tiene un tercer número: el DNI de Ana Fernández y la pregunta por el vencimiento → derivación con el motivo `cliente sin pólizas`.
- [ ] 5.4 **Falla del envío contra la base real.** Con `docker compose stop waha`, guardar los conteos de `conversacion`, `caso`, `mensaje`, `respuesta` y `telefono`. Mandar al webhook un aviso con el formato de WAHA, un número ficticio (`5490000000099`) y el texto «hola», desde el contenedor del backend con `node -e` y `fetch`, usando `process.env.WHATSAPP_WEBHOOK_SECRET` (no se lee el `.env`). Verificar:
  - el webhook responde 500 y el log dice que WAHA lo reintenta;
  - los conteos son los mismos;
  - después, `docker compose --profile whatsapp up -d` para levantar WAHA de nuevo.
- [ ] 5.5 **Inactividad contra la base real (opcional, si hay tiempo).** Con el número de la tarea 5.3 o uno que no haya derivado: escribir, esperar 31 minutos y volver a escribir. Verificar:
  - pide el DNI;
  - con SELECT, la conversación anterior tiene `fecha_fin` igual al último mensaje más 30 minutos;
  - sus casos no derivados quedaron cerrados y sin responsable;
  - hay una conversación nueva abierta para ese número.
- [ ] 5.6 **Lo migrado no cambió.** Repetir el SELECT de la tarea 5.1. Verificar:
  - los hashes son iguales;
  - `SELECT COUNT(*) FROM conversacion WHERE asistente_suspendido = TRUE AND id_conversacion <= 10` da 7.

## 6. Verificaciones globales

- [ ] 6.1 Correr las verificaciones de AGENTS.md:
  - `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`;
  - `docker compose exec backend npx prisma generate`, `docker compose exec backend npx tsc --noEmit` y `docker compose exec backend npm test`;
  - `docker compose config --quiet`.

  Verificar: todas terminan sin errores, y `git grep -n -e "clientes-ficticio[s]" -e "customerRepositoryFrom[F]ixtures" -- . ':!openspec/changes/archive'` sin resultados.
