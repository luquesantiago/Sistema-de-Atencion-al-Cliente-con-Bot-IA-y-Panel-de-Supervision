# Proposal

## Why

Los botones «Bloquear número» y «Desbloquear número» de la Bandeja aplican un bloqueo dentro del sistema. También hace falta que una detección positiva de posible manipulación active ese mismo bloqueo automáticamente para que los mensajes siguientes se descarten. El bloqueo interno no bloquea al contacto en WhatsApp: WAHA puede seguir recibiendo sus mensajes, aunque el backend los descarte y la Bandeja impida responderle manualmente. El motor configurado, GOWS, no soporta el bloqueo nativo de contactos.

## What Changes

- Documentar el alcance del bloqueo interno por número y sus límites.
- Especificar el descarte de mensajes entrantes y el rechazo de respuestas manuales desde la Bandeja mientras el número está bloqueado.
- Ante una detección positiva de posible amenaza, guardar y derivar el mensaje sin responder y activar el bloqueo interno en la misma transacción; permitir que el operador lo desbloquee desde la Bandeja.
- Aclarar que desbloquear restaura el comportamiento interno y no ejecuta ninguna acción de bloqueo o desbloqueo en WhatsApp.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `panel-supervision`: se documenta el bloqueo interno disponible desde la Bandeja (RF-SUP-02).
- `atencion-automatizada`: una detección positiva de amenaza activa el bloqueo interno automáticamente (RF-VER-01).

## Impact

- Se documentan las reglas operativas en `AGENTS.md`, las aclaraciones de RF-SUP-02 y RF-VER-01, y la tabla de eventos.
- Se utiliza el atributo existente `telefono.bloqueado`; no se agrega una columna ni un endpoint.
- El comportamiento implementado y sus pruebas están en el backend y frontend existentes.
- No se cambia el motor GOWS ni se afirma que el contacto quede bloqueado en WhatsApp.
