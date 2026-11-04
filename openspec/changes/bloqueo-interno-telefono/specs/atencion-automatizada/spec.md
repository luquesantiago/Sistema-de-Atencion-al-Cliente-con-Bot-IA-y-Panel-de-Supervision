## ADDED Requirements

### Requirement: Una amenaza detectada bloquea internamente el número

Cuando el detector clasifica positivamente un mensaje como posible intento de manipulación o exfiltración, el sistema SHALL guardar el mensaje, derivar el caso sin responder al cliente y activar en la misma operación el bloqueo interno del número, que descarta mensajes entrantes posteriores antes de guardarlos o procesarlos hasta que un operador lo desbloquee desde la Bandeja. Una falla del proveedor al clasificar no activa el bloqueo automático. El bloqueo no bloquea al contacto en WhatsApp ni impide que WAHA reciba los mensajes (RF-VER-01).

#### Scenario: Amenaza clasificada positivamente
- **WHEN** el detector clasifica positivamente como amenaza un mensaje entrante de un número no bloqueado
- **THEN** el mensaje queda registrado en un caso derivado sin respuesta automática, `telefono.bloqueado` queda activo, y los siguientes mensajes entregados por WAHA se descartan antes de guardarse o procesarse

#### Scenario: Amenaza detectada en conversación ya derivada
- **WHEN** llega un mensaje clasificado positivamente como amenaza a una conversación que ya estaba en silencio por una derivación abierta
- **THEN** el mensaje se registra en el caso derivado existente, el motivo principal del caso pasa a ser posible amenaza, el número queda bloqueado internamente y no se envía respuesta automática

#### Scenario: Falla al clasificar amenaza
- **WHEN** falla el proveedor de IA al clasificar si un mensaje es una amenaza
- **THEN** el sistema no bloquea automáticamente el número y continúa con el flujo de atención ya definido

#### Scenario: Desbloqueo de una detección errónea
- **WHEN** un operador determina que una detección positiva fue un error y desbloquea el número desde la Bandeja
- **THEN** el sistema desactiva el bloqueo interno y los mensajes futuros vuelven a procesarse según el flujo habitual
