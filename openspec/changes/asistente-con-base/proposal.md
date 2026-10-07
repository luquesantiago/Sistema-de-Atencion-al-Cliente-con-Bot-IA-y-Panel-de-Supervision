# Proposal

## Why

En `main` (`3583b56`, después del PR #18) el asistente ya busca la cartera en la base, distingue si el número de WhatsApp está vinculado, registra al cliente nuevo como prospecto con la foto del DNI y crea la solicitud de cambio de teléfono. Pero la conversación no se guarda: el estado de cada número vive en un `Map` en memoria, los mensajes del cliente y del asistente no quedan en `conversacion`, `caso`, `mensaje` y `respuesta`, y el silencio después de derivar solo sobrevive a un reinicio en el prospecto y en el cambio de teléfono. Además, las specs principales (`openspec/specs/`) siguen describiendo el flujo anterior al PR #18.

Para el Parcial 1 (08/10/2026) la demo tiene que mostrar al asistente respondiendo con los datos de la cartera, reconociendo si el número está vinculado y derivando bien, y guardar cada conversación como pidió la agencia: «que todo lo que diga quede guardado para que Graciela lo pueda revisar» (RF-SUP-01).

## What Changes

Decisiones de Santiago del 06/10/2026 y del 07/10/2026 (el cómo está en `design.md`). Los números de «pregunta» son los de la lista de preguntas del equipo, como en el change `asistente-respuestas-limitadas`. Las specs de este change incorporan también lo que trajo el PR #18, para que al archivarlo las specs principales coincidan con el código.

- **La cartera sale de la base** (ya en `main`):
  - el asistente busca al cliente por DNI y responde con sus pólizas: número, ramo, estado y vencimiento, ordenadas por número;
  - un cliente o una póliza con `activo = FALSE` (cargado por error, skill `backend-datos`) no se usa;
  - `backend/fixtures/clientes-ficticios.json` no se borra: AGENTS.md lo reserva para las pruebas automatizadas;
  - quien no cargó la planilla levanta el backend igual, pero el asistente no reconoce ningún DNI.
- **Identificación** (reglas 1 y 2 de AGENTS.md, RF-ATE-03):
  - un número vinculado a un solo cliente activo identifica a ese cliente sin pedir el DNI (propuesta del equipo del 07/10/2026, a validar con la agencia);
  - un número vinculado a varios clientes pide el DNI;
  - un número no vinculado recibe primero «¿ya es cliente o es nuevo?», y la IA clasifica la respuesta como cliente existente, cliente nuevo o ajena; ante una respuesta ajena vuelve a preguntar;
  - un DNI no reconocido vuelve a esa pregunta y, al cuarto DNI no reconocido (`max_intentos_dni` = 3 reintentos), se deriva;
  - se deriva si desde un número vinculado se da el DNI de un cliente no vinculado a ese número, o si en una conversación identificada se da un DNI distinto del del cliente;
  - el primer mensaje del número queda como la consulta a responder cuando el cliente se identifica.
- **Cambio de teléfono desde un número no vinculado** (regla 9, RF-CAR-05):
  - si la persona dice que ya es cliente y su DNI coincide, se crea la solicitud pendiente en su propio caso, con el tipo «cambio de teléfono», sin derivar y sin vincular el número;
  - el asistente avisa que la decisión queda pendiente y **sigue atendiendo** como cliente identificado: responde la consulta guardada o pregunta en qué lo puede ayudar;
  - si ya hay una solicitud pendiente de ese cliente para ese número, no se crea otra;
  - el aviso de la decisión que manda el sistema cuando un operador aprueba o rechaza queda guardado como mensaje del asistente en el caso del trámite.
- **Cliente nuevo** (regla 3, RF-ATE-05): nombre y apellido, DNI y foto del DNI. Con la foto se registra el prospecto pendiente y se deriva. La imagen no se guarda: queda un mensaje con un texto del sistema que dice que el cliente la mandó. Si el DNI ya es de un cliente, se sigue como cliente existente.
- **La conversación se guarda** en `conversacion`, `caso`, `mensaje` y `respuesta`:
  - **Conversación:** hay una sola abierta por número. El prospecto y la solicitud de cambio de teléfono se registran en esa conversación, no en una nueva como hace hoy `main`;
  - **Teléfono:** el número se guarda en `telefono` si no estaba. Identificarse con el DNI no lo vincula al cliente (RF-CAR-03);
  - **Cliente identificado:** `conversacion.id_cliente` se completa cuando el cliente queda identificado, por el número o por el DNI;
  - **Un caso por consulta.** El primer mensaje abre un caso sin tipo. El caso toma el tipo de la primera intención del catálogo `tipo_consulta` que elige el modelo, y una intención distinta abre un caso nuevo;
  - **Intenciones que no están en el catálogo:** «no sé» se deriva en un caso sin tipo; un mensaje «no es de seguros» queda en el caso abierto más reciente, sin respuesta;
  - **Respuestas:** cada mensaje del asistente se guarda en `mensaje` y en `respuesta`, enlazado al mensaje del cliente que responde;
  - **Borrador rechazado:** la redacción que rechaza el control se guarda como respuesta no enviada. No se crea verificación ni alerta: RF-VER-02 sigue afuera;
  - **Derivación:** se completan la fecha de derivación del caso y su motivo (pregunta 37), un texto corto sin texto del cliente.
- **El silencio sale de `conversacion.asistente_suspendido`** (pregunta 32):
  - derivar, mandar a aprobar una baja o una modificación, y registrar el prospecto lo ponen en TRUE. Mientras está en TRUE, el asistente no responde ni llama al proveedor de IA, y lo que escribe el cliente queda en el caso derivado (RF-DER-03);
  - la solicitud de cambio de teléfono no lo pone en TRUE;
  - las 7 conversaciones migradas abiertas, que tienen un caso derivado sin cerrar, pasan a TRUE. Es lo único que cambia en las filas migradas;
  - cuando la decisión de un trámite cierra el último caso derivado sin cerrar de la conversación, la marca vuelve a FALSE. El cierre de los demás casos le toca a la bandeja, en otro change.
- **El paso de la identificación sigue en memoria** (decisión de Santiago del 07/10/2026): si se reinicia el backend, la conversación que no está en silencio termina cuando el número vuelve a escribir, y ese mensaje empieza una conversación nueva. El silencio y todo lo guardado sobreviven al reinicio.
- **Inactividad** (E23). Se detecta cuando el número vuelve a escribir. Si pasaron más minutos que los de `minutos_inactividad_sesion` desde el último mensaje y la conversación no está en silencio ni tiene un caso derivado sin cerrar:
  - se cierran la conversación y sus casos no derivados que no tengan nada pendiente; esos casos quedan sin responsable. La conversación termina a la hora en que se cumplió el plazo o, si después se cerró un caso derivado, a la hora del cierre más reciente;
  - el mensaje abre otra conversación y la identificación empieza de nuevo.
- **Mandar a aprobar sigue como hoy** para la baja y la modificación (incluida el alta de conductor): reciben el aviso fijo y el caso queda derivado. No se registra `solicitud_accion`: la intención «modificación» no separa el alta de conductor, que `tipo_accion` sí separa, y el pedido no dice de qué póliza es. Queda para el change de Trámites por Aprobar.
- **Fallas** (pregunta 35):
  - al proveedor de IA se le piden la clasificación, la intención y la redacción antes de escribir nada;
  - lo de cada mensaje se escribe en una transacción, con el envío por WhatsApp al final. Si falla la base o el envío, no queda nada guardado, el webhook responde 500 y WAHA reintenta desde el mismo estado;
  - los mensajes repetidos se siguen descartando en memoria, porque la base no guarda el id del mensaje de WhatsApp.
- **Plantillas:** el aviso al prospecto deja de decir «a la brevedad», porque AGENTS.md pide no prometer tiempos. El equipo revisa el texto en el PR.
- **Documentación:** AGENTS.md y `docs/requisitos.md` ya tienen en esta rama las reglas nuevas (número vinculado a un solo cliente, DNI de otra persona, el cambio de teléfono que sigue atendiendo y el reinicio). Quedan los textos de AGENTS.md que siguen describiendo el flujo anterior, la excepción de la foto del DNI en «Decisiones abiertas», los desvíos que siguen, las skills `backend-datos` y `verificacion-seguridad`, y `docs/migracion.md`.

No cambian: el canal (webhook, secreto, cola por remitente y `@lid`), la elección de la intención con Groq, la tabla de intención a acción salvo el cambio de teléfono, y el control de la redacción.

**Fuera de alcance:**
- los endpoints y las pantallas de la bandeja: tomar, cerrar y reabrir casos, respuesta del operador (E11, E17 y E24);
- las pantallas de Trámites por Aprobar (los endpoints ya están en `main`);
- las alertas y la verificación (RF-VER);
- el fuera de horario (RF-DER-04): el mensaje de derivación es el mismo;
- la tabla `auditoria`;
- `solicitud_accion` para baja, modificación y alta de conductor.

## Capabilities

### New Capabilities
- `panel-supervision`: módulo «Panel de supervisión» de `docs/requisitos.md`. Este change agrega solo que cada mensaje de la conversación queda guardado en el caso de su consulta (RF-SUP-01). Consultarlo desde el panel queda para la bandeja. Cómo se reparten los mensajes en casos (uno por consulta, regla de «Casos y cierre» de AGENTS.md), el motivo de la derivación y el borrador rechazado se definen en `design.md`, sin requirement propio: no hay un RF que los pida tal cual.

### Modified Capabilities
- `atencion-automatizada`:
  - la identificación: número vinculado a un solo cliente, número compartido, número no vinculado con la clasificación de la IA, DNI no reconocido y DNI de otra persona (RF-ATE-03);
  - la foto del DNI como excepción a los mensajes sin texto (RF-ATE-01);
  - el cliente nuevo queda como prospecto, con nombre, DNI y foto (RF-ATE-05);
  - el pedido de cambio de teléfono desde un número vinculado (RF-ATE-01);
  - vencimiento y estado no usan las pólizas cargadas por error (RF-ATE-01);
  - la conversación termina por inactividad o, si se reinició el backend, cuando el número vuelve a escribir (RF-ATE-03);
  - una falla de la base o del envío no deja nada guardado (RF-ATE-01).
- `derivacion-seguimiento`: el silencio dura hasta que se cierre el caso, sobrevive al reinicio y lo que el cliente sigue escribiendo queda guardado (RF-DER-03).
- `cartera`: el número se registra sin identificar a nadie salvo que esté vinculado a un solo cliente activo (RF-CAR-03), y la solicitud de cambio de teléfono desde un número no vinculado, con su aprobación o rechazo (RF-CAR-05).

`aprobacion-acciones-criticas` no cambia. El requirement de RF-ATE-02 tampoco: el «registro de la agencia» pasa a ser la cartera de la base.

No se citan, porque este change no los cumple:
- RF-APR-02: no se registra la solicitud de baja, modificación ni alta de conductor;
- RF-DER-01: no se avisa al equipo;
- RF-DER-02: no se asigna responsable ni hay seguimiento hasta el cierre;
- RF-DER-04: el fuera de horario no cambia;
- RF-VER-02: no hay verificación ni alertas, aunque el borrador rechazado se guarda.

## Impact

- **Código (backend):**
  - `domain/`:
    - en `customer.ts`, el id pasa a ser un número y `CustomerRepository` queda con `findByDni`, `findById` y los clientes activos vinculados a un número. Lo que escribe la conversación pasa al almacén;
    - `conversation.ts` (nuevo): el almacén, el caso de cada mensaje, el cierre de la conversación y los parámetros;
    - `templates.ts`: el aviso al prospecto.
  - `infrastructure/`:
    - `prisma-customer-repository.ts`: la función pura `customerFromRecord`, el orden de las pólizas y los vinculados a un número. Salen el registro del número, el prospecto, la solicitud y el silencio, que pasan al almacén;
    - `prisma-conversation-store.ts` e `in-memory-conversation-store.ts` (nuevos);
    - `prisma-request-management-repository.ts`: la marca de silencio al cerrar el caso;
    - `in-memory-customer-repository.ts`: queda como doble de prueba y conserva el cargador de los fixtures.
  - `application/`: `process-incoming-message.ts` se reescribe sobre el almacén, junto con su prueba; `manage-requests.ts` guarda el aviso de la decisión.
  - `index.ts`.
  - `scripts/migrar-planilla.ts`: las conversaciones abiertas se cargan con `asistente_suspendido = TRUE`.

  `http/app.ts` y el canal no cambian.
- **Base:** una migración de solo datos pone `asistente_suspendido = TRUE` en las conversaciones abiertas que tienen un caso derivado sin cerrar. No hay tablas, columnas ni valores de catálogo nuevos, y `schema.prisma` no cambia.
- **Infraestructura:** no cambia. El compose ya le pasa `DATABASE_*` al backend.
- **Riesgos:**
  - sin la bandeja, una conversación derivada queda en silencio hasta que exista el cierre de casos, salvo la del prospecto, que la cierra la decisión del trámite. Para probar otras ramas hace falta otro número;
  - un reinicio del backend termina las conversaciones que no estaban en silencio, y una persona a mitad de identificarse vuelve a empezar;
  - después de un reinicio, un reintento de WAHA puede duplicar mensajes;
  - los mensajes guardados incluyen el DNI tal como lo escribe el cliente;
  - sin la planilla cargada no se reconoce ningún DNI;
  - el change simplificar-esquema, que el equipo planea, ya no puede eliminar `asistente_suspendido`.
- **Desvíos provisionales de las reglas de AGENTS.md** (quedan escritos en AGENTS.md):
  - regla 8 (RF-APR-02, E6): la baja, la modificación y el alta de conductor no quedan registradas como solicitud pendiente, sino como caso derivado;
  - skills `backend-datos` y `verificacion-seguridad` («un mensaje repetido no puede duplicar mensajes ni efectos»): después de un reinicio, un reintento de WAHA puede duplicar.
- **Preguntas abiertas que el change no cierra** (de «Decisiones abiertas» de AGENTS.md):
  - no pedir el DNI a un número vinculado a un solo cliente es una propuesta del equipo que la agencia todavía no validó;
  - el cambio de teléfono por WhatsApp (RF-CAR-05) sigue sin validar por la agencia;
  - el tratamiento de datos sensibles: `mensaje.contenido` guarda el DNI que escribe el cliente, y `prospecto.dni_declarado`, el que declara;
  - los minutos de inactividad (30, provisorio): se leen de `parametro_configuracion`;
  - si después de derivar el asistente sigue con otras consultas simples: rige RF-DER-03;
  - la forma final de presentación del asistente;
  - si el asistente pide CUIT a los clientes empresa: una empresa no tiene DNI y sigue el flujo de DNI no reconocido;
  - qué hacer con audios, fotos y archivos sin texto: el canal los sigue ignorando, salvo la foto del DNI del cliente nuevo y la imagen que llega a una conversación en silencio;
  - cómo se cuenta «lo resolvió el asistente» (RF-SUP-05): los casos que el asistente responde quedan abiertos, sin responsable, hasta que la conversación termina.
