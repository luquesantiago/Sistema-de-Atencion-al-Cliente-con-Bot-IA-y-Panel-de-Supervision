# Spec Delta

## ADDED Requirements

### Requirement: El asistente pide el DNI antes de responder

El sistema SHALL pedir el DNI a todo número que todavía no se identificó y no responder ninguna consulta, ni enviarla al proveedor de IA, hasta que el DNI se reconozca entre los clientes. Después, entrega solo información de ese cliente (RF-ATE-03).

#### Scenario: Primer mensaje sin DNI
- **WHEN** un número que no se identificó escribe un mensaje que no es un DNI
- **THEN** el asistente le pide el DNI, guarda ese primer mensaje como la consulta a responder y no envía nada al proveedor de IA

#### Scenario: Otro mensaje sin DNI antes de identificarse
- **WHEN** un número al que ya se le pidió el DNI escribe otra vez algo que no es un DNI
- **THEN** el asistente le vuelve a pedir el DNI, conserva como consulta a responder el primer mensaje y no cuenta un intento de DNI no reconocido

#### Scenario: DNI reconocido con una consulta guardada
- **WHEN** el cliente escribe un DNI que se reconoce y antes había escrito una consulta
- **THEN** el asistente atiende esa consulta guardada, con los datos del cliente de ese DNI

#### Scenario: DNI reconocido sin consulta guardada
- **WHEN** el primer mensaje del cliente es un DNI que se reconoce
- **THEN** el asistente le pregunta en qué lo puede ayudar

#### Scenario: Cliente ya identificado
- **WHEN** un número cuyo DNI ya se reconoció escribe otra consulta, sin que el backend se haya reiniciado entre medio
- **THEN** el asistente la atiende con los datos del mismo cliente, sin volver a pedir el DNI

#### Scenario: Reinicio del backend
- **WHEN** el backend se reinicia y después escribe un número que ya se había identificado
- **THEN** el asistente le vuelve a pedir el DNI

### Requirement: DNI no reconocido y cliente nuevo

El sistema SHALL preguntar si es cliente nuevo cuando un DNI no se reconoce. Si la persona dice que no, vuelve a pedirle el DNI hasta tres veces más y, si sigue sin reconocerse, deriva la conversación a un operador (RF-ATE-03).

#### Scenario: Mensaje con una fecha o un número que no es un DNI
- **WHEN** un número que no se identificó escribe un mensaje con una fecha, o con un número que no tiene la forma de un DNI de 7 u 8 dígitos
- **THEN** el asistente no lo toma como un DNI ni como un intento: le pide el DNI como a cualquier mensaje sin DNI

#### Scenario: Primer DNI no reconocido
- **WHEN** un número que no se identificó escribe por primera vez un DNI que no se reconoce
- **THEN** el asistente le pregunta si es cliente nuevo

#### Scenario: No es cliente nuevo
- **WHEN** a la pregunta de si es cliente nuevo la persona contesta que no, o algo que no es un sí ni un no
- **THEN** el asistente le vuelve a pedir el DNI, sin enviar la respuesta al proveedor de IA

#### Scenario: La consulta guardada sobrevive a un DNI no reconocido
- **WHEN** el cliente escribió una consulta, dio un DNI que no se reconoce, contestó que no es nuevo y después da un DNI que se reconoce
- **THEN** el asistente atiende la consulta que escribió primero

#### Scenario: Responde con otro DNI
- **WHEN** a la pregunta de si es cliente nuevo la persona contesta con un DNI
- **THEN** el asistente lo toma como un nuevo intento de identificarse

#### Scenario: Cuarto DNI no reconocido
- **WHEN** la persona escribe el cuarto DNI que no se reconoce
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Es cliente nuevo
- **WHEN** a la pregunta de si es cliente nuevo la persona contesta que sí
- **THEN** el asistente le pide su nombre y apellido y, con el mensaje siguiente, le manda el mensaje de derivación y deja de responder en esa conversación, sin registrar al cliente

### Requirement: La acción sale de la intención

El sistema SHALL hacer con cada mensaje una sola de estas cosas: ignorar, pedir el DNI, responder, derivar o mandar a aprobar. Con el cliente identificado, el proveedor de IA elige la intención del mensaje de una lista cerrada (los tipos de consulta de la agencia, más «no es de seguros» y «no sé»), y la acción la decide el sistema según esa intención, no el texto que genere el modelo. El asistente contesta lo que no implica riesgo y no contesta lo que no es una consulta para la agencia (RF-ATE-01).

#### Scenario: Consulta de vencimiento o de estado
- **WHEN** la intención elegida es vencimiento o estado de póliza
- **THEN** el asistente responde con los datos de las pólizas del cliente

#### Scenario: Saludo o agradecimiento
- **WHEN** la intención elegida es saludo, incluido un agradecimiento
- **THEN** el asistente responde con una cortesía y le ofrece ayuda, sin derivar

#### Scenario: Pedido de cambio de teléfono
- **WHEN** la intención elegida es cambio de teléfono
- **THEN** el asistente le contesta, sin pedirle una redacción al proveedor de IA, «Recibimos su pedido. Un miembro de nuestro equipo lo va a revisar y se va a comunicar con usted.», no cambia ningún dato y deja de responder en esa conversación

#### Scenario: Mensaje que no es de seguros
- **WHEN** la intención elegida es «no es de seguros»
- **THEN** el asistente no contesta ni deriva, y queda una línea en el log del backend sin el texto del mensaje

#### Scenario: Consulta que no es de seguros guardada antes del DNI
- **WHEN** el cliente da un DNI que se reconoce y la consulta guardada resulta no ser de seguros
- **THEN** el asistente no responde esa consulta y le pregunta en qué lo puede ayudar

#### Scenario: Consulta que se deriva
- **WHEN** la intención elegida es «no sé», o es saldo, cobertura o reclamo
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Falla del proveedor de IA al decidir
- **WHEN** el proveedor de IA no responde, responde con error o devuelve algo que no es una de las intenciones de la lista
- **THEN** el asistente le manda el mensaje de derivación, sin mencionar la falla, bots ni inteligencia artificial, y deja de responder en esa conversación

### Requirement: Vencimiento y estado de todas las pólizas

El sistema SHALL responder la consulta de vencimiento o de estado con todas las pólizas del cliente identificado juntas, una línea por póliza con el número, el ramo y el dato pedido. Una póliza se informa como vencida cuando su fecha de vencimiento es anterior a la fecha de hoy en Argentina (RF-ATE-01).

#### Scenario: Cliente con varias pólizas
- **WHEN** un cliente identificado con dos pólizas pregunta cuándo vencen
- **THEN** la respuesta tiene una línea por cada póliza, con su número, su ramo y su fecha de vencimiento

#### Scenario: Póliza vencida
- **WHEN** un cliente pregunta el estado de una póliza activa cuya fecha de vencimiento ya pasó en Argentina
- **THEN** la respuesta informa esa póliza como vencida

#### Scenario: Cliente sin pólizas
- **WHEN** un cliente identificado que no tiene pólizas pregunta el vencimiento o el estado
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

### Requirement: Solo datos del registro, con la redacción controlada

El sistema MUST responder solo con datos del cliente identificado que existen en el registro de la agencia: el texto sale de una plantilla completada con esos datos, y el proveedor de IA solo puede volver a redactarlo. Si la redacción cambia, agrega o quita un número de póliza, una fecha, un estado, un ramo o un número, si tiene un link o un término de la lista de prohibidos, o si no se puede obtener, la respuesta no se envía y la consulta se deriva sin responderla (RF-ATE-02).

#### Scenario: Redacción que conserva los datos
- **WHEN** la redacción del proveedor de IA tiene los mismos números de póliza, fechas, estados, ramos y números que la plantilla, y ningún link
- **THEN** el asistente le envía al cliente la redacción

#### Scenario: Redacción que cambia un dato
- **WHEN** la redacción cambia una fecha, agrega un número de póliza o un número que no está en la plantilla, o quita alguno
- **THEN** la redacción no se envía, y el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Redacción con un link
- **WHEN** la redacción tiene un link, una dirección web o un `@`
- **THEN** la redacción no se envía, y el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Redacción que agrega un compromiso o un tema que se deriva
- **WHEN** la redacción conserva los datos pero agrega un término de la lista de prohibidos, por ejemplo «su pedido quedó registrado», «tiene cobertura total» o «soy una persona»
- **THEN** la redacción no se envía, y el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Falla de la redacción
- **WHEN** el proveedor de IA no devuelve la redacción
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: El DNI no sale al proveedor de IA
- **WHEN** el sistema le envía al proveedor de IA un mensaje del cliente o una plantilla para elegir la intención o redactar
- **THEN** lo que envía no tiene el DNI del cliente, aunque el cliente lo haya escrito en el mensaje, ni datos de otros clientes

### Requirement: Accidentes, siniestros y cotizaciones se derivan siempre

El sistema MUST derivar a una persona, sin responderla, toda consulta sobre accidentes, siniestros o cotizaciones, sin importar qué texto genere el modelo (RF-ATE-04).

#### Scenario: Consulta por un siniestro o un accidente
- **WHEN** la intención elegida es siniestro
- **THEN** el asistente le manda el mensaje de derivación, sin pedirle una redacción al proveedor de IA, y deja de responder en esa conversación

#### Scenario: Pedido de cotización
- **WHEN** la intención elegida es cotización
- **THEN** el asistente le manda el mensaje de derivación, sin pedirle una redacción al proveedor de IA, y deja de responder en esa conversación
