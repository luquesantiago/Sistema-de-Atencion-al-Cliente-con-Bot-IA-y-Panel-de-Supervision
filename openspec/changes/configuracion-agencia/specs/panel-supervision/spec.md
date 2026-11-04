## ADDED Requirements

### Requirement: Configuración de la información de la agencia

El sistema SHALL ofrecer en el panel un módulo «Configuración», solo para el rol administrador y protegido por rol en el backend, que permita ver y editar la información de la agencia que usa el asistente: la dirección y el teléfono, que son obligatorios; el teléfono de grúa o asistencia, el email, la web y los medios de pago, que son opcionales; el horario de atención de cada día de la semana, con días sin atención; y qué ramos y qué planes están activos, con al menos uno de cada uno y un día con atención. SHALL validar cada dato en el backend, pedir una confirmación que muestre el valor actual y el nuevo antes de guardar, guardar todo junto o nada, mostrar una vista previa de la información de la agencia que va a contestar el asistente, y marcar los datos que siguen siendo de ejemplo o que no se cargaron. El asistente SHALL usar los datos guardados desde el mensaje siguiente, sin reiniciar el sistema (RF-SUP-07, RF-ATE-06).

#### Scenario: El administrador carga la dirección real
- **WHEN** el administrador cambia la dirección «Ficticia 123» por la real y confirma
- **THEN** la dirección queda guardada, deja de marcarse como dato de ejemplo y la próxima consulta de información de la agencia por WhatsApp la informa

#### Scenario: Cargar el número de grúa
- **WHEN** el administrador carga el teléfono de grúa o asistencia y confirma
- **THEN** el próximo pedido de grúa recibe ese número además de la derivación

#### Scenario: Confirmación con los cambios
- **WHEN** el administrador cambia el horario del sábado y desactiva un plan, y guarda
- **THEN** la confirmación muestra cada dato con su valor actual y el nuevo, y avisa que el plan desactivado deja de ofrecerse y no se puede elegir en coberturas nuevas; sin confirmar no se guarda nada

#### Scenario: Datos inválidos
- **WHEN** el administrador deja la dirección o el teléfono vacíos, carga un horario en que el cierre no es posterior a la apertura, un email o una web con un formato inválido, un texto de más de 255 caracteres, o desactiva todos los ramos, todos los planes o todos los días
- **THEN** el sistema rechaza el guardado con un mensaje que dice qué dato corregir y no guarda ninguno de los cambios

#### Scenario: Vista previa
- **WHEN** el administrador edita los datos, antes de guardar
- **THEN** el módulo muestra la plantilla de la información de la agencia, y los mensajes de grúa y de medios de pago, armados con los datos editados, sin la redacción de la IA

#### Scenario: Un operador no accede
- **WHEN** un usuario con rol operador intenta abrir la Configuración o llamar a su API
- **THEN** el menú no la muestra y el backend responde 403 sin leer ni modificar nada

#### Scenario: Datos sin cargar
- **WHEN** el teléfono de grúa, el email, la web o los medios de pago no están cargados
- **THEN** el módulo los muestra como «Sin cargar» y explica qué hace el asistente mientras tanto (deriva la consulta o no menciona el dato)
