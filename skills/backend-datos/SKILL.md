# Skill: Backend y datos

## Cuándo usarla

Usar al tocar Express, Prisma, el esquema MySQL, migraciones, endpoints, integraciones o persistencia de auditoría.

## Stack y comandos

- Node.js 24 en Docker, TypeScript estricto y Express 5.
- MySQL 8.4 y Prisma 7; la conexión de la aplicación usa el adaptador MariaDB con variables separadas.
- Verificar con `npx tsc --noEmit` desde `backend/` y con `docker compose config` cuando se cambie infraestructura.

## Diseño

- Mantener capas claras: transporte HTTP, casos de uso, dominio y repositorios.
- Validar entrada, autorización y transición de estado en backend.
- Las restricciones críticas deben ser transaccionales: leer estado, comprobar autorización y mutar deben pertenecer a una misma operación cuando corresponda.
- Guardar fechas en UTC; convertir a hora argentina solo en la presentación.
- Usar claves y relaciones explícitas para clientes, teléfonos, pólizas, coberturas, conversaciones, trámites y auditoría.
- Evitar borrar evidencia operativa. Preferir estados, historial o soft delete cuando el caso de negocio lo requiera.

## API

- Responder errores con formato consistente y sin filtrar stack traces ni secretos.
- Distinguir `401` de `403`, validación (`400`), recurso inexistente (`404`) y conflicto de estado (`409`).
- No aceptar desde el cliente un actor o rol para autorizar una acción.
- Diseñar idempotencia para webhooks y eventos de WhatsApp.
- No enviar una respuesta de IA antes de pasar por verificación.

## Prisma y migraciones

- Cambiar primero el modelo conceptual y luego el schema.
- Toda migración debe ser revisable y compatible con datos existentes o acompañarse de una estrategia de importación.
- La importación histórica no modifica la planilla original; registros irresolubles quedan listados para carga manual.
- No almacenar secretos ni datos reales de clientes en fixtures, logs de desarrollo o migraciones.