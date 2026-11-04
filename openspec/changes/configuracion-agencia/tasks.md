# Tasks

Requiere `acceso-por-rol` implementado (`requireSession` y `requireRole`).

## 1. Datos y dominio

- [x] 1.1 Escribir la migración de solo datos `backend/prisma/migrations/<fecha>_configuracion_agencia/migration.sql` (con `SET NAMES utf8mb4;`):
  - «asistencia mecánica» y «medios de pago» en `tipo_consulta`;
  - `telefono_asistencia`, `email_agencia`, `web_agencia` y `medios_pago` en `parametro_configuracion`, vacíos y con la descripción «Sin informar…».

  Verificar: `docker compose restart backend` aplica la migración, y `npx prisma db pull` no cambia `schema.prisma`.
- [x] 1.2 En `intent.ts`, `conversation.ts` y `risk-level.ts`, sumar las dos intenciones, sus acciones (`assistance` y `payment-methods`) y el nivel medio para «asistencia mecánica». Actualizar `intent.test.ts` y `risk-level.test.ts`. Verificar: `docker compose exec backend npm test` y `npx tsc --noEmit`.
- [x] 1.3 En `agency-info.ts` y `prisma-agency-info.ts`, sumar los cuatro datos a `AgencyInfo`. El email y la web van a la plantilla y a los literales solo si están cargados. Probar en `agency-info.test.ts` y `prisma-agency-info.test.ts` la plantilla con y sin email y web. Verificar: `docker compose exec backend npm test`.
- [x] 1.4 Crear `domain/agency-settings.ts` con `parseAgencySettings` y la marca de dato de ejemplo o sin informar. Agregar `agency-settings.test.ts`:
  - datos válidos (permitido);
  - dirección vacía, horario invertido, email o web inválidos, más de 255 caracteres, y sin ramos, planes o días activos (rechazados).

  Verificar: `docker compose exec backend npm test`.

## 2. Asistente

- [x] 2.1 Sumar a `templates.ts` los textos fijos de grúa y de medios de pago, y a `openai-compatible-client.ts` las descripciones y los ejemplos de las dos intenciones, sacándolos de «otra consulta». Probar en `openai-compatible-client.test.ts` que la lista las incluye. Verificar: `docker compose exec backend npm test`.
- [x] 2.2 En `process-incoming-message.ts`, tratar las dos intenciones en cada etapa donde hoy se responde la información de la agencia (inicio, esperando si ya es cliente, esperando el DNI, oferta al cliente nuevo, cambio de teléfono pendiente e identificado):
  - grúa con número: texto fijo, derivación con el tipo «asistencia mecánica» y nivel medio;
  - medios de pago cargados: texto fijo sin derivar, repitiendo la pregunta pendiente;
  - sin dato cargado: derivación habitual.

  Probar en `process-incoming-message.test.ts`:
  - cliente identificado con y sin número de grúa;
  - grúa antes de identificarse;
  - medios de pago con y sin texto;
  - medios de pago esperando el DNI (no cuenta intento);
  - nada de esto mientras se toman los datos del alta ni en silencio;
  - un siniestro con pedido de grúa sigue siendo siniestro.

  Verificar: `docker compose exec backend npm test`.

## 3. API de Configuración

- [x] 3.1 Agregar `save(settings)` en una transacción a `PrismaAgencyInfoSource`, el caso de uso `ManageAgencySettings` y, en `app.ts`, `GET`/`PUT /api/configuracion/agencia` y `POST /api/configuracion/agencia/vista-previa` con `requireRole('administrador')`. Probar en `app.test.ts`:
  - el administrador lee y guarda;
  - el operador recibe 403 y sin sesión hay 401;
  - un dato inválido da 400 sin guardar;
  - la vista previa no escribe.

  Verificar: `docker compose exec backend npm test` y `npx tsc --noEmit`.

## 4. Panel

- [x] 4.1 Crear `frontend/src/api/configuracion.ts` y `pages/Configuracion.tsx`:
  - secciones Contacto, Asistencia y pagos, Horario, y Seguros y planes;
  - marcas «Dato de ejemplo» y «Sin cargar»;
  - vista previa;
  - confirmación con `ConfirmarCambio`, que incluye el aviso del plan desactivado.

  Sumar el módulo a `navigation.ts`, `App.tsx` y `Sidebar.tsx`, solo para el administrador. Seguir `docs/design.md` y la skill `frontend-panel`. Verificar: `docker compose exec frontend npm run lint` y `npm run build`.
- [ ] 4.2 Prueba manual con el administrador:
  1. Cargar dirección, teléfono, número de grúa y medios de pago.
  2. Cambiar el horario del sábado.
  3. Ver la vista previa.
  4. Por WhatsApp, preguntar por la agencia, pedir una grúa (número más derivación, caso con nivel medio en la Bandeja) y preguntar cómo pagar (texto sin derivar).

  Con el operador: el menú no muestra Configuración y la API responde 403. Anotar el resultado en el PR.

## 5. Documentación y verificación

- [x] 5.1 Actualizar:
  - AGENTS.md: módulos del panel, punto 4 del Parcial 1 (grúa y medios de pago), reglas del Parcial 1 sobre la información de la agencia, y «Decisiones abiertas»: los datos nuevos son propuesta a validar y la dirección y el teléfono se cargan desde Configuración;
  - `docs/requisitos.md` (RF-ATE-06 con los datos nuevos);
  - las skills `frontend-panel` y `backend-datos`;
  - `docs/design.md` si suma componentes.

  Verificar: releer y que no contradiga las specs del change.
- [x] 5.2 Correr todas las comprobaciones de AGENTS.md y `openspec validate configuracion-agencia --strict`.
