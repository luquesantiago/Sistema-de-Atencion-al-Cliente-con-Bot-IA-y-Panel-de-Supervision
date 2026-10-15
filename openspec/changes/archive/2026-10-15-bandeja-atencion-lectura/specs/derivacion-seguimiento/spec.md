# Spec Delta

## ADDED Requirements

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
