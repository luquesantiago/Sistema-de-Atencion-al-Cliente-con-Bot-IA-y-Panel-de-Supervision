# Spec Delta

## ADDED Requirements

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
