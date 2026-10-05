# Proposal

## Why

El asistente todavía no recibe ni manda mensajes reales de WhatsApp.

- `AGENTS.md` y el `README.md` de `main` dicen que el canal es OpenWA, pero el equipo lo descartó el 01/10/2026: la versión 5.4.0 no mostraba el QR, y el build de su imagen con Chromium colgó la WSL.
- El código de `main` tiene un cliente de la API oficial de Meta (`meta-whatsapp-client.ts`) que tampoco se puede usar. El 04/10/2026 Meta dejó la cuenta de prueba restringida hasta verificar el negocio (error 131031), y Seguros Castaño no es un negocio real que se pueda verificar.

Para que el Parcial 1 (08/10/2026) muestre una conversación de punta a punta, el canal pasa a WAHA (WhatsApp HTTP API) con el motor GOWS, que no usa navegador, vinculado al WhatsApp personal de Santiago.

## What Changes

- **Servicio `waha` en `docker-compose.yml`:**
  - Usa la imagen oficial `devlikeapro/waha:gows-2026.9.2` (02/10/2026), sin Dockerfile propio, con el motor elegido por `WHATSAPP_DEFAULT_ENGINE: GOWS`.
  - Lleva el perfil `whatsapp`, así que solo arranca cuando se lo pide. Va sin `restart`, y el backend no tiene `depends_on` hacia él.
  - Adentro del compose escucha en el puerto 3000. En el host se publica solo en `127.0.0.1:8080`.
  - Las variables van por `environment:`, sin `env_file`:
    - la clave de la API (`WAHA_API_KEY`, la misma que usa el backend);
    - el usuario y la contraseña del dashboard;
    - el webhook al backend, solo con el evento `message` y el header `X-Webhook-Secret`. Los reintentos quedan los de fábrica;
    - los filtros que ignoran estados, grupos, canales y difusiones;
    - la multimedia sin descargar.
  - **Sesión:** se llama `seguros-castano`, arranca sola con el contenedor y se guarda en `${HOME}/waha-sesion`, fuera del repo. Corre con el usuario 1000, para que esos archivos no queden de root.
- **Entrada:** `POST /webhooks/whatsapp`, en el mismo path.
  - Antes de leer el cuerpo, valida `X-Webhook-Secret` en tiempo constante. Si no coincide, responde 401 sin cuerpo.
  - Traduce el aviso de WAHA al mensaje que ya procesa el asistente (`IncomingWhatsAppMessage`).
  - Procesa y recién después responde 2xx. Si el proceso falla, responde 500 y WAHA reintenta. Antes, el backend deshace lo que dejó en memoria: la marca de mensaje procesado y la consulta pendiente de ese número.
  - Los mensajes de un mismo número se procesan de a uno.
  - Los mensajes sin texto se ignoran con un 200.
  - Si el remitente llega como `@lid`, se resuelve su número.
- **Salida:** un cliente nuevo de WAHA implementa la interfaz `WhatsAppClient` con `POST /api/sendText`. El backend no suma ninguna librería de WAHA.
- **BREAKING (configuración):**
  - El backend exige `WHATSAPP_API_URL` (`http://waha:3000`), `WHATSAPP_API_KEY` y `WHATSAPP_WEBHOOK_SECRET`.
  - `WHATSAPP_API_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` se van de `config.ts`, del compose y de `.env.example`.
  - `.env.example` suma `WAHA_DASHBOARD_USERNAME` y `WAHA_DASHBOARD_PASSWORD`.
  - Cada integrante tiene que actualizar su `.env`. Quien levante `waha` tiene que cambiar los valores de ejemplo.
- **BREAKING (API):** el webhook deja de aceptar el cuerpo propio `{ messageId, phone, text, dni?, receivedAt? }`. Ahora acepta solo el aviso de WAHA.
- **Se borra** `backend/src/infrastructure/meta-whatsapp-client.ts`.
- **Documentación:**
  - `README.md`: la fila «Mensajería» y una sección para levantar WAHA, escanear el QR y ver que conectó;
  - `AGENTS.md`: la línea de «Mensajería»;
  - skills `backend-datos` y `verificacion-seguridad`: OpenWA pasa a WAHA, sin cambiar el sentido.
- **Fuera de alcance:**
  - la lógica del asistente (pedido de DNI, clasificación, derivación y plantillas);
  - lo que hace el asistente después de derivar (decisión abierta de `AGENTS.md`; rige RF-DER-03);
  - la persistencia de conversaciones en la base;
  - las pruebas automáticas (ver `design.md`, «Pruebas automáticas pendientes»).

## Capabilities

### New Capabilities
- `atencion-automatizada`: módulo «Atención automatizada» de `docs/requisitos.md` (RF-ATE-01 a RF-ATE-05). Este change agrega solo los requirements del canal: recibir por WhatsApp los mensajes de texto del cliente y enviarle la respuesta del asistente (parte de RF-ATE-01), y aceptar solo los avisos autenticados. Qué responde el asistente no cambia.

### Modified Capabilities

Ninguna: en `openspec/specs/` solo está `cartera`, y este change no la toca.

## Impact

- **Código:**
  - modificados: `backend/src/http/app.ts`, `backend/src/index.ts` y `backend/src/infrastructure/config.ts`;
  - `backend/src/application/process-incoming-message.ts`: solo se deshace el estado en memoria cuando el proceso falla;
  - nuevos, en `backend/src/infrastructure/`: `waha-whatsapp-client.ts`, `waha-webhook.ts` y `keyed-queue.ts`;
  - borrado: `meta-whatsapp-client.ts`.
- **Infraestructura:** `docker-compose.yml` (servicio `waha` con perfil `whatsapp`) y `.env.example`. Los que no activan el perfil levantan el stack igual que antes, pero necesitan las variables nuevas del backend en el `.env`.
- **Riesgo aceptado:** WAHA es un cliente no oficial de WhatsApp. WhatsApp no permite bots ni clientes no oficiales, así que el número de Santiago puede terminar bloqueado. Además, cualquiera que le escriba a ese número recibe la respuesta del asistente.
- **Pruebas:** no hay pruebas automáticas (Vitest no se instala en este change). Se verifica con `npx tsc --noEmit`, `docker compose config --quiet` y pruebas manuales: avisos sintéticos con curl o `fetch`, el QR y un mensaje real desde un teléfono.
- **Preguntas abiertas que el change no cierra** (de «Decisiones abiertas» de `AGENTS.md`):
  - la forma final de presentación del asistente;
  - si después de derivar el asistente deja de responder del todo (rige RF-DER-03);
  - el tratamiento de datos sensibles: las conversaciones pasan por un servicio no oficial y la sesión queda en la máquina de Santiago.
- **Pregunta abierta nueva:** qué hacer con los audios, las fotos y los archivos sin texto. Este change los ignora sin responder. La decisión le toca al change del flujo de conversación, que es el que crea casos y derivaciones.
