# Spec Delta

## MODIFIED Requirements

### Requirement: Cada conversación queda guardada

El sistema SHALL guardar cada mensaje de las conversaciones por WhatsApp que el asistente procesa, lo que escribe el cliente, lo que le envía el asistente y lo que le envía un empleado desde el panel, cada uno con su origen y su fecha y hora, en el caso de la consulta a la que pertenece, para que el equipo pueda revisar lo que preguntó el cliente y lo que se le respondió (RF-SUP-01).

#### Scenario: Consulta y respuesta
- **WHEN** un cliente identificado hace una consulta y el asistente le responde
- **THEN** el mensaje del cliente y la respuesta quedan guardados en el mismo caso, cada uno con su origen y su fecha y hora, y la respuesta queda enlazada al mensaje que responde

#### Scenario: Consulta escrita antes de identificarse
- **WHEN** el cliente escribe una consulta, el asistente le pide que se identifique y, ya identificado, responde esa consulta
- **THEN** la consulta, los mensajes de la identificación y la respuesta quedan guardados en el mismo caso, y la respuesta queda enlazada a la consulta

#### Scenario: Mensaje sin respuesta
- **WHEN** el cliente escribe un mensaje que el asistente no contesta, porque no es de seguros o porque la conversación está en silencio
- **THEN** el mensaje queda guardado igual, en un caso no cerrado de la conversación

#### Scenario: Foto sin copia
- **WHEN** el asistente procesa una foto que mandó el cliente
- **THEN** queda guardado un mensaje del cliente con un texto que dice que mandó una imagen y la referencia al mensaje de WhatsApp de esa imagen, y la imagen no se guarda

#### Scenario: Respuesta de un empleado
- **WHEN** un empleado le escribe al cliente desde la Bandeja de Atención
- **THEN** queda guardado en el caso un mensaje de origen operador con el texto enviado y su fecha y hora, y una respuesta con el empleado que la escribió

#### Scenario: Lo guardado no se pisa
- **WHEN** el asistente o un empleado guarda un mensaje nuevo
- **THEN** no borra ni modifica ningún mensaje ni respuesta guardados antes

### Requirement: Bandeja de atención priorizada por gravedad

El sistema SHALL mostrar en la Bandeja de Atención del panel los casos sin cerrar que están derivados o que tienen pendiente la decisión de un prospecto o de una solicitud de cambio de teléfono, ordenados primero por gravedad, después los que no tienen responsable y después por mayor tiempo de espera, con la gravedad escrita y no solo en color, el cliente, el tipo de consulta, el motivo de la derivación, el último mensaje, el responsable y el tiempo de espera de cada uno, y actualizándose sola cada pocos segundos mientras está abierta (RF-SUP-02, RF-DER-02). La gravedad de un caso es la más grave entre el nivel de riesgo del caso, el de sus alertas sin atender y el que corresponde a su tipo de consulta según la regla de derivación; un caso sin ninguno de los tres se muestra «Sin nivel», después de los de nivel bajo. La espera se cuenta desde la derivación o, si el caso no se derivó, desde la solicitud pendiente. Las fechas se muestran en hora argentina. Desde la bandeja, un empleado puede tomar, contestar y cerrar casos según los requirements de `derivacion-seguimiento`; mirar la bandeja no modifica nada.

#### Scenario: Orden por gravedad
- **WHEN** hay un caso derivado de reclamo, uno de siniestro grave y uno de consulta no entendida, todos sin tomar
- **THEN** la bandeja los muestra en este orden: el de siniestro con «Crítico», el de reclamo con «Alto» y el de consulta no entendida con «Bajo»

#### Scenario: A igual gravedad, primero los sin tomar
- **WHEN** hay dos casos con la misma gravedad, uno con responsable y otro sin responsable
- **THEN** el que no tiene responsable aparece primero y muestra «Sin tomar»

#### Scenario: A igual gravedad y estado, el que más espera
- **WHEN** hay dos casos sin tomar con la misma gravedad, derivados a distinta hora
- **THEN** aparece primero el que se derivó antes, con su tiempo de espera

#### Scenario: Alerta sin atender más grave que el caso
- **WHEN** un caso derivado con nivel medio tiene una alerta sin atender de nivel crítico
- **THEN** la bandeja lo muestra con gravedad «Crítico»

#### Scenario: Caso migrado sin nivel
- **WHEN** un caso migrado de la planilla sigue abierto y derivado, no tiene nivel de riesgo ni alertas sin atender y su tipo de consulta es siniestro
- **THEN** la bandeja lo muestra con gravedad «Alto», con su responsable

#### Scenario: Caso sin ningún nivel
- **WHEN** un caso derivado no tiene nivel de riesgo, ni alertas sin atender, ni un tipo de consulta con nivel
- **THEN** la bandeja lo muestra con «Sin nivel», después de los casos de nivel bajo

#### Scenario: Conversación sin cliente identificado
- **WHEN** un caso derivado pertenece a una conversación en la que nadie se identificó
- **THEN** la bandeja muestra el teléfono y «Sin identificar», y no muestra el nombre de ningún cliente, aunque el número esté vinculado a alguno

#### Scenario: Alta pendiente
- **WHEN** un caso derivado tiene un prospecto pendiente de confirmación
- **THEN** la bandeja lo muestra con la etiqueta «Alta pendiente · se decide en Trámites»

#### Scenario: Alta rechazada
- **WHEN** un caso derivado sin cerrar tiene un prospecto descartado
- **THEN** la bandeja lo muestra con la etiqueta «Alta rechazada · avisar al cliente»

#### Scenario: Baja o modificación pedida
- **WHEN** un caso derivado es de una baja o de una modificación
- **THEN** la bandeja lo muestra con la etiqueta «Pedido pendiente de aprobación»

#### Scenario: Cambio de teléfono pendiente
- **WHEN** un caso sin cerrar y sin derivar tiene una solicitud de cambio de teléfono pendiente
- **THEN** la bandeja lo muestra con la etiqueta «Cambio de teléfono pendiente · se decide en Trámites», con nivel bajo y la espera contada desde la solicitud

#### Scenario: Casos que no entran
- **WHEN** un caso está cerrado, o está abierto sin derivar y sin nada pendiente de decisión
- **THEN** la bandeja no lo muestra

#### Scenario: Caso que se cierra
- **WHEN** un empleado cierra un caso desde la bandeja
- **THEN** el caso deja de aparecer en la bandeja

#### Scenario: Bandeja vacía
- **WHEN** no hay ningún caso que cumpla las condiciones
- **THEN** la bandeja dice que no hay casos para atender

#### Scenario: La bandeja no modifica nada
- **WHEN** un usuario del panel abre la bandeja y elige casos, sin tomar, contestar ni cerrar ninguno
- **THEN** ningún caso, conversación, mensaje ni marca de silencio cambia

#### Scenario: La bandeja se actualiza sola
- **WHEN** la bandeja está abierta en el panel y el asistente deriva un caso nuevo, o el cliente de un caso abierto en el detalle escribe otro mensaje
- **THEN** a los pocos segundos la bandeja muestra el caso nuevo en su lugar del orden y el detalle muestra el mensaje nuevo, sin que el usuario recargue la página ni pierda el caso elegido

#### Scenario: El orden vale para todas las páginas
- **WHEN** hay más casos que los que entran en una página
- **THEN** la primera página tiene los más graves de toda la bandeja, no los más graves de una parte

#### Scenario: Paginación
- **WHEN** el panel pide la bandeja con un límite fuera de 1 a 100 o un desplazamiento negativo
- **THEN** el sistema rechaza el pedido con un error de validación, sin consultar los casos

### Requirement: Conversación completa de un caso de la bandeja

El sistema SHALL mostrar, al elegir un caso de la Bandeja de Atención, todos los mensajes guardados de la conversación de ese caso, en el orden en que se guardaron, con el origen de cada uno (cliente, asistente u operador), el empleado que escribió cada mensaje de origen operador, su fecha y hora en hora argentina y la marca de cuáles pertenecen al caso elegido, junto con el cliente identificado o el teléfono y «Sin identificar» y las alertas sin atender del caso con su tipo y su nivel, sin modificar nada; los mensajes que guardan la referencia a una imagen del cliente permiten verla, obtenida de WhatsApp en el momento en que se pide, sin guardar una copia en el sistema (RF-SUP-01, RF-ATE-05).

#### Scenario: Conversación derivada
- **WHEN** un usuario del panel elige un caso que el asistente derivó después de varios mensajes
- **THEN** ve los mensajes del cliente y las respuestas del asistente de toda la conversación, en orden, con origen y hora, incluido lo que el cliente escribió después de la derivación

#### Scenario: Conversación con varios casos
- **WHEN** la conversación del caso elegido tiene otros casos, por ejemplo una consulta de vencimiento respondida antes de un reclamo
- **THEN** se ven todos los mensajes de la conversación y los del caso elegido quedan marcados

#### Scenario: Mensaje de un empleado
- **WHEN** la conversación tiene un mensaje que un empleado le escribió al cliente desde la bandeja
- **THEN** se ve con origen operador y el nombre del empleado que lo escribió

#### Scenario: Foto del DNI de un cliente nuevo
- **WHEN** un usuario del panel elige el caso de un alta pendiente y pide ver la foto del DNI que mandó la persona
- **THEN** ve la imagen, obtenida de WhatsApp en ese momento; el sistema no guarda una copia de la imagen y el navegador no la conserva en caché

#### Scenario: Imagen después de derivar
- **WHEN** el cliente mandó una foto a una conversación en silencio y un usuario del panel pide verla
- **THEN** ve la imagen, obtenida de WhatsApp en ese momento, sin que el sistema guarde una copia

#### Scenario: Imagen que ya no está disponible
- **WHEN** un usuario del panel pide ver una imagen que WhatsApp ya no entrega
- **THEN** el panel dice que la imagen ya no está disponible y el resto de la conversación se sigue viendo

#### Scenario: Imagen sin referencia
- **WHEN** la conversación tiene un mensaje de imagen guardado antes de este cambio, sin referencia al mensaje de WhatsApp
- **THEN** se ve el texto que dice que el cliente mandó una imagen, sin opción de verla

#### Scenario: Imagen de una conversación que no está en la bandeja
- **WHEN** el panel pide la imagen de un mensaje que no pertenece a la conversación del caso elegido, o de un caso que no está en la bandeja
- **THEN** el sistema responde que no la encontró y no consulta WhatsApp

#### Scenario: Caso que no está en la bandeja
- **WHEN** el panel pide el detalle de un caso cerrado o de un caso abierto sin derivar y sin nada pendiente
- **THEN** el sistema responde que no lo encontró en la bandeja, sin mostrar la conversación

#### Scenario: Identificador inválido
- **WHEN** el panel pide el detalle con un identificador de caso que no es un entero positivo
- **THEN** el sistema rechaza el pedido con un error de validación

## ADDED Requirements

### Requirement: Un caso con alertas sin atender se cierra con revisión explícita

El sistema SHALL rechazar el cierre de un caso que tiene alertas sin atender, salvo que quien lo cierra confirme en el mismo pedido que las revisó; con esa confirmación, el caso se cierra y cada una de esas alertas queda atendida por quien cerró, con la fecha y hora del cierre (RF-SUP-04).

#### Scenario: Cierre sin confirmar la revisión
- **WHEN** el responsable de un caso derivado con una alerta sin atender intenta cerrarlo sin confirmar que la revisó
- **THEN** el sistema rechaza el cierre indicando que hay alertas sin revisar, el panel las muestra con su tipo y su nivel, y el caso y las alertas no cambian

#### Scenario: Cierre con la revisión confirmada
- **WHEN** el responsable de un caso derivado con dos alertas sin atender lo cierra confirmando que las revisó
- **THEN** el caso queda cerrado y las dos alertas quedan atendidas por ese empleado, con la fecha y hora del cierre

#### Scenario: Caso sin alertas pendientes
- **WHEN** el responsable cierra un caso derivado cuyas alertas ya están atendidas o que no tiene alertas
- **THEN** el sistema no le pide confirmar ninguna revisión
