# AGENTS.md

## Propósito del proyecto

Sistema de atención para Seguros Castaño con tres capacidades conectadas:

- atención automática por WhatsApp para consultas de rutina;
- derivación y seguimiento por operadores humanos;
- panel de supervisión que verifica respuestas contra la cartera, alerta riesgos y controla acciones contractuales.

La cartera de clientes y pólizas es la fuente de verdad. El bot informa, pero nunca dispone ni modifica contratos por sí solo.

## Contexto funcional obligatorio

### Alcance de la primera etapa

Incluye gestión de clientes, teléfonos, prospectos, pólizas, coberturas, vencimientos, situación de pago, siniestros, conversaciones, derivaciones, verificación de respuestas, alertas, aprobación de acciones críticas, métricas, perfiles de acceso y auditoría.

El asistente opera únicamente por WhatsApp. La atención humana funciona de lunes a viernes de 9 a 18, configurable. El asistente contesta siempre; si deriva fuera de ese horario, el cliente recibe el mensaje de derivación habitual, sin aviso de que no hay atención humana, y el caso queda pendiente hasta la apertura. El tiempo para alertar un caso derivado sin tomar corre solo dentro del horario de atención.

La comunicación con el cliente debe ser natural, clara y cordial. Mientras la agencia no confirme la forma de presentación del asistente (ver Decisiones abiertas): no anunciar que responde una inteligencia artificial, pero nunca afirmar que es una persona si el cliente lo pregunta. Esto no autoriza a inventar información ni a ocultar una derivación: cuando una consulta deba pasar a una persona, informar que será atendida por un miembro del equipo.

Mensaje sugerido para derivaciones: “Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle”. El texto puede adaptarse al contexto, pero debe conservar un tono humano y no prometer tiempos o resultados no confirmados.

### Fuera de alcance

No implementar emisión ni cotización de pólizas, integración con compañías, contabilidad, comisiones, cobranzas, pagos, reembolsos automáticos, otros canales, ni aplicación móvil para clientes. Un pedido de reembolso se registra como aviso al equipo.

### Entregas

- Parcial 1 (08/10/2026): la cátedra pide migración y limpieza de los datos históricos, CRUD de las entidades principales y flujo operativo inicial con validaciones. Lo que el equipo acordó mostrar está en «Parcial 1: alcance y flujo».
- Parcial 2 (05/11/2026): reglas de negocio complejas, reportes y métricas, y control de acceso por rol.
- Para aprobar, el sistema tiene que funcionar de punta a punta y procesar los datos históricos.

### Reglas de negocio no negociables

1. Identificar clientes por DNI. Una persona puede tener varios teléfonos y un teléfono puede pertenecer a varias personas. La única excepción es un número de WhatsApp vinculado a un solo cliente activo: identifica a ese cliente sin pedir el DNI (regla 2). Un número compartido no identifica a nadie. El sistema comprueba si el número está vinculado para elegir el inicio del flujo. También hay clientes empresa (CUIT + razón social); si el asistente les pide CUIT todavía no está definido.
2. Si el teléfono está vinculado a un solo cliente activo, la conversación queda identificada con ese cliente y no se pide el DNI. Si está vinculado a más de un cliente, pedir el DNI al iniciar cada conversación. Si no está vinculado, preguntar si ya es cliente o si es nuevo; la IA interpreta la respuesta como cliente nuevo, cliente existente o ajena/ambigua. Ante una respuesta ajena o ambigua, volver a preguntar. Si es existente, pedir el DNI. Si un DNI no se reconoce, con el teléfono vinculado o no, volver a preguntar si ya es cliente o si es nuevo y, si confirma que ya es cliente, pedirle el DNI de nuevo. Al cuarto DNI no reconocido (3 reintentos), derivar. Si quien escribe desde un número vinculado da el DNI de un cliente que no está vinculado a ese número, o si en una conversación ya identificada da un DNI distinto del del cliente identificado, derivar.
3. Si es cliente nuevo, pedir nombre y apellido, DNI y una foto del DNI. Guardar nombre, DNI y número de WhatsApp en un prospecto pendiente; no guardar una copia de la foto en el sistema. Derivar para que un miembro autorizado del equipo confirme el alta.
4. Responder solo con información de la cartera sobre el cliente identificado, o con la información de la agencia (ramos y planes activos, dirección, teléfono y horario de atención, RF-ATE-06), que no es de ningún cliente: nunca mostrar datos de otro cliente, aunque comparta el teléfono. Ante duda, dato ausente o consulta de accidentes, siniestros o cotizaciones, derivar. Si la consulta no se entiende, repreguntar hasta 2 veces seguidas; si el tercer mensaje seguido tampoco se entiende, derivar.
5. Cuando una consulta se deriva, el cliente recibe el mensaje de derivación y el asistente deja de responder en esa conversación hasta que se cierre el caso (RF-DER-03). Lo que el cliente siga escribiendo queda en el mismo caso para el operador, y la inactividad no cierra una conversación que tenga un caso derivado abierto.
6. Una derivación debe comunicarse como transferencia a un miembro del equipo, sin mencionar bots, inteligencia artificial ni fallas internas.
7. Verificar cada respuesta antes de enviarla. Retener la respuesta si contiene datos falsos, no verificables, datos personales expuestos, manipulación del asistente o compromiso de una acción no autorizada. Una respuesta retenida no se envía y la consulta se deriva a un operador.
8. Las bajas, modificaciones de contrato y altas de conductor quedan pendientes de aprobación. Solo pueden aprobar Roberto (rol Administrador), Graciela o Diego (rol Operador); Graciela puede aprobar casos que ella misma atendió. La aprobación registra quién, cuándo y por qué.
9. El cambio de teléfono (RF-CAR-05) también queda pendiente de aprobación, pero es un dato de cartera y no una acción crítica: no genera la alerta «Pedido de acción crítica».
   - Si una persona indica que ya es cliente desde un número no vinculado, el asistente pide el DNI. Si coincide, registra una solicitud pendiente de cambio de teléfono; no vincula el número hasta que un operador la apruebe. Informa al cliente que la decisión queda pendiente, sigue atendiendo sus consultas en esa conversación como cliente identificado y le comunica el resultado por ese WhatsApp.
   - El número nuevo es el de la conversación. Si alguien pide el cambio escribiendo desde un número que ya tiene vinculado, el asistente le pide que escriba desde el nuevo.
   - Al aprobar, el operador elige qué números anteriores del cliente se desvinculan (puede no elegir ninguno). Solo cambia el vínculo de ese cliente, no el de otros que compartan el número.
   - Al aplicar el cambio, el sistema anota en el `detalle` de la solicitud qué número vinculó y cuáles desvinculó, y le avisa la decisión al cliente en ese número.
10. Cada respuesta, corrección, derivación, aprobación y rechazo debe ser auditable.

### Casos y cierre

- Un caso por consulta: un mensaje abre un caso nuevo cuando cambia la intención que detecta el LLM; mientras sea la misma, sigue en el mismo caso. La respuesta del asistente va al caso de la consulta que responde.
- La solicitud de cambio de teléfono forma su propio caso.
- Solo cierra el responsable del caso; si lo quiere cerrar otro, primero lo toma. Cuando una conversación termina por inactividad, se cierran sus casos no derivados que no tengan nada pendiente (ni una alerta sin atender ni una solicitud sin decidir); esos casos quedan sin responsable.
- El caso de un cambio de teléfono lo cierra quien aprueba o rechaza el pedido, en el mismo paso, y queda como responsable.

## Parcial 1 (08/10/2026): alcance y flujo

Se muestra una conversación por WhatsApp de punta a punta, con los datos históricos migrados. Mientras la cátedra no diga otra cosa, el Parcial 1 no incluye ABM.

1. Si el número de WhatsApp está vinculado a un solo cliente activo, el asistente lo atiende como ese cliente sin pedir el DNI. Si está vinculado a varios, pide el DNI antes de responder cualquier cosa, salvo la información de la agencia. Si no está vinculado, pregunta si ya es cliente o si es nuevo; la IA interpreta la respuesta y, si es un cliente existente, se pide y valida el DNI.
2. Para un cliente nuevo, el asistente solicita nombre y apellido, DNI y foto del DNI; guarda nombre, DNI y teléfono como prospecto pendiente, no conserva una copia de la foto y deriva el caso.
3. Para un número no vinculado, el LLM primero clasifica la respuesta a «¿ya es cliente o es nuevo?» como cliente nuevo, cliente existente o ajena/ambigua. Para los números vinculados a varios clientes, y para quienes confirman que ya son clientes, el DNI sigue siendo obligatorio. Una vez identificado, el LLM elige la intención de una lista cerrada: el catálogo `tipo_consulta` (que incluye «cambio de teléfono» e «información de la agencia»), más «no es de seguros», «otra consulta» y «no se entiende». Antes de identificarse, en los mensajes sin DNI, la elige solo para saber si piden la información de la agencia.
4. Según la intención:
   - Vencimiento o estado de la póliza: responde el asistente. Si el cliente tiene varias pólizas, responde todas juntas, una línea por póliza con el número, el ramo y el dato pedido.
   - Saludo o agradecimiento: responde con una plantilla de cortesía, sin derivar.
   - Información de la agencia (ramos y planes activos, dirección, teléfono y horario de atención): responde el asistente, también antes de identificarse, y después repite la pregunta pendiente (si ya es cliente o el DNI). No la responde mientras toma los datos de un cliente nuevo ni en silencio.
   - Cambio de teléfono pedido desde un número ya vinculado: le pide que escriba desde el número nuevo.
   - Baja o modificación (incluida el alta de conductor): le avisa que un miembro del equipo va a revisar el pedido, sin darlo por hecho, y deja de responder en esa conversación.
   - Lo que no es de seguros, incluidas las preguntas sobre cómo funciona el asistente: contesta con un texto fijo que no tiene que ver con Seguros Castaño, sin redacción de la IA y sin derivar.
   - Lo que no se entiende, ni con los mensajes anteriores: repregunta con un texto fijo, hasta 2 veces seguidas; si el tercer mensaje seguido tampoco se entiende, deriva.
   - Cualquier otra cosa (incluidos siniestro, cotización, saldo, cobertura, reclamo, medios de pago y pedidos de grúa o asistencia): deriva a la bandeja de un operador.

Reglas del Parcial 1:

- El LLM elige la intención de una lista cerrada (salida estructurada estricta), con los últimos 4 mensajes de la conversación como contexto (con el DNI tapado y como dato, no como instrucciones), y vuelve a redactar la plantilla completada con los datos, sin cambiarlos; el código controla que los datos no cambien y, si cambian, deriva. El motor de verificación (RF-VER-02) todavía no está.
- El asistente consulta y guarda los datos operativos en MySQL. `backend/fixtures/clientes-ficticios.json` se reserva para pruebas automatizadas; los datos históricos se cargan siguiendo `docs/migracion.md`.
- El asistente guarda cada conversación en la base (`conversacion`, `caso`, `mensaje` y `respuesta`). El silencio después de derivar, de mandar a aprobar o de registrar un prospecto dura hasta que se cierre el caso derivado (`asistente_suspendido`).
- Si se reinicia el backend, la conversación que no está en silencio termina cuando el número vuelve a escribir, y ese mensaje empieza una conversación nueva. El silencio después de derivar o de mandar a aprobar sí se conserva (regla 5).
- Desvíos provisionales: la baja y la modificación (incluida el alta de conductor) se derivan sin registrar la solicitud pendiente (regla 8), y los mensajes repetidos se descartan en memoria, porque la base no guarda el id del mensaje de WhatsApp: después de un reinicio, un reintento de WAHA puede duplicar un mensaje.
- Los textos de las plantillas los propone la IA que programa, en el PR, con el tono de «Contexto funcional». El equipo los revisa ahí.
- Login en Frontend: la interfaz incluye la pantalla de inicio de sesión con los usuarios de prueba (`admin` y `operador` / clave `1234`) para simular el acceso según el rol. El backend atribuye todo lo que se hace desde el panel al usuario de prueba `operador` y la autenticación real de servidor se integrará en el Parcial 2.
- El operador le contesta al cliente desde el panel: el mensaje sale por WhatsApp desde el número del asistente y queda guardado con origen «operador».
- La migración de la planilla sigue `docs/migracion.md`. El Excel limpio no está en el repo: se copia a `backend/planilla/` (ignorada) y se carga con `docker compose exec backend npm run migrar-planilla` (script `backend/scripts/migrar-planilla.ts`).

## Arquitectura y convenciones

- Frontend: React 19 + TypeScript + Vite, en `frontend/`.
- Backend: Node.js + TypeScript + Express, en `backend/`.
- Persistencia: MySQL 8.4 + Prisma 7, con Docker Compose. El esquema es SQL-first: cada cambio de la base es una migración SQL escrita a mano en `backend/prisma/migrations`, y `schema.prisma` se regenera con `prisma db pull`. El flujo está en la skill `backend-datos`.
- Mensajería: WhatsApp con WAHA (WhatsApp HTTP API) y el motor GOWS, un servicio no oficial que se conecta a WhatsApp Web por websocket, sin navegador, con un WhatsApp vinculado por QR. No es la API oficial de Meta, que exige verificar el negocio. Corre en el compose como servicio `waha`, con el perfil `whatsapp`, y avisa cada mensaje al webhook del backend (`/webhooks/whatsapp`). La sesión que guarda no se sube al repo.
- IA del asistente: Groq con el modelo `openai/gpt-oss-20b` (plan gratuito), por la API compatible con OpenAI. Se configura con `AI_API_URL`, `AI_API_KEY` y `AI_MODEL`.
- Todo corre en Docker Compose (`db`, `backend`, `frontend`) con recarga automática: Node y las dependencias viven en los contenedores, no hace falta instalarlos en la máquina.
- El repo se clona dentro de WSL, no en una carpeta de Windows: la recarga automática falla en montajes de Windows.
- La aplicación debe trabajar con fechas almacenadas en UTC y convertirlas a hora argentina solo para mostrar.
- Mantener separación entre reglas de dominio, acceso a datos, transporte HTTP, integración de mensajería y presentación.
- Evitar que un handler HTTP, componente React o prompt de IA sea la única implementación de una regla crítica.
- Mantener TypeScript estricto y no silenciar errores con `any`, `@ts-ignore` o aserciones innecesarias.
- Preferir cambios pequeños, nombres explícitos y APIs existentes del proyecto antes que nuevas abstracciones.

## Guía visual y de contenido

- Interfaz de supervisión en español, con tono claro, profesional y natural para Argentina.
- Preservar la dirección de los mockups: sidebar azul marino, fondo gris muy claro, superficies blancas, azul para acción primaria, verde para éxito, ámbar para advertencia y rojo para riesgo o rechazo.
- Priorizar densidad operativa, lectura rápida, estados visibles y acciones inequívocas sobre decoración.
- Las alertas deben comunicar gravedad y motivo; no usar color como única señal.
- Mantener los módulos del panel: Dashboard, Bandeja de Atención, Trámites por Aprobar y Base de Clientes.
- No presentar datos ficticios como datos reales. Los fixtures deben estar marcados o documentados.

## Seguridad, privacidad y auditoría

- Tratar DNI, teléfonos, pólizas, conversaciones y datos de siniestros como información sensible.
- Aplicar autorización por rol en backend; ocultar una acción en frontend nunca es suficiente.
- Validar entradas y salidas en los límites del sistema. No confiar en texto generado por IA.
- No guardar secretos, tokens, contraseñas ni datos de producción en el repositorio.
- Toda mutación contractual debe tener actor, timestamp, motivo, estado anterior y estado nuevo.
- Ante una duda entre responder o derivar, derivar.

## Flujo de trabajo esperado

1. Leer la skill aplicable antes de cambiar una superficie del proyecto.
2. Localizar la regla de negocio y su prueba o punto de integración más cercano.
3. Implementar el cambio mínimo, preservando APIs y estilo existentes.
4. Verificar primero el slice afectado y después ejecutar las comprobaciones globales disponibles.
5. Actualizar documentación o decisiones abiertas cuando el cambio modifique el comportamiento acordado.

## Especificaciones con OpenSpec (opcional)

Algunas tareas se planifican con OpenSpec antes de programarlas. Usarlo no es obligatorio: una tarea sin change se trabaja como siempre. La guía está en `openspec/README.md`.

- `openspec/changes/<nombre>/` tiene la propuesta, las specs, el diseño y las tareas de un cambio en curso. Si la tarea que te pidieron tiene un change, leerlo antes de tocar código, seguir sus tareas y marcarlas en `tasks.md` al terminarlas.
- `openspec/specs/` describe el comportamiento ya implementado, una spec por módulo de `docs/requisitos.md`. No se edita a mano: se actualiza al archivar un change.
- En OpenCode se usa con los comandos `/opsx-*` y los agentes `spec` (planifica, solo escribe en `openspec/`) y `revisor-spec` (revisa un change, solo lectura). Por ahora los comandos y los agentes están solo para OpenCode.

## Git (obligatorio por la consigna)

- No commitear ni pushear a `main`. Trabajar en una rama `feature/<tema>` y abrir un pull request.
- La cátedra audita la participación individual por el historial de commits: cada integrante commitea su propio trabajo con su usuario de Git.
- Citar en el commit o en el PR los IDs de los requisitos afectados (RF-CAR, RF-ATE, RF-DER, RF-VER, RF-SUP, RF-APR). La lista está en `docs/requisitos.md`; no inventar IDs.
- Antes de abrir el PR, actualizar la rama con `main` (la cátedra recomienda rebase en lugar de merge).

## Comandos de verificación

Desde la raíz del repo, en la terminal de WSL y con el stack levantado (`docker compose up -d --build`):

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
docker compose exec backend npx prisma generate
docker compose exec backend npx tsc --noEmit
docker compose exec backend npm test
```

Si se cambia `docker-compose.yml`, validar con `docker compose config`.

Las pruebas se escriben con Vitest, en el backend y en el frontend. En el backend ya está instalado (`npm test`, pruebas en `backend/src/**/*.test.ts`); en el frontend todavía no: el primer PR que sume pruebas ahí lo instala y agrega el comando a esta sección. Toda nueva regla crítica debe venir con una prueba de dominio o de integración que demuestre el caso permitido y el caso retenido o derivado.

## Decisiones abiertas

No cerrar por código sin confirmación del cliente. Si una tarea depende de alguna, preguntar o dejarla configurable y documentada:

- Forma final de presentación del asistente (mientras tanto rige lo de "Contexto funcional").
- Si después de derivar el asistente deja de responder del todo en esa conversación o sigue con otras consultas simples. Mientras tanto rige RF-DER-03.
- Fuera de horario (RF-DER-04) y el cambio de teléfono por WhatsApp (RF-CAR-05) son propuestas del equipo que la agencia todavía no validó. Mientras tanto rigen como están escritas.
- No pedir el DNI cuando el número está vinculado a un solo cliente activo (reglas 1 y 2) es una propuesta del equipo (07/10/2026) que la agencia todavía no validó: en la entrevista del 16/09/2026 pidió identificar por DNI en todos los casos (RF-ATE-03). Mientras tanto rige como está escrita.
- Responder la información de la agencia (RF-ATE-06), también antes de identificarse, es una propuesta del equipo (07/10/2026) que la agencia todavía no validó. Mientras tanto rige como está escrita.
- Dirección y teléfono de la agencia: los que informa el asistente («Ficticia 123» y 11 7816-8015) son datos de ejemplo, guardados en `parametro_configuracion` y marcados así, hasta que la agencia informe los reales.
- Si el Parcial 1 tiene que incluir ABM. Mientras tanto, no.
- Requisitos y documentación de cada acción crítica, y si un alta de conductor aprobada la aplica el sistema o la carga el operador.
- Qué ficha vale en los clientes duplicados y quién es el titular del VW Gol. Mientras tanto, la migración sigue `docs/migracion.md`: el duplicado exacto quedó en una sola fila y las pólizas POL-00126 y POL-00131 se omiten.
- Inconsistencias entre las hojas de la planilla (casos vinculados a una póliza de otro ramo, un vencimiento que no coincide y primas sin símbolo de moneda). Mientras tanto, esos casos quedan sin póliza y las primas sin símbolo se toman como pesos.
- Valores del catálogo de planes (el nombre "riesgos incompletos" está a verificar) y coberturas de vida, hogar y embarcaciones, que no se relevaron. La estructura sí está decidida: los planes son iguales para cualquier bien y se cargan con ABM.
- Compañía aseguradora: que Seguros Castaño figure como la aseguradora es un supuesto del equipo.
- Cuotas de las pólizas.
- Si el asistente pide CUIT a los clientes empresa.
- Tratamiento de datos sensibles.
- Qué hace el asistente con los audios, las fotos y los archivos sin texto. Mientras tanto, el canal los ignora sin responder y deja una línea en el log del backend; si la foto trae epígrafe, procesa el texto. Las excepciones son la foto del DNI del cliente nuevo y la imagen que llega a una conversación en silencio: se procesan sin guardar la imagen, y queda un mensaje con un texto que dice que el cliente la mandó.
- Minutos para alertar una derivación sin tomar (60, provisorio) y minutos de inactividad que cierran una sesión (30, provisorio).
- Cómo se cuenta «lo resolvió el asistente» en las métricas (RF-SUP-05). Definirlo antes de programarlas.

## Documentación de diseño (Hito 0)

En `docs/`. Es la referencia para lo que ya está acordado; si el código tiene que apartarse de ella, preguntar antes.

- `requisitos.md`: los 29 requisitos funcionales con su origen en el material del cliente. Es copia del documento de análisis, que sigue siendo la fuente oficial (RF-CAR-05 y RF-ATE-06 todavía no están en el documento).
- `caso8_der.md` (+ `.puml`, `.svg`, `.png`): DER, convenciones de la base y decisiones de modelado. Los cambios del 28/09 están en el `.md`, en el `.puml` y en las migraciones.
- `01_esquema.sql` y `02_catalogos.sql`: esquema en MySQL alineado uno a uno con el DER, como quedó en el Hito 0. No se corren: el esquema vigente está en `backend/prisma/migrations`, sin la tabla `auditoria`, que queda para el MVP 2.
- `caso8_tabla_de_eventos.md` y `caso8_diagrama_contexto.puml`: eventos de negocio y diagrama de contexto (DFD nivel 0).
- `migracion.md`: reglas de la migración de la planilla histórica y de los usuarios.

## Skills del proyecto

Están en `.claude/skills/` con el formato estándar (`SKILL.md` con `name` y `description`). OpenCode y Claude Code las encuentran solos y cargan cada una cuando la tarea coincide con su descripción:

- `dominio-seguros`: reglas, flujos y estados del negocio.
- `backend-datos`: API, Prisma, MySQL y consistencia.
- `frontend-panel`: panel, UX visual y accesibilidad.
- `verificacion-seguridad`: IA, privacidad, autorización y auditoría.

Claude Code lee este archivo solo mientras no haya un `CLAUDE.md` en el repo: no crear uno (tampoco con `/init`). Si alguna vez hace falta, que empiece con `@AGENTS.md`.
