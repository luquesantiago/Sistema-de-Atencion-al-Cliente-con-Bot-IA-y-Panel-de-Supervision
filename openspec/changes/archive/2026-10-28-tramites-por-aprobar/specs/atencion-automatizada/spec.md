## ADDED Requirements

### Requirement: Trámites muestra las altas pendientes con su evidencia

El sistema SHALL mostrar en Trámites por Aprobar cada prospecto pendiente con el nombre declarado, el DNI declarado, el teléfono de la conversación, la fecha de la solicitud y la foto del DNI pedida a WhatsApp en el momento y sin guardarla, ordenados del más antiguo al más reciente, sin crear ningún cliente mientras el prospecto siga pendiente (RF-ATE-05).

#### Scenario: Lista de altas ordenada por antigüedad
- **WHEN** hay dos prospectos pendientes, uno solicitado el 20/10/2026 y otro el 22/10/2026
- **THEN** la pantalla muestra primero el del 20/10/2026 y después el del 22/10/2026, cada uno con el nombre declarado, el DNI, el teléfono de la conversación y la fecha

#### Scenario: Foto del DNI a pedido
- **WHEN** la persona autorizada abre el detalle de un prospecto y pide ver la foto del DNI
- **THEN** la pantalla trae la imagen desde WhatsApp en ese momento, la muestra sin guardar una copia y aclara que no se conserva

#### Scenario: Foto no disponible
- **WHEN** la conversación del prospecto no tiene una foto guardada, la imagen ya no está disponible en WhatsApp o falla el pedido de la imagen
- **THEN** la pantalla lo informa y no crea ni modifica ningún dato del prospecto

#### Scenario: Prospecto sin DNI declarado
- **WHEN** un prospecto pendiente no tiene DNI declarado
- **THEN** la pantalla muestra «No informado» y no permite aprobar el alta, aunque sí permite rechazarla

### Requirement: El alta se aprueba o rechaza desde Trámites

El sistema SHALL permitir que una persona autorizada apruebe o rechace un prospecto pendiente desde Trámites por Aprobar, con un fundamento de entre 3 y 2000 caracteres y una confirmación que muestre los cambios, sin permitir modificar el DNI y sí el nombre y el apellido; al aprobar SHALL crear el cliente con el DNI declarado, vincularle el teléfono de la conversación y cerrar el caso, y al rechazar SHALL descartar el prospecto sin crear un cliente y dejar el caso abierto en la Bandeja de Atención, a cargo de quien rechazó y en silencio, para que le explique el rechazo al cliente (RF-ATE-05).

#### Scenario: Aprobar un alta con el nombre revisado
- **WHEN** la persona autorizada corrige el nombre o el apellido, escribe un fundamento válido y confirma la aprobación
- **THEN** la confirmación muestra el nombre declarado y el revisado, el DNI sin cambios y el teléfono que se vincula; al confirmar se crea el cliente con el DNI declarado, el teléfono de la conversación queda vinculado, el caso queda cerrado y el alta sale de la lista

#### Scenario: Rechazar un alta
- **WHEN** la persona autorizada escribe un fundamento válido y confirma el rechazo
- **THEN** la confirmación avisa que no se crea ningún cliente y que el caso queda en la Bandeja; al confirmar el prospecto queda descartado, no se crea ningún cliente, el caso queda abierto, tomado por quien rechazó y en silencio, y la pantalla ofrece ir a la Bandeja

#### Scenario: Fundamento inválido
- **WHEN** el fundamento tiene menos de 3 o más de 2000 caracteres
- **THEN** la pantalla no permite aprobar ni rechazar y no envía la decisión

#### Scenario: El alta ya no está pendiente
- **WHEN** la persona autorizada confirma una decisión sobre un alta que otra persona ya resolvió
- **THEN** la pantalla avisa que el trámite ya no está pendiente y actualiza la lista

#### Scenario: Decisión atribuida al usuario del panel
- **WHEN** el panel todavía no tiene autenticación real y se aprueba o rechaza un alta
- **THEN** la decisión queda atribuida al usuario de prueba operador, con la fecha y el fundamento
