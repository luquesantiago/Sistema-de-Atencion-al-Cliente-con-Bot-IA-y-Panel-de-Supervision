# Tasks

Los comandos corren desde la raíz del repo, en la WSL, con el stack levantado (`docker compose up -d --build`). Para las pruebas con WhatsApp, también con el perfil `whatsapp`.

- No se lee ni se muestra el `.env`.
- Los SELECT se corren en el contenedor `db` con `docker compose exec db sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "…"'`, con un solo `-e`. No muestran DNI, teléfonos completos, textos de mensajes ni referencias de imágenes.
- Los DNI, los números y las fotos de las pruebas manuales los elige Santiago y no se escriben en el repo ni en el chat. La foto de prueba no es de un DNI real.
- Las pruebas de Vitest usan datos ficticios (DNI 99…), sin base, sin Groq y sin WAHA.

## 1. Imágenes de WhatsApp: comprobación y referencia guardada

- [x] 1.1 Comprobación con WAHA real (decisión 7 de `design.md`, primer riesgo). Mandar una imagen a una conversación en silencio y anotar en `design.md`:
  - el formato del `messageId` que llega al webhook;
  - si `GET /api/seguros-castano/chats/{chatId}/messages/{id}?downloadMedia=true` devuelve `media.url` con el motor GOWS de la imagen de `docker-compose.yml`, y qué `chatId` sirve (el del id o `<teléfono>@c.us`);
  - si WAHA deja un archivo en su disco y cuánto dura;
  - si la imagen se sigue pudiendo bajar al día siguiente.

  Si no se puede bajar, anotarlo y seguir con el camino de «no disponible». Verificar: la sección de la decisión 7 tiene el resultado y, si hace falta, `docker-compose.yml` ajusta la vida de los archivos (`docker compose config` pasa).
- [x] 1.2 Crear la migración `backend/prisma/migrations/<AAAAMMDDHHMMSS>_mensaje_id_imagen_whatsapp/migration.sql` con `SET NAMES utf8mb4;` y `ALTER TABLE mensaje ADD COLUMN id_imagen_whatsapp VARCHAR(255) NULL;`. Seguir la skill `backend-datos`: `docker compose exec backend npx prisma migrate deploy`, `npx prisma db pull` y `npx prisma generate`. Actualizar `docs/caso8_der.md` y `docs/caso8_der.puml` con la columna y la nota de la decisión del 15/10/2026. Verificar: `docker compose exec backend npx tsc --noEmit` pasa y `SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'mensaje' AND column_name = 'id_imagen_whatsapp'` da 1.
- [x] 1.3 En `domain/conversation.ts`, sumar `imageRef?: string` a `incoming` en los cambios del turno. En `application/process-incoming-message.ts`, completarlo con `message.messageId` en la foto del DNI y en la imagen que llega en silencio. En `infrastructure/prisma-conversation-store.ts`, escribirlo en `mensaje.id_imagen_whatsapp`. En `process-incoming-message.test.ts`:
  - **permitido:** la foto del DNI y la imagen en silencio llevan la referencia, con el mismo texto fijo de hoy;
  - **excluido:** un mensaje de texto, y una imagen fuera de esos dos caminos (que sigue `IGNORED_MEDIA`), no llevan referencia.

  Verificar: `docker compose exec backend npm test` pasa y, a mano, después de una foto en silencio, `SELECT id_mensaje, id_imagen_whatsapp IS NOT NULL FROM mensaje ORDER BY id_mensaje DESC LIMIT 2` muestra la marca en el mensaje de la foto.
- [x] 1.4 En `domain/whatsapp-client.ts`, sumar `downloadImage(ref, phone)`. En `infrastructure/waha-whatsapp-client.ts`, implementarlo según la decisión 7 y el resultado de 1.1: en memoria, con los tipos aceptados y el tope de 10 MB, devolviendo `null` si la imagen no está disponible. Actualizar los dobles de `WhatsAppClient` en las pruebas. En una prueba con `fetch` simulado:
  - **permitido:** una respuesta con `media.url` y una imagen JPEG devuelve los bytes y el tipo;
  - **rechazado:** un 404 de WAHA, un mensaje sin `media`, un tipo que no es imagen y una imagen de más de 10 MB devuelven `null`; un 500 lanza.

  Verificar: `docker compose exec backend npm test` pasa.

## 2. Reglas de tomar, contestar y cerrar en el dominio

- [x] 2.1 Crear `domain/case-actions.ts` con `CaseActionState`, `PanelActor`, `decideTake`, `decideReply` y `decideClose` (decisión 2 de `design.md`). En `case-actions.test.ts`:
  - **permitido:**
    - tomar un caso sin responsable y uno de otro responsable;
    - contestar como responsable (`take: false`) y en un caso sin responsable (`take: true`);
    - cerrar como responsable un reclamo sin motivo y una baja sin motivo;
    - cerrar un alta pendiente con motivo (`discardProspect` y `noteOnProspect`) y un alta rechazada con motivo (solo `noteOnProspect`);
    - cerrar con alertas sin atender y `alertsReviewed` (`attendAlerts`);
  - **rechazado:**
    - tomar, contestar o cerrar un caso que no está en la bandeja;
    - contestar un caso de otro responsable, uno sin derivar (cambio de teléfono pendiente) o uno sin mensajes del cliente;
    - contestar con texto vacío, solo espacios o de más de 4096 caracteres;
    - cerrar un caso sin responsable o de otro;
    - cerrar el cambio de teléfono pendiente;
    - cerrar un alta pendiente o rechazada sin motivo o con motivo de menos de 3 caracteres;
    - cerrar con alertas sin atender sin `alertsReviewed`.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 2.2 En `domain/inbox.ts`, cambiar `hasPendingProspect` por `prospectState` y sumar la etiqueta `'alta-rechazada'` con la precedencia de la decisión 6; sumar `assignedToMe`, `hasImage`, `author` y las alertas sin atender a los tipos del detalle. En `inbox.test.ts`:
  - **permitido:** un caso derivado con el prospecto descartado da `'alta-rechazada'`; uno con el prospecto pendiente sigue dando `'alta-pendiente'`;
  - **excluido:** un caso sin prospecto no da ninguna de las dos.

  Verificar: `docker compose exec backend npm test` y `docker compose exec backend npx tsc --noEmit` pasan.

## 3. Persistencia de las acciones

- [x] 3.1 Crear `infrastructure/prisma-case-closing.ts` y mover ahí `closeCase`, `releaseSilence` (ahora sin condición, decisión 4) y la búsqueda del usuario de prueba. Que `prisma-request-management-repository.ts` las use. Verificar: `docker compose exec backend npx tsc --noEmit` y `docker compose exec backend npm test` pasan, y a mano, aprobar un prospecto deja la conversación con `asistente_suspendido = 0`.
- [x] 3.2 En `prisma-request-management-repository.ts`, que el rechazo de un prospecto tome el caso a nombre del actor sin cerrarlo ni llamar a `releaseSilence` (decisión 6), y que las dos decisiones devuelvan `casoId`. En `http/app.ts`, sumar `casoId` a la respuesta. En `app.test.ts`: **permitido:** la respuesta de aprobar y la de rechazar traen `casoId`. Verificar: `docker compose exec backend npm test` pasa y, a mano, después de rechazar con `curl`, el SELECT de `caso` muestra `fecha_cierre` nula y `id_usuario_asignado` con valor, y la conversación sigue con `asistente_suspendido = 1`.
- [x] 3.3 En `infrastructure/prisma-inbox-repository.ts`:
  - sumar `findActionState`, `take`, `close` y `recordOperatorReply` con las actualizaciones condicionales y la transacción de las decisiones 3 y 5;
  - en el detalle, leer `prospectState`, `hasImage` (sin exponer la referencia), el autor de los mensajes de operador y las alertas sin atender;
  - sumar la búsqueda del mensaje con imagen dentro de la conversación de un caso de la bandeja.

  En `prisma-inbox-repository.test.ts`, sin base:
  - **permitido:** el mapeo de una fila con prospecto descartado da `prospectState: 'descartado'`; un mensaje con referencia da `hasImage: true` y el objeto mapeado no contiene la referencia; un mensaje de operador trae el nombre del empleado; la línea de `observaciones` del cierre tiene el formato de la decisión 3;
  - **excluido:** un mensaje sin referencia da `hasImage: false`.

  Verificar: `docker compose exec backend npm test` y `docker compose exec backend npx tsc --noEmit` pasan.

## 4. Casos de uso y API

- [x] 4.1 En `application/manage-inbox.ts`, sumar `take`, `reply`, `close` y `findImage`, que reciben el `PanelActor`, con el mapeo de errores de la decisión 2 y el orden de envío de la decisión 5. Que `listCases` y `findCase` calculen `assignedToMe`. Probar en `manage-inbox.test.ts` con un repositorio en memoria y un `WhatsAppClient` falso:
  - **permitido:**
    - contestar en un caso sin tomar envía, guarda y toma;
    - cerrar un alta pendiente con motivo descarta el prospecto y saca la conversación del silencio;
    - pedir la imagen de un mensaje de la conversación devuelve los bytes;
  - **rechazado o derivado al error:**
    - si WhatsApp falla, no se guarda nada y el caso no se toma (`WHATSAPP_ERROR`);
    - si el guardado falla después del envío, devuelve `saved: false` con la advertencia;
    - contestar un caso de otro responsable no llama a WhatsApp;
    - cerrar con alertas sin revisar da `CONFLICT` y no cambia nada;
    - pedir la imagen de un mensaje de otra conversación da `NOT_FOUND` sin llamar a WhatsApp;
    - una imagen que WhatsApp ya no entrega da `IMAGE_UNAVAILABLE`.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 4.2 En `http/app.ts`, sumar las cuatro rutas de la decisión 8 con `parseBody` y rechazo de campos desconocidos. La de la imagen responde con `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` y el `Content-Type` validado. En `index.ts`, armar `resolvePanelActor` (decisión 1). En `app.test.ts`:
  - **permitido:** 200 al tomar; 201 al contestar; 200 al cerrar; 200 con `image/jpeg` y `Cache-Control: no-store` en la imagen;
  - **rechazado:** 400 con `texto` vacío, con un campo desconocido y con un id `abc`; 409 al cerrar un caso sin tomar; 404 con un caso fuera de la bandeja; 404 `IMAGE_UNAVAILABLE`; 502 `WHATSAPP_ERROR`.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 4.3 Prueba manual del backend con la base migrada:
  - con `curl`, tomar un caso migrado de Graciela y cerrarlo;
  - con el SELECT de `caso`, comprobar que `id_usuario_asignado` pasó a `operador`, que `fecha_toma` no cambió, que `fecha_cierre` tiene valor y que la conversación quedó con `asistente_suspendido = 0`.

  No contestar en casos migrados: el número es de la planilla. Verificar: los valores coinciden.

  Resultado (15/10/2026): la base de desarrollo no tenía casos migrados abiertos, así que no se probó tomar un caso de otro responsable contra la base; eso lo cubren las pruebas de dominio y de `manage-inbox`. Con casos reales (61, 62, 65, 67 y 69) se comprobó que tomar y cerrar completan `id_usuario_asignado`, `fecha_toma` y `fecha_cierre`, y que la conversación queda con `asistente_suspendido = 0`. Los rechazos de la API real (cerrar un cambio de teléfono, cerrar sin tomar, contestar un caso sin derivar y un campo desconocido) no cambiaron nada.

## 5. Pantalla

- [x] 5.1 En `frontend/src/api/bandeja.ts`, sumar los tipos (`assignedToMe`, `'alta-rechazada'`, `hasImage`, `author`, alertas) y las funciones `tomarCaso`, `contestarCaso`, `cerrarCaso` y `obtenerImagenMensaje` (esta última devuelve un `Blob` o «no disponible»). Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build` pasan.
- [x] 5.2 Leer la skill `frontend-panel` y, en `pages/BandejaAtencion.tsx`, sumar lo de la decisión 9: «Tomar caso», «Cerrar caso» con el diálogo (motivo y alertas cuando corresponden), la caja para contestar con el borrador conservado durante el sondeo, el nombre del empleado en los mensajes de operador, la etiqueta «Alta rechazada · avisar al cliente» en ámbar y los botones deshabilitados con el motivo escrito. Verificar: lint y build pasan.
- [x] 5.3 Sumar «Ver imagen» en los mensajes con `hasImage`: pedido con `AbortController`, `URL.createObjectURL`, revocado al cambiar de caso o salir de la pantalla, sin volver a pedirla en el sondeo y con «La imagen ya no está disponible» ante un 404. Verificar: lint y build pasan y, a mano, en la pestaña Network la imagen se pide una sola vez, con `Cache-Control: no-store`.

## 6. Documentación

- [x] 6.1 En AGENTS.md, aplicar la decisión 10 de `design.md`:
  - en «Parcial 1: alcance y flujo», reemplazar «Bandeja de Atención de solo lectura… Tomar, contestar y cerrar desde la bandeja quedan para un change siguiente» por las reglas de tomar, contestar y cerrar, y sumar que el rechazo del alta deja el caso abierto;
  - en «Decisiones abiertas», en el punto de los audios y las fotos, sumar que las imágenes procesadas se ven desde el panel sin copia, con el resultado de 1.1.

  Verificar: el texto coincide con las specs de `derivacion-seguimiento`, `panel-supervision` y `atencion-automatizada` del change.

## 7. Prueba de punta a punta

- [x] 7.1 Con WhatsApp vinculado, desde un número de prueba:
  1. Hacer un reclamo. En el panel, contestar sin tomar: el mensaje llega al teléfono y el caso queda tomado. Cuando el cliente responde, el asistente no contesta y el mensaje aparece en el detalle.
  2. Cerrar el caso. Se va de la bandeja y, cuando el cliente vuelve a escribir, el asistente lo atiende.
  3. Desde otro número, registrar un cliente nuevo con una foto de prueba. En la bandeja, «Ver imagen» muestra la foto.
  4. Rechazar el alta con `curl` a `/api/tramites/prospectos/:id/decision`. El caso aparece como «Alta rechazada · avisar al cliente». Contestarle, cerrarlo con motivo y comprobar con un SELECT que el motivo quedó en `observaciones`.

  Verificar: cada paso se ve como se describe.

  Resultado (15/10/2026, marcada por decisión de Santiago):
  - **Comprobado con WhatsApp:**
    - un reclamo derivado con nivel alto, contestado desde el panel (respuesta a nombre del empleado, enlazada al mensaje del cliente y al enviado) y cerrado;
    - contestar un caso sin tomar lo toma (caso 69);
    - la foto del DNI guarda la referencia y se ve con «Ver imagen» (WAHA la entregó);
    - cerrar un alta pendiente con motivo la descarta y anota el motivo;
    - después de cerrar, el asistente vuelve a atender;
    - después de reiniciar el backend, el próximo mensaje abre una conversación nueva.
  - **No comprobado con WhatsApp** (lo cubren solo las pruebas automáticas):
    - el rechazo del alta desde `/api/tramites/prospectos/:id/decision`, que deja el caso abierto como «Alta rechazada · avisar al cliente»;
    - que el asistente siga callado si el cliente escribe después de la respuesta del operador y antes del cierre.
- [x] 7.2 Correr las comprobaciones globales de AGENTS.md: `docker compose exec frontend npm run lint`, `docker compose exec frontend npm run build`, `docker compose exec backend npx prisma generate`, `docker compose exec backend npx tsc --noEmit` y `docker compose exec backend npm test`. Verificar: todas pasan.
