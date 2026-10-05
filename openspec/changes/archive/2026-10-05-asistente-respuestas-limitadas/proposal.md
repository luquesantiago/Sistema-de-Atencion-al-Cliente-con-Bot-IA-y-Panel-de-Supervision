# Proposal

## Why

Para el Parcial 1 (08/10/2026) hay que mostrar una conversación por WhatsApp de punta a punta. El canal ya funciona (change `canal-whatsapp-waha`), pero lo que hace el asistente con cada mensaje en `main` (`5612333`) no sirve:

- Si no reconoce el DNI, no contesta nada. Los clientes salen de `CUSTOMERS_JSON`, que está vacío por defecto.
- Con un cliente encontrado, Groq clasifica el mensaje en tres categorías y **redacta la respuesta libremente** (`generateResponse`), con un control de expresiones regulares. Eso contradice `AGENTS.md`: «El LLM solo clasifica la intención».
- Si Groq falla, el webhook responde 500 y WAHA reintenta. Si se agotan los reintentos, el cliente se queda sin respuesta.
- Después de derivar, el asistente sigue contestando: no cumple RF-DER-03.

La base todavía no tiene los datos de la planilla (la migración va en otro change). Este change define un flujo mínimo y provisional, sin base, en el que el asistente hace con cada mensaje **una sola** de cinco cosas: ignorar, pedir el DNI, responder, derivar o mandar a aprobar.

## What Changes

Decisiones de Santiago del 05/10/2026 (el contexto y por qué no se usa Open-Jev están en `design.md`):

- **Decide Groq de una lista cerrada.** Con el modelo de `AI_MODEL` (`openai/gpt-oss-20b`), el asistente elige la intención del mensaje entre los valores del catálogo `tipo_consulta` (saldo, vencimiento, estado de póliza, cobertura, siniestro, cotización, baja, modificación, reclamo, saludo y cambio de teléfono), más «no es de seguros» y «no sé». Usa salida estructurada en modo estricto (`strict: true`, con `enum`): el modelo nunca redacta para decidir. **La acción la decide el código** con una tabla fija:
  - vencimiento y estado de póliza: responder;
  - saludo (incluye el agradecimiento): cortesía;
  - baja, modificación (incluye el alta de conductor) y cambio de teléfono: mandar a aprobar;
  - siniestro (incluye accidentes), cotización, saldo, cobertura, reclamo (incluye reembolsos) y «no sé»: derivar. Saldo y cobertura se derivan porque los clientes de prueba no tienen esos datos (RF-ATE-02);
  - no es de seguros: ignorar, sin contestar ni derivar. Es una decisión del equipo del 05/10/2026, con un riesgo aceptado: si el modelo se equivoca, un cliente real se queda sin respuesta.

  El decisor queda detrás de una interfaz del dominio, como hoy `AiClient`, para poder cambiar de motor sin tocar el flujo.
- **El DNI va siempre primero.** Sin un DNI validado no se llama a Groq: se pide el DNI y se guarda el primer mensaje para responderlo después de validar.
- **DNI no reconocido y cliente nuevo** (pregunta 27, que antes tenía Alejo):
  - con el primer DNI no reconocido, el asistente pregunta si es cliente nuevo;
  - el sí o el no lo resuelve el código, sin Groq: antes del DNI no sale nada al proveedor. Lo que no es ni sí ni no se toma como un no, igual que en la regla 9 para el teléfono (decisión de Santiago del 05/10/2026);
  - si no lo es, vuelve a pedir el DNI, y al 4.º DNI no reconocido deriva. La consulta del primer mensaje se conserva hasta que el DNI se reconozca;
  - si es nuevo, le pide el nombre y apellido y deriva (decisión de Santiago del 05/10/2026). Sin base, el prospecto no se guarda (no se cumple RF-ATE-05 ni la regla 3 de `AGENTS.md`): el operador ve el nombre en el chat.
- **Responder:** el texto sale de una plantilla completada con los datos del cliente identificado. Groq la vuelve a redactar para que suene más humana, sin cambiar los datos.
  - Recibe la plantilla y la pregunta del cliente, nunca el DNI.
  - El código controla que la redacción tenga exactamente los mismos números de póliza, fechas, estados, ramos y números que la plantilla, que no tenga links y que no tenga ninguno de los términos de una lista de prohibidos (compromisos como «registrado» o «aprobado», temas que se derivan como «cobertura» o «siniestro», y afirmar que es una persona).
  - Si no pasa el control o Groq falla, deriva.
  - Riesgo aceptado: una frase sin números ni términos de la lista puede pasar el control.

  **Esto cambia lo decidido el 28/09** («el LLM solo clasifica la intención»): el change actualiza `AGENTS.md` y las skills.
- **Mandar a aprobar:** el asistente nunca ejecuta una baja, una modificación ni un alta de conductor (regla 8). Le contesta «Recibimos su pedido. Un miembro de nuestro equipo lo va a revisar y se va a comunicar con usted.». Nunca dice que el pedido está hecho ni registrado, ni promete que se va a aprobar: sin base, la solicitud no se guarda (no se cumple RF-APR-02).
  - El cambio de teléfono recibe el mismo aviso, aunque no es una acción crítica (regla 9): los clientes de prueba no tienen teléfonos para saber si el número ya está vinculado.
  - Después del aviso el asistente deja de responder, como en una derivación. Tratar «mandar a aprobar» como una derivación es una decisión de Santiago del 05/10/2026: ninguna fuente lo dice para el cambio de teléfono.
- **Silencio después de derivar** (RF-DER-03, pregunta 27): lo que el cliente escribe después de una derivación o de mandar a aprobar se ignora y deja una línea en el log, sin el texto. Sin base ni panel nadie cierra el caso: el silencio dura hasta que se reinicia el backend.
- **Fallas de Groq:** si Groq falla al decidir (red, 429 o 5xx), se deriva. El 500 con reintento de WAHA queda solo para las fallas al enviar por WhatsApp.
- **Clientes de prueba:** pasan de `CUSTOMERS_JSON` a `backend/fixtures/clientes-ficticios.json` (respuesta de Santiago del 05/10/2026, que reemplaza lo anotado antes: «con el adaptador `CUSTOMERS_JSON`»). Van marcados como ficticios, con DNI poco probables. No se lee ni se escribe nada en la base, ni siquiera los catálogos.
- **Pruebas:** se instala Vitest en `backend/`, con pruebas del caso permitido y del derivado para cada regla crítica.
- **Textos:** las plantillas las propone este change (`design.md`), con el tono de `AGENTS.md` y tratando al cliente de usted. Para derivar se usa el mensaje sugerido de `AGENTS.md`, tal cual. El equipo los revisa en el PR.
- **BREAKING (configuración):** desaparece `CUSTOMERS_JSON` de `config`, del compose y de `.env.example`. `.env.example` pasa a tener los valores de Groq sin la clave (`AI_API_URL=https://api.groq.com/openai/v1`, `AI_MODEL=openai/gpt-oss-20b`).
- **BREAKING (dominio):** la interfaz `AiClient` deja `classify` y `generateResponse` y pasa a elegir la intención y redactar una plantilla.
- **Documentación:** este change actualiza las líneas de `AGENTS.md` con las que choca lo decidido:
  - la 70 («Cualquier otra cosa (…): deriva a la bandeja de un operador»): ahora lo que no es de seguros se ignora y las ediciones se mandan a aprobar;
  - la 74 («El LLM solo clasifica la intención»): ahora elige de una lista cerrada y redacta sobre plantillas controladas;
  - los pasos 2 y la línea del cambio de teléfono del flujo del Parcial 1: no aplican mientras los clientes salgan de los fixtures, que no tienen teléfonos;
  - la sección de comandos: el comando de Vitest;
  - una nota en «Parcial 1: alcance y flujo» con los desvíos provisionales sin base (abajo, en «Impact»).

  También actualiza las skills `verificacion-seguridad` (líneas 14 y 16) y `backend-datos` (línea 66). La regla 4 y «Ante una duda entre responder o derivar, derivar» no cambian: «no sé» se deriva, y «no es de seguros» no es una duda sino una intención elegida. Mientras este change no se implemente, rige el `AGENTS.md` vigente.

**Fuera de alcance:**
- la base: conversaciones, casos, solicitudes, prospectos y alertas;
- los endpoints y las pantallas del panel;
- la migración de la planilla;
- el fuera de horario: el mensaje de derivación es el mismo (RF-DER-04);
- la verificación completa de RF-VER-02 (alertas, borrador retenido): acá solo se controla la redacción del LLM;
- la detección de manipulación (RF-VER-01);
- el ofrecimiento del cambio de teléfono (RF-CAR-05) y el aviso al cliente cuando se aprueba un pedido (E18).

## Capabilities

### New Capabilities
- `derivacion-seguimiento`: módulo «Derivación y seguimiento» de `docs/requisitos.md`. Este change agrega solo el silencio del asistente después de derivar (RF-DER-03).
- `aprobacion-acciones-criticas`: módulo «Aprobación de acciones críticas». Este change agrega solo que el asistente nunca ejecuta una baja, una modificación ni un alta de conductor, y que avisa que el pedido queda en revisión (RF-APR-01).

### Modified Capabilities
- `atencion-automatizada`: se agregan requirements de qué hace el asistente con cada mensaje: el pedido del DNI y el cliente nuevo (RF-ATE-03), la acción según la intención (RF-ATE-01), la respuesta de vencimiento y estado (RF-ATE-01), la redacción controlada y la derivación ante un dato ausente (RF-ATE-02), y la derivación de accidentes, siniestros y cotizaciones (RF-ATE-04). Los requirements del canal no cambian.

No se citan, porque este change no los cumple:
- RF-APR-02: la solicitud no se registra;
- RF-ATE-05: el prospecto no se guarda;
- RF-DER-01: no se avisa al equipo;
- RF-VER-02: no hay alertas ni borrador retenido.

## Impact

- **Código (backend):**
  - `application/process-incoming-message.ts` se reescribe;
  - en `domain/`: cambian `ai-client.ts`, `customer.ts` y `message.ts`, y se suman la tabla de intenciones, las plantillas y el control de la redacción;
  - en `infrastructure/`: cambian `openai-compatible-client.ts` (salida estructurada estricta) y `config.ts`, y el repositorio en memoria pasa a leer el archivo de fixtures;
  - `index.ts`.

  `http/app.ts` y el canal no cambian.
- **Archivos nuevos:** `backend/fixtures/clientes-ficticios.json` y las pruebas de Vitest.
- **Dependencias:** `vitest` como dependencia de desarrollo del backend.
- **Infraestructura:** `docker-compose.yml` y `.env.example` sin `CUSTOMERS_JSON`. Para probar con WhatsApp real hace falta la clave de Groq en el `.env` de cada uno.
- **Desvíos provisionales, hasta que entre la base:**
  - el DNI validado vale hasta que se reinicia el backend, no por conversación: se aparta de «al iniciar cada conversación» (RF-ATE-03);
  - el silencio también dura hasta el reinicio, no hasta el cierre del caso;
  - lo que el cliente escribe en silencio no le queda guardado al operador;
  - el cliente nuevo no se registra como prospecto (regla 3, RF-ATE-05): solo se le pide el nombre y se deriva;
  - el cambio de teléfono se manda a aprobar y silencia, sin el ofrecimiento ni el pedido de escribir desde el número nuevo (regla 9, RF-CAR-05).
- **Riesgos:**
  - lo que el modelo toma por «no es de seguros» queda sin respuesta;
  - una falla momentánea de Groq deriva y silencia ese número hasta el reinicio;
  - el plan gratuito de Groq admite 30 pedidos por minuto y 1.000 por día, y una respuesta de póliza usa dos;
  - el texto del cliente y los datos de sus pólizas salen a Groq.
- **Preguntas abiertas que el change no cierra** (de «Decisiones abiertas» de `AGENTS.md`):
  - la forma final de presentación del asistente;
  - si después de derivar el asistente deja de responder del todo o sigue con consultas simples: rige RF-DER-03 y el change lo implementa así;
  - si el asistente pide CUIT a los clientes empresa: los fixtures son solo personas;
  - los minutos de inactividad que cierran una sesión: sin base, no hay sesiones;
  - el tratamiento de datos sensibles: la pregunta del cliente y los datos de sus pólizas pasan por Groq;
  - cómo se cuenta «lo resolvió el asistente» en las métricas (RF-SUP-05).
- **Pendientes fuera del repo** (del contexto de Santiago):
  - el docx, punto 4.6: tiene que decir que el LLM elige entre opciones cerradas y redacta sobre plantillas controladas;
  - avisarle a Alejo que la pregunta 27 (DNI no reconocido y silencio) la hace este change.
