# Design

## Context

Estado actual y restricciones (el porqué está en `proposal.md`):

- El backend ya separa el canal de la lógica:
  - `ProcessIncomingMessage` (`backend/src/application/process-incoming-message.ts`) recibe un `IncomingWhatsAppMessage` (`backend/src/domain/message.ts`) y responde por la interfaz `WhatsAppClient` (`backend/src/domain/whatsapp-client.ts`), que tiene un solo método: `sendText(phone, text)`.
  - El único cliente es el de Meta, `backend/src/infrastructure/meta-whatsapp-client.ts`.
  - `POST /webhooks/whatsapp` (`backend/src/http/app.ts`) espera hoy un cuerpo propio: `{ messageId, phone, text, dni?, receivedAt? }`.
- **Estado en memoria** de `ProcessIncomingMessage`, del que depende el reintento:
  - `processedMessageIds`: marca cada `messageId` al entrar y no lo saca nunca.
  - `pendingQuestions`: guarda, por teléfono, la consulta que el cliente hizo antes de dar el DNI. Se borra antes de clasificar, así que si la clasificación falla, el reintento ya no la encuentra.
- **Teléfono:**
  - WhatsApp identifica los números en formato internacional sin `+`, y en los celulares argentinos incluye el 9 (`5491155551001@c.us`). Coincide con el formato con el que `docs/migracion.md` cargó los teléfonos migrados (54 + 9 + área + número).
  - `docs/caso8_der.md` exige de 10 a 15 dígitos y deja pendiente la regla del 9 para los números que se escriben sin él. Este change usa el número tal como lo entrega WhatsApp y no cierra esa regla.
- **Compose:** el puerto 3000 del host ya lo usa el backend, que se publica en todas las interfaces (`3000:3000`). Los compañeros levantan el stack sin activar perfiles y no tienen que necesitar WAHA.

### Por qué no la API oficial de Meta

El 04/10/2026 se probó la Cloud API con el número de prueba de Meta. La cuenta de prueba quedó como «Cuenta restringida» y el envío falló con el error 131031 («Business Account locked»): Meta exige verificar el negocio, incluso para usar el número de prueba, y la verificación pide documentación legal de un negocio real. Seguros Castaño es ficticio. Además, la Cloud API necesitaba una URL pública HTTPS (un túnel como ngrok) para el webhook, y desde el 01/10/2026 cobra los mensajes de servicio. Para la agencia real, el canal oficial sigue siendo el camino. El MVP usa un puente no oficial detrás de la misma interfaz `WhatsAppClient`, así que cambiar de canal no toca la lógica del asistente.

### Por qué WAHA y no OpenWA

`AGENTS.md` y el `README.md` todavía nombran OpenWA, pero el equipo lo descartó el 01/10/2026 por dos motivos: la versión 5.4.0 no mostraba el QR, y su imagen con Chromium (1,51 GB, más 700 MB a 1 GB por sesión) colgó la WSL, que tiene unos 3,7 GB de RAM. WAHA con el motor GOWS hace el mismo trabajo de puente sin navegador. Además trae imagen oficial: no hace falta un Dockerfile propio.

### Lo verificado de WAHA

Verificado el 04/10/2026 en waha.devlike.pro, en Docker Hub y en el código fuente de `github.com/devlikeapro/waha` (rama `core`).

- **Licencia y motores:**
  - Desde la 2026.6.1 todo es gratis (WAHA Plus pasó a la imagen libre), con licencia Apache-2.0.
  - La etiqueta `gows-2026.9.2` existe en Docker Hub, publicada el 02/10/2026. Solo trae arreglos.
  - GOWS y NOWEB no usan navegador y se conectan a WhatsApp por websocket. Según el FAQ, gastan 0,1 CPU y 200 MB por sesión.
  - El motor por defecto es WEBJS, por eso hace falta `WHATSAPP_DEFAULT_ENGINE: GOWS`.
  - Las respuestas de la API y los webhooks cambian según el motor (`/docs/how-to/engines/`).
- **Usuario:**
  - El `Dockerfile` de WAHA no declara `USER`, así que la imagen corre como root.
  - La doc de configuración no menciona variables de uid ni de usuario.
- **Clave de la API:**
  - El `entrypoint.sh` toma `WHATSAPP_API_KEY` o `WAHA_API_KEY`, con prioridad para `WHATSAPP_API_KEY`, la hashea con sha512 y la exporta como `WAHA_API_KEY`.
  - Con la clave configurada, toda la API pide el header `X-Api-Key` (`/docs/how-to/config/`).
- **Valores inseguros** (`src/core/auth/config.ts`):
  - Si la contraseña del dashboard es uno de los valores comunes de su lista (vacío, `123`, `321`, `waha`, `admin`, `00…00`, `11…11`), WAHA la descarta y usa una generada al azar. Entonces el dashboard no acepta la configurada.
  - El usuario del dashboard no se controla contra esa lista: solo vale `admin` cuando está vacío.
  - La clave de la API pasa antes por el `entrypoint.sh`, que la hashea. De la lista, solo se descarta `00…00`, porque su sha512 es el único hash que figura. Si se descarta, el backend no puede mandar nada (401).
- **Sesión:**
  - `WHATSAPP_START_SESSION` arranca, al iniciar la API, las sesiones que lista.
  - En el código, `startPredefinedSessions()` llama a `start(name)`, que lee la config de la sesión (puede no existir) e inicializa su autenticación. O sea, la crea si no existe. Confirmado en la prueba del 05/10/2026: con `~/waha-sesion` vacía, la sesión se creó y arrancó sola.
  - Por defecto (`WAHA_WORKER_RESTART_SESSIONS=True`), WAHA reanuda al reiniciar las sesiones que ya corrían.
  - Los datos se guardan en `/app/.sessions` (`/docs/how-to/sessions/`).
- **QR:**
  - Sale en el dashboard (`/dashboard`) o con `GET /api/{session}/auth/qr`. El primero dura 60 s y los siguientes 20 s, hasta 6 en total. Si vencen todos, la sesión pasa a `FAILED`.
  - `GET /api/sessions/{session}` da el estado: `STOPPED`, `STARTING`, `SCAN_QR_CODE`, `WORKING`, `FAILED`, `PASSKEY_REQUIRED`.
  - Si WhatsApp le pide passkey a la cuenta, la sesión queda en `PASSKEY_REQUIRED` y hace falta la extensión de WAHA para el navegador (blog «How to Handle Passkey», 09/07/2026).
- **Dashboard:** está en `/dashboard`, con autenticación básica (`WAHA_DASHBOARD_USERNAME` y `WAHA_DASHBOARD_PASSWORD`, que por defecto son `waha`/`waha`). El Event Monitor (`/dashboard/event-monitor`) muestra los eventos en vivo. La doc dice que `GET /health` no pide clave, pero en la prueba con la 2026.9.2 sin la clave dio 401 (con la clave, 200).
  - El dashboard tiene un botón para reiniciar o apagar el **servidor** (`POST /api/server/stop`). Apaga el proceso esperando que Docker lo vuelva a levantar. Como el servicio va sin `restart`, en la prueba dejó el contenedor apagado. El README lo avisa.
- **Webhook** (`/docs/how-to/events/` y `src/modules/waha-webhook/`):
  - Se configura para todas las sesiones con `WHATSAPP_HOOK_URL` y `WHATSAPP_HOOK_EVENTS`.
  - El evento `message` trae solo los entrantes (`message.any` también trae los propios).
  - El aviso trae `{ id, timestamp, event, session, metadata, me, payload, environment, engine }`.
  - En `payload` vienen `id`, `timestamp`, `from`, `fromMe`, `to`, `body`, `hasMedia`, `media` y `_data` (datos crudos del motor).
  - `WHATSAPP_HOOK_CUSTOM_HEADERS` se parte por `;`, y cada header por `:`, con exactamente dos partes. Si el valor tiene un `:`, WAHA tira un error de configuración. Si tiene un `;`, lo corta. Por eso el secreto no puede llevar ninguno de los dos.
- **Cómo envía WAHA los avisos, según el código:**
  - Cada evento se manda con `setImmediate` y un POST de axios que no se espera, así que **los avisos no van de a uno ni en orden**.
  - El POST no tiene timeout: WAHA espera el 2xx lo que haga falta.
  - **Los reintentos de fábrica son 15, cada 2 s, con demora constante**, cuando no se configura ninguna variable `WHATSAPP_HOOK_RETRIES_*` (`DEFAULT_RETRY_ATTEMPTS = 15` y `DEFAULT_RETRY_DELAY_SECONDS = 2`; sin política, usa demora constante). La doc da como ejemplo `linear` y 4 intentos, pero eso no es lo que hace el código.
  - Reintenta ante cualquier error (`retryCondition: () => true`), incluidos los 4xx.
- **Filtros:** `WAHA_SESSION_CONFIG_IGNORE_STATUS`, `_GROUPS`, `_CHANNELS` y `_BROADCAST` descartan esos eventos en origen. Por defecto están en `false`.
- **Multimedia:** `WAHA_EVENTS_DOWNLOAD_MEDIA` está en `true` por defecto.
- **Salida:** `POST /api/sendText` con `{ session, chatId, text }`, donde `chatId` es el número internacional sin `+` seguido de `@c.us` (`/docs/how-to/send-messages/`).
- **`@lid`** (`/docs/how-to/contacts/` y `src/core/engines/gows/session.gows.core.ts`):
  - WhatsApp usa el «Linked ID» para ocultar el número.
  - `GET /api/{session}/lids/{lid}` devuelve `{ lid, pn }`, con `pn: null` si no lo encuentra (por ejemplo, si no está en los contactos). GOWS soporta estos endpoints.
  - Con GOWS, `from` sale de `toCusFormat(...)`, así que llega como `...@c.us` o como `...@lid`.
  - Cuando llega `@lid`, el número viene en `_data.Info.SenderAlt`. Es el campo que usa la integración de Chatwoot del propio WAHA (`src/apps/chatwoot/waha/engines.ts`).
  - Ese campo viene crudo, sin pasar por `toCusFormat`: puede traer `@s.whatsapp.net` y un sufijo de dispositivo (`5491155551001:3@s.whatsapp.net`).

## Goals / Non-Goals

**Goals:**

- Que un mensaje real de WhatsApp llegue a `ProcessIncomingMessage` y que la respuesta salga por el mismo número, sin cambiar la lógica del asistente.
- Que levantar el stack sin el perfil `whatsapp` siga funcionando igual.
- Que nada de la sesión ni de los secretos quede en el repo.

**Non-Goals:**

- Multimedia, grupos, estados, canales y difusiones.
- Más de una sesión o más de un número.
- Guardar mensajes en la base: lo hace el change del flujo de conversación.
- Instalar Vitest.

## Decisions

### 1. Servicio `waha` en el compose, con la imagen oficial y el perfil `whatsapp`

```yaml
waha:
  image: devlikeapro/waha:gows-2026.9.2
  profiles: [whatsapp]
  user: "1000:1000"
  ports:
    - "127.0.0.1:8080:3000"
  volumes:
    - ${HOME}/waha-sesion:/app/.sessions
  environment:
    WHATSAPP_DEFAULT_ENGINE: GOWS
    WHATSAPP_START_SESSION: seguros-castano
    WAHA_API_KEY: ${WHATSAPP_API_KEY}
    WAHA_DASHBOARD_USERNAME: ${WAHA_DASHBOARD_USERNAME}
    WAHA_DASHBOARD_PASSWORD: ${WAHA_DASHBOARD_PASSWORD}
    WHATSAPP_HOOK_URL: http://backend:3000/webhooks/whatsapp
    WHATSAPP_HOOK_EVENTS: message
    WHATSAPP_HOOK_CUSTOM_HEADERS: X-Webhook-Secret:${WHATSAPP_WEBHOOK_SECRET}
    WAHA_SESSION_CONFIG_IGNORE_STATUS: "true"
    WAHA_SESSION_CONFIG_IGNORE_GROUPS: "true"
    WAHA_SESSION_CONFIG_IGNORE_CHANNELS: "true"
    WAHA_SESSION_CONFIG_IGNORE_BROADCAST: "true"
    WAHA_EVENTS_DOWNLOAD_MEDIA: "false"
```

- **Imagen:**
  - La versión va fija, porque WAHA saca una por mes y los payloads cambian según el motor.
  - No hay Dockerfile propio: es un puente que se configura solo con variables.
- **Perfil y arranque:**
  - Con el perfil `whatsapp`, `docker compose up` no lo levanta.
  - El backend no tiene `depends_on: waha`: con el perfil apagado, compose fallaría al no encontrar el servicio.
  - Va sin `restart`, como el backend y el frontend. Así no queda contestando mensajes después de una prueba.
- **Puertos:** adentro de la red, el backend lo llama en `http://waha:3000`. En el host va al 8080 y solo en `127.0.0.1`, porque el 3000 es del backend y el dashboard no tiene que quedar expuesto a la red.
- **Variables:**
  - Van con `environment:` y sin `env_file`, para que no le lleguen las variables del backend: WAHA lee varias que empiezan con `WHATSAPP_`.
  - La clave se le pasa como `WAHA_API_KEY` y no como `WHATSAPP_API_KEY`. WAHA acepta las dos, con prioridad para el nombre viejo; con una sola no hay ambigüedad.
- **Reintentos:** quedan los de fábrica (15 intentos cada 2 s, constante), sin variables. Alcanzan para un reinicio corto del backend.
- **Usuario:**
  - `user: "1000:1000"` hace que los archivos de `~/waha-sesion` queden del usuario de WSL y no de root, que se borrarían solo con sudo.
  - La carpeta tiene que existir antes de levantar el servicio. Si la crea Docker, queda de root y el usuario 1000 no puede escribir.
  - **Alternativa:** dejarlo como root. Se descarta salvo que la prueba muestre que WAHA necesita escribir en alguna carpeta que el usuario 1000 no puede. En ese caso se vuelve a root y se documenta.
- **Sesión:** `${HOME}/waha-sesion` queda fuera del repo. Con esa carpeta se puede usar el WhatsApp vinculado, así que no se sube ni se comparte.
- **Valores de las variables** (comentados en `.env.example`):
  - **Secreto:** no puede llevar `:` ni `;`, por cómo WAHA parte `WHATSAPP_HOOK_CUSTOM_HEADERS`.
  - **Usuario del dashboard:** no puede llevar `:`, porque la autenticación básica separa el usuario de la contraseña con el primer `:`.
  - **Contraseña del dashboard:** la misma regla, sin `:` ni `;`, por pedido de Santiago, para que una sola regla valga para todos los valores de WAHA.
  - **Contraseña del dashboard:** no puede ser `admin`, `waha`, `123` ni `00…00`, entre otros, porque WAHA la reemplaza por una al azar. La clave de la API no puede ser `00…00`, por lo mismo.

### 2. Entrada: el mismo endpoint, traducido en una capa de infraestructura

`POST /webhooks/whatsapp` sigue en el mismo path. Cada aviso pasa por estos pasos:

1. **Secreto antes del cuerpo:**
   - Un middleware de la ruta compara `X-Webhook-Secret` con `WHATSAPP_WEBHOOK_SECRET` con `timingSafeEqual`, sobre los sha256 de los dos valores, para que tengan el mismo largo y la comparación no revele el largo del secreto.
   - Si no coincide, responde `401` sin cuerpo.
   - `express.json` va después del middleware y solo en esa ruta. Así un aviso sin secreto ni se parsea.
   - El límite sube de `32kb` a `1mb`. El emisor ya está autenticado, y `_data` trae los datos crudos del motor (por ejemplo, las miniaturas de las fotos con epígrafe o de los links), que con 32 kB podían no entrar.
   - Un JSON inválido o demasiado grande cae en el `errorHandler` existente (500). WAHA reintenta y lo deja en sus logs.
2. **Traducción:** una función pura del módulo del webhook de WAHA convierte el aviso en:
   - un `IncomingWhatsAppMessage` (`messageId` = `payload.id`, `phone`, `text` = `payload.body`, `receivedAt` = `payload.timestamp` en ISO-8601 UTC); o
   - un `@lid` para resolver; o
   - un aviso ignorado, con su motivo: otro evento, `fromMe`, cuerpo sin texto, formato inesperado o remitente que no es un chat individual.
3. **Teléfono:**
   - Si `from` termina en `@c.us`, `phone` son sus dígitos.
   - Si termina en `@lid`, se usa `_data.Info.SenderAlt` cuando trae `...@s.whatsapp.net` o `...@c.us`, sin el sufijo de dispositivo (`:N`), igual que hace `toCusFormat`. Si no viene, se consulta `GET /api/seguros-castano/lids/{lid}`.
   - **Validación:** el número tiene que tener de 10 a 15 dígitos, el formato del DER. Si no hay un número válido (por ejemplo, porque `pn` es `null`), el aviso se ignora.
   - **Alternativa:** usar solo la API de lids. Se descarta como primera opción porque suma una llamada por mensaje y puede no encontrar números que no están en los contactos.
   - `_data` es interno del motor: si GOWS lo cambia, queda la API como respaldo.
4. **Multimedia:**
   - Si `body` está vacío, se ignora, sin contestarle al cliente. Esto incluye `hasMedia: true`.
   - Si una foto trae epígrafe (`body` con texto), se procesa el texto.
   - **Alternativa:** responder con una plantilla que pida escribir en texto, o con el mensaje de derivación. Se descarta: suma texto al flujo del asistente o promete una derivación que este change no crea. Queda como pregunta abierta.
5. **Ignorados:** responden `200`. Con cualquier otro código WAHA reintentaría 15 veces un aviso que nunca se va a procesar.
6. **Cola por remitente:**
   - Como WAHA no espera un aviso para mandar el siguiente, los avisos de un mismo remitente se encadenan en una cola en memoria (un `Map` de clave a la última promesa).
   - La clave es el `from` crudo, y el `@lid` se resuelve adentro de la tarea encolada. Así una consulta lenta a `/lids` no puede invertir dos mensajes del mismo remitente.
   - El siguiente arranca cuando termina el anterior, salió bien o mal.
   - Los remitentes distintos siguen en paralelo, y la entrada del `Map` se libera al vaciarse la cola.
   - Sin la cola, una consulta y el DNI mandados seguidos pueden pisarse en `pendingQuestions`.
   - **Alternativa:** no ordenar y aceptar la carrera. Se descarta.
   - **Límites:** el orden es el de llegada al backend. Si un aviso falla, su reintento llega 2 s después, detrás de los mensajes posteriores.
7. **Procesar antes de responder:**
   - El handler espera a `ProcessIncomingMessage.execute` y recién después responde `200` con el resultado.
   - Si algo falla, el `errorHandler` existente responde `500` y WAHA reintenta.
   - WAHA no tiene timeout, así que una clasificación lenta de Groq no dispara reintentos.
8. **Logs:**
   - Una línea por aviso: el `messageId`, el teléfono enmascarado (solo los últimos 4 dígitos) y el resultado (el estado de `execute` o el motivo por el que se ignoró).
   - Nunca el texto del mensaje ni el número completo. Las conversaciones y los teléfonos son datos sensibles (`AGENTS.md`).

### 3. Deshacer el estado en memoria cuando el proceso falla

- En `ProcessIncomingMessage.execute`, la marca sigue al entrar, pero lo que viene después va en un `try/catch`.
- **Al fallar**, el `catch` deshace los dos cambios que pudo dejar en memoria el mensaje que falló, y relanza el error:
  - saca el `messageId` de `processedMessageIds`;
  - vuelve `pendingQuestions` de ese teléfono al valor que tenía antes del mensaje.
- **Por qué hace falta lo segundo:** la consulta pendiente se borra antes de clasificar. Si Groq falla, el reintento del DNI ya no la encuentra y clasifica el DNI como si fuera la consulta. Eso contradice el paso 3 del Parcial 1 de `AGENTS.md`: «después del DNI, el asistente responde la consulta del primer mensaje».
- El resto del método no cambia.

**Riesgo:** si la falla ocurre después de mandar una respuesta, el reintento la manda de nuevo. Se acepta. Es preferible a perder el mensaje, y el estado sigue en memoria hasta que se persistan las conversaciones.

### 4. Salida: un cliente de WAHA con `fetch`

- Un cliente nuevo en `backend/src/infrastructure/` implementa `WhatsAppClient`: `POST {WHATSAPP_API_URL}/api/sendText` con `X-Api-Key` y `{ session: 'seguros-castano', chatId: '<phone>@c.us', text }`. Si WAHA no responde 2xx, lanza un error con el código.
- El mismo cliente expone la consulta de `@lid`, que no forma parte de la interfaz del dominio.
- No se suma ninguna librería de WAHA.
- Se borra `meta-whatsapp-client.ts`.
- **Nombre de la sesión:**
  - Es la constante `seguros-castano` en el cliente, y el compose la repite en `WHATSAPP_START_SESSION`.
  - El backend no la puede sacar del aviso, porque hay mensajes que no responden a uno: el operador contestando desde el panel y el aviso de la decisión del cambio de teléfono.
  - **Alternativa:** una variable `WHATSAPP_SESSION`. Se descarta, porque es una variable más para cada integrante y hay una sola sesión.

### 5. Configuración

- `config.ts` exige `WHATSAPP_API_URL`, `WHATSAPP_API_KEY` y `WHATSAPP_WEBHOOK_SECRET`. Se van `WHATSAPP_API_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
- El compose (sección `backend`) y `.env.example` cambian igual.
- `.env.example` suma `WAHA_DASHBOARD_USERNAME` y `WAHA_DASHBOARD_PASSWORD`, con valores de ejemplo y las reglas de la decisión 1 en los comentarios.

## Pruebas automáticas pendientes

Este change no instala Vitest (decisión de Santiago, 04/10/2026). `AGENTS.md` pide una prueba de dominio o de integración para cada regla crítica nueva. El PR que instale Vitest tiene que sumar, como mínimo:

- **Secreto:** el mismo valor pasa; uno distinto, otro de distinto largo y la falta del header dan 401 sin cuerpo y no llaman a `execute`.
- **Traducción del aviso:**
  - `@c.us` da el teléfono.
  - `@lid` con `SenderAlt` (con sufijo de dispositivo y sin él) da el teléfono.
  - `@lid` sin `SenderAlt` pide la resolución.
  - Se ignoran `fromMe`, otro evento, el cuerpo vacío, los números fuera de 10 a 15 dígitos y los payloads con campos de otro tipo.
- **Cola:** dos tareas con la misma clave corren una después de la otra, aunque la primera falle. Con claves distintas corren en paralelo, y la clave se libera al terminar.
- **Estado en memoria:** si `sendText` o `classify` fallan, el reintento del mismo `messageId` se procesa (no da `DUPLICATE_IGNORED`) y encuentra la consulta pendiente. Un `messageId` ya procesado con éxito da `DUPLICATE_IGNORED`.

Mientras tanto, las tareas los verifican a mano con avisos sintéticos y con chequeos con `tsx`, sin agregar archivos al repo.

## Risks / Trade-offs

- **[Bloqueo del número]** WhatsApp no permite clientes no oficiales. → Riesgo aceptado por Santiago. El servicio se levanta solo para probar o para la demo.
- **[Le contesta a cualquiera]** No hay lista de destinatarios: el asistente le contesta a cualquiera que escriba al número personal. → WAHA va con perfil y sin `restart`, y se apaga después de cada prueba.
- **[Valores de ejemplo públicos]** El repo es público, y el backend publica el puerto 3000 en todas las interfaces. Si alguien levanta `waha` con el secreto de `.env.example`, cualquiera en su red puede mandar avisos falsos y hacer que el número le escriba a terceros. → `.env.example` y el README avisan que quien levanta `waha` cambia la clave, el secreto y la contraseña del dashboard.
- **[Datos sensibles]** Las conversaciones pasan por un servicio no oficial, y la sesión vinculada queda en `~/waha-sesion`. → Queda fuera del repo, publicada solo en `127.0.0.1` y detrás del dashboard con usuario y contraseña. Los logs del backend no guardan el texto ni el número completo. El tratamiento de datos sensibles sigue como decisión abierta en `AGENTS.md`.
- **[Multimedia sin texto]** Un audio o una foto, por ejemplo la de un choque, no reciben respuesta ni derivación. Roza «ante una duda entre responder o derivar, derivar» y la regla 4 de `AGENTS.md`. → Decisión de Santiago para este change: queda registrado en el log y es pregunta abierta para el change del flujo.
- **[Payload según el motor]** El ejemplo de la doc es de WEBJS. → La versión va fija, el parser valida cada campo antes de usarlo y la prueba confirma con el Event Monitor qué trae GOWS.
- **[`_data.Info.SenderAlt` es interno]** → Queda como respaldo `GET /lids/{lid}`, y si ninguno da el número, el aviso se ignora con un log.
- **[Passkey]** Si WhatsApp pide passkey, la sesión queda en `PASSKEY_REQUIRED`. → La prueba frena y se usa la extensión de WAHA.
- **[Estado en memoria]** `processedMessageIds` y `pendingQuestions` se pierden al reiniciar el backend. Un reintento de WAHA que llegue después del reinicio se procesaría de nuevo. → Se acepta hasta que las conversaciones vivan en la base.
- **[Sin pruebas automáticas]** Ver «Pruebas automáticas pendientes».

## Migration Plan

1. Cada integrante actualiza su `.env`:
   - `WHATSAPP_API_URL=http://waha:3000`;
   - `WHATSAPP_API_KEY`, `WHATSAPP_WEBHOOK_SECRET`, `WAHA_DASHBOARD_USERNAME` y `WAHA_DASHBOARD_PASSWORD` nuevas;
   - se borran `WHATSAPP_API_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.

   Quien no prueba WhatsApp puede dejar los valores de ejemplo. Quien levanta `waha` los cambia por valores propios.
2. `docker compose up -d --build` sigue funcionando sin WAHA.
3. Para probar el canal:
   - `mkdir -p ~/waha-sesion`, antes del primer `up`;
   - `docker compose --profile whatsapp up -d waha`;
   - escanear el QR en http://localhost:8080/dashboard.
4. **Rollback:** revertir el PR. El cliente de Meta vuelve con el revert, pero no sirve sin un negocio verificado.

## Open Questions

- ~~Qué trae exactamente `from` con GOWS para los contactos que escriben en la prueba (`@c.us` o `@lid`)~~. **Resuelta en la prueba del 05/10/2026** (GOWS 2026.9.2): `from` llegó como `@lid`. El número salió de `_data.Info.SenderAlt`, sin consultar `/lids`, y la respuesta a `<número>@c.us` le llegó al remitente.
- Qué hacer con los audios, las fotos y los archivos sin texto (ver Riesgos). Lo decide el change del flujo de conversación.
