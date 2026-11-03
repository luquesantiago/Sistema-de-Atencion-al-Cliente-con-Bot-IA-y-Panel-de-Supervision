# Design

## Context

Motivación: ver `proposal.md`. Requisitos: ver `specs/`.

Estado actual:

- **Login.** `frontend/src/pages/Login.tsx` valida `admin`/`operador` con la clave `1234` en el navegador, y `usuario.ts` arma el usuario a partir del nombre ingresado.
- **Usuarios en la base.** La tabla `usuario` ya tiene `nombre_usuario`, `contrasena_hash` (bcrypt `$2b$`, costo 10), `id_rol` y `activo`. Están `admin`, `operador`, `roberto` y `graciela` (`docs/migracion.md`, «Usuarios»).
- **Actor del panel.** `createApp` recibe `resolvePanelActor: () => Promise<PanelActor>`. `index.ts` lo resuelve con `findTestOperatorId`, que busca al usuario `operador`. La Bandeja ya pide el actor por acción.
- **Trámites.** `PrismaRequestManagementRepository` llama a `findTestOperatorId` dentro de `decideProspect` y `decidePhoneChange`.
- **API.** Express 5, con `express.json` después del webhook. El panel llama a `/api` por el proxy de Vite, en el mismo origen, así que la cookie viaja sola.
- **Restricción.** No hay tabla de sesiones en el DER, y no se agregan tablas.

## Goals / Non-Goals

**Goals:**
- Autenticación en el backend para toda la API del panel.
- Un guard de rol reutilizable.
- El actor real en cada acción que registra un responsable.
- No tocar el esquema.

**Non-Goals:**
- Alta, edición y cambio de clave de usuarios desde el panel.
- Registro de accesos y auditoría (MVP 2).
- Recuperar la clave.
- Cerrar todas las sesiones de un usuario desde el servidor.
- Las rutas de Configuración y de métricas: las agregan sus propios changes usando el guard.

## Decisions

### 1. Sesión con una cookie firmada, sin tabla

El token es `base64url(payload).base64url(hmac)`:
- el payload lleva `{ userId, exp }`;
- la firma es HMAC-SHA256 con `PANEL_SESSION_SECRET`;
- se verifica con `timingSafeEqual`.

La cookie se llama `sesion_panel`, es `httpOnly`, `SameSite=Strict` y `Path=/api`, y dura 8 horas. Lleva `Secure` cuando `NODE_ENV=production`. En desarrollo el panel corre por HTTP.

- **Por qué:** no agrega tablas al DER, y la firma impide fabricar o alterar una sesión. `SameSite=Strict` cubre el CSRF, porque el panel y la API comparten origen.
- **Alternativas descartadas:**
  - Sesiones en una tabla: requiere cambiar el DER.
  - Sesiones en memoria: se pierden cada vez que `tsx watch` reinicia el backend en desarrollo.
  - JWT con una librería: suma una dependencia para lo mismo que hace `node:crypto`.
- **Limitación:** cerrar sesión borra la cookie de ese navegador, pero un token copiado sigue valiendo hasta que vence. Se acepta por la duración corta y porque cada pedido vuelve a mirar `activo` en la base: dar de baja al usuario corta el acceso enseguida.

### 2. El usuario se lee en cada pedido

El middleware `requireSession`:
- verifica el token;
- lee de la base el usuario con su rol y `activo`;
- deja `{ userId, username, name, role }` en `response.locals.panelUser`.

Si el token no es válido, venció o el usuario está inactivo o no existe, responde 401 con el formato de error de siempre. `requireRole('administrador')` responde 403.

- **Por qué:** un cambio de rol o una baja se aplican en el pedido siguiente, sin esperar a que venza la sesión. El costo es una consulta por clave primaria por pedido; el panel tiene pocos usuarios.

### 3. Orden de las rutas en `app.ts`

```
/webhooks/whatsapp  (secreto de WAHA, sin cambios)
express.json
/health                            público
POST /api/sesion                   público (login, con límite de intentos)
GET  /api/sesion, POST /api/sesion/cierre
app.use('/api', requireSession)    todo lo demás
```

`createApp` recibe un `SessionService`, que verifica credenciales y tokens, en lugar de `resolvePanelActor`. Cada ruta toma el actor de `response.locals.panelUser`.

### 4. Credenciales y límite de intentos

- **Credenciales.**
  - `ManageSession.login(usuario, clave)` normaliza el usuario (trim y minúsculas), busca el activo y compara con `bcrypt.compare`.
  - Si el usuario no existe, compara igual contra un hash fijo, para que el tiempo de respuesta no revele si existe.
  - El error es siempre `INVALID_CREDENTIALS` (401): «Usuario o clave incorrectos.».
- **Límite de intentos.**
  - Un contador en memoria por usuario normalizado: 5 fallos seguidos bloquean ese usuario 15 minutos y responden 429 («Demasiados intentos. Probá de nuevo en unos minutos.»).
  - Un acierto reinicia el contador.
  - Lleva reloj inyectable para las pruebas.
  - Vive en memoria: un reinicio lo borra. Es una defensa básica, no un registro de seguridad.

### 5. Actor en Trámites

- `ManageRequests.decideProspect` y `decidePhoneChange` reciben el `PanelActor`.
- El repositorio usa ese `userId` para cerrar o tomar el caso, en vez de `findTestOperatorId`.
- La anotación del prospecto («Decisión aprobar por operador…») pasa a nombrar al usuario.
- `findTestOperatorId` deja de usarse en el panel. Si nada más lo usa, se borra.

### 6. Panel

- **`api/sesion.ts`:** `iniciarSesion`, `obtenerSesion` y `cerrarSesion`.
- **`App.tsx`:**
  - al montar llama a `obtenerSesion`, y mientras tanto muestra un estado de carga;
  - si el resultado es 401, muestra el login;
  - escucha el evento `sesion-vencida`.
- **`api/respuesta.ts`:** `leer` dispara `window.dispatchEvent(new Event('sesion-vencida'))` ante un 401, salvo en las rutas de sesión.
- **`usuario.ts`:**
  - `UsuarioPanel` se arma con lo que devuelve el backend: nombre, apellido, iniciales y rol;
  - desaparece `crearUsuario`;
  - el Sidebar ya filtra el Dashboard por rol, y queda igual.
- **Login.** Mantiene el diseño y la pista de los usuarios de prueba que pide AGENTS.md, pero valida en el backend y muestra el mensaje que devuelve.

## Risks / Trade-offs

- **[Cambio que rompe el entorno de cada integrante]** Sin `PANEL_SESSION_SECRET` el backend no arranca. → Se agrega a `.env.example` con el valor de ejemplo marcado para cambiar, y el error de arranque nombra la variable.
- **[Pruebas de HTTP existentes]** Todas las pruebas de `app.test.ts` llaman a la API sin sesión. → Un helper de prueba arma una cookie válida con un `SessionService` de prueba, y se suman pruebas del 401 y del 403.
- **[Token robado]** Vale hasta que vence (8 h). → `httpOnly` impide leerlo desde JavaScript; dar de baja al usuario lo corta.
- **[Fuerza bruta distribuida]** El límite es por usuario y en memoria. → Alcanza para el alcance del parcial; un límite por IP o persistente queda fuera.

## Migration Plan

1. Agregar `PANEL_SESSION_SECRET` al `.env` de cada integrante: un valor al azar largo, por ejemplo `openssl rand -hex 32`.
2. Correr `docker compose up -d` para que el compose pase la variable.
3. Iniciar sesión con `admin`/`1234`, `operador`/`1234`, o con `roberto` o `graciela` y su clave de prueba.

Rollback: revertir el PR. No hay datos que deshacer.

## Open Questions

Ninguna que cambie el diseño. Las de negocio están en `proposal.md`.
