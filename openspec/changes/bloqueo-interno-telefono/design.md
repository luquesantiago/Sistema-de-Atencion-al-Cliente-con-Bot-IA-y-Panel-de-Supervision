# Design

## Context

La columna `telefono.bloqueado` ya persiste el estado del número. La aplicación recibe eventos de WAHA aunque ese valor esté activo; el procesamiento entrante debe descartarlos antes de guardarlos o responderlos. GOWS no ofrece el bloqueo nativo de contactos de WhatsApp.

## Goals / Non-Goals

**Goals:** documentar con precisión el bloqueo interno; no guardar ni procesar mensajes entrantes de un número bloqueado; impedir respuestas manuales desde la Bandeja tanto en la interfaz como en el backend.

**Non-Goals:** impedir que el remitente escriba; impedir que WhatsApp o WAHA reciba el mensaje; bloquear al contacto en WhatsApp; cambiar el motor GOWS.

## Decisions

### 1. Alcance por número

El estado está en `telefono.bloqueado`, no en una conversación. Mientras está activo, los mensajes entrantes de ese número se descartan antes de guardarse o procesarse. La Bandeja oculta el compositor y el backend rechaza la respuesta manual antes de enviarla o persistirla.

Al desbloquear, se desactiva el estado interno y se restaura el flujo habitual. No se realiza una llamada de bloqueo o desbloqueo a WhatsApp.

### 2. Comunicación en la interfaz

La Bandeja muestra un aviso explícito de que el bloqueo es interno y que WAHA todavía puede recibir mensajes. El estado no se comunica solo con color.

## Risks / Trade-offs

- [La persona puede seguir escribiendo al número de WhatsApp] WAHA puede entregar el evento al backend, pero este descarta el mensaje sin guardarlo ni responderlo. El sistema no presenta el bloqueo interno como un bloqueo del contacto en WhatsApp.
