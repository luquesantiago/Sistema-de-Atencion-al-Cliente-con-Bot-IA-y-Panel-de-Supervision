# derivacion-seguimiento Specification

## Purpose
Módulo «Derivación y seguimiento» de `docs/requisitos.md`: el paso de una consulta a una persona, el responsable de cada caso derivado, su seguimiento hasta el cierre, el silencio del asistente mientras el caso está abierto y la derivación fuera de horario (RF-DER-01 a RF-DER-04).

## Requirements

### Requirement: El asistente se calla después de derivar

El sistema SHALL hacer que, una vez que el asistente mandó en una conversación el mensaje de derivación, el aviso de que el pedido de baja o de modificación queda en revisión, o el aviso de que el alta del cliente nuevo queda en revisión, el asistente deje de responder por completo en esa conversación hasta que se cierre el caso derivado, y que lo que el cliente siga escribiendo quede guardado en ese caso (RF-DER-03).

#### Scenario: Mensaje después de una derivación
- **WHEN** un número al que el asistente ya le mandó el mensaje de derivación en la conversación abierta vuelve a escribir
- **THEN** el asistente no le contesta, no envía el mensaje al proveedor de IA, el mensaje queda guardado en el caso derivado y queda una línea en el log del backend sin el texto del mensaje

#### Scenario: Mensaje después de mandar a aprobar
- **WHEN** un número al que el asistente ya le avisó que su pedido de baja o de modificación, o su alta como cliente nuevo, queda en revisión vuelve a escribir
- **THEN** el asistente no le contesta ni envía el mensaje al proveedor de IA, y el mensaje queda guardado en el caso derivado

#### Scenario: Otro número
- **WHEN** el asistente derivó la conversación de un número y escribe otro número distinto
- **THEN** el asistente atiende al otro número de forma normal

#### Scenario: Reinicio del backend
- **WHEN** el backend se reinicia y después escribe un número cuya conversación estaba en silencio
- **THEN** el asistente sigue sin contestarle y el mensaje queda guardado en el caso derivado

#### Scenario: La inactividad no termina una conversación derivada
- **WHEN** un número cuya conversación tiene un caso derivado sin cerrar vuelve a escribir después de los minutos de inactividad de la configuración
- **THEN** la conversación sigue abierta, el asistente no le contesta ni le pide que se identifique y el mensaje queda guardado en el caso derivado

#### Scenario: Conversación migrada abierta
- **WHEN** escribe un número que tiene una conversación migrada de la planilla todavía abierta, con un caso derivado sin cerrar
- **THEN** el asistente no le contesta y el mensaje queda guardado en ese caso

#### Scenario: Conversación que deja de estar en silencio
- **WHEN** se cierra el último caso derivado sin cerrar de una conversación abierta, por ejemplo con la decisión del alta de un cliente nuevo, y la conversación deja de estar en silencio
- **THEN** el asistente vuelve a atender: si el último mensaje de la conversación es de hace menos minutos que los de inactividad y el backend no se reinició, sigue en la misma conversación y, si el cliente ya estaba identificado en ella, no le vuelve a pedir que se identifique, y si no, la identificación empieza de nuevo; si no, la conversación termina y el mensaje abre una conversación nueva

#### Scenario: La solicitud de cambio de teléfono no calla al asistente
- **WHEN** en la conversación quedó pendiente una solicitud de cambio de teléfono y el cliente vuelve a escribir
- **THEN** el asistente lo sigue atendiendo como cliente identificado

### Requirement: El asistente registra el nivel de riesgo al derivar

El sistema SHALL registrar en el caso, en el mismo momento en que el asistente lo deriva, un nivel de riesgo del catálogo (crítico, alto, medio o bajo) que sale del tipo de consulta del caso y del motivo de la derivación, quedándose con el más grave de los dos cuando aplican ambos, y SHALL registrar el nivel bajo en el caso de una solicitud de cambio de teléfono pendiente, aunque ese caso no se derive, para que el equipo vea primero lo que más riesgo implica (RF-DER-01). Por tipo de consulta: siniestro, alto, o crítico si el siniestro es grave; reclamo, alto; cotización, cobertura, baja y modificación, medio. Por motivo: cliente nuevo, DNI no reconocido después de los reintentos, DNI de otra persona, cliente identificado que ya no está en la cartera y redacción rechazada por el control, medio; otra consulta, consulta que no se entendió, dato ausente (cliente sin pólizas, póliza sin cuotas, datos de la agencia incompletos) y falla del proveedor de IA o de la redacción, bajo. El nivel no cambia el mensaje que recibe el cliente ni la acción que decide el sistema.

#### Scenario: Reclamo
- **WHEN** un cliente identificado hace un reclamo y el asistente lo deriva
- **THEN** el caso queda derivado con nivel alto

#### Scenario: Cotización
- **WHEN** un cliente identificado pide una cotización y el asistente la deriva
- **THEN** el caso queda derivado con nivel medio

#### Scenario: Consulta que no se entiende
- **WHEN** el tercer mensaje seguido de un cliente identificado tampoco se entiende y el asistente deriva
- **THEN** el caso queda derivado con nivel bajo

#### Scenario: Cliente nuevo
- **WHEN** una persona que dice ser cliente nueva manda la foto de su DNI y el asistente registra el prospecto y deriva
- **THEN** el caso queda derivado con nivel medio

#### Scenario: DNI no reconocido
- **WHEN** el cuarto DNI que da una persona tampoco se reconoce y el asistente deriva
- **THEN** el caso queda derivado con nivel medio

#### Scenario: Gana el más grave
- **WHEN** un cliente identificado hace un reclamo y el asistente lo deriva por una falla del proveedor de IA
- **THEN** el caso queda derivado con nivel alto, no bajo

#### Scenario: Consulta respondible que se deriva por falta de dato
- **WHEN** un cliente identificado pregunta su saldo y una de sus pólizas no tiene cuotas registradas
- **THEN** el caso queda derivado con nivel bajo

#### Scenario: Cambio de teléfono pendiente
- **WHEN** el asistente registra una solicitud de cambio de teléfono pendiente
- **THEN** el caso de la solicitud queda con nivel bajo, sin derivarse, y el asistente sigue atendiendo al cliente

#### Scenario: El cliente no ve el nivel
- **WHEN** el asistente deriva un caso con cualquier nivel
- **THEN** el cliente recibe el mismo mensaje de derivación de siempre, sin mención del nivel ni de la urgencia

### Requirement: La urgencia del siniestro solo puede subir el nivel

El sistema SHALL pedirle al proveedor de IA, en la misma clasificación que elige la intención y con una lista cerrada, si el mensaje describe un siniestro grave (personas heridas, riesgo de vida o una emergencia en curso, como un incendio, una inundación activa o un vehículo varado en la ruta) o normal, y SHALL usar esa respuesta solo cuando la intención es siniestro y solo para pasar el nivel de alto a crítico: un siniestro nunca queda con un nivel menor que alto, y si la urgencia falta o no es un valor de la lista, queda alto (RF-DER-01, RF-ATE-04).

#### Scenario: Siniestro grave
- **WHEN** un cliente identificado escribe que chocó y hay una persona herida, y el proveedor de IA elige siniestro con urgencia grave
- **THEN** el asistente deriva y el caso queda con nivel crítico

#### Scenario: Siniestro normal
- **WHEN** un cliente identificado avisa que le rayaron el auto estacionado, y el proveedor de IA elige siniestro con urgencia normal
- **THEN** el asistente deriva y el caso queda con nivel alto

#### Scenario: Urgencia inválida
- **WHEN** el proveedor de IA elige siniestro y la urgencia que devuelve falta o no es grave ni normal
- **THEN** el asistente deriva igual y el caso queda con nivel alto

#### Scenario: Urgencia en otra intención
- **WHEN** el proveedor de IA elige reclamo con urgencia grave
- **THEN** la urgencia se ignora y el caso queda derivado con nivel alto, el del reclamo

#### Scenario: La urgencia no cambia la acción
- **WHEN** el proveedor de IA elige siniestro con cualquier urgencia
- **THEN** el asistente deriva sin responder la consulta, como con todo siniestro
