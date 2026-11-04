## ADDED Requirements

### Requirement: El alta de póliza registra su plan de cuotas

El sistema SHALL exigir la prima mensual al dar de alta una póliza desde Base de Clientes y SHALL registrar, en la misma transacción del alta, una cuota por mes de la vigencia: la primera vence el día de inicio y las siguientes el mismo día de cada mes (el último día si el mes es más corto), mientras venzan antes del vencimiento de la póliza, numeradas desde 1 y con la prima mensual como importe; las cuotas con vencimiento anterior a la fecha de carga en Argentina SHALL quedar pagas o sin pagar según la cantidad de cuotas pagas que declare quien carga, empezando por la más antigua, y el sistema SHALL rechazar el alta si hay cuotas vencidas y no se declara esa cantidad o si la cantidad no está entre 0 y la cantidad de cuotas vencidas; las cuotas con vencimiento en la fecha de carga o después SHALL quedar sin pagar (RF-CAR-02).

#### Scenario: Póliza que empieza hoy
- **WHEN** quien carga da de alta una póliza con inicio hoy, vencimiento dentro de un año y una prima mensual de $ 45.000,00, sin declarar cuotas pagas
- **THEN** la póliza queda con 12 cuotas de $ 45.000,00 sin pagar, la primera con vencimiento hoy y las siguientes el mismo día de cada mes

#### Scenario: Póliza con cuotas ya vencidas
- **WHEN** quien carga da de alta una póliza que empezó hace tres meses y declara que 2 cuotas están pagas
- **THEN** las cuotas 1 y 2 quedan pagas, con su fecha de vencimiento como fecha de pago, y la cuota 3 y las siguientes quedan sin pagar

#### Scenario: Faltan las cuotas pagas
- **WHEN** quien carga da de alta una póliza con cuotas ya vencidas sin declarar cuántas están pagas, o declara más pagas que vencidas
- **THEN** el sistema rechaza el alta, no crea la póliza ni sus cuotas y avisa qué dato falta o está fuera de rango

#### Scenario: Falta la prima mensual
- **WHEN** quien carga da de alta una póliza sin prima mensual
- **THEN** el sistema rechaza el alta y no crea la póliza ni sus cuotas

#### Scenario: Día de inicio que no existe en todos los meses
- **WHEN** la póliza empieza el 31 de enero
- **THEN** la cuota de febrero vence el último día de febrero y la de marzo el 31 de marzo

#### Scenario: La confirmación muestra las cuotas
- **WHEN** quien carga revisa la confirmación del alta de póliza
- **THEN** la confirmación muestra cuántas cuotas se registran, su importe, cuántas quedan pagas y la fecha de la primera y de la última

#### Scenario: El asistente responde el saldo de la póliza nueva
- **WHEN** el cliente de una póliza cargada desde Base de Clientes pregunta cuánto debe y no tiene otras pólizas sin cuotas
- **THEN** el asistente responde las cuotas vencidas sin pagar y las por vencer de esa póliza, sin derivar

#### Scenario: Una falla en el alta
- **WHEN** el alta falla después de crear la póliza y antes de registrar todas sus cuotas
- **THEN** la base queda sin la póliza ni ninguna de sus cuotas

### Requirement: Carga de clientes ficticios para la demo

El sistema SHALL ofrecer una carga aparte de la migración de la planilla que, solo con una confirmación explícita de quien la corre, borre en una sola transacción los clientes, teléfonos, pólizas, cuotas, prospectos, conversaciones, casos, mensajes, respuestas, solicitudes y alertas, conserve los catálogos, los parámetros, el horario de atención y los usuarios, y registre clientes, teléfonos, pólizas y cuotas ficticios que permitan probar con el asistente: un número vinculado a un solo cliente activo con varias pólizas en distintas monedas, cuotas vencidas sin pagar, cuotas por vencer, una póliza con todas las cuotas pagas y una vencida por fecha; un número compartido por dos clientes activos; un cliente sin pólizas; un cliente con una póliza sin cuotas; y un cliente dado de baja; los números de WhatsApp de la demo SHALL tomarse del entorno de quien corre la carga, sin quedar en el repositorio, y los datos cargados SHALL quedar documentados y marcados como ficticios (RF-CAR-01, RF-CAR-02, RF-CAR-03).

#### Scenario: Carga confirmada
- **WHEN** se corre la carga de la demo con la confirmación explícita
- **THEN** la base queda solo con los clientes, teléfonos, pólizas y cuotas ficticios de la demo, sin conversaciones, casos, prospectos ni solicitudes, con los catálogos, los parámetros, el horario y los usuarios intactos
- **AND** la carga informa cuántos clientes, pólizas y cuotas registró y qué caso límite cubre cada número, sin mostrar DNI

#### Scenario: Sin confirmación
- **WHEN** se corre la carga sin la confirmación explícita
- **THEN** la carga no borra ni escribe nada e informa qué borraría y cómo confirmarla

#### Scenario: Números de la demo desde el entorno
- **WHEN** quien corre la carga define los números de WhatsApp de la demo en el entorno
- **THEN** el número vinculado a un solo cliente y el número compartido quedan con esos valores; si alguno no está definido, queda un número ficticio que no corresponde a ningún WhatsApp y la carga lo informa

#### Scenario: Número de la demo inválido
- **WHEN** un número de WhatsApp de la demo definido en el entorno no tiene solo dígitos o tiene más de 15, o los dos números son iguales
- **THEN** la carga no borra ni escribe nada e informa qué número no es válido, sin mostrarlo completo

#### Scenario: Una falla a mitad de la carga
- **WHEN** la carga falla después de empezar a borrar o escribir
- **THEN** la base queda como estaba antes de correrla

#### Scenario: Los datos ficticios quedan marcados
- **WHEN** se revisan las pólizas cargadas por la demo o la documentación de la migración
- **THEN** cada póliza de la demo dice en sus observaciones que es un dato ficticio de demostración, y la documentación lista los clientes de la demo, el caso límite que prueba cada uno, cómo se cargan y cómo volver a los datos históricos de la planilla
