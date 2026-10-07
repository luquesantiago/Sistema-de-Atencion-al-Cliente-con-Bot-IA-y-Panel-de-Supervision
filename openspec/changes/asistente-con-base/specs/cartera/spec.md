# Spec Delta

## ADDED Requirements

### Requirement: El número desde el que se escribe se registra sin identificar al cliente

El sistema SHALL registrar el número de WhatsApp de cada conversación en la lista de teléfonos, aunque no esté vinculado a ningún cliente, y SHALL identificar al cliente por su DNI, salvo cuando el número está vinculado a un solo cliente activo, que lo identifica; identificarse con el DNI no vincula el número al cliente (RF-CAR-03).

#### Scenario: Número que escribe por primera vez
- **WHEN** escribe un número que no está en la lista de teléfonos
- **THEN** el número queda registrado una sola vez, sin ningún cliente vinculado

#### Scenario: Identificarse no vincula el número
- **WHEN** un cliente se identifica con su DNI desde un número que no tiene vinculado
- **THEN** la conversación queda a nombre del cliente y el número sigue sin vincularse a él

#### Scenario: Número vinculado a un solo cliente
- **WHEN** escribe un número vinculado a un solo cliente activo
- **THEN** la conversación queda a nombre de ese cliente sin pedirle el DNI

#### Scenario: Número compartido
- **WHEN** escribe un número vinculado a más de un cliente activo
- **THEN** el número no identifica a nadie y el asistente pide el DNI

#### Scenario: Vínculo con un cliente cargado por error
- **WHEN** escribe un número cuyo único vínculo es con un cliente marcado como cargado por error
- **THEN** el número se atiende como no vinculado

### Requirement: Cambio de teléfono desde un número no vinculado

El sistema SHALL, cuando una persona dice que ya es cliente desde un número no vinculado y su DNI coincide con un cliente de la cartera, registrar una solicitud pendiente para vincular ese número al cliente, sin vincularlo hasta que un operador la apruebe, avisarle que la decisión queda pendiente y seguir atendiéndolo como cliente identificado; al decidir, el operador elige qué números anteriores de ese cliente se desvinculan, sin afectar a otros clientes que compartan esos números, y el cliente recibe el aviso de la decisión por ese WhatsApp (RF-CAR-05).

#### Scenario: Solicitud registrada
- **WHEN** desde un número no vinculado la persona contesta que ya es cliente y da el DNI de un cliente activo
- **THEN** queda una solicitud pendiente de cambio de teléfono para ese cliente y ese número, en un caso propio de tipo «cambio de teléfono» de la conversación abierta, sin derivar; el número sigue sin vincularse; el asistente le avisa que la actualización quedó pendiente de aprobación y que le van a informar la decisión por ese WhatsApp

#### Scenario: Sigue atendiendo después de la solicitud
- **WHEN** se registró la solicitud de cambio de teléfono
- **THEN** la conversación queda identificada con ese cliente y el asistente no deja de responder: atiende la consulta guardada o, si no había, le pregunta en qué lo puede ayudar

#### Scenario: Solicitud ya pendiente
- **WHEN** el mismo cliente vuelve a identificarse desde el mismo número no vinculado y ya tiene una solicitud pendiente para ese número
- **THEN** no se crea otra solicitud, el asistente le avisa que la actualización sigue pendiente y lo sigue atendiendo

#### Scenario: Solicitud aprobada
- **WHEN** un operador aprueba la solicitud y elige qué números anteriores del cliente se desvinculan, o ninguno
- **THEN** el número de la solicitud queda vinculado al cliente, los números elegidos dejan de estar vinculados solo a ese cliente, el detalle de la solicitud dice qué número se vinculó y cuáles se desvincularon, el caso queda cerrado con el operador como responsable y el cliente recibe el aviso por ese WhatsApp

#### Scenario: Solicitud rechazada
- **WHEN** un operador rechaza la solicitud con un fundamento
- **THEN** no cambia ningún vínculo, el caso queda cerrado con el operador como responsable y el cliente recibe el aviso por ese WhatsApp

#### Scenario: El aviso de la decisión queda guardado
- **WHEN** el aviso de la decisión se envía por WhatsApp
- **THEN** queda guardado en el caso de la solicitud como mensaje del asistente, con su fecha y hora
