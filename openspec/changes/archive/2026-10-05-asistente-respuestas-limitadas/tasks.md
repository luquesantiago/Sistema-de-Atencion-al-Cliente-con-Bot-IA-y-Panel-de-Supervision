# Tasks

Los comandos corren desde la raíz del repo, en la WSL, con el stack levantado (`docker compose up -d --build`). No se lee ni se muestra el `.env`: si hace falta saber si una variable está cargada, se le pregunta a Santiago.

## 1. Vitest

- [x] 1.1 Instalar Vitest en el backend:
  - `docker compose exec backend npm install -D vitest`;
  - sumar el script `"test": "vitest run --passWithNoTests"` en `backend/package.json`.

  Verificar: `docker compose exec backend npm test` termina con código 0 y `docker compose exec backend npx tsc --noEmit` sin errores.
- [x] 1.2 En `AGENTS.md`, sección «Comandos de verificación»: sumar `docker compose exec backend npm test` y cambiar «Todavía no está instalado: el primer PR que sume pruebas lo instala…» por que Vitest está instalado en el backend (el frontend todavía no). Verificar: `git grep -n "Todavía no está instalado" -- AGENTS.md` sin resultados

## 2. Dominio: intenciones, plantillas y control de la redacción

Desde la tarea 2.2, `npx tsc --noEmit` falla en `process-incoming-message.ts` y en el repositorio en memoria, que todavía usan los tipos viejos, hasta las tareas 4.1 y 5.1, y en `ai-client.ts` hasta la 3.1. En los grupos 2 a 4 se verifica con `npm test` (Vitest no hace chequeo de tipos) y con `tsc` sobre los archivos nuevos: `docker compose exec backend npx tsc --noEmit 2>&1 | grep "^src/" | grep -v -E "process-incoming-message|in-memory-customer-repository|index.ts|ai-client|openai-compatible-client"` sin resultados (en la 3.1 y la 4.1 se sacan del filtro los archivos que ya quedaron al día).

- [x] 2.1 Crear `backend/src/domain/intent.ts` con la lista cerrada (los 11 valores de `tipo_consulta` de las migraciones, más `no es de seguros` y `no sé`) y `actionForIntent`, según la tabla de `design.md` (decisión 1). Agregar `intent.test.ts`:
  - **permitido:** vencimiento, estado de póliza y saludo responden;
  - **derivado:** siniestro, cotización, saldo, cobertura, reclamo y «no sé» derivan;
  - **mandar a aprobar:** baja, modificación y cambio de teléfono;
  - **ignorar:** «no es de seguros»;
  - toda intención de la lista tiene una acción.

  Verificar: `docker compose exec backend npm test` pasa
- [x] 2.2 Crear `backend/src/domain/templates.ts` con los textos de la decisión 4 y el cálculo de «vencida» con la fecha de `America/Argentina/Buenos_Aires` y un reloj inyectado. Mover el mensaje de derivación desde `message.ts` y borrar `unrelatedMessage`. Adaptar `CustomerPolicy` en `customer.ts` (decisión 7). Agregar `templates.test.ts`:
  - dos pólizas dan dos líneas, con número, ramo y dato;
  - una póliza activa con la fecha de ayer en Argentina sale «vencida». Probarlo a las 23:30 de Argentina, que en UTC ya es el día siguiente;
  - «dada de baja» y «suspendida por mora» salen tal cual;
  - el mensaje de derivación es el de `AGENTS.md`, letra por letra;
  - el aviso de mandar a aprobar es exactamente «Recibimos su pedido. Un miembro de nuestro equipo lo va a revisar y se va a comunicar con usted.».

  Verificar: `docker compose exec backend npm test` pasa
- [x] 2.3 Crear `backend/src/domain/rewrite-check.ts` con `checkRewrite` y la lista de prohibidos (decisión 5), y `backend/src/domain/dni.ts` con `findDni`, `maskDni` (decisiones 2 y 3) y `parseYesNo` (decisión 2). Agregar las pruebas:
  - **`checkRewrite`, permitido:** una redacción con otras palabras y los mismos datos pasa; «dada de baja» pasa si está en la plantilla.
  - **`checkRewrite`, rechazado:** fecha cambiada, póliza agregada, póliza quitada, un número de más, un estado cambiado, un ramo cambiado, «venció» cambiado por «vence», `https://…`, `www.…`, `algo.com.ar`, un `@`, un draft vacío, y frases sin números con un término prohibido («su pedido quedó registrado», «tiene cobertura total», «soy una persona»).
  - **`findDni`:** reconoce `30111222`, `30.111.222`, `30 111 222` y `30-111-222`; devuelve `null` para «¿vence el 15/11/2026?», `POL-90001`, un número de 6 o de 9 dígitos y un texto sin dígitos.
  - **`maskDni`:** cambia por `[DNI]` los mismos cuatro formatos y no toca `POL-90001` ni una fecha.
  - **`parseYesNo`:** «sí», «Si», «soy nueva» y «¡sí, soy nuevo!» dan sí; «no», «no soy nuevo», «¿qué?» y «hola» dan no.

  Verificar: `docker compose exec backend npm test` pasa

## 3. Decisor de Groq

- [x] 3.1 Cambiar `backend/src/domain/ai-client.ts` por la interfaz de la decisión 3 (`classifyIntent` y `rewrite`) y reescribir `backend/src/infrastructure/openai-compatible-client.ts`:
  - `response_format` `json_schema` con `strict: true`, `enum`, `required` y `additionalProperties: false`;
  - `temperature: 0`;
  - corte a los 10 s;
  - validación del valor devuelto contra la lista.

  Sacar `Classification` y `messageCategories` de `message.ts`. Agregar `openai-compatible-client.test.ts` con un `fetch` falso:
  - el cuerpo del pedido lleva el esquema estricto con todas las intenciones;
  - el prompt de redacción pide no decir que es una persona;
  - un valor fuera de la lista, un HTTP 429 y un cuerpo sin `choices` lanzan.

  Verificar: `docker compose exec backend npm test` pasa y el `tsc` filtrado del grupo 2 sin resultados
- [x] 3.2 Confirmar de nuevo en console.groq.com/docs/structured-outputs que `openai/gpt-oss-20b` sigue en la lista de modo estricto, y anotar la fecha en `design.md` («Lo verificado de Groq»). Verificar: la fecha anotada es la del día de la tarea

## 4. Clientes de prueba

- [x] 4.1 Crear `backend/fixtures/clientes-ficticios.json` con el aviso de ficticio y los casos de la decisión 7. Reemplazar `customerRepositoryFromEnvironment` por `customerRepositoryFromFixtures`, que valida cada campo sin `as`, y sumar `findById` al repositorio. Sacar `CUSTOMERS_JSON` de `docker-compose.yml` y de `.env.example`, y poner en `.env.example` los valores de Groq sin la clave (`AI_API_URL=https://api.groq.com/openai/v1`, `AI_MODEL=openai/gpt-oss-20b`). Agregar `in-memory-customer-repository.test.ts`:
  - el archivo del repo carga y encuentra un DNI 99…;
  - un JSON con una póliza sin número o con un estado fuera del catálogo lanza.

  Verificar: `docker compose exec backend npm test` pasa, el `tsc` filtrado del grupo 2 sin resultados, `docker compose config --quiet` sin errores y `git grep -n CUSTOMERS_JSON -- . ':!openspec'` sin resultados

## 5. Flujo del asistente

- [x] 5.1 Reescribir `backend/src/application/process-incoming-message.ts` con el estado por número y el flujo de la decisión 2:
  - el decisor, las plantillas y el control de las tareas 2 y 3;
  - las fallas de la decisión 6;
  - la foto del estado que se restaura si `execute` lanza.

  Cablear `index.ts`, que pasa a recibir un reloj. `ProcessResult` suma `IGNORED_NOT_INSURANCE`, `SILENCED`, `HANDOFF_SENT`, `APPROVAL_NOTICE_SENT`, `ANSWER_SENT` y `DNI_REQUESTED`, para el log del webhook. Verificar: `docker compose exec backend npx tsc --noEmit` sin errores
- [x] 5.2 Agregar `process-incoming-message.test.ts` con un `AiClient`, un `WhatsAppClient` y un reloj falsos. Un caso permitido y uno derivado o retenido por regla:
  - **DNI primero:** un mensaje sin DNI pide el DNI y no llama a `AiClient`. El DNI reconocido responde la consulta guardada. El DNI reconocido sin consulta manda la bienvenida. «¿vence el 15/11/2026?» antes del DNI pide el DNI y no suma intento.
  - **DNI no reconocido:**
    - el 1.º pregunta si es cliente nuevo;
    - con «no» o con una respuesta poco clara («¿qué?»), vuelve a pedir el DNI;
    - un DNI como respuesta a «¿es cliente nuevo?» cuenta como intento;
    - el 4.º no reconocido deriva;
    - un texto sin DNI no suma intento;
    - consulta → DNI no reconocido → «no» → DNI reconocido: responde la consulta del primer mensaje;
    - en todo este recorrido, `AiClient` no se llama hasta el DNI reconocido.
  - **Cliente nuevo:** con «sí», pide el nombre, y el mensaje siguiente deriva.
  - **Solo datos propios:** con dos clientes de prueba, la plantilla que recibe `rewrite` tiene solo las pólizas del identificado. Un cliente identificado que escribe «mi DNI es 99-000-001, ¿cuándo vence?»: ningún pedido al `AiClient` tiene `99000001` ni `99-000-001`.
  - **Saludo:** la cortesía se envía redactada, sin derivar.
  - **Cliente sin pólizas:** el vencimiento deriva sin llamar a `rewrite`.
  - **Reinicio:** una instancia nueva de `ProcessIncomingMessage` vuelve a pedir el DNI a un número que estaba identificado o en silencio.
  - **Siniestro y cotización:** derivan sin llamar a `rewrite`, aunque el falso de `rewrite` devuelva un texto válido.
  - **Redacción:** una redacción que conserva los datos se envía; una que cambia una fecha deriva; si `rewrite` lanza, deriva.
  - **Mandar a aprobar:** baja, modificación y cambio de teléfono mandan exactamente el aviso fijo de la decisión 4 y no llaman a `rewrite`.
  - **No es de seguros:** no se envía nada. Si era la consulta guardada antes del DNI, se manda la bienvenida.
  - **Silencio:** después de derivar o de mandar a aprobar, otro mensaje del mismo número no envía nada y no llama a `AiClient`; otro número se atiende normal.
  - **Fallas:** si `classifyIntent` lanza, deriva y no lanza. Si el `WhatsAppClient` falla al derivar, `execute` lanza, y el reintento del mismo `messageId` vuelve a derivar (el estado se restauró).
  - **Repetido:** el mismo `messageId` dos veces envía una sola respuesta.

  Verificar: `docker compose exec backend npm test` pasa

## 6. Documentación

- [x] 6.1 Actualizar `AGENTS.md`:
  - **línea 70:** «Cualquier otra cosa (…): deriva a la bandeja de un operador» pasa a reflejar la tabla de la decisión 1. Baja, modificación (y alta de conductor) y cambio de teléfono: aviso de que el pedido queda en revisión, y el asistente deja de responder. Lo que no es de seguros: no contesta. Siniestro, cotización y lo que no se pueda clasificar: deriva;
  - **línea 74:** «El LLM solo clasifica la intención…» pasa a «El LLM elige la intención de una lista cerrada (salida estructurada estricta) y vuelve a redactar la plantilla completada con los datos, sin cambiarlos; el código controla que los datos no cambien y, si cambian, deriva. El motor de verificación (RF-VER-02) todavía no está»;
  - **pasos 2 y línea 69 (cambio de teléfono):** aclarar que no aplican mientras los clientes salgan de los fixtures, que no tienen teléfonos, y que el cambio de teléfono se manda a aprobar.

  - **nota en «Parcial 1: alcance y flujo»:** los desvíos provisionales sin base de `proposal.md` («Impact»): el DNI y el silencio duran hasta el reinicio, el cliente nuevo no se registra como prospecto y el cambio de teléfono se manda a aprobar.

  Verificar:
  - `git grep -n "El LLM solo clasifica" -- AGENTS.md .claude` sin resultados;
  - `git grep -n "Cualquier otra cosa (incluidos baja" -- AGENTS.md` sin resultados;
  - `git grep -n -i "no es de seguros" -- AGENTS.md` y `git grep -n -i "fixtures" -- AGENTS.md` muestran las líneas nuevas;
  - `git diff main -- AGENTS.md` solo cambia esas líneas, la nota y la sección de comandos.
- [x] 6.2 Actualizar la skill `verificacion-seguridad`: en la línea 14 («consulta fuera del alcance, retener y derivar»), aclarar que se refiere a una respuesta generada y que un mensaje que no es de seguros se ignora sin generar respuesta; en la línea 16 («En el Parcial 1 solo clasifica la intención…») y la skill `backend-datos` (línea 66: «En el Parcial 1 el LLM solo clasifica la intención…») con el mismo sentido que la línea 74 de `AGENTS.md`. Revisar que el `README.md` no describa el flujo viejo (`git grep -n -i "clasifica\|CUSTOMERS_JSON" -- README.md`). Verificar: `git grep -n -i "solo clasifica" -- AGENTS.md .claude README.md` sin resultados

## 7. Prueba de punta a punta (manual, con Santiago)

- [x] 7.1 **Preparación:** Santiago confirma que su `.env` tiene la clave de Groq y los valores de `AI_API_URL` y `AI_MODEL`. Se levanta `docker compose --profile whatsapp up -d` con la sesión de WAHA en `WORKING`. Verificar: `docker compose logs backend` muestra «Backend listening on port 3000»
- [ ] 7.2 **Conversación real**, desde un teléfono de prueba. Cada paso deja una línea en el log del backend con el resultado esperado y sin el texto:
  1. «hola, ¿cuándo vence mi seguro?» → pedido de DNI;
  2. un DNI 99… con dos pólizas → una línea por póliza, redactada;
  3. «tuve un choque» → mensaje de derivación;
  4. «¿hola?» → nada.
- [ ] 7.3 **Otras ramas:** `docker compose restart backend` y repetir desde otro teléfono o después del reinicio:
  - un DNI inexistente → «¿Es usted cliente nuevo?»; con «no», nuevo pedido; al 4.º, derivación;
  - después de otro reinicio, «sí» → nombre → derivación;
  - después de otro reinicio, con un cliente identificado: primero «¿me vendés zapatillas?» → nada; después «quiero dar de baja la póliza» → aviso de revisión; después «¿hola?» → nada (silencio).

Resultado de la prueba del 05/10/2026 (Santiago pidió cortarla después de la primera conversación; 7.2 y 7.3 quedan sin marcar):
- **Con WhatsApp real:** mensaje sin DNI → pedido de DNI (`DNI_REQUESTED`); DNI que no está en los fixtures → «¿Es usted cliente nuevo?» (`NEW_CUSTOMER_ASKED`); «sí» → pedido de nombre (`NAME_REQUESTED`); nombre → derivación (`HANDOFF_SENT`, «cliente nuevo»). Una línea de log por mensaje, sin el texto y con el teléfono enmascarado.
- **Contra Groq real, desde el contenedor y sin WhatsApp:** «¿cuándo vence mi seguro?» → vencimiento; «tuve un choque con el auto» → siniestro; «¿me vendés zapatillas?» → no es de seguros; «quiero dar de baja la póliza» → baja; «gracias!» → saludo. La redacción de la plantilla de vencimientos de dos pólizas pasó `checkRewrite`.
- **Sin probar con el teléfono** (cubierto solo por las pruebas de Vitest de la tarea 5.2): la respuesta de vencimientos redactada, el siniestro, el silencio después de derivar, el aviso de baja y el mensaje que no es de seguros.

## 8. Verificaciones globales

- [x] 8.1 Correr las verificaciones de `AGENTS.md`: `docker compose exec frontend npm run lint`, `docker compose exec frontend npm run build`, `docker compose exec backend npx prisma generate`, `docker compose exec backend npx tsc --noEmit`, `docker compose exec backend npm test` y `docker compose config --quiet`. Verificar: todas terminan sin errores
