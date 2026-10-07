# Spec Delta

## REMOVED Requirements

### Requirement: El asistente pide el DNI antes de responder
**Reason**: Un número vinculado a un solo cliente activo identifica sin DNI y un número no vinculado pregunta primero si la persona ya es cliente o es nueva (reglas 1 y 2 de AGENTS.md, PR #18 y decisión del 07/10/2026).
**Migration**: Lo reemplaza «El asistente identifica al cliente antes de responder».

### Requirement: DNI no reconocido y cliente nuevo
**Reason**: La respuesta a «¿ya es cliente o es nuevo?» la clasifica la IA, un DNI no reconocido vuelve a esa pregunta y el cliente nuevo da nombre, DNI y foto (regla 2 de AGENTS.md y PR #18).
**Migration**: Lo reemplazan «DNI no reconocido» y «El cliente nuevo queda como prospecto».

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
- **WHEN** el cliente manda un audio, una foto u otro archivo sin texto, y no se está esperando la foto del DNI de un cliente nuevo ni la conversación está en silencio
- **THEN** el mensaje no se procesa, no se guarda, no se le responde y el aviso queda registrado en el log del backend

#### Scenario: Foto del DNI de un cliente nuevo
- **WHEN** el asistente le pidió la foto del DNI a un cliente nuevo y el cliente manda una foto
- **THEN** el asistente la toma como la foto pedida, no guarda una copia de la imagen y deja guardado un mensaje del cliente con un texto que dice que mandó la foto

#### Scenario: Foto en una conversación en silencio
- **WHEN** el cliente manda una foto en una conversación en la que el asistente dejó de responder
- **THEN** el asistente no le contesta, no guarda una copia de la imagen y deja guardado en el caso derivado un mensaje del cliente con un texto que dice que mandó una imagen

### Requirement: La acción sale de la intención

El sistema SHALL hacer con cada mensaje de un cliente identificado una sola de estas cosas: ignorar, responder, derivar o mandar a aprobar. El proveedor de IA elige la intención del mensaje de una lista cerrada (los tipos de consulta de la agencia, más «no es de seguros» y «no sé»), y la acción la decide el sistema según esa intención, no el texto que genere el modelo. El asistente contesta lo que no implica riesgo y no contesta lo que no es una consulta para la agencia (RF-ATE-01).

#### Scenario: Consulta de vencimiento o de estado
- **WHEN** la intención elegida es vencimiento o estado de póliza
- **THEN** el asistente responde con los datos de las pólizas del cliente

#### Scenario: Saludo o agradecimiento
- **WHEN** la intención elegida es saludo, incluido un agradecimiento
- **THEN** el asistente responde con una cortesía y le ofrece ayuda, sin derivar

#### Scenario: Pedido de cambio de teléfono
- **WHEN** la intención elegida es cambio de teléfono
- **THEN** el asistente le pide, sin pedirle una redacción al proveedor de IA, que escriba desde el número nuevo, no cambia ningún dato y sigue atendiendo en esa conversación

#### Scenario: Mensaje que no es de seguros
- **WHEN** la intención elegida es «no es de seguros»
- **THEN** el asistente no contesta ni deriva, y queda una línea en el log del backend sin el texto del mensaje

#### Scenario: Consulta que no es de seguros guardada antes del DNI
- **WHEN** el cliente queda identificado y la consulta guardada resulta no ser de seguros
- **THEN** el asistente no responde esa consulta y le pregunta en qué lo puede ayudar

#### Scenario: Consulta que se deriva
- **WHEN** la intención elegida es «no sé», o es saldo, cobertura o reclamo
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Falla del proveedor de IA al decidir
- **WHEN** el proveedor de IA no responde, responde con error o devuelve algo que no es una de las opciones de la lista, al clasificar si la persona ya es cliente o al elegir la intención
- **THEN** el asistente le manda el mensaje de derivación, sin mencionar la falla, bots ni inteligencia artificial, y deja de responder en esa conversación

### Requirement: Vencimiento y estado de todas las pólizas

El sistema SHALL responder la consulta de vencimiento o de estado con todas las pólizas que el cliente identificado tiene en la cartera, salvo las marcadas como cargadas por error, juntas, una línea por póliza con el número, el ramo y el dato pedido, ordenadas por número de póliza. Una póliza se informa como vencida cuando su fecha de vencimiento es anterior a la fecha de hoy en Argentina (RF-ATE-01).

#### Scenario: Cliente con varias pólizas
- **WHEN** un cliente identificado con dos pólizas pregunta cuándo vencen
- **THEN** la respuesta tiene una línea por cada póliza, ordenadas por número, con su número, su ramo y su fecha de vencimiento

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

### Requirement: El asistente identifica al cliente antes de responder

El sistema SHALL identificar al cliente de cada conversación antes de responder ninguna consulta y entregarle solo información de ese cliente mientras dure la conversación. Un número vinculado a un solo cliente activo identifica a ese cliente; un número vinculado a varios clientes pide el DNI; un número no vinculado pregunta primero si la persona ya es cliente o si es nueva, y la IA clasifica la respuesta como cliente existente, cliente nuevo o ajena (RF-ATE-03).

#### Scenario: Número vinculado a un solo cliente
- **WHEN** escribe un número vinculado a un solo cliente activo de la cartera
- **THEN** la conversación queda identificada con ese cliente, el asistente no le pide el DNI y atiende ese primer mensaje con los datos de ese cliente

#### Scenario: Número vinculado a varios clientes
- **WHEN** escribe un número vinculado a más de un cliente activo
- **THEN** el asistente le pide el DNI, guarda ese primer mensaje como la consulta a responder y no envía nada al proveedor de IA

#### Scenario: Número no vinculado
- **WHEN** escribe un número que no está vinculado a ningún cliente activo
- **THEN** el asistente le pregunta si ya es cliente o si es nuevo y guarda ese primer mensaje como la consulta a responder

#### Scenario: Respuesta ajena o ambigua
- **WHEN** a la pregunta de si ya es cliente o es nuevo la persona contesta algo que la IA clasifica como ajeno o ambiguo
- **THEN** el asistente vuelve a preguntarle si ya es cliente o si es nuevo

#### Scenario: Ya es cliente
- **WHEN** a la pregunta de si ya es cliente o es nuevo la persona contesta que ya es cliente
- **THEN** el asistente le pide el DNI

#### Scenario: Otro mensaje sin DNI cuando se espera el DNI
- **WHEN** el asistente le pidió el DNI y la persona escribe algo que no es un DNI
- **THEN** el asistente le vuelve a pedir el DNI, conserva como consulta a responder el primer mensaje y no cuenta un intento de DNI no reconocido

#### Scenario: DNI reconocido con una consulta guardada
- **WHEN** desde un número vinculado a varios clientes, la persona escribe el DNI de uno de esos clientes y antes había escrito una consulta
- **THEN** el asistente atiende esa consulta guardada, con los datos del cliente de ese DNI

#### Scenario: DNI reconocido sin consulta guardada
- **WHEN** desde un número vinculado a varios clientes, el primer mensaje es el DNI de uno de esos clientes
- **THEN** el asistente le pregunta en qué lo puede ayudar

#### Scenario: DNI de un cliente no vinculado al número
- **WHEN** desde un número vinculado a uno o más clientes, la persona da el DNI de un cliente que no está vinculado a ese número
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Otro DNI en una conversación identificada
- **WHEN** en una conversación ya identificada la persona escribe un DNI distinto del DNI del cliente identificado
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Cliente ya identificado
- **WHEN** en una conversación ya identificada, sin que el backend se haya reiniciado, el cliente escribe otra consulta
- **THEN** el asistente la atiende con los datos del mismo cliente, sin volver a pedir el DNI

#### Scenario: Reinicio del backend
- **WHEN** el backend se reinicia y después escribe un número cuya conversación abierta no está en silencio
- **THEN** esa conversación termina, el mensaje abre una conversación nueva y la identificación empieza de nuevo

#### Scenario: Cliente cargado por error
- **WHEN** el DNI escrito es el de un cliente marcado en la cartera como cargado por error, o el número está vinculado solo a clientes cargados por error
- **THEN** el asistente no lo reconoce: el DNI sigue el flujo de DNI no reconocido y el número se atiende como no vinculado

### Requirement: DNI no reconocido

El sistema SHALL volver a preguntar si la persona ya es cliente o si es nueva cada vez que un DNI no se reconoce, pedirle de nuevo el DNI si contesta que ya es cliente y, cuando los DNI no reconocidos superan los reintentos del parámetro de la configuración (3), derivar la conversación a un operador (RF-ATE-03).

#### Scenario: Mensaje con una fecha o un número que no es un DNI
- **WHEN** una persona a la que se le pidió el DNI escribe un mensaje con una fecha, o con un número que no tiene la forma de un DNI de 7 u 8 dígitos
- **THEN** el asistente no lo toma como un DNI ni como un intento: le vuelve a pedir el DNI

#### Scenario: DNI no reconocido
- **WHEN** la persona escribe un DNI que no se reconoce y todavía no agotó los reintentos
- **THEN** el asistente le pregunta si ya es cliente o si es nuevo

#### Scenario: La consulta guardada sobrevive a un DNI no reconocido
- **WHEN** la persona escribió una consulta, dio un DNI que no se reconoce, contestó que ya es cliente y después da el DNI de uno de los clientes vinculados al número
- **THEN** el asistente atiende la consulta que escribió primero

#### Scenario: Cuarto DNI no reconocido
- **WHEN** la persona escribe un DNI que no se reconoce y ya agotó los reintentos del parámetro de la configuración (con el valor 3, es el cuarto DNI no reconocido)
- **THEN** el asistente le manda el mensaje de derivación y deja de responder en esa conversación

#### Scenario: Es cliente nuevo
- **WHEN** a la pregunta de si ya es cliente o es nuevo la persona contesta que es nueva
- **THEN** el asistente le pide su nombre y apellido, después su DNI y después una foto del DNI

#### Scenario: Base sin la cartera migrada
- **WHEN** la base no tiene cargada la planilla histórica y una persona escribe su DNI
- **THEN** el DNI no se reconoce y el asistente sigue el flujo de DNI no reconocido

### Requirement: La conversación termina por inactividad

El sistema SHALL dar por terminada la conversación de un número cuando ese número vuelve a escribir y pasaron más minutos que los de inactividad de la configuración (30, provisorio) desde el último mensaje, salvo que la conversación esté en silencio o tenga un caso derivado sin cerrar; y SHALL empezar de nuevo la identificación en la conversación nueva (RF-ATE-03).

#### Scenario: Mensaje después de la inactividad
- **WHEN** un cliente identificado vuelve a escribir cuando el último mensaje de la conversación es de hace más minutos que los de la configuración, y su conversación no está en silencio ni tiene un caso derivado sin cerrar
- **THEN** la conversación anterior queda terminada a la hora en que se cumplió el plazo o, si después se cerró un caso derivado, a la hora del cierre más reciente; el mensaje abre una conversación nueva y la identificación empieza de nuevo, con ese mensaje como la consulta a responder

#### Scenario: Mensaje dentro del plazo
- **WHEN** un cliente identificado vuelve a escribir antes de que se cumplan los minutos de inactividad
- **THEN** el mensaje sigue en la misma conversación y el asistente no le vuelve a pedir que se identifique

#### Scenario: Conversación con el caso derivado ya cerrado
- **WHEN** el caso derivado de una conversación se cerró cuando ya habían pasado más minutos que los de inactividad desde el último mensaje de la conversación, la conversación ya no está en silencio y el cliente vuelve a escribir
- **THEN** la conversación anterior queda terminada a la hora del cierre del caso, el mensaje abre una conversación nueva y la identificación empieza de nuevo

#### Scenario: Casos que se cierran con la conversación
- **WHEN** una conversación termina por inactividad o porque se reinició el backend
- **THEN** se cierran sus casos no derivados que no tienen una alerta sin atender ni una solicitud sin decidir, y quedan sin responsable; los demás casos siguen como estaban

### Requirement: El cliente nuevo queda como prospecto

El sistema SHALL registrar como prospecto pendiente de confirmación a la persona que dice ser cliente nueva, con el nombre y el DNI que declaró, después de recibir la foto de su DNI, sin guardar una copia de la foto ni darla de alta como cliente: el alta la confirma un operador (RF-ATE-05).

#### Scenario: Prospecto registrado
- **WHEN** la persona que dijo ser nueva escribe su nombre y apellido, después un DNI que no es de ningún cliente y después manda una foto
- **THEN** queda un prospecto en estado pendiente, en un caso derivado de la conversación abierta, con el nombre como nombre declarado y ese DNI como DNI declarado; el asistente le avisa que un miembro autorizado del equipo va a revisar la solicitud, sin prometer tiempos, y deja de responder en esa conversación; no se crea ningún cliente

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
- **THEN** el prospecto queda descartado, no se crea ningún cliente, el caso queda cerrado con el operador como responsable y, si no queda otro caso derivado sin cerrar, la conversación deja de estar en silencio
