# Spec Delta

## Purpose

Módulo «Aprobación de acciones críticas» de `docs/requisitos.md`: las bajas, modificaciones de póliza y altas de conductor que pide un cliente, que el asistente nunca ejecuta y que quedan a la espera de que una persona autorizada las apruebe o las rechace (RF-APR-01 a RF-APR-04).

## ADDED Requirements

### Requirement: El asistente nunca ejecuta una acción contractual

El sistema MUST impedir que el asistente ejecute, modifique o dé por hecha una baja, una modificación de póliza o un alta de conductor. Ante esos pedidos, el asistente le avisa al cliente que un miembro del equipo lo va a revisar, sin afirmar que el pedido está hecho ni registrado ni prometer que se va a aprobar, y deja de responder en esa conversación (RF-APR-01).

#### Scenario: Pedido de baja
- **WHEN** un cliente identificado pide la baja de una póliza
- **THEN** el asistente le contesta «Recibimos su pedido. Un miembro de nuestro equipo lo va a revisar y se va a comunicar con usted.», no cambia ningún dato y deja de responder en esa conversación

#### Scenario: Pedido de modificación o de alta de conductor
- **WHEN** un cliente identificado pide modificar una póliza o agregar un conductor
- **THEN** el asistente le contesta el mismo aviso, no cambia ningún dato y deja de responder en esa conversación

#### Scenario: El aviso no pasa por la redacción del modelo
- **WHEN** el asistente responde un pedido de baja, modificación o alta de conductor
- **THEN** el aviso se envía tal como está escrito, sin pedirle una redacción al proveedor de IA
