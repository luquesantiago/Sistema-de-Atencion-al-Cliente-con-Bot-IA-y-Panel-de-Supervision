# Proposal

## Why

El panel no tiene acceso real:
- el login compara la clave con «1234» en el navegador;
- la API responde a cualquiera que la llame;
- el backend atribuye toda acción al usuario de prueba `operador`.

Eso choca con dos reglas de AGENTS.md:
- «aplicar autorización por rol en backend; ocultar una acción en frontend nunca es suficiente»;
- la regla 8: una aprobación registra quién decidió.

También bloquea el módulo de Configuración, que solo puede usar el administrador. El Parcial 2 (05/11/2026) pide control de acceso por rol (RF-SUP-07).

## What Changes

- **Inicio de sesión real.**
  - `POST /api/sesion` verifica el usuario y la clave contra la tabla `usuario`, con el hash bcrypt que ya tiene, y solo para usuarios activos.
  - Si coinciden, deja una cookie de sesión firmada, `httpOnly`, que dura 8 horas.
  - Ante datos incorrectos responde un error genérico, sin decir si el usuario existe.
- **Sesión.**
  - `GET /api/sesion` devuelve el usuario logueado (nombre, apellido y rol) para recuperar la sesión al recargar.
  - `POST /api/sesion/cierre` la cierra.
- **BREAKING (API del panel).** Toda ruta `/api/*`, salvo las de sesión, exige una sesión válida y responde 401 sin ella. El webhook de WhatsApp y `/health` no cambian.
- **Rol en el backend.**
  - Las rutas reservadas al administrador responden 403 a un operador.
  - En este change no hay ninguna todavía: el guard queda listo para la Configuración y las métricas.
  - El rol y el estado activo se leen de la base en cada pedido, así una baja o un cambio de rol se aplican enseguida.
- **Actor real.**
  - Tomar, liberar, contestar y cerrar casos, y aprobar o rechazar trámites, quedan a nombre del usuario logueado (por ejemplo, Roberto o Graciela), no del usuario de prueba `operador`.
  - Las ediciones de cartera siguen sin auditoría hasta el MVP 2.
- **Panel.**
  - El login usa la API.
  - El panel recupera la sesión al recargar.
  - Ante un 401 vuelve al login.
  - Muestra el nombre real del usuario y oculta lo que su rol no permite (el Dashboard de métricas, para el operador).
- **Límite de intentos.** Después de 5 intentos fallidos seguidos para un mismo usuario, el login se bloquea 15 minutos para ese usuario.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `panel-supervision`:
  - se agrega el requirement de acceso al panel con sesión y control por rol (RF-SUP-07);
  - se agrega el de atribución de las acciones del panel al usuario logueado (RF-SUP-07, RF-APR-03).
- `atencion-automatizada`: la decisión de un alta en Trámites queda atribuida al usuario logueado, no al usuario de prueba (RF-ATE-05, RF-APR-03).
- `derivacion-seguimiento`: tomar un caso desde la bandeja queda a nombre del usuario logueado, no del usuario de prueba (RF-DER-02, RF-SUP-07).

## Impact

- **Backend.**
  - Módulos nuevos de sesión: dominio con la firma y la verificación del token y el límite de intentos; caso de uso de login; repositorio de usuarios.
  - Middleware de autenticación y de rol en `http/app.ts`.
  - `resolvePanelActor` pasa a leer el usuario de la sesión.
  - Las decisiones de Trámites reciben el actor en vez de usar `findTestOperatorId`.
  - Usa `bcryptjs`, que ya está instalado.
- **Configuración.**
  - Variable nueva y obligatoria, `PANEL_SESSION_SECRET`, en `.env.example`, `docker-compose.yml` y `config.ts`.
  - Sin ella el backend no arranca, como con las otras variables.
- **Frontend.** `Login.tsx`, `usuario.ts`, `App.tsx`, `Sidebar.tsx`, una API nueva `api/sesion.ts` y el manejo del 401 en `api/respuesta.ts`.
- **Base de datos.** Sin migraciones: se usan `usuario` y `rol` como están.
- **Documentación.** AGENTS.md («Login en Frontend» y la atribución a `operador`), la skill `verificacion-seguridad`, `docs/migracion.md` (usuarios) y el README si explica el login.

## Preguntas abiertas (no se cierran en este change)

- **Diego** no está en la base, porque no figura en la planilla (`docs/migracion.md`). Hasta que se cargue no puede iniciar sesión.
- **Las claves de los usuarios** (`admin`/`operador` con `1234`, `roberto`/`graciela` con `seguros1234`) son de prueba y el repo es público. Se cambian antes de producción, como ya dice `docs/migracion.md`.
- **Tratamiento de datos sensibles** (Decisiones abiertas): este change no agrega registros de acceso. Quién entró y cuándo queda para la auditoría del MVP 2.
