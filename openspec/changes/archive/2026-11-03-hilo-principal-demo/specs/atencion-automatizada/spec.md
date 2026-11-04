## MODIFIED Requirements

### Requirement: El alta se aprueba o rechaza desde Trámites

El sistema SHALL permitir que una persona autorizada apruebe o rechace un prospecto pendiente desde Trámites por Aprobar, con un fundamento de entre 3 y 2000 caracteres y una confirmación que muestre los cambios, sin permitir modificar el DNI y sí el nombre y el apellido; al aprobar SHALL crear el cliente con el DNI declarado, vincularle el teléfono de la conversación, cerrar el caso, avisarle al cliente por WhatsApp que el alta quedó confirmada y ofrecer ir a la ficha del cliente nuevo en Base de Clientes, y si el aviso falla SHALL mantener la decisión registrada, avisar en el panel y ofrecer reintentar el aviso; y al rechazar SHALL descartar el prospecto sin crear un cliente y dejar el caso abierto en la Bandeja de Atención, a cargo de quien rechazó y en silencio, para que le explique el rechazo al cliente (RF-ATE-05).

#### Scenario: Aprobar un alta con el nombre revisado
- **WHEN** la persona autorizada corrige el nombre o el apellido, escribe un fundamento válido y confirma la aprobación
- **THEN** la confirmación muestra el nombre declarado y el revisado, el DNI sin cambios, el teléfono que se vincula y el aviso por WhatsApp a ese teléfono; al confirmar se crea el cliente con el DNI declarado, el teléfono de la conversación queda vinculado, el caso queda cerrado y el alta sale de la lista

#### Scenario: El cliente recibe el aviso del alta
- **WHEN** se aprueba un alta y WhatsApp envía el aviso
- **THEN** el cliente recibe en el teléfono de la conversación el texto fijo «Su alta como cliente de Seguros Castaño fue confirmada. Desde ahora puede consultarnos por este WhatsApp sobre sus pólizas.», sin redacción del proveedor de IA; el aviso queda guardado como mensaje del asistente en el caso del alta, y la pantalla confirma que el cliente recibió el aviso

#### Scenario: El aviso del alta falla
- **WHEN** se aprueba un alta pero el aviso por WhatsApp no se puede enviar
- **THEN** el cliente queda creado y el teléfono vinculado igual, no queda guardado ningún mensaje del aviso, la pantalla avisa que no se pudo avisar al cliente y ofrece reintentar el aviso

#### Scenario: Reintentar el aviso del alta
- **WHEN** la persona autorizada reintenta el aviso de un alta ya aprobada
- **THEN** si WhatsApp lo envía, la pantalla confirma que el cliente recibió el aviso y no vuelve a aplicar la decisión; si vuelve a fallar, la pantalla avisa que todavía no se pudo enviar y permite reintentar de nuevo

#### Scenario: Reintentar el aviso de un alta que no está aprobada
- **WHEN** se pide reintentar el aviso de un prospecto pendiente o descartado
- **THEN** el sistema no envía nada y responde que el alta no tiene un aviso de aprobación para enviar

#### Scenario: Ir a la ficha del cliente nuevo
- **WHEN** la aprobación se aplicó y la persona autorizada elige «Ir a la ficha del cliente»
- **THEN** el panel abre Base de Clientes con la ficha del cliente recién creado

#### Scenario: El cliente aprobado escribe de nuevo
- **WHEN** después de la aprobación el cliente escribe desde el teléfono de la conversación, que solo está vinculado a él
- **THEN** el asistente lo atiende como cliente identificado sin pedirle el DNI

#### Scenario: Rechazar un alta
- **WHEN** la persona autorizada escribe un fundamento válido y confirma el rechazo
- **THEN** la confirmación avisa que no se crea ningún cliente y que el caso queda en la Bandeja; al confirmar el prospecto queda descartado, no se crea ningún cliente, el cliente no recibe ningún aviso automático, el caso queda abierto, tomado por quien rechazó y en silencio, y la pantalla ofrece ir a la Bandeja

#### Scenario: Fundamento inválido
- **WHEN** el fundamento tiene menos de 3 o más de 2000 caracteres
- **THEN** la pantalla no permite aprobar ni rechazar y no envía la decisión

#### Scenario: El alta ya no está pendiente
- **WHEN** la persona autorizada confirma una decisión sobre un alta que otra persona ya resolvió
- **THEN** la pantalla avisa que el trámite ya no está pendiente y actualiza la lista

#### Scenario: Decisión atribuida al usuario del panel
- **WHEN** el panel todavía no tiene autenticación real y se aprueba o rechaza un alta
- **THEN** la decisión queda atribuida al usuario de prueba operador, con la fecha y el fundamento
