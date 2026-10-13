# cartera Specification

## Purpose
Módulo «Gestión de cartera» de `docs/requisitos.md`: el registro único de clientes, pólizas, coberturas y planes, la identificación por DNI, el registro de vencimientos y estados, los siniestros, los teléfonos de contacto y el pedido de cambio de teléfono (RF-CAR-01 a RF-CAR-05). El valor «cambio de teléfono» en los catálogos sale de RF-CAR-05 y de las decisiones 2 y 3 del 28/09/2026 de `docs/caso8_der.md`.

## Requirements

### Requirement: El catálogo de tipos incluye el cambio de teléfono

La base de datos SHALL tener el valor «cambio de teléfono» en el catálogo `tipo_accion`, que enumera los tipos de pedido que se registran en `solicitud_accion`, y en el catálogo `tipo_consulta`, que enumera las intenciones que clasifica el asistente (RF-CAR-05).

#### Scenario: Tipo de acción disponible para el pedido de cambio de teléfono
- **WHEN** se consulta el catálogo `tipo_accion`
- **THEN** entre sus valores está «cambio de teléfono», junto a los tipos de acción que ya tenía

#### Scenario: Intención disponible para la consulta de un número nuevo
- **WHEN** se consulta el catálogo `tipo_consulta`
- **THEN** entre sus valores está «cambio de teléfono», junto a los tipos de consulta que ya tenía

### Requirement: Los clientes de la planilla quedan una sola vez, identificados por DNI

Después de la migración de la planilla histórica, la base de datos SHALL tener cada cliente de la hoja Clientes una sola vez, como persona con DNI normalizado (solo dígitos), apellido y nombre, sin cargar las columnas de referencia de la limpieza (`polizas`, `titular_en_planilla` y `observaciones`) (RF-CAR-01, RF-CAR-03).

#### Scenario: Se migran todos los clientes, aunque no tengan pólizas migradas
- **WHEN** se corre la migración sobre una base recién creada
- **THEN** la tabla `cliente` tiene las 10 filas de la hoja Clientes, una por DNI
- **AND** Ana Fernández y Luisa Martínez están cargadas aunque todas sus pólizas queden pendientes

#### Scenario: El DNI identifica al cliente
- **WHEN** se busca un cliente migrado por su DNI escrito solo con dígitos
- **THEN** se encuentra exactamente un cliente

### Requirement: Las pólizas migradas registran vencimiento y estado

Después de la migración, la base de datos SHALL tener cada póliza de la hoja Pólizas con «migrar» = «Sí», con su titular, la compañía «Seguros Castaño», su ramo, su bien asegurado (si el ramo asegura un bien), su moneda, su prima mensual, sus fechas de inicio y de vencimiento tal como están en la planilla y su estado, con «vencida» cargada como «activa», porque vencida se calcula con la fecha de vencimiento (RF-CAR-01, RF-CAR-02).

#### Scenario: Se cargan solo las pólizas que se migran
- **WHEN** se corre la migración sobre una base recién creada
- **THEN** la tabla `poliza` tiene las 8 pólizas con «migrar» = «Sí» y la tabla `bien_asegurado` tiene 6 bienes
- **AND** POL-00126, POL-00131 y POL-00128 no están en la base

#### Scenario: La vigencia es la de la planilla
- **WHEN** se consulta una póliza migrada
- **THEN** su `fecha_inicio` y su `fecha_vencimiento` son las fechas de la planilla, sin corrimiento de zona horaria

#### Scenario: Una póliza vencida en la planilla queda activa y vencida por fecha
- **WHEN** la planilla trae una póliza con estado «vencida»
- **THEN** la póliza queda en estado «activa» y se ve vencida porque su fecha de vencimiento ya pasó

### Requirement: Los teléfonos de las consultas se registran sin identificar al cliente

Después de la migración, la base de datos SHALL tener cada número de la hoja Consultas una sola vez en `telefono` y SHALL vincularlo a un cliente solo cuando el caso tiene póliza, con el titular de esa póliza; un mismo número puede quedar en conversaciones sin cliente aunque esté vinculado (RF-CAR-03).

#### Scenario: Un número compartido entre casos se guarda una sola vez
- **WHEN** se corre la migración sobre una base recién creada
- **THEN** la tabla `telefono` tiene 8 números para los 10 casos migrados, y 5491155551001 aparece una sola vez aunque lo usen CASO-001, CASO-003 y CASO-011

#### Scenario: El número se vincula al titular de la póliza del caso
- **WHEN** un caso migrado tiene póliza
- **THEN** su conversación queda a nombre del titular de esa póliza y el número queda vinculado a ese cliente
- **AND** la tabla `cliente_telefono` tiene 3 vínculos: Juan García con 5491155551001 y 5491155551009, y María del Carmen López con 5491155551005

#### Scenario: Un caso sin póliza no identifica a nadie por su número
- **WHEN** un caso migrado no tiene póliza, como CASO-003
- **THEN** su conversación queda sin cliente, aunque el número ya esté vinculado a otro cliente por otro caso

### Requirement: El número desde el que se escribe se registra sin identificar al cliente

El sistema SHALL registrar el número de WhatsApp de cada conversación en la lista de teléfonos, aunque no esté vinculado a ningún cliente, y SHALL identificar al cliente por su DNI, salvo cuando el número está vinculado a un solo cliente activo, que lo identifica; identificarse con el DNI no vincula el número al cliente (RF-CAR-03).

#### Scenario: Número que escribe por primera vez
- **WHEN** escribe un número que no está en la lista de teléfonos
- **THEN** el número queda registrado una sola vez, sin ningún cliente vinculado

#### Scenario: Identificarse no vincula el número
- **WHEN** un cliente se identifica con su DNI desde un número que no tiene vinculado
- **THEN** la conversación queda a nombre del cliente y el número sigue sin vincularse a él

#### Scenario: Número vinculado a un solo cliente
- **WHEN** escribe un número vinculado a un solo cliente activo
- **THEN** la conversación queda a nombre de ese cliente sin pedirle el DNI

#### Scenario: Número compartido
- **WHEN** escribe un número vinculado a más de un cliente activo
- **THEN** el número no identifica a nadie y el asistente pide el DNI

#### Scenario: Vínculo con un cliente cargado por error
- **WHEN** escribe un número cuyo único vínculo es con un cliente marcado como cargado por error
- **THEN** el número se atiende como no vinculado

### Requirement: Cambio de teléfono desde un número no vinculado

El sistema SHALL, cuando una persona dice que ya es cliente desde un número no vinculado y su DNI coincide con un cliente de la cartera, registrar una solicitud pendiente para vincular ese número al cliente, sin vincularlo hasta que un operador la apruebe, avisarle que la decisión queda pendiente y seguir atendiéndolo como cliente identificado; al decidir, el operador elige qué números anteriores de ese cliente se desvinculan, sin afectar a otros clientes que compartan esos números, y el cliente recibe el aviso de la decisión por ese WhatsApp (RF-CAR-05).

#### Scenario: Solicitud registrada
- **WHEN** desde un número no vinculado la persona contesta que ya es cliente y da el DNI de un cliente activo
- **THEN** queda una solicitud pendiente de cambio de teléfono para ese cliente y ese número, en un caso propio de tipo «cambio de teléfono» de la conversación abierta, sin derivar; el número sigue sin vincularse; el asistente le avisa que la actualización quedó pendiente de aprobación y que le van a informar la decisión por ese WhatsApp

#### Scenario: Sigue atendiendo después de la solicitud
- **WHEN** se registró la solicitud de cambio de teléfono
- **THEN** la conversación queda identificada con ese cliente y el asistente no deja de responder: atiende la consulta guardada o, si no había, le pregunta en qué lo puede ayudar

#### Scenario: Solicitud ya pendiente
- **WHEN** el mismo cliente vuelve a identificarse desde el mismo número no vinculado y ya tiene una solicitud pendiente para ese número
- **THEN** no se crea otra solicitud, el asistente le avisa que la actualización sigue pendiente y lo sigue atendiendo

#### Scenario: Solicitud aprobada
- **WHEN** un operador aprueba la solicitud y elige qué números anteriores del cliente se desvinculan, o ninguno
- **THEN** el número de la solicitud queda vinculado al cliente, los números elegidos dejan de estar vinculados solo a ese cliente, el detalle de la solicitud dice qué número se vinculó y cuáles se desvincularon, el caso queda cerrado con el operador como responsable y el cliente recibe el aviso por ese WhatsApp

#### Scenario: Solicitud rechazada
- **WHEN** un operador rechaza la solicitud con un fundamento
- **THEN** no cambia ningún vínculo, el caso queda cerrado con el operador como responsable y el cliente recibe el aviso por ese WhatsApp

#### Scenario: El aviso de la decisión queda guardado
- **WHEN** el aviso de la decisión se envía por WhatsApp
- **THEN** queda guardado en el caso de la solicitud como mensaje del asistente, con su fecha y hora
