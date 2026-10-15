# Spec Delta

## MODIFIED Requirements

### Requirement: El cliente nuevo queda como prospecto

El sistema SHALL registrar como prospecto pendiente de confirmación a la persona que dice ser cliente nueva, con el nombre y el DNI que declaró, después de recibir la foto de su DNI, sin guardar una copia de la foto ni darla de alta como cliente: el alta la confirma un operador, que puede ver la foto desde el panel obtenida de WhatsApp en el momento; si el operador rechaza el alta, el caso queda abierto y en silencio, a su cargo, para que le explique el rechazo al cliente antes de cerrarlo (RF-ATE-05).

#### Scenario: Prospecto registrado
- **WHEN** la persona que dijo ser nueva escribe su nombre y apellido, después un DNI que no es de ningún cliente y después manda una foto
- **THEN** queda un prospecto en estado pendiente, en un caso derivado de la conversación abierta, con el nombre como nombre declarado y ese DNI como DNI declarado; el mensaje de la foto guarda la referencia al mensaje de WhatsApp, sin la imagen; el asistente le avisa que un miembro autorizado del equipo va a revisar la solicitud, sin prometer tiempos, y deja de responder en esa conversación; no se crea ningún cliente

#### Scenario: Mensaje sin DNI cuando se espera el DNI del cliente nuevo
- **WHEN** el asistente le pidió el DNI al cliente nuevo y la persona escribe algo que no es un DNI
- **THEN** el asistente le vuelve a pedir el DNI

#### Scenario: Texto en lugar de la foto
- **WHEN** el asistente le pidió la foto del DNI y la persona manda un mensaje de texto
- **THEN** el asistente le vuelve a pedir la foto y no registra el prospecto

#### Scenario: El DNI ya es de un cliente
- **WHEN** la persona que dijo ser nueva da el DNI de un cliente de la cartera
- **THEN** el asistente no registra un prospecto y sigue como con un cliente existente: desde un número no vinculado, crea la solicitud de cambio de teléfono; desde un número vinculado a otros clientes, deriva

#### Scenario: Un prospecto sin confirmar no se identifica
- **WHEN** una persona registrada como prospecto escribe su DNI en una conversación posterior, sin que un operador haya confirmado el alta
- **THEN** el DNI no se reconoce y el asistente sigue el flujo de DNI no reconocido

#### Scenario: Alta confirmada por un operador
- **WHEN** un operador aprueba el prospecto con el nombre y el apellido revisados
- **THEN** se crea el cliente con el DNI declarado, el número de la conversación queda vinculado solo a ese cliente, el prospecto queda confirmado, el caso queda cerrado con el operador como responsable y, si no queda otro caso derivado sin cerrar, la conversación deja de estar en silencio

#### Scenario: Alta rechazada por un operador
- **WHEN** un operador rechaza el prospecto con un fundamento
- **THEN** el prospecto queda descartado con el fundamento, no se crea ningún cliente, el caso sigue abierto y derivado con el operador como responsable, la conversación sigue en silencio, la respuesta de la decisión indica el caso para abrirlo en la Bandeja de Atención y la bandeja lo muestra como alta rechazada

#### Scenario: Cliente que escribe después del rechazo
- **WHEN** el prospecto se rechazó y la persona vuelve a escribir antes de que se cierre el caso
- **THEN** el asistente no le contesta y el mensaje queda guardado en el caso del alta
