# Spec Delta

## MODIFIED Requirements

### Requirement: El asistente recibe y responde por WhatsApp

El sistema SHALL recibir por WhatsApp cada mensaje de texto que un cliente le escribe al número de la agencia, entregárselo al asistente y, cuando el asistente genera una respuesta, enviársela al mismo número desde el que escribió el cliente (RF-ATE-01).

#### Scenario: Respuesta enviada al mismo número
- **WHEN** un cliente escribe un mensaje de texto al número de la agencia y el asistente genera una respuesta
- **THEN** la respuesta le llega al cliente por WhatsApp, en el mismo número desde el que escribió

#### Scenario: Remitente identificado con un id oculto
- **WHEN** WhatsApp entrega el mensaje con un identificador que oculta el número del remitente (`@lid`) y el canal puede obtener ese número
- **THEN** el asistente procesa el mensaje con el número del remitente y, si genera una respuesta, se la envía a ese número

#### Scenario: Número del remitente desconocido
- **WHEN** el canal no puede obtener un número de teléfono válido del remitente
- **THEN** el mensaje no se procesa, no se le responde y el aviso queda registrado en el log del backend sin el texto del mensaje

#### Scenario: Mensaje repetido
- **WHEN** el canal entrega de nuevo un mensaje que ya se procesó con éxito, sin que el backend se haya reiniciado entre medio
- **THEN** el mensaje no se procesa otra vez, no se guarda de nuevo y el cliente no recibe otra respuesta

#### Scenario: Mensajes seguidos del mismo número
- **WHEN** un cliente manda dos mensajes seguidos y ninguno falla al procesarse
- **THEN** el asistente procesa el segundo después de terminar el primero, en el orden en que llegaron al backend

#### Scenario: Falla al procesar
- **WHEN** el proceso de un mensaje falla, por ejemplo porque falla la base de datos o el envío por WhatsApp
- **THEN** el backend responde con error, no queda guardado nada de lo que ese mensaje iba a guardar, el mensaje no queda marcado como procesado y, cuando el canal lo vuelve a entregar, se procesa desde el mismo estado que tenía la conversación antes de la falla

#### Scenario: Mensaje sin texto
- **WHEN** el cliente manda un audio, una foto u otro archivo sin texto
- **THEN** el mensaje no se procesa, no se guarda, no se le responde y el aviso queda registrado en el log del backend

### Requirement: El asistente pide el DNI antes de responder

El sistema SHALL pedir el DNI a todo número que todavía no se identificó en su conversación abierta, desde el comienzo de cada conversación, y no responder ninguna consulta, ni enviarla al proveedor de IA, hasta que el DNI se reconozca entre los clientes de la cartera de la agencia. Después, entrega solo información de ese cliente mientras dure la conversación (RF-ATE-03).

#### Scenario: Primer mensaje sin DNI
- **WHEN** un número que no se identificó en la conversación abierta escribe un mensaje que no es un DNI
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
- **WHEN** un número cuyo DNI ya se reconoció en la conversación abierta escribe otra consulta, aunque el backend se haya reiniciado entre medio
- **THEN** el asistente la atiende con los datos del mismo cliente, sin volver a pedir el DNI

#### Scenario: Reinicio del backend
- **WHEN** el backend se reinicia mientras una persona está dando su DNI y después la persona vuelve a escribir en la misma conversación
- **THEN** el asistente sigue desde donde estaba: conserva la consulta guardada, los DNI no reconocidos y si esperaba la respuesta a «¿es cliente nuevo?» o el nombre

#### Scenario: Cliente cargado por error
- **WHEN** el DNI escrito es el de un cliente marcado en la cartera como cargado por error
- **THEN** el asistente no lo reconoce y sigue el flujo de DNI no reconocido

### Requirement: DNI no reconocido y cliente nuevo

El sistema SHALL preguntar si es cliente nuevo cuando un DNI no se reconoce. Si la persona dice que no, vuelve a pedirle el DNI tantas veces más como indica el parámetro de reintentos de DNI de la configuración (3) y, si sigue sin reconocerse, deriva la conversación a un operador (RF-ATE-03).

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
- **WHEN** la persona escribe un DNI que no se reconoce y ya agotó los reintentos del parámetro de la configuración (con el valor 3, es el cuarto DNI no reconocido)
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Es cliente nuevo
- **WHEN** a la pregunta de si es cliente nuevo la persona contesta que sí
- **THEN** el asistente le pide su nombre y apellido y, con el mensaje siguiente, la registra como prospecto, le manda el mensaje de derivación y deja de responder en esa conversación, sin darla de alta como cliente

#### Scenario: Base sin la cartera migrada
- **WHEN** la base no tiene cargada la planilla histórica y una persona escribe su DNI
- **THEN** el DNI no se reconoce y el asistente sigue el flujo de DNI no reconocido

### Requirement: Vencimiento y estado de todas las pólizas

El sistema SHALL responder la consulta de vencimiento o de estado con todas las pólizas que el cliente identificado tiene en la cartera, salvo las marcadas como cargadas por error, juntas, una línea por póliza con el número, el ramo y el dato pedido. Una póliza se informa como vencida cuando su fecha de vencimiento es anterior a la fecha de hoy en Argentina (RF-ATE-01).

#### Scenario: Cliente con varias pólizas
- **WHEN** un cliente identificado con dos pólizas pregunta cuándo vencen
- **THEN** la respuesta tiene una línea por cada póliza, con su número, su ramo y su fecha de vencimiento

#### Scenario: Póliza vencida
- **WHEN** un cliente pregunta el estado de una póliza activa cuya fecha de vencimiento ya pasó en Argentina
- **THEN** la respuesta informa esa póliza como vencida

#### Scenario: Cliente sin pólizas
- **WHEN** un cliente identificado que no tiene pólizas pregunta el vencimiento o el estado
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Póliza cargada por error
- **WHEN** un cliente identificado pregunta el vencimiento y una de sus pólizas está marcada en la cartera como cargada por error
- **THEN** esa póliza no aparece en la respuesta; si era la única, la consulta se deriva como la de un cliente sin pólizas

## ADDED Requirements

### Requirement: La conversación termina por inactividad

El sistema SHALL dar por terminada la conversación de un número cuando ese número vuelve a escribir y pasaron más minutos que los de inactividad de la configuración (30, provisorio) desde el último mensaje, salvo que la conversación tenga un caso derivado sin cerrar; y SHALL volver a pedir el DNI en la conversación nueva (RF-ATE-03).

#### Scenario: Mensaje después de la inactividad
- **WHEN** un cliente identificado vuelve a escribir cuando el último mensaje de la conversación es de hace más minutos que los de la configuración, y su conversación no tiene un caso derivado sin cerrar
- **THEN** la conversación anterior queda terminada a la hora en que se cumplió el plazo o, si después se cerró un caso derivado, a la hora del cierre más reciente; el mensaje abre una conversación nueva y el asistente le pide el DNI, guardando ese mensaje como la consulta a responder

#### Scenario: Mensaje dentro del plazo
- **WHEN** un cliente identificado vuelve a escribir antes de que se cumplan los minutos de inactividad
- **THEN** el mensaje sigue en la misma conversación y el asistente no le vuelve a pedir el DNI

#### Scenario: Conversación con el caso derivado ya cerrado
- **WHEN** el caso derivado de una conversación se cerró cuando ya habían pasado más minutos que los de inactividad desde el último mensaje de la conversación, y el cliente vuelve a escribir
- **THEN** la conversación anterior queda terminada a la hora del cierre del caso, el mensaje abre una conversación nueva y el asistente le pide el DNI

#### Scenario: Casos que se cierran con la conversación
- **WHEN** una conversación termina por inactividad
- **THEN** se cierran sus casos no derivados que no tienen una alerta sin atender ni una solicitud sin decidir, y quedan sin responsable; los demás casos siguen como estaban

### Requirement: El cliente nuevo queda como prospecto

El sistema SHALL registrar como prospecto pendiente de confirmación a la persona que dice ser cliente nueva, con el nombre y el DNI que declaró, sin darla de alta como cliente: el alta la confirma un operador (RF-ATE-05).

#### Scenario: Prospecto registrado
- **WHEN** la persona contesta que es cliente nueva y después escribe su nombre y apellido
- **THEN** queda un prospecto en estado pendiente, en el caso derivado de esa conversación, con el nombre como nombre declarado y el último DNI no reconocido como DNI declarado, los dos tal como los escribió, y no se crea ningún cliente

#### Scenario: Un prospecto sin confirmar no se identifica
- **WHEN** una persona registrada como prospecto escribe su DNI en una conversación posterior, sin que un operador haya confirmado el alta
- **THEN** el DNI no se reconoce y el asistente sigue el flujo de DNI no reconocido
