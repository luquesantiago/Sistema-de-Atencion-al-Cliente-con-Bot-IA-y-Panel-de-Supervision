# Proposal

## Why

El backend ya registra prospectos pendientes y solicitudes de cambio de teléfono, y ya permite decidirlos con un fundamento, pero el panel no tenía una pantalla para revisarlos. Sin ese lugar, la persona autorizada no podía ver la foto del DNI, comparar los teléfonos del cliente ni enterarse de un aviso fallido antes de decidir. La pantalla «Trámites por Aprobar» completa el flujo de RF-ATE-05 y RF-CAR-05 desde el panel.

## What Changes

- Agregar la pantalla «Trámites por Aprobar» con una lista única de altas de clientes nuevos y cambios de teléfono pendientes, ordenada del trámite más antiguo al más reciente.
- Mostrar en cada alta el nombre declarado, el DNI, el teléfono de la conversación y la fecha; permitir ver la foto del DNI pedida a WhatsApp en el momento, sin guardarla, y corregir el nombre y el apellido antes de decidir.
- Mostrar en cada cambio de teléfono el cliente, el DNI, el número solicitado, los teléfonos actuales y la fecha; permitir elegir cuáles de los teléfonos actuales se desvinculan al aprobar, pudiendo no elegir ninguno.
- Exigir un fundamento de entre 3 y 2000 caracteres y una confirmación con los cambios antes de aprobar o rechazar.
- Al aprobar un alta, crear el cliente con el DNI declarado, vincular el teléfono de la conversación y cerrar el caso. Al rechazarla, descartar el prospecto sin crear un cliente y dejar el caso abierto en la Bandeja de Atención a cargo de quien rechazó, con una acción para ir a la Bandeja.
- Al aprobar o rechazar un cambio de teléfono, aplicar la decisión, cerrar el caso y avisar al cliente por WhatsApp. Si el aviso falla, mantener la decisión registrada, avisar en el panel y ofrecer reintentar el aviso.
- Unificar la carga, los errores, el estado vacío y la paginación de las dos listas, y actualizar la lista cuando una decisión choca con un trámite que otra persona ya resolvió.
- **Fuera de alcance:** las bajas, las modificaciones de póliza y las altas de conductor. La pantalla actual no las lista porque todavía no tienen API de listado y decisión; el módulo queda preparado para sumarlas en otro change.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `atencion-automatizada`: se agrega la pantalla y el flujo de decisión del alta de un prospecto pendiente (RF-ATE-05).
- `cartera`: se agrega la pantalla y el flujo de decisión del cambio de teléfono pendiente (RF-CAR-05).

## Impact

- Frontend: `pages/TramitesAprobar.tsx`, `api/tramites.ts`, `App.tsx`, `App.css` y los componentes de confirmación y estado que ya existían.
- Sin cambios en el backend, la base de datos ni las APIs: se usan `GET /api/tramites/prospectos`, `GET /api/tramites/cambios-telefono`, `POST /api/tramites/prospectos/:id/decision`, `POST /api/tramites/cambios-telefono/:id/decision`, `POST /api/tramites/cambios-telefono/:id/notificacion` y los endpoints de la Bandeja para ver la foto.
- `AGENTS.md`: se actualiza la regla que decía que la pantalla de Trámites todavía no existía.
- No se modifica `aprobacion-acciones-criticas`: este change no agrega la aprobación de bajas, modificaciones ni altas de conductor.
