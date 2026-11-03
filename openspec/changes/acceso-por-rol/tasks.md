# Tasks

## 1. Sesión en el dominio

- [x] 1.1 Crear `backend/src/domain/session.ts` con la firma y la verificación del token (`{ userId, exp }`, HMAC-SHA256, `timingSafeEqual`) y el límite de intentos (5 fallos seguidos bloquean 15 minutos, con reloj inyectable). Agregar `session.test.ts` con:
  - un token válido (permitido);
  - un token alterado, uno vencido y uno firmado con otro secreto (rechazados);
  - el bloqueo al quinto fallo, el desbloqueo a los 15 minutos y el reinicio del contador con un acierto.

  Verificar: `docker compose exec backend npm test` y `npx tsc --noEmit`.
- [x] 1.2 Agregar `PANEL_SESSION_SECRET` a `config.ts` (obligatoria), a `docker-compose.yml` y a `.env.example`, con la indicación de generar un valor al azar. Verificar: `docker compose config` y que el backend arranca con la variable y falla nombrándola sin ella.

## 2. Login y usuarios

- [x] 2.1 Crear el repositorio de usuarios del panel (Prisma), que busque por nombre de usuario y por id con el rol y `activo`, y `application/manage-session.ts`:
  - `login` normaliza el usuario, compara con `bcrypt.compare` (contra un hash fijo si el usuario no existe), aplica el límite de intentos y devuelve el token;
  - `currentUser` resuelve el usuario de un token.

  Probar con un repositorio en memoria:
  - clave correcta (permitido);
  - clave incorrecta, usuario inexistente y usuario inactivo, todos con el mismo error;
  - el bloqueo por intentos (429).

  Verificar: `docker compose exec backend npm test`.

## 3. Autenticación y rol en la API

- [x] 3.1 En `http/app.ts`:
  - agregar `POST /api/sesion`, `GET /api/sesion` y `POST /api/sesion/cierre`, con la cookie `sesion_panel` (`httpOnly`, `SameSite=Strict`, `Path=/api`, 8 h, `Secure` en producción);
  - agregar el middleware `requireSession` para el resto de `/api`;
  - agregar `requireRole`;
  - reemplazar `resolvePanelActor` por el usuario de `response.locals`;
  - actualizar `index.ts`.

  En `app.test.ts`:
  - agregar un helper de cookie válida para las pruebas existentes;
  - sumar pruebas de 401 (sin cookie, cookie alterada, usuario dado de baja), de 403 (operador en una ruta con `requireRole('administrador')` montada en la prueba), del webhook sin sesión y del login (cookie emitida, credenciales inválidas, 429).

  Verificar: `docker compose exec backend npm test` y `npx tsc --noEmit`.
- [x] 3.2 Pasar el actor de la sesión a `ManageRequests.decideProspect` y `decidePhoneChange`, y en `PrismaRequestManagementRepository` usarlo en vez de `findTestOperatorId`, también en la anotación del prospecto. Borrar `findTestOperatorId` si nada más lo usa. Probar en `app.test.ts` que la decisión llega con el usuario de la sesión. Verificar: `docker compose exec backend npm test`.

## 4. Panel

- [x] 4.1 Crear `frontend/src/api/sesion.ts` y hacer que `api/respuesta.ts` dispare `sesion-vencida` ante un 401, salvo en las rutas de sesión. Verificar: `docker compose exec frontend npm run lint` y `npm run build`.
- [x] 4.2 En `App.tsx`, `Login.tsx`, `usuario.ts` y `Sidebar.tsx`:
  - recuperar la sesión al montar;
  - iniciar y cerrar sesión con la API;
  - volver al login ante `sesion-vencida`;
  - armar el usuario con los datos del backend;
  - mantener la pista de los usuarios de prueba.

  Seguir `docs/design.md`. Verificar: `docker compose exec frontend npm run lint` y `npm run build`, y a mano:
  - login con `admin`, `operador` y `graciela`;
  - clave incorrecta;
  - recargar sin perder la sesión;
  - cerrar sesión;
  - el operador no ve el Dashboard;
  - tomar un caso queda a nombre de quien inició sesión.

## 5. Documentación y verificación

- [x] 5.1 Actualizar:
  - AGENTS.md: «Login en Frontend», la atribución a `operador` en el Parcial 1 y el comando de verificación si cambia;
  - la skill `verificacion-seguridad` (Autorización);
  - `docs/migracion.md` («Usuarios»: qué claves sirven para entrar);
  - el README, si explica el login.

  Verificar: releer y que no quede ninguna mención a que el backend atribuye todo a `operador`.
- [x] 5.2 Correr todas las comprobaciones de AGENTS.md y `openspec validate acceso-por-rol --strict`.
