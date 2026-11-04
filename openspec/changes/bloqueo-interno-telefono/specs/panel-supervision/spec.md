## ADDED Requirements

### Requirement: Bloqueo interno de un número desde la Bandeja

El sistema SHALL permitir bloquear y desbloquear un número desde la Bandeja mediante el estado `telefono.bloqueado`. Mientras esté bloqueado, los mensajes entrantes que WAHA entregue se descartan antes de guardarse o procesarse, y no se permiten respuestas manuales desde la Bandeja: la interfaz oculta el compositor y el backend rechaza el envío. Si el motivo del caso indica una posible amenaza, esa etiqueta reemplaza cualquier otra etiqueta de prioridad y el caso se ordena antes que los demás; el nivel de riesgo del catálogo se conserva. El bloqueo no bloquea al contacto en WhatsApp ni impide que WAHA reciba sus mensajes (RF-SUP-02).

#### Scenario: Mensaje entrante de un número bloqueado
- **WHEN** WAHA entrega al backend un mensaje de un número marcado como bloqueado
- **THEN** el backend lo descarta antes de guardarlo, no lo procesa y no responde; el mensaje no aparece en la conversación de la Bandeja

#### Scenario: Respuesta manual a un número bloqueado
- **WHEN** un operador intenta responder desde la Bandeja a un número bloqueado
- **THEN** la interfaz no muestra el compositor y el backend rechaza cualquier envío manual sin enviarlo por WhatsApp ni guardarlo

#### Scenario: Desbloqueo interno
- **WHEN** un operador desbloquea el número desde la Bandeja
- **THEN** el sistema desactiva `telefono.bloqueado` y restaura el flujo habitual dentro de la aplicación, sin ejecutar una operación de bloqueo o desbloqueo nativa de WhatsApp

#### Scenario: Amenaza por encima de otra prioridad
- **WHEN** un caso con gravedad media o alta queda marcado con el motivo «posible intento de manipulación o exfiltración»
- **THEN** la Bandeja muestra «Posible amenaza» en lugar de la etiqueta de gravedad y ordena ese caso antes que los demás, conservando el nivel de riesgo del catálogo
