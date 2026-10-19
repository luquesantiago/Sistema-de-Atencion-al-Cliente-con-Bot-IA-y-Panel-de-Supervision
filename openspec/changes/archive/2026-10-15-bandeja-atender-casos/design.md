# Design

## Context

Estado de la rama `feature/bandeja-atencion-lectura`, con `bandeja-atencion-lectura` archivado. El porqué está en `proposal.md` y el comportamiento, en las specs del change.

- **La bandeja hoy.**
  - `ManageInbox` (`application/manage-inbox.ts`) solo lista y muestra el detalle.
  - `PrismaInboxRepository` ordena con `$queryRaw` y trae los datos con `findMany`. El filtro de «caso en la bandeja» es `inboxWhere(caseId?)`.
  - `domain/inbox.ts` tiene `InboxEntry`, `inboxLabel` y `waitingSince`.
  - En el frontend, `pages/BandejaAtencion.tsx` sondea cada 5 segundos y `api/bandeja.ts` es lo único que llama a `/api/bandeja`.
- **El cierre que ya existe.**
  - `prisma-request-management-repository.ts` tiene `closeCase` (responsable, `fecha_toma ?? ahora`, `fecha_cierre`) y `releaseSilence`, que pone `asistente_suspendido = false` si no queda otro caso derivado sin cerrar.
  - Las usan las decisiones de prospecto y de cambio de teléfono.
  - `findOperatorId` busca al usuario de prueba `operador`, al que se atribuye todo lo que se hace desde el panel.
- **El silencio.**
  - Con `asistente_suspendido = true`, `ProcessIncomingMessage` guarda el mensaje en el caso derivado sin llamar a la IA.
  - `PrismaConversationStore.save` vuelve a leer la marca dentro de la transacción y lanza si cambió. El webhook responde 500 y WAHA reintenta con el estado nuevo.
  - Mientras hay un caso derivado sin cerrar, el asistente no deriva otro en la misma conversación, así que no hay dos casos derivados abiertos a la vez (salvo datos cargados a mano).
- **Las imágenes.**
  - `waha-webhook.ts` marca `media: 'image'` y siempre trae `messageId`, el id serializado de WAHA.
  - `process-incoming-message.ts` guarda dos textos fijos: `prospectPhotoText` para la foto del DNI y `silencedImageText` para la imagen que llega a una conversación en silencio. Las demás imágenes se ignoran (`IGNORED_MEDIA`).
  - `docker-compose.yml` tiene `WAHA_EVENTS_DOWNLOAD_MEDIA: "false"`: WAHA no baja la imagen al recibirla.
  - `mensaje` no guarda el id de WhatsApp.
- **Las respuestas.** El DER ya prevé la respuesta de un operador: `respuesta.id_usuario` es el empleado, `id_mensaje_consulta` (obligatorio) es el mensaje que responde e `id_mensaje_enviado` es el mensaje que salió.
- **Trámites.** El backend decide prospectos y cambios de teléfono (`/api/tramites/...`), pero `pages/TramitesAprobar.tsx` es un cartel fijo: no hay pantalla.

## Goals / Non-Goals

**Goals:**
- Que las reglas de tomar, contestar y cerrar sean funciones puras del dominio con sus pruebas, no reglas escondidas en el handler, el SQL o el componente.
- Que tomar y cerrar resistan dos pedidos simultáneos sin pisarse.
- Que la imagen no quede escrita en la base, en el disco del backend ni en la caché del navegador.
- Que el usuario que actúa se resuelva en un solo lugar, para que el login del Parcial 2 lo cambie sin tocar las reglas.

**Non-Goals:**
- Historial de reasignaciones o auditoría inalterable (tabla `auditoria`, MVP 2).
- Reabrir un caso cerrado.
- Mandarle un mensaje automático al cliente al tomar o al cerrar.
- Descartar mensajes de WhatsApp repetidos con el id guardado.

## Decisions

### 1. Quién actúa: se resuelve en la capa HTTP y viaja como dato

`application/` recibe un `PanelActor = { userId: number }` en cada acción. `index.ts` lo arma con una función `resolvePanelActor()` que hoy busca al usuario `operador` (la misma búsqueda que `findOperatorId`, movida a un módulo compartido de `infrastructure/`) y que en el Parcial 2 leerá la sesión.

La lista y el detalle devuelven `assignedToMe: boolean`, calculado en el backend con el actor. Así el frontend no tiene que saber quién es el usuario para decidir qué botones mostrar.

*Alternativa descartada:* **que el repositorio busque a `operador` adentro de cada acción**, como hacen hoy las decisiones de trámites. Las reglas del dominio no podrían probar «otro responsable» sin base, y el Parcial 2 tendría que tocar cada consulta.

### 2. Las reglas, en `domain/case-actions.ts`

El módulo nuevo recibe el estado del caso que leyó el repositorio (`CaseActionState`): si está en la bandeja, si está derivado, el responsable, el estado del prospecto (`pendiente` | `descartado` | `null`), si tiene una solicitud de cambio de teléfono pendiente y la cantidad de alertas sin atender. Exporta:

- `decideTake(state)`: `ok`, o `not-in-inbox`.
- `decideReply(state, actor, text)`:
  - `{ take: boolean }`, que es `true` cuando el caso no tiene responsable;
  - o el error: `not-in-inbox`, `not-handed-off`, `taken-by-other`, `no-customer-message` o `invalid-text`.
- `decideClose(state, actor, { reason, alertsReviewed })`:
  - `{ discardProspect: boolean, noteOnProspect: boolean, attendAlerts: boolean }`;
  - o el error: `not-in-inbox`, `not-handed-off` (cubre el cambio de teléfono, que no se deriva), `not-assignee` (sin responsable o con otro), `reason-required`, `invalid-reason` o `alerts-not-reviewed`.

`application/manage-inbox.ts` traduce cada error a `RequestManagementError`:

| Error | HTTP | Código |
|---|---|---|
| `not-in-inbox` | 404 | `NOT_FOUND` |
| `not-handed-off` | 409 | `CONFLICT` |
| `taken-by-other` | 409 | `CONFLICT` |
| `not-assignee` | 409 | `CONFLICT` |
| `alerts-not-reviewed` | 409 | `CONFLICT` |
| `no-customer-message` | 409 | `CONFLICT` |
| `reason-required` | 400 | `VALIDATION_ERROR` |
| `invalid-reason` | 400 | `VALIDATION_ERROR` |
| `invalid-text` | 400 | `VALIDATION_ERROR` |

Los 409 llevan mensajes distintos, por ejemplo «Tomá el caso antes de cerrarlo.».

Límites de texto:
- La respuesta va de 1 a 4096 caracteres después de `trim`.
- El motivo va de 3 a 2000 caracteres, como el fundamento de Trámites.

### 3. Tomar y cerrar sin pisarse: actualización condicional

`InboxRepository` suma estas operaciones:

- `findActionState(caseId)`;
- `take(caseId, actor, expectedAssignee)`;
- `close(caseId, actor, plan)`;
- `recordOperatorReply(caseId, actor, text, sentAt, takeIfUnassigned)`.

**Tomar.** Hace un `caso.updateMany` con `where: { id_caso, fecha_cierre: null, id_usuario_asignado: expectedAssignee }` y `data: { id_usuario_asignado: actor, fecha_toma: <la que tenía> ?? ahora }`.

- Si `count` da 0, otra persona cambió el caso mientras tanto y se responde 409 «El caso cambió mientras lo tomabas».
- Se registra una línea en el log con el id del caso y los ids de usuario anterior y nuevo, sin datos del cliente.

**Cerrar.** Va en una sola transacción:

1. Vuelve a leer el estado y llama a `decideClose`.
2. Hace un `caso.updateMany` condicional (`fecha_cierre: null` y `id_usuario_asignado: actor`) que pone `fecha_cierre`. Si `count` da 0, responde 409.
3. Si el plan lo pide, actualiza el prospecto:
   - un prospecto pendiente pasa a `descartado` (condicionado a que siga pendiente);
   - se agrega en `observaciones` la línea `Caso cerrado desde la bandeja por <nombre_usuario> el <ISO>. Motivo: <motivo>`, con el mismo formato que usa hoy la decisión de Trámites.
4. Si el plan lo pide, actualiza las alertas: `alerta.updateMany` sobre las alertas del caso con `fecha_atencion: null`, que pasan a tener `fecha_atencion` y `id_usuario_atencion`.
5. Llama a `releaseSilence(conversationId)`.

*Alternativa descartada:* **bloquear la fila con `SELECT … FOR UPDATE`**. Prisma no lo expresa sin SQL a mano, y la actualización condicional ya es el patrón del proyecto: `decideProspect` reclama el prospecto con `updateMany` condicionado al estado.

### 4. Salir del silencio: siempre `false`, en un módulo compartido

`closeCase`, `releaseSilence` y la búsqueda del usuario se mueven a `infrastructure/prisma-case-closing.ts`, que usan los dos repositorios.

`releaseSilence` pasa a poner `asistente_suspendido = false` en la conversación abierta del caso, **sin** preguntar si queda otro caso derivado. Es la decisión de Santiago del 15/10/2026. Por el invariante de «Context» (no hay dos casos derivados abiertos en una conversación), el resultado es el mismo que el de hoy en los flujos del asistente. Con datos cargados a mano, el asistente vuelve a hablar aunque quede otro derivado abierto, y se acepta.

La aprobación de un prospecto y la decisión de un cambio de teléfono usan el mismo módulo. El cambio de teléfono no deriva ni silencia, así que no lo afecta.

*Alternativa descartada:* **dejar la condición actual**. Es más defensiva, pero Santiago pidió que cerrar saque siempre del silencio, y la condición protege contra un estado que el flujo no produce.

### 5. Contestar: primero WhatsApp, después la base

`ManageInbox.reply(caseId, text, actor)`:

1. `findActionState` + `decideReply`. Si hay error, no se envía nada.
2. `whatsapp.sendText(phone, text)`. Si falla, responde 502 con `WHATSAPP_ERROR` («No se pudo enviar el mensaje por WhatsApp.»): nada se guarda y el caso no se toma.
3. `recordOperatorReply` en una transacción:
   - crea el `mensaje` (origen `operador`, `fecha_hora` = el envío);
   - crea la `respuesta` con `id_usuario` = el actor, `id_mensaje_consulta` = el último mensaje de origen `cliente` del caso (por `fecha_hora` e `id_mensaje`) e `id_mensaje_enviado` = el mensaje creado;
   - si `takeIfUnassigned` y el caso sigue sin responsable, lo toma con `updateMany` condicional.

   Si el caso se cerró o cambió de responsable entre el paso 1 y el 3, igual guarda el mensaje, porque ya lo recibió el cliente, y no toma nada.
4. Si el paso 3 falla, responde 200 con `{ sent: true, saved: false, warning: 'El mensaje se envió, pero no quedó registrado.' }` y deja una línea `[bandeja]` en el log, sin el texto. Si funciona, responde 201 con `{ sent: true, saved: true, messageId }`.

El orden es el mismo de `sendPhoneChangeNotification`: la base registra lo que efectivamente salió. El envío no pasa por la `KeyedQueue` del webhook: no toca el estado de la conversación, solo agrega filas.

*Alternativas descartadas:*
- **Guardar primero y enviar después.** Si el envío falla, queda en la conversación un mensaje que el cliente nunca vio, y `mensaje` no tiene columna de estado para marcarlo.
- **Guardar solo el `mensaje`.** Se pierde quién escribió, que es lo que pide la regla 10 de AGENTS.md y lo que el DER resuelve con `respuesta.id_usuario`.

### 6. El rechazo del alta deja el caso abierto

En `decideProspect`, con `decision === 'rechazar'`:

- el prospecto pasa a `descartado` con el fundamento, como hoy;
- el caso **no** se cierra: se toma a nombre del actor con `id_usuario_asignado` y `fecha_toma ?? ahora`;
- no se llama a `releaseSilence`.

La aprobación sigue igual. La respuesta de `POST /api/tramites/prospectos/:id/decision` suma `casoId` en los dos casos, para que la futura pantalla de Trámites redirija a la bandeja.

En la bandeja:
- `InboxEntry` suma `prospectState: 'pendiente' | 'descartado' | null` en lugar de `hasPendingProspect`;
- `inboxLabel` devuelve `'alta-rechazada'` para un caso derivado con el prospecto descartado, después de `'alta-pendiente'` y antes de `'pedido-pendiente'`.

El filtro de la bandeja no cambia, porque el caso sigue derivado y sin cerrar.

### 7. Imágenes: referencia en la base, bytes de paso

**Columna.**
- La migración `backend/prisma/migrations/<AAAAMMDDHHMMSS>_mensaje_id_imagen_whatsapp/migration.sql` agrega `ALTER TABLE mensaje ADD COLUMN id_imagen_whatsapp VARCHAR(255) NULL`, sin índice único.
- Guarda el id serializado de WAHA del mensaje de imagen, solo en los mensajes de imagen. Que tenga valor es lo que marca al mensaje como imagen.
- `docs/caso8_der.md` y `caso8_der.puml` la suman, con una nota de la decisión del 15/10/2026.

**Al recibir.**
- `ConversationChanges.incoming` sigue guardando el texto fijo como contenido y suma `imageRef?: string`.
- `process-incoming-message.ts` lo completa con `message.messageId` cuando `message.media === 'image'`, en los dos caminos que ya procesan imágenes: la foto del DNI y la imagen en silencio.
- `PrismaConversationStore.save` lo escribe en el `mensaje` del cliente.

**Al mostrar.**
- `WhatsAppClient` suma `downloadImage(ref: string, phone: string): Promise<{ mimeType: string; data: Uint8Array } | null>`. Devuelve `null` si WAHA ya no la entrega y lanza ante otras fallas.
- `WahaWhatsAppClient` llama a `GET /api/{session}/chats/{chatId}/messages/{ref}?downloadMedia=true`, toma `media.url` y la baja con la misma `X-Api-Key`, todo en memoria.
- Acepta solo `image/jpeg`, `image/png` y `image/webp`, de hasta 10 MB. Si no cumple, devuelve `null`.
- El `chatId` es `<teléfono>@c.us`, como en `sendText` (comprobado en la tarea 1.1).

**Resultado de la comprobación con WAHA real** (tarea 1.1, 15/10/2026, `devlikeapro/waha:gows-2026.9.2`, tier CORE):

- El `messageId` del webhook es el id serializado de WAHA, por ejemplo `false_<lid>@lid_<hex>` cuando el cliente escribe desde un `@lid`. El chat del listado puede ser `<teléfono>@c.us`.
- `GET /api/seguros-castano/chats/{chatId}/messages/{id}?downloadMedia=true` funciona con GOWS en CORE y devuelve `media.mimetype` y `media.url` (`/api/files/seguros-castano/<hex>.jpeg`). Sirve tanto `<teléfono>@c.us` como el chat que figura en el id. Se usa `<teléfono>@c.us`, porque el teléfono es lo que guarda la conversación.
- `media.url` apunta al host de WAHA (`localhost:3000`). El backend toma solo el camino y lo pide a `WHATSAPP_API_URL` con la misma `X-Api-Key`.
- **Copia temporal del proveedor.** WAHA escribe la imagen en `/tmp/whatsapp-files/seguros-castano/` dentro de su contenedor, fuera de cualquier volumen, y la borra cuando pasa `WHATSAPP_FILES_LIFETIME` (180 segundos por defecto). `docker-compose.yml` la baja a 30 segundos, porque el backend la pide apenas WAHA la escribe. Comprobado: 41 segundos después de bajarla, la carpeta estaba vacía.
- Un id que WAHA no encuentra no responde 404: responde 500 con `not found` en el detalle. `downloadImage` lo trata como «no disponible»; cualquier otro 500 lanza.
- Una imagen recibida 1 h 38 min antes se pudo bajar. No se comprobó cuánto tiempo más WhatsApp la sigue entregando: el panel contempla «ya no está disponible».

**Endpoint.** `GET /api/bandeja/:idCaso/mensajes/:idMensaje/imagen`:

- valida los dos ids;
- comprueba con el filtro de la bandeja que el caso está en ella y que el mensaje es de la misma conversación y tiene referencia. Si no, responde 404 **sin llamar a WAHA**;
- responde con `Content-Type` = el tipo validado, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y `Content-Disposition: inline`;
- si `downloadImage` devuelve `null`, responde 404 con `IMAGE_UNAVAILABLE`; si lanza, responde 502 con `WHATSAPP_ERROR`;
- los logs no llevan ni la referencia ni el teléfono.

**El detalle.** Cada mensaje suma `hasImage: boolean`, nunca la referencia, y `author: { name } | null` para los de origen `operador` (por `respuesta_enviada.usuario`). El caso suma `alerts: Array<{ type, level }>`, con las alertas sin atender.

*Alternativas descartadas:*
- **`WAHA_EVENTS_DOWNLOAD_MEDIA: "true"`.** WAHA guardaría cada imagen en su disco al recibirla: es una copia en el sistema (RF-ATE-05) y además baja imágenes que nadie va a mirar.
- **Guardar la imagen en la base, aunque sea cifrada.** Contradice RF-ATE-05 y la regla 3 de AGENTS.md.
- **El id de WhatsApp en todos los mensajes (`mensaje.id_whatsapp`).** Serviría para descartar repetidos, pero entonces la columna no diría qué mensaje es una imagen y haría falta otra marca. Queda para el change que resuelva los repetidos.

### 8. API

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/bandeja/:idCaso/toma` | sin campos | 200 con el ítem del caso actualizado |
| `POST /api/bandeja/:idCaso/respuestas` | `{ texto }` | 201 `{ sent, saved, messageId }`, 200 `{ sent, saved: false, warning }` o 502 `WHATSAPP_ERROR` |
| `POST /api/bandeja/:idCaso/cierre` | `{ motivo?, alertasRevisadas? }` | 200 `{ caseId, closedAt }` |
| `GET /api/bandeja/:idCaso/mensajes/:idMensaje/imagen` | | la imagen, o 404 `NOT_FOUND` o `IMAGE_UNAVAILABLE` |

Los cuerpos se validan con `parseBody` y rechazan campos desconocidos, como en Trámites. Los ítems de la lista y del detalle suman `assignedToMe` y la etiqueta `'alta-rechazada'`. Los errores usan el formato vigente (`{ error: { code, message } }`).

### 9. Pantalla

Se lee la skill `frontend-panel` antes de tocar la pantalla. Sobre el diseño de dos columnas que ya existe:

- **Encabezado del caso.**
  - **«Tomar caso»**, cuando `assignedToMe` es falso. Si el caso tiene otro responsable, el botón dice «Tomar caso (lo tiene <nombre>)».
  - **«Cerrar caso»**, solo si el caso está derivado y `assignedToMe`. Si no, aparece deshabilitado con el motivo escrito («Tomá el caso para cerrarlo», o «Se decide en Trámites» para el cambio de teléfono).
- **Confirmación del cierre.** Es un diálogo que siempre pide confirmar.
  - Si la etiqueta es `alta-pendiente` o `alta-rechazada`, suma el campo obligatorio «Motivo». Con el alta pendiente, avisa que el alta quedará descartada.
  - Si el caso tiene alertas sin atender, las lista con tipo y nivel y suma la casilla «Revisé las alertas».
  - El botón final queda deshabilitado hasta completar lo obligatorio.
- **Caja para contestar.**
  - Va al pie de la conversación, solo en casos derivados.
  - Si el caso lo tiene otra persona, aparece deshabilitada, con «Tomá el caso para contestar».
  - Si el caso está sin tomar, avisa «Al enviar vas a tomar el caso».
  - Enter envía y Shift+Enter hace un salto de línea.
  - El borrador se conserva durante el sondeo y se borra solo si el envío funcionó.
  - Si el envío salió pero no se guardó, muestra la advertencia de la API.
- **Mensajes de operador.** Muestran «Operador · <nombre>».
- **Imágenes.**
  - Los mensajes con `hasImage` muestran «Ver imagen».
  - Al pulsarlo se pide la imagen con `fetch` y `AbortController`, se arma un `URL.createObjectURL` y se muestra.
  - La URL se revoca al cambiar de caso o salir de la pantalla.
  - El sondeo no vuelve a pedir la imagen.
  - Un 404 `IMAGE_UNAVAILABLE` muestra «La imagen ya no está disponible».
- Después de cada acción, la bandeja y el detalle se refrescan enseguida, sin esperar al sondeo. Si el caso se cerró, el detalle avisa y vuelve a la lista.
- Las nuevas llamadas van en `api/bandeja.ts`.

### 10. Documentación

- **AGENTS.md, «Parcial 1: alcance y flujo»:**
  - el punto de la bandeja de solo lectura pasa a describir tomar, contestar y cerrar con las reglas de este change;
  - se agrega el rechazo del alta que deja el caso abierto.
- **AGENTS.md, «Decisiones abiertas», punto de los audios y las fotos:** se aclara que las imágenes procesadas se pueden ver desde el panel, obtenidas de WhatsApp en el momento y sin copia.
- **`docs/caso8_der.md` y `.puml`:** la columna nueva.

## Risks / Trade-offs

- [GOWS no vuelve a bajar imágenes de mensajes ya recibidos, o la API de WAHA Core no lo permite] → la tarea 1.1 lo comprueba antes de construir. Si no se puede, `downloadImage` devuelve siempre `null`, el panel muestra «La imagen ya no está disponible» y el resto del change sigue. Queda anotado en AGENTS.md.
- [WAHA escribe la imagen en su disco al bajarla con `downloadMedia`] → la tarea 1.1 mide cuánto tiempo la guarda (`WHATSAPP_FILES_LIFETIME`). Si es necesario, se lo baja en `docker-compose.yml` y se documenta como copia temporal del proveedor.
- [WhatsApp deja de entregar las imágenes viejas] → el operador ve «ya no está disponible». La foto del DNI se mira poco después de recibirla.
- [La API del panel no tiene autenticación y ahora sirve fotos de DNI] → corre en local. El endpoint solo entrega imágenes de casos que están en la bandeja, sin caché, y el Parcial 2 suma la autenticación. Queda en «Tratamiento de datos sensibles».
- [Contestar en un caso migrado escribe a un número de la planilla] → riesgo aceptado por Santiago. La pantalla no lo distingue.
- [Todo queda a nombre de `operador`] → mientras no haya login, «otro responsable» solo se ve en los casos migrados. Las reglas se prueban en el dominio con actores distintos.
- [Mensaje enviado pero no guardado] → el panel lo avisa y queda en el log. No se reintenta, para no duplicarlo.
- [El cliente escribe justo mientras se cierra el caso] → el almacén de conversaciones detecta el cambio de la marca, el webhook responde 500 y WAHA reintenta con la conversación ya fuera del silencio.
- [`releaseSilence` sin condición] → con datos cargados a mano, cerrar un caso puede sacar del silencio una conversación que tiene otro derivado abierto (decisión 4).
- [Sin historial de reasignaciones] → solo queda la línea del log hasta que exista `auditoria`.
- [Prospectos rechazados con el caso abierto] → si nadie lo cierra, el caso queda en la bandeja como «Alta rechazada · avisar al cliente», que es lo buscado: no se pierde.

## Migration Plan

1. La migración agrega una columna nula. Los mensajes existentes quedan con `NULL` y se ven como hasta ahora, sin «Ver imagen».
2. Al levantar el backend, la migración se aplica sola. Después corren `npx prisma db pull` y `npx prisma generate`, y se commitean juntos la migración y `schema.prisma`.
3. Los prospectos que ya se rechazaron tienen el caso cerrado y no cambian.
4. Para volver atrás se revierte el PR. La columna queda en la base sin molestar; borrarla exigiría una migración nueva.
