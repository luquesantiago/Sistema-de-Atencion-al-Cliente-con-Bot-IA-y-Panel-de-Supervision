# Tasks

Los comandos corren desde la raíz del repo, en la WSL, con el stack levantado (`docker compose up -d --build`).

- No se lee ni se muestra el `.env`.
- Los SELECT se corren en el contenedor `db` con `docker compose exec db sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "…"'`, con un solo `-e`. No muestran DNI, teléfonos completos ni textos de mensajes.
- Los DNI y los números de las pruebas manuales los elige Santiago y no se escriben en el repo ni en el chat.
- Las pruebas de Vitest usan datos ficticios (DNI 99…, pólizas POL-9…), sin base y sin Groq, con una fecha de hoy fija.

## 1. El motivo de la derivación como tipo cerrado

- [x] 1.1 Crear `domain/handoff.ts` con `HandoffReason` y `describeHandoffReason` (decisión 1 de `design.md`). En `handoff.test.ts`: **permitido:** cada motivo produce exactamente el texto que hoy se guarda en `motivo_derivacion` (la lista de «Context»). Verificar: `docker compose exec backend npm test` pasa.
- [x] 1.2 En `application/process-incoming-message.ts`, pasar `handoffIn`, `handoffIdentifying` y `handoffUntyped` a recibir un `HandoffReason`, sin cambiar ningún otro comportamiento. Verificar: `docker compose exec backend npx tsc --noEmit` pasa y `docker compose exec backend npm test` pasa sin tocar las aserciones de motivo de `process-incoming-message.test.ts`.

## 2. El nivel de riesgo al derivar

- [x] 2.1 Crear `domain/risk-level.ts` con `riskLevels`, `mostSevere`, `queryTypeRiskLevel`, `reasonRiskLevel` y `handoffRiskLevel` (decisión 2 de `design.md`). En `risk-level.test.ts`:
  - **permitido:** cada fila de la tabla del proposal (tipo y motivo); siniestro con urgencia grave da crítico; reclamo derivado por falla del proveedor da alto (gana el más grave); una consulta de saldo derivada por póliza sin cuotas da bajo; cambio de teléfono da bajo;
  - **retenido en el piso:** siniestro con urgencia normal o `null` da alto; urgencia grave en un reclamo o en una cotización no sube el nivel.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 2.2 En `domain/ai-client.ts`, cambiar `classifyIntent` para que devuelva `{ intent, urgency }`; en `infrastructure/openai-compatible-client.ts`, sumar `urgencia` al esquema estricto y a las instrucciones, con el criterio de grave de la spec (decisión 3 de `design.md`). En `openai-compatible-client.test.ts`:
  - **permitido:** el pedido manda `urgencia` en `properties` y en `required`; `{ intencion: 'siniestro', urgencia: 'grave' }` devuelve la urgencia grave;
  - **rechazado:** una intención fuera de la lista sigue lanzando; una urgencia fuera de la lista o ausente devuelve `urgency: null` sin lanzar.

  Ajustar los dobles de `http/app.test.ts` y `application/process-incoming-message.test.ts`. Verificar: `docker compose exec backend npx tsc --noEmit` y `docker compose exec backend npm test` pasan.
- [x] 2.3 En `domain/conversation.ts`, sumar `riskLevel` a `handoff` y a `phoneChangeRequest`; en `process-incoming-message.ts`, calcularlo con `handoffRiskLevel` en cada derivación (con el tipo de la consulta y la urgencia de la clasificación) y con `queryTypeRiskLevel('cambio de teléfono')` en la solicitud. En `process-incoming-message.test.ts`:
  - **permitido:** reclamo → alto; cotización → medio; siniestro con urgencia grave → crítico; cliente nuevo → medio; cuarto DNI no reconocido → medio; tercer mensaje no entendido → bajo; solicitud de cambio de teléfono → bajo y sin derivar; el mensaje que recibe el cliente es el de derivación de siempre;
  - **derivado igual, en el piso:** siniestro con urgencia normal o `null` → alto; la urgencia grave en un reclamo no cambia ni el nivel ni la acción.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 2.4 En `infrastructure/prisma-conversation-store.ts`, buscar el id de `nivel_riesgo` por nombre en `catalogIds` (lanza si falta) y escribir `caso.id_nivel_riesgo` en el `update` de la derivación y en el caso de la solicitud de cambio de teléfono cuando se crea la solicitud. Verificar: `docker compose exec backend npx tsc --noEmit` pasa, y a mano, con WhatsApp, un reclamo deja el caso con nivel alto: `SELECT c.id_caso, n.nombre FROM caso c JOIN nivel_riesgo n ON n.id_nivel_riesgo = c.id_nivel_riesgo ORDER BY c.id_caso DESC LIMIT 3`.
- [x] 2.5 En AGENTS.md, «Parcial 1: alcance y flujo»: sumar la tabla de niveles de riesgo al derivar como decisión del equipo del 15/10/2026 y que la urgencia del siniestro solo sube el nivel (decisión 7 de `design.md`). Verificar: el texto coincide con la tabla del proposal y con la spec de `derivacion-seguimiento`.

## 3. La bandeja en el backend

- [x] 3.1 Crear `domain/inbox.ts` con `InboxEntry`, `InboxRepository`, `inboxLabel`, `waitingSince` y `queryTypeRiskLevels` (decisión 4 de `design.md`). En `inbox.test.ts`:
  - **permitido:** las tres etiquetas; la espera de un cambio de teléfono sale de la solicitud; `queryTypeRiskLevels` da siniestro y reclamo → alto, cotización, cobertura, baja y modificación → medio, cambio de teléfono → bajo, y nada para los demás tipos;
  - **excluido:** un caso de baja sin derivar no lleva la etiqueta de pedido; un caso derivado sin prospecto ni solicitud no lleva etiqueta.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 3.2 Crear `infrastructure/prisma-inbox-repository.ts` con las dos consultas de la decisión 4: la de orden y página con `$queryRaw` (gravedad = menor orden entre el nivel del caso, las alertas con `fecha_atencion` nula y el `CASE` por tipo armado desde `queryTypeRiskLevels`; `NULL` al final; sin tomar primero; espera; id) más el `COUNT`, y la de datos con `findMany`, con el último mensaje recortado a 160 caracteres y el cliente desde `conversacion.id_cliente`. En `prisma-inbox-repository.test.ts`, sin base:
  - **permitido:** el `CASE` tiene un `WHEN` por cada par de `queryTypeRiskLevels` y los nombres van como parámetros, no dentro del texto SQL; una fila derivada con cliente, responsable y último mensaje se mapea completa y en el orden de la primera consulta; una empresa muestra la razón social y el CUIT;
  - **excluido:** una conversación sin cliente da `customer: null` aunque el teléfono esté vinculado; una gravedad `NULL` da `severity: null`.

  Verificar: `docker compose exec backend npm test` pasa, y a mano con la base migrada, `curl` a `/api/bandeja` (tarea 3.4) devuelve los siete casos migrados abiertos con la gravedad de su tipo.
- [x] 3.3 Crear `application/manage-inbox.ts` con la lista paginada y el detalle (decisión 4 de `design.md`), con un repositorio en memoria en la prueba. En `manage-inbox.test.ts`:
  - **permitido:** pasa la página validada al repositorio y devuelve `items` con etiqueta y espera; el detalle trae toda la conversación en orden con `inCase` en los del caso;
  - **rechazado:** `limit` 0 o 101, `offset` negativo e id no entero dan `VALIDATION_ERROR` sin consultar el repositorio; un caso cerrado o sin derivar y sin nada pendiente da `NOT_FOUND`.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 3.4 En `http/app.ts`, sumar `GET /api/bandeja` y `GET /api/bandeja/:idCaso` con el formato de la decisión 5; en `index.ts`, armar `ManageInbox` con `PrismaInboxRepository`. En `app.test.ts`: **permitido:** 200 con `items`, `total`, `limit` y `offset`, y el detalle; **rechazado:** 400 con `limit=0` y con id `abc`, 404 con un caso que no está en la bandeja. Verificar: `docker compose exec backend npm test` pasa y `curl -s localhost:<puerto del backend>/api/bandeja | head -c 300` devuelve la lista con los casos migrados abiertos.

## 4. La bandeja en el panel

- [x] 4.1 Crear `frontend/src/api/bandeja.ts` con los tipos y las dos llamadas, documentando que es la única capa que habla con `/api/bandeja`. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build` pasan.
- [x] 4.2 Reescribir `frontend/src/pages/BandejaAtencion.tsx` según la decisión 6 de `design.md`, después de leer la skill `frontend-panel`: dos columnas como el mock (lista de casos en tarjetas y conversación a la derecha), con gravedad (texto, icono y color, con los tonos de la tabla del design y el modificador `chip--riesgo-fuerte`), cliente o teléfono con «Sin identificar», tipo, motivo, etiqueta en ámbar, último mensaje, responsable o «Sin tomar» y espera; la conversación completa en burbujas, con el origen escrito y la hora argentina; una columna por vez en pantallas chicas; estados de carga, error y vacío; sin botones de acción. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build` pasan.
- [x] 4.3 Sumar la actualización automática de la decisión 6: sondeo cada 5 segundos encadenado con `setTimeout`, cancelado con `AbortController`, pausado con la pestaña oculta y con consulta inmediata al volver; refresca la página y el detalle elegido, conserva la selección, avisa si el caso dejó de estar en la bandeja y, si falla, deja los últimos datos con «No se pudo actualizar». Verificar: lint y build pasan, y a mano, con la bandeja abierta, una derivación nueva por WhatsApp aparece en su lugar en menos de 10 segundos sin recargar; en la pestaña Network del navegador no hay pedidos mientras la pestaña está oculta.

## 5. Prueba de punta a punta

- [x] 5.1 Con la planilla migrada y WhatsApp vinculado: desde un número de prueba, provocar un reclamo, un siniestro con una persona herida y una consulta que no se entienda tres veces; desde otro número, registrar un cliente nuevo. Verificar en el panel que la bandeja muestra esos casos y los siete migrados abiertos en el orden de la spec (crítico, alto, medio, bajo, sin nivel), también al pasar a la segunda página con `limit=2`, con la etiqueta del alta, «Sin tomar» en los nuevos y el responsable en los migrados; que el detalle de cada uno muestra la conversación completa en hora argentina; y, con el SELECT de 2.4, que abrir la bandeja no cambió `fecha_toma`, `fecha_cierre` ni `asistente_suspendido`.
- [x] 5.2 Correr las comprobaciones globales de AGENTS.md: `docker compose exec frontend npm run lint`, `docker compose exec frontend npm run build`, `docker compose exec backend npx prisma generate`, `docker compose exec backend npx tsc --noEmit` y `docker compose exec backend npm test`. Verificar: todas pasan.
