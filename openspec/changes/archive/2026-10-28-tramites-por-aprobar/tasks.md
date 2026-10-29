# Tasks

## 1. API y navegación

- [x] 1.1 Crear `frontend/src/api/tramites.ts` con los tipos y las llamadas de listado, decisión y reintento de aviso. Verificar: `docker compose exec frontend npm run build`.
- [x] 1.2 Pasar `onNavegar` desde `App.tsx` a las páginas del panel para que Trámites pueda llevar a la Bandeja. Verificar: `docker compose exec frontend npm run build`.

## 2. Lista única

- [x] 2.1 Unir prospectos y cambios en `TramitePendiente`, ordenar por fecha ascendente y combinar carga, errores, estado vacío y “Cargar más”. Verificar: `docker compose exec frontend npm run lint` y `npm run build`.
- [x] 2.2 Agregar los estilos de la lista, el detalle, la foto, los avisos y el layout responsive en `App.css`. Verificar: `docker compose exec frontend npm run build`.

## 3. Altas de clientes nuevos

- [x] 3.1 Mostrar el detalle del prospecto con nombre, DNI, teléfono, fecha y foto del DNI pedida a WhatsApp en el momento. Verificar: `docker compose exec frontend npm run build` y revisión de la llamada a `obtenerCasoBandeja`/`obtenerImagenMensaje`.
- [x] 3.2 Permitir corregir nombre y apellido, mantener el DNI fijo y exigir un fundamento de 3 a 2000 caracteres. Verificar: `docker compose exec frontend npm run lint`.
- [x] 3.3 Confirmar y aplicar la aprobación o el rechazo del alta; al rechazar, ofrecer ir a la Bandeja con el caso devuelto por la API. Verificar: `docker compose exec frontend npm run build` y revisión del contrato de `POST /api/tramites/prospectos/:id/decision`.
- [x] 3.4 Manejar el conflicto 409 y el trámite que ya no está pendiente recargando las listas. Verificar: `docker compose exec frontend npm run build`.

## 4. Cambios de teléfono

- [x] 4.1 Mostrar el detalle del cambio con cliente, DNI, número solicitado, teléfonos actuales y fecha; permitir elegir cuáles se desvinculan. Verificar: `docker compose exec frontend npm run build`.
- [x] 4.2 Confirmar y aplicar la aprobación o el rechazo con fundamento y aviso por WhatsApp. Verificar: `docker compose exec frontend npm run lint` y revisión del contrato de `POST /api/tramites/cambios-telefono/:id/decision`.
- [x] 4.3 Si el aviso falla, mantener la decisión, mostrar la advertencia y permitir reintentar con `POST /api/tramites/cambios-telefono/:id/notificacion`. Verificar: `docker compose exec frontend npm run build`.
- [x] 4.4 Manejar el conflicto 409 y el cambio que ya no está pendiente recargando las listas. Verificar: `docker compose exec frontend npm run build`.

## 5. Documentación y validación

- [x] 5.1 Actualizar en `AGENTS.md` la regla que decía que la pantalla de Trámites todavía no existía. Verificar: leer la sección «Bandeja de Atención» y comprobar que la navegación a la Bandeja desde el rechazo de un alta queda descrita.
- [x] 5.2 Validar el change con `openspec validate tramites-por-aprobar --strict` y verificar que los dos deltas correspondan a `atencion-automatizada` y `cartera`.
- [x] 5.3 Ejecutar la verificación completa del frontend: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
