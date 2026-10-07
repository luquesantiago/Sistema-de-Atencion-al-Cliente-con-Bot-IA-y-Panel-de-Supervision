# Proposal

## Why

En `main` (`21467ce`), el asistente identifica a los clientes con el JSON de clientes ficticios de `backend/fixtures/` y guarda en memoria el estado de cada número. Al reiniciar el backend se pierden el DNI validado, la consulta guardada, los intentos y el silencio después de derivar. Además, lo que el cliente escribe mientras el asistente está en silencio no queda en ningún lado.

La cartera histórica ya está en la base (change `migracion-planilla-parcial-1`). Para el Parcial 1 (08/10/2026), el asistente puede identificar al cliente y responderle con esa cartera, y guardar cada conversación como pidió la agencia: «que todo lo que diga quede guardado para que Graciela lo pueda revisar» (RF-SUP-01).

## What Changes

Decisiones de Santiago del 06/10/2026 (el cómo está en `design.md`). Los números de «pregunta» son los de la lista de preguntas del equipo, como en el change `asistente-respuestas-limitadas`:

- **La cartera sale de la base.**
  - El asistente busca al cliente por DNI y responde con sus pólizas: número, ramo, estado y vencimiento.
  - Un cliente o una póliza con `activo = FALSE` (cargado por error, skill `backend-datos`) no se usa.
  - Se borran el JSON de clientes ficticios de `backend/fixtures/`, su cargador y su prueba: la base es la única fuente. Las pruebas del flujo siguen con clientes ficticios definidos en cada prueba.
  - Quien no cargó la planilla levanta el backend igual, pero el asistente no reconoce ningún DNI.
- **La conversación se guarda** en `conversacion`, `caso`, `mensaje` y `respuesta`:
  - **Conversación:** hay una sola abierta por número. El primer mensaje de un número sin conversación abierta abre una.
  - **Teléfono:** el número se guarda en `telefono` si no estaba. Identificarse con el DNI no lo vincula al cliente (RF-CAR-03): ese vínculo lo crea solo un cambio de teléfono aprobado (regla 9).
  - **Cliente identificado:** `conversacion.id_cliente` se completa cuando se reconoce el DNI.
  - **Un caso por consulta.** El primer mensaje abre un caso sin tipo. El caso toma el tipo de la primera intención del catálogo `tipo_consulta` que elige el modelo, y una intención distinta abre un caso nuevo.
  - **Intenciones que no están en el catálogo** (pregunta abierta del change `asistente-respuestas-limitadas`):
    - «no sé» se deriva en un caso sin tipo;
    - un mensaje «no es de seguros» queda en el caso abierto más reciente, sin respuesta.
  - **Respuestas:** cada mensaje del asistente se guarda en `mensaje` y en `respuesta`, enlazado al mensaje del cliente que responde. La respuesta a la consulta guardada antes del DNI se enlaza a esa consulta.
  - **Borrador rechazado:** la redacción que rechaza el control se guarda como respuesta no enviada, para que el operador la vea. No se crea verificación ni alerta: RF-VER-02 sigue afuera.
  - **Derivación:** se completa la fecha de derivación del caso y su motivo (pregunta 37). El motivo es un texto libre corto, el mismo que hoy va al log, sin texto del cliente.
- **El silencio sale de `conversacion.asistente_suspendido`** (pregunta 32):
  - derivar y mandar a aprobar lo ponen en TRUE. Mientras está en TRUE, el asistente no responde ni llama al proveedor de IA, y lo que escribe el cliente queda en el caso derivado (RF-DER-03);
  - las 7 conversaciones migradas abiertas, que tienen un caso derivado sin cerrar, pasan a TRUE. Es lo único que cambia en las filas migradas;
  - volver a ponerlo en FALSE le toca al cierre del caso, que hace la bandeja en otro change.
- **Lo que hoy está en memoria sale de lo guardado** (pregunta 34):
  - la consulta guardada antes del DNI, los DNI no reconocidos y si se espera el sí o el no del cliente nuevo, o su nombre, se reconstruyen con los mensajes del cliente de la conversación, sin el proveedor de IA. Un reinicio del backend no cambia nada;
  - en memoria quedan solo la cola por remitente y los ids de los mensajes ya procesados.
- **Inactividad** (E23). Se detecta cuando el número vuelve a escribir. Si pasaron más minutos que los de `minutos_inactividad_sesion` desde el último mensaje y la conversación no tiene un caso derivado sin cerrar:
  - se cierran la conversación y sus casos no derivados que no tengan nada pendiente; esos casos quedan sin responsable. La conversación termina a la hora en que se cumplió el plazo o, si después se cerró un caso derivado, a la hora del cierre más reciente;
  - el mensaje abre otra conversación y el asistente vuelve a pedir el DNI (RF-ATE-03).

  Los minutos y el tope de DNI salen de `parametro_configuracion`. Con `max_intentos_dni` = 3, se deriva al cuarto DNI no reconocido, como hoy.
- **Cliente nuevo:** cuando escribe el nombre, además de derivar, se registra un `prospecto` en estado «pendiente», con el nombre y el DNI que declaró, sin darlo de alta (RF-ATE-05, regla 3).
- **Mandar a aprobar sigue como hoy.** Baja, modificación (incluida el alta de conductor) y cambio de teléfono reciben el aviso fijo, y el caso queda derivado.
  - No se registra `solicitud_accion`: la intención «modificación» no separa el alta de conductor, que `tipo_accion` sí separa, y el pedido no dice de qué póliza es.
  - Queda para el change de Trámites por Aprobar.
- **El ofrecimiento del cambio de teléfono sigue afuera** (regla 9, RF-CAR-05). Con la cartera migrada casi ningún número está vinculado, así que aparecería en casi todas las conversaciones. Va en su propio change.
- **Fallas** (pregunta 35):
  - al proveedor de IA se le pide la intención y la redacción antes de escribir nada;
  - lo de cada mensaje se escribe en una transacción, con el envío por WhatsApp al final. Si falla la base o el envío, no queda nada guardado, el webhook responde 500 y WAHA reintenta desde el mismo estado;
  - los mensajes repetidos se siguen descartando en memoria, porque la base no guarda el id del mensaje de WhatsApp.
- **Documentación:** se actualizan AGENTS.md (líneas 64, 69 y 77, del flujo del Parcial 1), la skill `backend-datos` (línea 66) y `docs/migracion.md`.

No cambian: el canal (webhook, secreto, cola por remitente y `@lid`), la elección de la intención con Groq, la tabla de intención a acción, las plantillas y el control de la redacción.

**Fuera de alcance:**
- los endpoints y las pantallas del panel: bandeja, tomar y cerrar casos, respuesta del operador (E11, E17 y E24);
- las alertas y la verificación (RF-VER);
- el fuera de horario (RF-DER-04): el mensaje de derivación es el mismo;
- la tabla `auditoria`;
- `solicitud_accion`;
- el ofrecimiento del cambio de teléfono.

## Capabilities

### New Capabilities
- `panel-supervision`: módulo «Panel de supervisión» de `docs/requisitos.md`. Este change agrega solo que cada mensaje de texto de la conversación queda guardado en el caso de su consulta (RF-SUP-01). Consultarlo desde el panel queda para la bandeja. Cómo se reparten los mensajes en casos (uno por consulta, regla de «Casos y cierre» de AGENTS.md), el motivo de la derivación y el borrador rechazado se definen en `design.md`, sin requirement propio: no hay un RF que los pida tal cual.

### Modified Capabilities
- `atencion-automatizada`:
  - la identificación sale de la cartera de la base, vale mientras dure la conversación y se vuelve a pedir después de la inactividad (RF-ATE-03);
  - el tope de DNI sale de la configuración (RF-ATE-03);
  - el cliente nuevo queda como prospecto (RF-ATE-05);
  - vencimiento y estado no usan las pólizas cargadas por error (RF-ATE-01);
  - una falla de la base o del envío no deja nada guardado (RF-ATE-01).
- `derivacion-seguimiento`: el silencio dura hasta que se cierre el caso, sobrevive al reinicio y lo que el cliente sigue escribiendo queda guardado (RF-DER-03).
- `cartera`: el número desde el que se escribe se registra sin identificar a nadie (RF-CAR-03).

`aprobacion-acciones-criticas` no cambia. El requirement de RF-ATE-02 tampoco: el «registro de la agencia» pasa a ser la cartera de la base.

No se citan, porque este change no los cumple:
- RF-APR-02: no se registra la solicitud;
- RF-CAR-05: no hay ofrecimiento ni pedido de cambio de teléfono;
- RF-DER-01: no se avisa al equipo;
- RF-DER-02: no se asigna responsable ni hay seguimiento hasta el cierre;
- RF-DER-04: el fuera de horario no cambia;
- RF-VER-02: no hay verificación ni alertas, aunque el borrador rechazado se guarda.

## Impact

- **Código (backend):**
  - `infrastructure/`: `config.ts` suma las variables `DATABASE_*`. Se agregan el cliente de Prisma, el repositorio de clientes y el almacén de conversaciones. Se borran el cargador del JSON y su prueba. `in-memory-customer-repository.ts` queda como doble de prueba, junto a un almacén en memoria.
  - `domain/`: en `customer.ts`, el id pasa a ser un número. Se agregan funciones puras para la etapa de identificación, el caso de cada mensaje, la inactividad y los parámetros.
  - `application/process-incoming-message.ts` se reescribe sobre el almacén, junto con su prueba.
  - `index.ts`.
  - `scripts/migrar-planilla.ts`: las conversaciones abiertas se cargan con `asistente_suspendido = TRUE`.

  `http/app.ts` y el canal no cambian.
- **Base:** una migración de solo datos pone `asistente_suspendido = TRUE` en las conversaciones abiertas que tienen un caso derivado sin cerrar. No hay tablas, columnas ni valores de catálogo nuevos, y `schema.prisma` no cambia.
- **Se borra** `backend/fixtures/`.
- **Infraestructura:** no cambia. El compose ya le pasa `DATABASE_*` al backend.
- **Riesgos:**
  - sin bandeja, una conversación derivada queda en silencio hasta que exista el cierre de casos. Para probar otras ramas hace falta otro número;
  - después de un reinicio del backend, un reintento de WAHA puede duplicar mensajes;
  - los mensajes guardados incluyen el DNI tal como lo escribe el cliente;
  - sin la planilla cargada no se reconoce ningún DNI;
  - el change simplificar-esquema, que el equipo planea, ya no puede eliminar `asistente_suspendido`.
- **Desvíos provisionales de las reglas de AGENTS.md** (decisiones de Santiago del 06/10/2026, que quedan escritas en AGENTS.md):
  - regla 9 y paso 2 del flujo del Parcial 1 (RF-CAR-05, que según «Decisiones abiertas» rige como está escrito): el asistente no ofrece registrar el número nuevo y el pedido de cambio de teléfono se deriva como una baja;
  - regla 8 (RF-APR-02, E6): la baja, la modificación y el alta de conductor no quedan registradas como solicitud pendiente, sino como caso derivado;
  - skills `backend-datos` y `verificacion-seguridad` («un mensaje repetido no puede duplicar mensajes ni efectos»): después de un reinicio, un reintento de WAHA puede duplicar.
- **Preguntas abiertas que el change no cierra** (de «Decisiones abiertas» de AGENTS.md):
  - el tratamiento de datos sensibles: `mensaje.contenido` guarda el DNI que escribe el cliente, y `prospecto.dni_declarado`, el que declara;
  - los minutos de inactividad (30, provisorio): se leen de `parametro_configuracion`;
  - si después de derivar el asistente sigue con otras consultas simples: rige RF-DER-03;
  - la forma final de presentación del asistente;
  - si el asistente pide CUIT a los clientes empresa: una empresa no tiene DNI y sigue el flujo de DNI no reconocido;
  - qué hacer con audios, fotos y archivos sin texto: el canal los sigue ignorando y no se guardan;
  - cómo se cuenta «lo resolvió el asistente» (RF-SUP-05): los casos que el asistente responde quedan abiertos, sin responsable, hasta que la conversación termina por inactividad.
