# Spec Delta

## Purpose

Módulo «Derivación y seguimiento» de `docs/requisitos.md`: el paso de una consulta a una persona, el responsable de cada caso derivado, su seguimiento hasta el cierre, el silencio del asistente mientras el caso está abierto y la derivación fuera de horario (RF-DER-01 a RF-DER-04).

## ADDED Requirements

### Requirement: El asistente se calla después de derivar

El sistema SHALL hacer que, una vez que el asistente le mandó a un número el mensaje de derivación o el aviso de que su pedido queda en revisión, el asistente deje de responder por completo a ese número. Mientras no exista el cierre de casos, el silencio dura hasta que se reinicia el backend (RF-DER-03).

#### Scenario: Mensaje después de una derivación
- **WHEN** un número al que el asistente ya le mandó el mensaje de derivación vuelve a escribir
- **THEN** el asistente no le contesta, no envía el mensaje al proveedor de IA, y queda una línea en el log del backend sin el texto del mensaje

#### Scenario: Mensaje después de mandar a aprobar
- **WHEN** un número al que el asistente ya le avisó que su pedido queda en revisión vuelve a escribir
- **THEN** el asistente no le contesta ni envía el mensaje al proveedor de IA

#### Scenario: Otro número
- **WHEN** el asistente derivó la conversación de un número y escribe otro número distinto
- **THEN** el asistente atiende al otro número de forma normal

#### Scenario: Reinicio del backend
- **WHEN** el backend se reinicia y después escribe un número que estaba en silencio
- **THEN** el asistente le pide el DNI como a un número que todavía no se identificó
