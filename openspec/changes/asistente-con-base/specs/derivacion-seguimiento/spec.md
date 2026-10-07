# Spec Delta

## MODIFIED Requirements

### Requirement: El asistente se calla después de derivar

El sistema SHALL hacer que, una vez que el asistente mandó en una conversación el mensaje de derivación o el aviso de que el pedido queda en revisión, el asistente deje de responder por completo en esa conversación hasta que se cierre el caso derivado, y que lo que el cliente siga escribiendo quede guardado en ese caso (RF-DER-03).

#### Scenario: Mensaje después de una derivación
- **WHEN** un número al que el asistente ya le mandó el mensaje de derivación en la conversación abierta vuelve a escribir
- **THEN** el asistente no le contesta, no envía el mensaje al proveedor de IA, el mensaje queda guardado en el caso derivado y queda una línea en el log del backend sin el texto del mensaje

#### Scenario: Mensaje después de mandar a aprobar
- **WHEN** un número al que el asistente ya le avisó que su pedido queda en revisión vuelve a escribir
- **THEN** el asistente no le contesta ni envía el mensaje al proveedor de IA, y el mensaje queda guardado en el caso derivado

#### Scenario: Otro número
- **WHEN** el asistente derivó la conversación de un número y escribe otro número distinto
- **THEN** el asistente atiende al otro número de forma normal

#### Scenario: Reinicio del backend
- **WHEN** el backend se reinicia y después escribe un número cuya conversación estaba en silencio
- **THEN** el asistente sigue sin contestarle y el mensaje queda guardado en el caso derivado

#### Scenario: La inactividad no termina una conversación derivada
- **WHEN** un número cuya conversación tiene un caso derivado sin cerrar vuelve a escribir después de los minutos de inactividad de la configuración
- **THEN** la conversación sigue abierta, el asistente no le contesta ni le pide el DNI y el mensaje queda guardado en el caso derivado

#### Scenario: Conversación migrada abierta
- **WHEN** escribe un número que tiene una conversación migrada de la planilla todavía abierta, con un caso derivado sin cerrar
- **THEN** el asistente no le contesta y el mensaje queda guardado en ese caso

#### Scenario: Conversación que deja de estar en silencio
- **WHEN** se cierra el caso derivado de una conversación abierta y la conversación deja de estar marcada en silencio
- **THEN** el asistente vuelve a atender: si el último mensaje de la conversación es de hace menos minutos que los de inactividad, sigue en la misma conversación y, si el cliente ya se había identificado en ella, no le vuelve a pedir el DNI; si no, el mensaje abre una conversación nueva y el asistente le pide el DNI
