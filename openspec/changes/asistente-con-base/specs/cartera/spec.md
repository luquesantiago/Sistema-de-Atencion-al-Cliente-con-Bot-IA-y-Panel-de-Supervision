# Spec Delta

## ADDED Requirements

### Requirement: El número desde el que se escribe se registra sin identificar al cliente

El sistema SHALL registrar el número de WhatsApp de cada conversación en la lista de teléfonos, aunque no esté vinculado a ningún cliente, e identificar al cliente solo por su DNI, sin vincular el número al cliente al identificarse (RF-CAR-03).

#### Scenario: Número que escribe por primera vez
- **WHEN** escribe un número que no está en la lista de teléfonos
- **THEN** el número queda registrado una sola vez, sin ningún cliente vinculado

#### Scenario: Identificarse no vincula el número
- **WHEN** un cliente se identifica con su DNI desde un número que no tiene vinculado
- **THEN** la conversación queda a nombre del cliente y el número sigue sin vincularse a él

#### Scenario: Número vinculado sin DNI
- **WHEN** escribe un número que ya está vinculado a uno o más clientes
- **THEN** el asistente igual le pide el DNI y no identifica a nadie por el número
