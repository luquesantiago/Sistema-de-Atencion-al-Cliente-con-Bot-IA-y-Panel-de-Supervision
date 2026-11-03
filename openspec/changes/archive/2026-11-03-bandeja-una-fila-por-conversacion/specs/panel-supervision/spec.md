## MODIFIED Requirements

### Requirement: Bandeja de atención de casos abiertos

El sistema SHALL mostrar en la Bandeja de Atención del panel una fila por cada conversación que tenga algún caso sin cerrar (`fecha_cierre IS NULL`), incluidos los casos atendidos por el asistente que no están derivados ni tienen un pendiente operativo; la fila representa al caso más relevante de esa conversación: el derivado si lo hay, si no el que tiene una solicitud de cambio de teléfono pendiente y, si no, el más reciente, y muestra los datos y permite las acciones de ese caso. Las filas se ordenan primero por gravedad, después los que no tienen responsable y después por mayor tiempo de espera, con la gravedad escrita y no solo en color, el cliente, el tipo de consulta, el motivo de la derivación cuando exista, el último mensaje, el responsable y el estado de derivación, y actualizándose sola cada pocos segundos mientras está abierta (RF-SUP-02). La gravedad de un caso es la más grave entre el nivel de riesgo del caso, el de sus alertas sin atender y el que corresponde a su tipo de consulta según la regla de derivación; un caso sin ninguno de los tres se muestra «Sin nivel», después de los de nivel bajo. La espera se cuenta desde la derivación o, si el caso no se derivó, desde la solicitud pendiente. Las fechas se muestran en hora argentina. Desde la bandeja, un empleado puede tomar, contestar y cerrar casos según los requirements de `derivacion-seguimiento`; los casos no derivados se muestran en modo de solo lectura.

El sistema SHALL calcular `handedOff` como verdadero únicamente cuando `caso.fecha_derivacion IS NOT NULL`, y como falso cuando `caso.fecha_derivacion IS NULL` (RF-SUP-01, RF-SUP-02).

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

#### Scenario: Todos incluye casos derivados y no derivados
- **WHEN** hay un caso abierto derivado en una conversación y otro caso abierto atendido por el asistente sin derivación ni pendiente operativo en otra conversación
- **THEN** la pestaña «Todos» muestra las dos conversaciones

#### Scenario: Una conversación con varias consultas es una sola fila
- **WHEN** en una misma conversación el asistente respondió saldo, estado y vencimiento y los tres casos siguen sin cerrar
- **THEN** la bandeja muestra una sola fila para esa conversación, con el caso de vencimiento, que es el más reciente, y el total cuenta una conversación

#### Scenario: El caso derivado representa a su conversación
- **WHEN** una conversación tiene un caso de saldo respondido por el asistente y, después, un caso de siniestro derivado, los dos sin cerrar
- **THEN** la bandeja muestra una sola fila con el caso de siniestro, su gravedad y sus acciones, y la pestaña «Derivados» la incluye

#### Scenario: El detalle de cualquier caso abierto sigue disponible
- **WHEN** se pide el detalle de un caso abierto que no es el que representa a su conversación
- **THEN** el panel muestra la conversación completa de ese caso

#### Scenario: Derivados solo incluye casos derivados
- **WHEN** hay casos abiertos con y sin fecha de derivación
- **THEN** la pestaña «Derivados» muestra únicamente las filas cuyo caso tiene `handedOff` verdadero

#### Scenario: Un caso cerrado no aparece
- **WHEN** un caso tiene `fecha_cierre` no nula
- **THEN** no aparece en ninguna pestaña de la Bandeja

#### Scenario: El motivo no determina la derivación
- **WHEN** un caso tiene `fecha_derivacion` nula y un motivo nulo, o tiene `fecha_derivacion` no nula y el motivo es nulo
- **THEN** `handedOff` es falso en el primer caso y verdadero en el segundo

#### Scenario: La búsqueda se combina con la pestaña
- **WHEN** el usuario escribe un teléfono, nombre o patente y elige una pestaña
- **THEN** la lista conserva solo los casos que cumplen simultáneamente el filtro de la pestaña y la búsqueda, sin descartar casos cuyo cliente sea nulo

#### Scenario: El detalle conserva la conversación abierta
- **WHEN** el usuario elige un caso abierto no derivado desde «Todos»
- **THEN** el panel muestra la conversación completa y conserva `handedOff` en falso sin crear una derivación

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
- **WHEN** hay más conversaciones que las que entran en una página
- **THEN** la primera página tiene las más graves de toda la bandeja, no las más graves de una parte

#### Scenario: Paginación
- **WHEN** el panel pide la bandeja con un límite fuera de 1 a 100 o un desplazamiento negativo
- **THEN** el sistema rechaza el pedido con un error de validación, sin consultar los casos
