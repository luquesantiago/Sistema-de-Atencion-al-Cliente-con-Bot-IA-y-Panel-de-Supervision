## MODIFIED Requirements

### Requirement: Tomar un caso desde la bandeja

El sistema SHALL permitir que un empleado tome desde la Bandeja de Atención un caso que esté en la bandeja y no tenga responsable, y que desde ese momento quede como responsable del caso con la fecha y hora de la toma; un caso que tiene otro responsable no se puede tomar hasta que su responsable lo libere, y tomar un caso propio no lo cambia; tomar un caso no le envía nada al cliente ni cambia el silencio de la conversación; mientras el panel no tenga autenticación, el empleado que actúa es el usuario de prueba operador (RF-DER-02).

#### Scenario: Caso sin tomar
- **WHEN** un empleado toma un caso derivado que no tiene responsable
- **THEN** el caso queda con ese empleado como responsable y con la fecha y hora de la toma, y la bandeja deja de mostrarlo «Sin tomar»

#### Scenario: Caso de otro responsable
- **WHEN** un empleado intenta tomar un caso migrado de la planilla que tiene como responsable a Graciela
- **THEN** el sistema rechaza la toma y avisa que el caso lo tiene otra persona y que tiene que liberarlo antes, y el caso no cambia

#### Scenario: Caso propio
- **WHEN** el responsable de un caso lo vuelve a tomar
- **THEN** el caso no cambia

#### Scenario: Tomar no cambia la conversación
- **WHEN** un empleado toma un caso derivado y después el cliente escribe
- **THEN** el cliente no recibió ningún mensaje por la toma, el asistente no le contesta y el mensaje queda guardado en el caso

#### Scenario: Caso que ya no está en la bandeja
- **WHEN** un empleado intenta tomar un caso cerrado, o uno abierto sin derivar y sin nada pendiente
- **THEN** el sistema responde que el caso no está en la bandeja y el caso no cambia

#### Scenario: Toma simultánea
- **WHEN** dos empleados toman el mismo caso al mismo tiempo
- **THEN** el caso queda con uno solo de ellos como responsable y al otro el sistema le avisa que el caso cambió mientras lo tomaba

### Requirement: Contestarle al cliente desde la bandeja

El sistema SHALL permitir que un empleado le escriba desde la Bandeja de Atención al cliente de un caso derivado sin cerrar, enviando el texto por WhatsApp al número de la conversación desde el número del asistente, y guardándolo en ese caso como mensaje de origen operador y como respuesta escrita por ese empleado al último mensaje del cliente del caso; si el caso no tiene responsable, al enviar queda como responsable quien escribe, y si tiene otro responsable, el envío se rechaza, porque solo su responsable puede contestar; el asistente sigue en silencio en esa conversación hasta que se cierre el caso (RF-DER-02, RF-SUP-01).

#### Scenario: Respuesta en un caso tomado
- **WHEN** el responsable de un caso derivado le escribe al cliente desde la bandeja
- **THEN** el cliente recibe el texto por WhatsApp desde el número del asistente, el caso guarda un mensaje de origen operador con ese texto y una respuesta escrita por el empleado, enlazada al último mensaje del cliente del caso y al mensaje enviado

#### Scenario: Respuesta en un caso sin tomar
- **WHEN** un empleado le escribe al cliente de un caso derivado que no tiene responsable
- **THEN** el mensaje sale y se guarda, y el caso queda tomado por ese empleado con la fecha y hora del envío

#### Scenario: Caso de otro responsable
- **WHEN** un empleado le escribe al cliente de un caso derivado que tiene otro responsable
- **THEN** el sistema rechaza el envío y avisa que solo su responsable puede contestar, no se envía nada al cliente y el caso no cambia

#### Scenario: Caso sin derivar
- **WHEN** un empleado intenta escribirle al cliente de un caso de la bandeja que no está derivado, como el de una solicitud de cambio de teléfono pendiente
- **THEN** el sistema rechaza el envío, porque en esa conversación el asistente sigue atendiendo, y no se envía nada

#### Scenario: Texto vacío
- **WHEN** un empleado intenta enviar un texto vacío o solo con espacios
- **THEN** el sistema lo rechaza con un error de validación y no se envía nada

#### Scenario: WhatsApp no envía el mensaje
- **WHEN** un empleado le escribe al cliente y el envío por WhatsApp falla
- **THEN** el panel avisa que el mensaje no se pudo enviar, no se guarda ningún mensaje ni respuesta y el caso no queda tomado por ese envío

#### Scenario: El mensaje salió pero no se pudo guardar
- **WHEN** el mensaje salió por WhatsApp y después falla el guardado
- **THEN** el panel avisa que el mensaje se envió pero no quedó registrado, y queda una línea en el log del backend sin el texto del mensaje

#### Scenario: El asistente sigue callado
- **WHEN** un empleado le contestó al cliente y el cliente responde por WhatsApp
- **THEN** el asistente no le contesta y el mensaje del cliente queda guardado en el caso derivado

### Requirement: Cerrar un caso derivado desde la bandeja

El sistema SHALL permitir que solo el responsable de un caso derivado sin cerrar lo cierre desde la Bandeja de Atención; al cerrarlo, el caso queda con la fecha y hora de cierre y la conversación deja de estar en silencio, sin enviarle nada al cliente; si el caso tiene un prospecto pendiente o descartado, el cierre exige un motivo, que queda anotado en el prospecto con quién y cuándo cerró, y un prospecto pendiente queda descartado sin crear ningún cliente; los demás casos derivados, incluidos los de baja y modificación, se cierran sin motivo; un caso sin derivar, como el de una solicitud de cambio de teléfono pendiente, no se cierra desde la bandeja (RF-DER-02, RF-DER-03).

#### Scenario: Cierre por el responsable
- **WHEN** el responsable de un caso derivado de reclamo lo cierra
- **THEN** el caso queda cerrado con la fecha y hora de cierre, sale de la bandeja, la conversación deja de estar en silencio y el cliente no recibe ningún mensaje

#### Scenario: Caso sin responsable
- **WHEN** un empleado intenta cerrar un caso derivado que no tiene responsable
- **THEN** el sistema rechaza el cierre y pide tomar el caso primero, y el caso no cambia

#### Scenario: Caso de otro responsable
- **WHEN** un empleado intenta cerrar un caso derivado que tiene otro responsable
- **THEN** el sistema rechaza el cierre y avisa que solo su responsable puede cerrarlo, y el caso no cambia

#### Scenario: Baja o modificación
- **WHEN** el responsable de un caso derivado de una baja o de una modificación lo cierra sin motivo
- **THEN** el caso queda cerrado y la conversación deja de estar en silencio

#### Scenario: Alta pendiente sin motivo
- **WHEN** el responsable de un caso con un prospecto pendiente intenta cerrarlo sin motivo
- **THEN** el sistema lo rechaza con un error de validación, y el caso y el prospecto no cambian

#### Scenario: Alta pendiente con motivo
- **WHEN** el responsable de un caso con un prospecto pendiente lo cierra con un motivo, por ejemplo porque cargó al cliente a mano
- **THEN** el caso queda cerrado, el prospecto queda descartado con el motivo, el empleado y la fecha anotados, no se crea ningún cliente y la conversación deja de estar en silencio

#### Scenario: Alta rechazada
- **WHEN** el responsable de un caso cuyo prospecto se rechazó lo cierra con un motivo, después de explicarle al cliente el rechazo
- **THEN** el caso queda cerrado, el motivo queda anotado en el prospecto, que sigue descartado, y la conversación deja de estar en silencio

#### Scenario: Cambio de teléfono pendiente
- **WHEN** un empleado intenta cerrar desde la bandeja el caso de una solicitud de cambio de teléfono pendiente
- **THEN** el sistema rechaza el cierre, porque ese caso se cierra al decidir la solicitud en Trámites, y nada cambia

#### Scenario: Caso ya cerrado
- **WHEN** un empleado intenta cerrar un caso que se cerró mientras lo tenía abierto en el panel
- **THEN** el sistema responde que el caso no está en la bandeja y nada cambia

#### Scenario: El asistente vuelve a atender
- **WHEN** se cerró el caso derivado de una conversación y el cliente vuelve a escribir
- **THEN** el asistente lo atiende según el requirement «El asistente se calla después de derivar», en el escenario «Conversación que deja de estar en silencio»

## ADDED Requirements

### Requirement: Liberar un caso desde la bandeja

El sistema SHALL permitir que solo el responsable de un caso de la bandeja lo libere desde la Bandeja de Atención, y que el caso quede sin responsable y sin fecha de toma, sin enviarle nada al cliente y sin cambiar el silencio de la conversación: un caso derivado liberado sigue derivado y el asistente no responde en esa conversación hasta que se cierre el caso (RF-DER-02, RF-DER-03).

#### Scenario: El responsable libera un caso derivado
- **WHEN** el responsable de un caso derivado lo libera
- **THEN** el caso queda sin responsable y sin fecha de toma, la bandeja lo muestra «Sin tomar» y el cliente no recibe ningún mensaje

#### Scenario: El asistente sigue callado
- **WHEN** se liberó un caso derivado y el cliente vuelve a escribir
- **THEN** el asistente no le contesta, no abre otro caso derivado y el mensaje queda guardado en el caso derivado

#### Scenario: Caso sin responsable o de otro responsable
- **WHEN** un empleado intenta liberar un caso que no tiene responsable o que tiene otro responsable
- **THEN** el sistema rechaza el pedido y el caso no cambia

#### Scenario: Caso que ya no está en la bandeja
- **WHEN** un empleado intenta liberar un caso cerrado
- **THEN** el sistema responde que el caso no está en la bandeja y el caso no cambia
