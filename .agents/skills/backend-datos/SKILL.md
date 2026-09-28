---
name: backend-datos
description: Backend y base de datos del proyecto. Cubre Express 5, Prisma 7, el esquema MySQL 8.4, migraciones, endpoints, webhooks de WhatsApp, migración de la planilla histórica y persistencia de auditoría, con los comandos Docker y los problemas ya conocidos. Usar al tocar cualquier archivo de backend/, el schema de Prisma o el servicio db.
---

# Skill: Backend y datos

## Cuándo usarla

Usar al tocar Express, Prisma, el esquema MySQL, migraciones, endpoints, integraciones o persistencia de auditoría.

## Stack y comandos

- Node.js 24 en Docker, TypeScript estricto y Express 5.
- MySQL 8.4 y Prisma 7; la conexión de la aplicación usa el adaptador MariaDB con variables separadas (`DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`). La CLI de Prisma usa `DATABASE_URL`. Todas las pone el compose a partir del `.env`.
- La config de la CLI está en `backend/prisma7.config.ts` (Prisma la detecta sola). El cliente se genera en `backend/src/generated/prisma`, que no se versiona.
- Los comandos corren dentro del contenedor, desde la raíz del repo:

```bash
docker compose exec backend npx tsc --noEmit
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma db pull
docker compose exec backend npx prisma generate
```

- Si se cambia infraestructura, validar con `docker compose config`.

## Problemas ya conocidos

- Instalar Prisma siempre con `@7` (`npm i -D prisma@7`, `npm i @prisma/client@7 @prisma/adapter-mariadb@7`). El tag `latest` de `prisma` apunta a una release candidate de la 8, así que hay que ignorar el aviso que sugiere `@latest`.
- `@prisma/adapter-mariadb` no acepta URLs `mysql://`; por eso la app usa las variables separadas.
- Sin TLS, MySQL 8.4 (`caching_sha2_password`) necesita `allowPublicKeyRetrieval: true` en el adaptador. Esa opción es solo para desarrollo.
- Con `module: nodenext`, los imports relativos llevan extensión `.js` (por ejemplo `./generated/prisma/client.js`).
- `SELECT 1` con `$queryRaw` devuelve `BigInt`, y `res.json` no puede serializarlo.
- Los scripts SQL que se corren con el cliente `mysql` del contenedor tienen que empezar con `SET NAMES utf8mb4;`: si no, los textos con tilde se guardan mal.
- La tabla `auditoria` y sus triggers no están en la base hasta el MVP 2 (decisión del 28/09/2026): no crearla ni escribir en ella antes. Cuando se agregue, hay que resolver antes que, con el log binario activo (default de MySQL 8.4), el usuario `app` no puede crear triggers (ERROR 1419).
- `migrate deploy` no revisa las migraciones ya aplicadas: si se edita una, en las bases que ya la tenían el cambio no se aplica y no avisa nada.
- Si una migración falla (P3018), queda marcada como fallida y las siguientes no se aplican (P3009) hasta resolverla. MySQL no deshace el DDL de una migración a medias: en desarrollo, corregir el SQL y recrear la base con `docker compose down -v`.
- `migrate deploy` sobre una base con tablas pero sin historial de migraciones da P3005 (por ejemplo, si alguien corrió `docs/01_esquema.sql` a mano). En desarrollo se resuelve con `docker compose down -v`.

## Diseño

- Mantener capas claras: transporte HTTP, casos de uso, dominio y repositorios.
- Validar entrada, autorización y transición de estado en backend.
- Las restricciones críticas deben ser transaccionales: leer estado, comprobar autorización y mutar deben pertenecer a una misma operación cuando corresponda.
- Guardar fechas en UTC; convertir a hora argentina solo para mostrar y para comparar con el horario de atención.
- Usar claves y relaciones explícitas para clientes, teléfonos, pólizas, coberturas, conversaciones, trámites y auditoría.

## Convenciones de la base (acordadas)

- Tablas y columnas en español, ids autoincrementales y referencias siempre por id.
- Bajas lógicas: no borrar filas con evidencia operativa.
- Los catálogos van en tablas propias, incluido el de tipos de acción crítica, que es fijo.
- Lo que se puede deducir de otros datos no se guarda: el estado del caso sale de sus fechas y "vencida" sale de la fecha de vencimiento.
- Cliente y teléfono son N:M. Puede haber clientes persona (DNI + apellido + nombre) o empresa (CUIT + razón social) en la misma tabla.
- Una moneda por póliza, solo pesos o dólares.
- El borrador retenido, la respuesta enviada y la corrección se guardan por separado.
- Una baja aprobada pone la póliza en "dada de baja". `activo = false` marca solo registros cargados por error. La cartera activa son las pólizas en estado "activa", no vencidas y con `activo = true`.

## API

- Responder errores con formato consistente y sin filtrar stack traces ni secretos.
- Distinguir `401` de `403`, validación (`400`), recurso inexistente (`404`) y conflicto de estado (`409`).
- No aceptar desde el cliente un actor o rol para autorizar una acción.
- Diseñar idempotencia para webhooks y eventos de WhatsApp.
- No enviar una respuesta de IA antes de pasar por verificación.
- No generar respuestas automáticas en una conversación con un caso derivado sin cerrar.

## Prisma y migraciones

- El esquema vigente está en las migraciones de `backend/prisma/migrations`. El DER (`docs/caso8_der.md`) y los SQL de `docs/` son la foto del Hito 0: no se corren. No inventar tablas ni columnas; si hace falta una nueva, proponerla y actualizar el DER.
- Flujo SQL-first (decisión del 28/09/2026). Para cambiar la base:
  1. Crear a mano la carpeta `backend/prisma/migrations/<AAAAMMDDHHMMSS>_<nombre>/` con un `migration.sql` que tenga el SQL del cambio (fecha y hora en UTC, para que quede después de las anteriores).
  2. Aplicarla con `npx prisma migrate deploy`.
  3. Regenerar `schema.prisma` con `npx prisma db pull` y el cliente con `npx prisma generate`.
  4. Commitear juntos la migración y `schema.prisma`.
- `schema.prisma` no se edita a mano, salvo los nombres de las relaciones que `db pull` genera solo (por ejemplo `mensaje_consulta`, `respuesta_origen`, `correcciones`): `db pull` respeta los nombres cambiados.
- No usar `prisma migrate dev`: genera y aplica migraciones propias a partir de `schema.prisma`, que en este flujo es un archivo generado.
- No editar una migración que ya está en `main`: el cambio va en una migración nueva.
- Las migraciones pendientes se aplican solas al levantar el backend (`docker compose restart backend` después de traer migraciones nuevas).
- Los CHECK de la base no aparecen en `schema.prisma` (Prisma no los representa): los sigue controlando MySQL.
- Toda migración debe ser revisable y compatible con datos existentes o acompañarse de una estrategia de importación.
- La importación histórica no modifica la planilla original. Los registros irresolubles, como los duplicados y las pólizas POL-00126 y POL-00131 del VW Gol, se omiten y quedan listados para carga manual.
- No almacenar secretos ni datos reales de clientes en fixtures, logs de desarrollo o migraciones.
