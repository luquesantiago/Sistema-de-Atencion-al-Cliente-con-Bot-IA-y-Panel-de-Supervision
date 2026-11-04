## ADDED Requirements

### Requirement: El panel exige iniciar sesión y controla el acceso por rol

El sistema SHALL exigir que quien use el panel inicie sesión con su usuario y su clave, verificados en el backend contra los usuarios activos de la base, y SHALL rechazar todo pedido a la API del panel sin una sesión válida; SHALL permitir las acciones de administración (configuración y métricas) solo al rol administrador, comprobándolo en el backend con el rol y el estado que el usuario tiene en la base en ese momento, y el panel SHALL ocultar lo que el rol no permite sin que eso sea la única barrera (RF-SUP-07).

#### Scenario: Inicio de sesión correcto
- **WHEN** una persona ingresa el usuario y la clave de un usuario activo
- **THEN** el panel se abre con su nombre y su rol, y la sesión dura 8 horas

#### Scenario: Usuario o clave incorrectos
- **WHEN** una persona ingresa un usuario que no existe, una clave que no corresponde o el usuario de alguien dado de baja
- **THEN** el panel no se abre y muestra el mismo mensaje en los tres casos, sin decir cuál de los datos falló

#### Scenario: Demasiados intentos fallidos
- **WHEN** hay 5 intentos fallidos seguidos para un mismo usuario
- **THEN** el inicio de sesión de ese usuario queda bloqueado durante 15 minutos, aunque después se ingrese la clave correcta, y el mensaje lo dice sin revelar si el usuario existe

#### Scenario: Pedido sin sesión
- **WHEN** se llama a cualquier ruta de la API del panel sin sesión, con una sesión vencida o con una cookie alterada
- **THEN** el sistema responde 401 sin leer ni modificar datos, y el panel vuelve a la pantalla de inicio de sesión

#### Scenario: El webhook de WhatsApp no usa la sesión
- **WHEN** WAHA avisa un mensaje al webhook con su secreto
- **THEN** el aviso se procesa igual que antes, sin sesión del panel

#### Scenario: Operador en una ruta de administración
- **WHEN** un usuario con rol operador llama a una ruta reservada al administrador
- **THEN** el sistema responde 403 sin leer ni modificar datos

#### Scenario: Baja o cambio de rol con la sesión abierta
- **WHEN** a un usuario con sesión iniciada lo dan de baja o le cambian el rol en la base
- **THEN** su pedido siguiente se resuelve con el estado nuevo: 401 si está dado de baja, y el permiso del rol nuevo si cambió

#### Scenario: Recargar la página
- **WHEN** una persona con sesión válida recarga el panel
- **THEN** el panel sigue abierto con su usuario, sin volver a pedir la clave

#### Scenario: Cerrar sesión
- **WHEN** la persona cierra la sesión desde el panel
- **THEN** el panel vuelve a la pantalla de inicio de sesión y los pedidos siguientes desde ese navegador responden 401

#### Scenario: El panel oculta lo que el rol no permite
- **WHEN** inicia sesión un usuario con rol operador
- **THEN** el menú no muestra el Dashboard de métricas ni la Configuración

### Requirement: Las acciones del panel quedan a nombre de quien las hace

El sistema SHALL atribuir cada acción del panel que registra un responsable (tomar, liberar, contestar y cerrar casos, y aprobar o rechazar trámites) al usuario con la sesión iniciada, tomado de la sesión y nunca de un dato que mande el navegador (RF-SUP-07, RF-APR-03).

#### Scenario: Graciela toma y contesta un caso
- **WHEN** Graciela, con su sesión iniciada, toma un caso derivado y le contesta al cliente
- **THEN** el caso queda con Graciela como responsable y la respuesta queda escrita por Graciela

#### Scenario: Roberto aprueba un cambio de teléfono
- **WHEN** Roberto, con su sesión iniciada, aprueba un cambio de teléfono
- **THEN** la decisión y el cierre del caso quedan a nombre de Roberto, con la fecha y el fundamento

#### Scenario: El navegador no elige el actor
- **WHEN** un pedido del panel incluye en el cuerpo un usuario, un actor o un rol distinto del de la sesión
- **THEN** el sistema rechaza el pedido con un error de validación o ignora ese dato, y nunca atribuye la acción a otro usuario
