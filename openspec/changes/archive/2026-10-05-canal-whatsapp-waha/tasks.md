# Tasks

## 1. Servicio WAHA en el compose

- [x] 1.1 `docker pull devlikeapro/waha:gows-2026.9.2` para confirmar la etiqueta. Verificar: el pull termina sin error y `docker image inspect devlikeapro/waha:gows-2026.9.2 --format '{{.Config.User}}'` muestra el usuario de la imagen (vacío = root)
- [x] 1.2 Agregar el servicio `waha` a `docker-compose.yml` tal como está en `design.md` (decisión 1): imagen fija, `profiles: [whatsapp]`, `user: "1000:1000"`, sin `restart`, `127.0.0.1:8080:3000`, volumen `${HOME}/waha-sesion:/app/.sessions` y variables con `environment:` (sin `env_file`). Verificar: `docker compose config --quiet` sin errores, y `docker compose config --services` no lista `waha`, mientras que `docker compose --profile whatsapp config --services` sí

## 2. Cliente de WAHA y configuración del backend

- [x] 2.1 Crear `backend/src/infrastructure/waha-whatsapp-client.ts`:
  - implementa `WhatsAppClient` con `fetch`: `POST {WHATSAPP_API_URL}/api/sendText`, header `X-Api-Key` y cuerpo `{ session: 'seguros-castano', chatId: '<phone>@c.us', text }`;
  - si la respuesta no es 2xx, lanza un error con el código;
  - expone la consulta `GET /api/seguros-castano/lids/{lid}`, que devuelve el número o `null`;
  - la sesión es una constante exportada.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores
- [x] 2.2 Hacer el cambio de configuración en un solo paso:
  - en `backend/src/infrastructure/config.ts`, exigir `WHATSAPP_API_URL`, `WHATSAPP_API_KEY` y `WHATSAPP_WEBHOOK_SECRET`, y sacar `WHATSAPP_API_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`;
  - lo mismo en la sección `backend` de `docker-compose.yml`, sin `depends_on` hacia `waha`;
  - cablear el cliente nuevo en `backend/src/index.ts`;
  - borrar `backend/src/infrastructure/meta-whatsapp-client.ts`.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores, `docker compose config --quiet` sin errores y `git grep -n -E "WHATSAPP_API_TOKEN|WHATSAPP_PHONE_NUMBER_ID|MetaWhatsApp|meta-whatsapp" -- backend/src docker-compose.yml` sin resultados
- [x] 2.3 En `.env.example`:
  - `WHATSAPP_API_URL=http://waha:3000`, con el comentario corregido (ya no dice `graph.facebook.com`);
  - `WHATSAPP_API_KEY`, `WHATSAPP_WEBHOOK_SECRET`, `WAHA_DASHBOARD_USERNAME` y `WAHA_DASHBOARD_PASSWORD`, con valores de ejemplo;
  - los comentarios explican las reglas de la decisión 1 de `design.md`: sin `:` ni `;` (en el secreto y en las del dashboard), que WAHA trata `admin`, `waha`, `123` y `00..00` como inseguras (en la contraseña, que es donde las controla), y que quien levanta `waha` cambia los valores de ejemplo.

  Verificar: `git grep -n -E "graph\.facebook|WHATSAPP_API_TOKEN|PHONE_NUMBER_ID" -- .env.example` sin resultados, y los valores de ejemplo del secreto y del dashboard no tienen `:` ni `;`

## 3. Entrada: webhook de WAHA

- [x] 3.1 Crear `backend/src/infrastructure/waha-webhook.ts` con dos funciones:
  - la comparación del secreto en tiempo constante (`timingSafeEqual` sobre los sha256);
  - la traducción del aviso a `IncomingWhatsAppMessage`, a un `@lid` por resolver o a un aviso ignorado con su motivo: otro evento, `fromMe`, sin texto, formato inesperado o un `from` que no es `@c.us` ni `@lid`.

  El teléfono sale de `@c.us`, o de `_data.Info.SenderAlt` (sin sufijo de dispositivo) cuando llega `@lid`, y tiene que tener de 10 a 15 dígitos. Cada campo se valida antes de usarlo, sin `any`.

  Verificar: `docker compose exec backend npx tsc --noEmit` sin errores. Además, un chequeo con `npx tsx` adentro del contenedor, sin agregar archivos al repo, con avisos de ejemplo de cada caso:
  - `@c.us`;
  - `@lid` con `SenderAlt` (con sufijo `:N` y sin él);
  - `@lid` sin `SenderAlt`;
  - foto sin texto y foto con epígrafe;
  - `fromMe`;
  - otro evento;
  - un número de 9 dígitos;
  - `body` que no es texto.

  Cada uno tiene que dar el resultado que dice `design.md` (decisión 2)
- [x] 3.2 Crear `backend/src/infrastructure/keyed-queue.ts`, la cola por clave: encadena las tareas de una misma clave aunque una falle, deja en paralelo las de claves distintas y libera la clave al vaciarse. Verificar: `docker compose exec backend npx tsc --noEmit` sin errores, y un chequeo con `npx tsx` que muestre que dos tareas con la misma clave terminan en orden aunque la primera tarde más y falle, y que dos con claves distintas se superponen
- [x] 3.3 En `backend/src/http/app.ts`, armar `POST /webhooks/whatsapp`:
  - primero el middleware del secreto: `401` sin cuerpo;
  - después `express.json({ limit: '1mb' })`, solo en esa ruta;
  - después la traducción (sincrónica, con `SenderAlt` si llega `@lid`), la cola por `from` crudo y, adentro de la tarea, la resolución del `@lid` por la API si hace falta y `execute`;
  - responde `200` después de procesar, `200` para los ignorados, y los errores van al `errorHandler` (500);
  - una línea de log por aviso, con el `messageId`, los últimos 4 dígitos del teléfono y el resultado o el motivo, sin el texto.

  `createApp` recibe el secreto y la función que resuelve el `@lid`, y `index.ts` los cablea. Verificar: `docker compose exec backend npx tsc --noEmit` sin errores. Con el backend levantado:
  - `curl -s -i -X POST -H 'X-Webhook-Secret: incorrecto' -H 'Content-Type: application/json' -d '{}' http://localhost:3000/webhooks/whatsapp` da `401` con `Content-Length: 0`;
  - sin el header, lo mismo.
- [x] 3.4 En `backend/src/application/process-incoming-message.ts`, envolver lo que sigue a la marca en un `try/catch` que deshaga el estado en memoria (sacar el `messageId` de `processedMessageIds` y devolver `pendingQuestions` de ese teléfono al valor que tenía antes) y relance el error. El resto de la lógica no cambia. Verificar: `docker compose exec backend npx tsc --noEmit` sin errores y `git diff` del archivo con solo ese cambio

## 4. Documentación

- [x] 4.1 Actualizar la documentación:
  - `README.md`: la fila «Mensajería» y una sección corta «WhatsApp (WAHA)». Explica:
    - crear `~/waha-sesion` antes del primer `up`;
    - cambiar los valores de ejemplo del `.env`;
    - levantar `waha` con el perfil;
    - escanear el QR en `http://localhost:8080/dashboard`;
    - ver la sesión en `WORKING`;
    - apagarlo al terminar, porque le contesta a cualquiera.
  - `AGENTS.md`: la línea de «Mensajería». WAHA con GOWS, servicio no oficial que se conecta a WhatsApp Web por websocket, sin navegador; no es la API oficial de Meta, que exige verificar el negocio; corre en el compose como servicio `waha` con el perfil `whatsapp`; la sesión no se sube al repo.
  - skills `backend-datos` (líneas 3 y 65) y `verificacion-seguridad` (línea 49): OpenWA pasa a WAHA, sin cambiar el sentido.

  Verificar: `git grep -n -i -E "openwa|graph\.facebook" -- . ':!openspec/changes'` sin resultados (`git grep` no lee el `.env`, que está en `.gitignore`)

## 5. Prueba de punta a punta (manual, con Santiago)

Las pruebas automáticas que quedan pendientes están en `design.md` («Pruebas automáticas pendientes»). Los avisos sintéticos se mandan desde adentro del contenedor del backend, con `node` y `fetch`, leyendo el secreto y la clave de su entorno: no se muestran ni se leen del `.env`.

- [x] 5.1 **Preparación:**
  - `ls -ld ~/waha-sesion` muestra una carpeta de uid 1000 (si no existe, `mkdir -p ~/waha-sesion`);
  - Santiago confirma que su `.env` tiene las variables nuevas con valores propios;
  - `docker compose up -d db backend`, sin el frontend.

  Verificar: `docker compose logs backend` muestra «Backend listening on port 3000»
- [x] 5.2 **Falla y marca, con `waha` todavía apagado:** mandar dos veces el mismo aviso sintético de texto (mismo `id`, `from` `5490000000000@c.us`). Después, un aviso sintético con `hasMedia: true` y `body` vacío. Verificar:
  - los dos primeros dan `500`: el segundo no da `DUPLICATE_IGNORED`, o sea que la marca se sacó;
  - el de multimedia da `200` y queda como ignorado;
  - las líneas del log no tienen el texto ni el número completo.
- [x] 5.3 **Levantar `waha` y vincular:** `docker compose --profile whatsapp up -d waha` y escanear el QR en `http://localhost:8080/dashboard` (WhatsApp → Dispositivos vinculados). Si aparece `PASSKEY_REQUIRED`, se frena. Verificar:
  - `docker compose logs waha` muestra la sesión `seguros-castano` con el motor GOWS, sin errores de permisos;
  - la sesión queda en `WORKING` (dashboard, o `GET /api/sessions/seguros-castano` desde el contenedor del backend);
  - `/health` responde 200 con la clave. En la 2026.9.2, sin la clave da 401, a diferencia de lo que decía la doc.
- [x] 5.4 **Secreto incorrecto:** repetir los dos `curl -i` de la tarea 3.3. Verificar: `401` sin cuerpo, y ninguna línea de proceso en el log del backend
- [x] 5.5 **Mensaje real:** alguien le escribe un texto sin DNI al número de Santiago y después manda dos mensajes seguidos. Verificar:
  - el Event Monitor (`/dashboard/event-monitor`) muestra qué llega en `from` (`@c.us` o `@lid`); se anota en `design.md` (Open Questions);
  - al remitente le llega el pedido de DNI;
  - el log del backend tiene una sola línea por `messageId`, con los mensajes seguidos en el orden en que se mandaron.
- [x] 5.6 **Repetido y `@lid` desconocido, con la sesión en `WORKING`:**
  - **Repetido:** mandar dos veces un aviso sintético con el mismo `id` desde el número propio de la sesión (`me.id`, leído de la API adentro del script sin mostrarlo).
  - **`@lid` desconocido:** consultar `GET /api/seguros-castano/lids/{lid}` con un lid inventado hasta que dé `pn: null`, y después mandar un aviso sintético desde ese lid, sin `SenderAlt`.

  Verificar:
  - el primer aviso repetido da `200` con `DNI_REQUESTED` (el pedido llega al chat propio), y el segundo, `200` con `DUPLICATE_IGNORED`;
  - el del lid da `200`, queda ignorado por no tener número y no se manda nada.
- [x] 5.7 **Sesión persistente:** `docker compose --profile whatsapp up -d --force-recreate waha`. Verificar: la sesión vuelve a `WORKING` sin pedir el QR, y `ls -ln ~/waha-sesion` muestra archivos de uid 1000
- [x] 5.8 **Apagar `waha`:** `docker compose --profile whatsapp stop waha`. Verificar: `docker compose ps waha` no lo muestra corriendo

## 6. Verificaciones globales

- [x] 6.1 Correr las verificaciones de `AGENTS.md`: `docker compose exec frontend npm run lint`, `docker compose exec frontend npm run build`, `docker compose exec backend npx prisma generate`, `docker compose exec backend npx tsc --noEmit` y `docker compose config --quiet`. Verificar: todas terminan sin errores
