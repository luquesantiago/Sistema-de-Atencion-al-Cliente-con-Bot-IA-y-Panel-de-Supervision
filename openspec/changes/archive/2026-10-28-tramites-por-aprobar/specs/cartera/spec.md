## ADDED Requirements

### Requirement: Trámites muestra los cambios de teléfono pendientes

El sistema SHALL mostrar en Trámites por Aprobar cada solicitud de cambio de teléfono pendiente con el nombre y el DNI del cliente, el número solicitado, los teléfonos actuales del cliente y la fecha de la solicitud, ordenadas de la más antigua a la más reciente, sin modificar ningún vínculo telefónico mientras la solicitud siga pendiente (RF-CAR-05).

#### Scenario: Lista de cambios ordenada por antigüedad
- **WHEN** hay dos cambios de teléfono pendientes, uno solicitado el 21/10/2026 y otro el 23/10/2026
- **THEN** la pantalla muestra primero el del 21/10/2026 y después el del 23/10/2026, cada uno con el cliente, el DNI, el número solicitado, los teléfonos actuales y la fecha

#### Scenario: Cliente sin otros teléfonos
- **WHEN** el cliente de una solicitud pendiente no tiene otros teléfonos vinculados
- **THEN** la pantalla informa que no tiene otros teléfonos y permite aprobar el cambio sin desvincular ninguno

### Requirement: El cambio de teléfono se aprueba o rechaza desde Trámites

El sistema SHALL permitir que una persona autorizada apruebe o rechace una solicitud de cambio de teléfono desde Trámites por Aprobar, con un fundamento de entre 3 y 2000 caracteres y una confirmación que muestre el número nuevo y los teléfonos que se desvinculan; al aprobar SHALL vincular el número solicitado al cliente, desvincular solo los teléfonos actuales elegidos sin afectar a otros clientes que compartan esos números y cerrar el caso, y al rechazar SHALL no cambiar ningún vínculo y cerrar el caso; en los dos casos SHALL avisar al cliente por WhatsApp, y si el aviso falla SHALL mantener la decisión registrada, avisar en el panel y ofrecer reintentar el aviso (RF-CAR-05).

#### Scenario: Aprobar sin desvincular teléfonos
- **WHEN** la persona autorizada no selecciona ningún teléfono actual, escribe un fundamento válido y confirma la aprobación
- **THEN** el número solicitado queda vinculado al cliente, no se desvincula ningún teléfono anterior, el caso queda cerrado, el cliente recibe el aviso por WhatsApp y el cambio sale de la lista

#### Scenario: Aprobar desvinculando teléfonos
- **WHEN** la persona autorizada selecciona uno o más teléfonos actuales, escribe un fundamento válido y confirma la aprobación
- **THEN** el número solicitado queda vinculado al cliente, solo los teléfonos seleccionados se desvinculan de ese cliente, los vínculos de otros clientes que compartan esos números no cambian, el caso queda cerrado y el cliente recibe el aviso por WhatsApp

#### Scenario: Rechazar un cambio de teléfono
- **WHEN** la persona autorizada escribe un fundamento válido y confirma el rechazo
- **THEN** no cambia ningún vínculo telefónico, el caso queda cerrado, el cliente recibe el aviso de rechazo por WhatsApp y el cambio sale de la lista

#### Scenario: El aviso al cliente falla
- **WHEN** la decisión se aplica pero el aviso por WhatsApp no se puede enviar
- **THEN** la decisión queda registrada igual, la pantalla avisa que no se pudo avisar al cliente y ofrece reintentar el aviso

#### Scenario: Reintentar el aviso con éxito
- **WHEN** la persona autorizada reintenta el aviso de una decisión ya registrada y WhatsApp lo envía
- **THEN** la pantalla confirma que el cliente recibió el aviso y no vuelve a aplicar la decisión

#### Scenario: Reintentar el aviso sin éxito
- **WHEN** la persona autorizada reintenta el aviso y WhatsApp vuelve a fallar
- **THEN** la pantalla avisa que todavía no se pudo enviar, mantiene la decisión registrada y permite reintentar de nuevo

#### Scenario: Fundamento inválido
- **WHEN** el fundamento tiene menos de 3 o más de 2000 caracteres
- **THEN** la pantalla no permite aprobar ni rechazar y no envía la decisión

#### Scenario: El cambio ya no está pendiente
- **WHEN** la persona autorizada confirma una decisión sobre un cambio que otra persona ya resolvió
- **THEN** la pantalla avisa que el trámite ya no está pendiente y actualiza la lista
