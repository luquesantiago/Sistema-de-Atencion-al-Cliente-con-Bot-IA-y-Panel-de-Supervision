# Proposal

## Why

Los botones «Bloquear número» y «Desbloquear número» de la Bandeja aplican un bloqueo dentro del sistema. Es necesario dejar claro que no bloquean al contacto en WhatsApp: WAHA puede seguir recibiendo sus mensajes, aunque el backend los descarte y la Bandeja impida responderle manualmente. El motor configurado, GOWS, no soporta el bloqueo nativo de contactos.

## What Changes

- Documentar el alcance del bloqueo interno por número y sus límites.
- Especificar el descarte de mensajes entrantes y el rechazo de respuestas manuales desde la Bandeja mientras el número está bloqueado.
- Aclarar que desbloquear restaura el comportamiento interno y no ejecuta ninguna acción de bloqueo o desbloqueo en WhatsApp.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `panel-supervision`: se documenta el bloqueo interno disponible desde la Bandeja (RF-SUP-02).

## Impact

- Se documentan las reglas operativas en `AGENTS.md`, la aclaración de RF-SUP-02, la tabla de eventos y el DER.
- Se utiliza el atributo existente `telefono.bloqueado`; no se agrega una columna ni un endpoint.
- El comportamiento implementado y sus pruebas están en el backend y frontend existentes.
- No se cambia el motor GOWS ni se afirma que el contacto quede bloqueado en WhatsApp.
