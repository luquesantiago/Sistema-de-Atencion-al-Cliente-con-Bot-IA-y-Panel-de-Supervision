# Spec Delta

## Purpose

Módulo «Panel de supervisión» de `docs/requisitos.md`: la conservación de las conversaciones, la bandeja de revisión, la corrección de respuestas, el cierre de casos, las métricas y el control de acceso por perfil (RF-SUP-01 a RF-SUP-07).

## ADDED Requirements

### Requirement: Cada conversación queda guardada

El sistema SHALL guardar cada mensaje de texto de las conversaciones por WhatsApp, lo que escribe el cliente y lo que le responde el asistente, cada uno con su origen y su fecha y hora, en el caso de la consulta a la que pertenece, para que el equipo pueda revisar lo que preguntó el cliente y lo que respondió el asistente (RF-SUP-01).

#### Scenario: Consulta y respuesta
- **WHEN** un cliente identificado hace una consulta y el asistente le responde
- **THEN** el mensaje del cliente y la respuesta quedan guardados en el mismo caso, cada uno con su origen y su fecha y hora, y la respuesta queda enlazada al mensaje que responde

#### Scenario: Consulta escrita antes del DNI
- **WHEN** el cliente escribe una consulta, el asistente le pide el DNI y, con el DNI reconocido, responde esa consulta
- **THEN** la consulta, el pedido de DNI, el DNI y la respuesta quedan guardados en el mismo caso, y la respuesta queda enlazada a la consulta

#### Scenario: Mensaje sin respuesta
- **WHEN** el cliente escribe un mensaje que el asistente no contesta, porque no es de seguros o porque la conversación está en silencio
- **THEN** el mensaje queda guardado igual, en un caso no cerrado de la conversación

#### Scenario: Lo guardado no se pisa
- **WHEN** el asistente guarda un mensaje nuevo
- **THEN** no borra ni modifica ningún mensaje ni respuesta guardados antes
