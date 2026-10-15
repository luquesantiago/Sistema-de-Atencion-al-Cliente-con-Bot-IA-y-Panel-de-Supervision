# Spec Delta

## ADDED Requirements

### Requirement: Bandeja de atención priorizada por gravedad

El sistema SHALL mostrar en la Bandeja de Atención del panel, sin permitir modificarlos, los casos sin cerrar que están derivados o que tienen pendiente la decisión de un prospecto o de una solicitud de cambio de teléfono, ordenados primero por gravedad, después los que no tienen responsable y después por mayor tiempo de espera, con la gravedad escrita y no solo en color, el cliente, el tipo de consulta, el motivo de la derivación, el último mensaje, el responsable y el tiempo de espera de cada uno, y actualizándose sola cada pocos segundos mientras está abierta (RF-SUP-02, RF-DER-02). La gravedad de un caso es la más grave entre el nivel de riesgo del caso, el de sus alertas sin atender y el que corresponde a su tipo de consulta según la regla de derivación; un caso sin ninguno de los tres se muestra «Sin nivel», después de los de nivel bajo. La espera se cuenta desde la derivación o, si el caso no se derivó, desde la solicitud pendiente. Las fechas se muestran en hora argentina.

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

#### Scenario: Baja o modificación pedida
- **WHEN** un caso derivado es de una baja o de una modificación
- **THEN** la bandeja lo muestra con la etiqueta «Pedido pendiente de aprobación»

#### Scenario: Cambio de teléfono pendiente
- **WHEN** un caso sin cerrar y sin derivar tiene una solicitud de cambio de teléfono pendiente
- **THEN** la bandeja lo muestra con la etiqueta «Cambio de teléfono pendiente · se decide en Trámites», con nivel bajo y la espera contada desde la solicitud

#### Scenario: Casos que no entran
- **WHEN** un caso está cerrado, o está abierto sin derivar y sin nada pendiente de decisión
- **THEN** la bandeja no lo muestra

#### Scenario: Bandeja vacía
- **WHEN** no hay ningún caso que cumpla las condiciones
- **THEN** la bandeja dice que no hay casos para atender

#### Scenario: La bandeja no modifica nada
- **WHEN** un usuario del panel abre la bandeja y elige casos
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

El sistema SHALL mostrar, al elegir un caso de la Bandeja de Atención, todos los mensajes guardados de la conversación de ese caso, en el orden en que se guardaron, con el origen de cada uno (cliente, asistente u operador), su fecha y hora en hora argentina y la marca de cuáles pertenecen al caso elegido, junto con el cliente identificado o el teléfono y «Sin identificar», sin modificar nada (RF-SUP-01).

#### Scenario: Conversación derivada
- **WHEN** un usuario del panel elige un caso que el asistente derivó después de varios mensajes
- **THEN** ve los mensajes del cliente y las respuestas del asistente de toda la conversación, en orden, con origen y hora, incluido lo que el cliente escribió después de la derivación

#### Scenario: Conversación con varios casos
- **WHEN** la conversación del caso elegido tiene otros casos, por ejemplo una consulta de vencimiento respondida antes de un reclamo
- **THEN** se ven todos los mensajes de la conversación y los del caso elegido quedan marcados

#### Scenario: Caso que no está en la bandeja
- **WHEN** el panel pide el detalle de un caso cerrado o de un caso abierto sin derivar y sin nada pendiente
- **THEN** el sistema responde que no lo encontró en la bandeja, sin mostrar la conversación

#### Scenario: Identificador inválido
- **WHEN** el panel pide el detalle con un identificador de caso que no es un entero positivo
- **THEN** el sistema rechaza el pedido con un error de validación
