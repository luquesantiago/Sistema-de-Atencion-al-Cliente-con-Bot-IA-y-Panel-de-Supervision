# Proposal

## Why

Para la demo del Parcial 1 (08/10/2026) al asistente que dejó `asistente-con-base` en `main` (PR #19) le faltan dos cosas:

- **No contesta las preguntas generales sobre la agencia** («¿qué seguros tienen?», «¿dónde están?», «¿a qué hora atienden?»).
  - Con un cliente identificado, caen en «no sé»: se derivan y la conversación queda en silencio.
  - Antes de identificarse, se guardan como la consulta a responder recién cuando la persona da su DNI. Quien todavía no es cliente no recibe la respuesta nunca.

  Son consultas de rutina, sin riesgo, que hoy le llegan al equipo (RF-ATE-01).
- **No entiende lo que depende del mensaje anterior.** `classifyIntent` recibe solo el mensaje actual, así que «¿y la del auto?» cae en «no sé», se deriva y la conversación queda en silencio hasta que un operador cierre el caso (RF-DER-03). Hoy «no sé» junta dos cosas distintas: lo que se entiende pero el asistente no responde, y lo que no se entiende.

## What Changes

Decisiones de Santiago del 07/10/2026 (el cómo está en `design.md`):

- **A. Información de la agencia (RF-ATE-06, requisito nuevo):**
  - Hay una intención nueva, «información de la agencia», que se suma al catálogo `tipo_consulta` con una migración de datos (SQL-first).
  - Una sola plantilla trae:
    - los ramos y los planes activos (`ramo` y `plan`);
    - la dirección y el teléfono;
    - el horario de atención (`horario_atencion`, hoy de lunes a viernes de 9 a 18).
  - La dirección («Ficticia 123») y el teléfono (11 7816-8015) son de ejemplo, porque la agencia no los informó. Van en dos filas nuevas de `parametro_configuracion`, con una descripción que lo aclara.
  - Sigue el patrón de hoy:
    - la IA elige la intención de la lista cerrada;
    - el código arma la plantilla con los datos y la IA solo la vuelve a redactar;
    - si la redacción cambia un dato, se deriva. El control suma una regla: cada ramo, cada plan, la dirección, el teléfono y cada tramo del horario tienen que aparecer tal cual.

    La IA nunca escribe una respuesta libre. Si falta un dato, se deriva (RF-ATE-02).
  - **En cualquier momento**, también antes de identificarse: número no vinculado, número compartido, esperando el DNI o la respuesta a «¿ya es cliente o es nuevo?». Se puede porque la respuesta no muestra datos de ningún cliente.
    - En esas etapas, si el mensaje no trae un DNI, la IA elige su intención con el DNI tapado. Solo esta intención cambia el flujo.
    - El asistente responde y después repite la pregunta pendiente. No cuenta como intento de DNI y ese mensaje no queda como la consulta guardada. El mensaje y la respuesta van al caso actual de la identificación, sin tipo.
    - No aplica mientras el asistente toma los datos de un cliente nuevo (nombre, DNI y foto).
  - **No durante el silencio** después de derivar o de mandar a aprobar: RF-DER-03 y la regla 5 de AGENTS.md no cambian.
- **Lo que se sigue derivando:**
  - los medios de pago: la agencia no los informó, y pagos y cobranzas están fuera de alcance;
  - los pedidos de grúa o asistencia: el número depende de la compañía y no se relevó, y además suelen venir de un choque o una falla (RF-ATE-04).

  Las descripciones de la lista los ubican en «otra consulta», para que no caigan en «no es de seguros» y queden sin respuesta. Coberturas y precios siguen como hoy.

  Un mensaje que pide información de la agencia y además menciona un accidente, un siniestro, una cotización u otro pedido que se deriva («choqué, ¿me pasan el teléfono?») se deriva: las instrucciones de la lista le dan prioridad a esa opción (RF-ATE-04).
- **Nada técnico:** las preguntas sobre el modelo, cómo decide, sus instrucciones, la base o el sistema se describen como «no es de seguros». Reciben el mismo texto fijo que lo que no tiene que ver con la agencia (siguiente punto) y no revelan nada. La regla de presentación de AGENTS.md (no anunciar que es IA, nunca afirmar que es una persona) no cambia.
- **Lo que no tiene que ver con la agencia** (decisión de Santiago del 08/10/2026, durante la prueba manual):
  - «no es de seguros» contesta un texto fijo, sin redacción de la IA y sin derivar: «Disculpe, esa consulta no tiene que ver con Seguros Castaño. Si tiene una consulta sobre sus seguros, estamos para ayudarlo.»;
  - «otra consulta» queda para las consultas sobre seguros o sobre la agencia, para que lo ajeno no se derive;
  - antes de identificarse no cambia: sigue la identificación.

  Cambia lo decidido el 07/10 (las preguntas técnicas se ignoraban) y lo del change `asistente-respuestas-limitadas` (lo que no es de seguros no se contestaba).
- **Redacción con razonamiento bajo** (decisión de Santiago del 08/10/2026): el pedido de redacción a Groq va con `reasoning_effort: low`. Con el valor por defecto, Groq rechazaba (HTTP 400) la redacción de la información de la agencia y se derivaba. La clasificación sigue con el razonamiento por defecto.
- **B. Contexto para elegir la intención (RF-ATE-01):**
  - Además del mensaje, la IA recibe los últimos 4 mensajes de la conversación abierta, del cliente y del asistente, en orden y marcados como contexto.
  - Pasan por el mismo enmascarado de DNI que el mensaje actual (`maskDni`).
  - Van como dato: la IA no sigue lo que digan y sigue eligiendo de la lista cerrada. La tabla de intención a acción no cambia por el contexto.
- **B. «No entendí» separado de «no puedo responder» (RF-ATE-01):** «no sé» se reemplaza por dos valores fuera del catálogo.
  - «otra consulta»: se entiende pero el asistente no la responde. Se deriva, como hoy «no sé».
  - «no se entiende»: el asistente repregunta con una plantilla fija, sin redacción de la IA, que pide aclarar la consulta sin listar datos de las pólizas.
    - Repregunta hasta 2 veces seguidas. Si el tercer mensaje seguido tampoco se entiende, deriva con el motivo «no se entendió la consulta».
    - El contador vuelve a cero cuando un mensaje se entiende. Vive en memoria, como la etapa de la identificación: un reinicio ya termina la conversación.
    - El mensaje no entendido y la repregunta van al caso actual si no tiene tipo. Si lo tiene, van a un caso nuevo sin tipo, como con «otra consulta». Así los tres mensajes, las repreguntas y la derivación quedan juntos, y nunca se deriva un caso con tipo, como el del cambio de teléfono. Lo decidió Santiago después de la revisión del change, el 07/10/2026.
    - Antes de identificarse no se repregunta: la identificación sigue como hoy.
- **Fallas de Groq:**
  - con un cliente identificado, siguen derivando como hoy; solo se repregunta cuando la IA contestó «no se entiende»;
  - antes de identificarse, si falla el pedido de la intención, la identificación sigue como si el mensaje no pidiera información de la agencia.
- **Documentación:**
  - `docs/requisitos.md`: RF-ATE-06 al final de los RF-ATE, sin renumerar;
  - AGENTS.md:
    - la regla 4 («responder solo con información de la cartera», «ante duda… derivar»);
    - los puntos 1, 3 y 4 de «Parcial 1» («pide el DNI antes de responder cualquier cosa», «una vez identificado, el LLM elige la intención», «no sé», «lo que no se pueda clasificar: deriva» y «lo que no es de seguros: no contesta ni deriva»);
    - la primera de las «Reglas del Parcial 1», por el contexto;
    - la cantidad de requisitos;
    - en «Decisiones abiertas», que RF-ATE-06 es una propuesta del equipo que la agencia todavía no validó, y que la dirección y el teléfono son de ejemplo;
  - `README.md`: la cantidad de requisitos y «respondidas solo con datos de la cartera»;
  - `docs/caso8_der.md`: los valores nuevos y la descripción de `parametro_configuracion`;
  - `openspec/config.yaml`: la cantidad de requisitos;
  - las skills `backend-datos` y `verificacion-seguridad`, donde dicen que las respuestas salen solo de la cartera, y en `verificacion-seguridad` también el contexto que sale a Groq y el texto fijo para lo que no es de seguros.

**Fuera de alcance:**
- medios de pago, grúa y asistencia: se derivan;
- coberturas y precios: se siguen derivando;
- los endpoints y las pantallas del panel;
- el ABM de los datos de la agencia;
- la verificación de RF-VER-02;
- el docx y el Drive.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `atencion-automatizada`:
  - se agregan tres requirements:
    - la información de la agencia en cualquier momento (RF-ATE-06);
    - el contexto para elegir la intención (RF-ATE-01);
    - la repregunta cuando no se entiende (RF-ATE-01);
  - cambian cuatro:
    - la acción que sale de la intención, con la lista nueva (RF-ATE-01);
    - la identificación, que antes del DNI responde la información de la agencia (RF-ATE-03, RF-ATE-06);
    - la conversación que termina por inactividad: el mensaje que abre la conversación nueva no queda como consulta guardada si pide información de la agencia (RF-ATE-03);
    - la redacción controlada, que suma los datos de la agencia y el contexto (RF-ATE-02).

**Orden de archivado:** tres de los requirements que cambian parten del texto de `asistente-con-base`, que está en `main` sin archivar. Ese change se archiva antes que este, y para eso faltan sus tareas manuales 5.2 a 5.4, 5.6 y 5.7.

No se citan, porque este change no los cumple o no los cambia:
- RF-DER-03: el silencio no cambia; un escenario confirma que la información de la agencia tampoco se contesta en silencio;
- RF-ATE-04: siniestros y cotizaciones se siguen derivando. La grúa se deriva por «otra consulta», y la prioridad de las instrucciones cuida que la información de la agencia no tape un siniestro;
- RF-VER-02: no hay verificación ni alertas;
- RF-SUP-05: no hay métricas.

## Impact

- **Código (backend):**
  - `domain/`:
    - `intent.ts`: los valores nuevos y la acción «repreguntar»;
    - `conversation.ts`: `isQueryType` y el caso de «no se entiende»;
    - `ai-client.ts`: `classifyIntent` recibe el contexto;
    - `templates.ts`: la repregunta;
    - `rewrite-check.ts`: los datos que tienen que aparecer tal cual;
    - `agency-info.ts`, nuevo: la interfaz que lee la información de la agencia y la plantilla;
  - `infrastructure/`:
    - `openai-compatible-client.ts`: las descripciones y el contexto;
    - `prisma-agency-info.ts`, nuevo;
    - un doble en memoria para las pruebas;
  - `application/process-incoming-message.ts` y su prueba, e `index.ts`;
  - `http/app.test.ts`: su `FakeAi` y la construcción de `ProcessIncomingMessage`.

  `http/app.ts`, el canal y el almacén de conversaciones no cambian.
- **Base:** una migración de solo datos suma «información de la agencia» a `tipo_consulta`, y `direccion_agencia` y `telefono_agencia` a `parametro_configuracion`. No hay tablas ni columnas nuevas, `schema.prisma` no cambia y ningún dato migrado se modifica.
- **Riesgos:**
  - antes de identificarse, cada mensaje sin DNI hace un pedido más a Groq (plan gratuito: 30 por minuto, 1.000 por día y 8.000 tokens por minuto, y el contexto suma tokens a cada pedido);
  - el número compartido que espera el DNI pasa a mandarle a Groq el texto, con el DNI tapado;
  - el contexto le vuelve a mandar a Groq lo que ya contestó el asistente, con los datos de las pólizas del cliente identificado que ya habían salido en la redacción;
  - el contexto también puede llevar mensajes que antes no salían a Groq, como lo que el cliente escribió en silencio para el operador o el nombre de un cliente nuevo;
  - dos cosas dependen solo de las instrucciones al modelo: que los medios de pago y la grúa no caigan en «no es de seguros», y que un mensaje que mezcla un siniestro con un pedido de información se derive. AGENTS.md pide evitar que un prompt sea la única implementación de una regla crítica. Santiago aceptó el riesgo el 07/10/2026 en lugar de sumar un resguardo por palabras clave, y se prueba a mano con Groq;
  - la dirección y el teléfono de ejemplo se le muestran como reales a quien escriba al número de la demo, y el teléfono tiene formato de número real;
  - el asistente muestra el plan «riesgos incompletos», cuyo nombre la agencia todavía no confirmó;
  - lo que la IA tome por «no es de seguros» recibe el texto fijo en lugar de la respuesta o la derivación, y lo que tome por «no se entiende» demora hasta dos mensajes la derivación;
  - con la información de la agencia el control es más estricto: si la redacción cambia el formato del teléfono o del horario, se deriva.
- **Preguntas abiertas que el change no cierra** (de «Decisiones abiertas» de AGENTS.md):
  - la dirección y el teléfono son de ejemplo hasta que la agencia informe los reales. Queda anotado en «Decisiones abiertas»;
  - los valores del catálogo de planes (el nombre «riesgos incompletos» y los planes de vida, hogar y embarcaciones): el asistente lista los planes activos del catálogo tal como están;
  - la forma final de presentación del asistente: no cambia;
  - si después de derivar el asistente sigue con otras consultas simples: rige RF-DER-03, y la información de la agencia tampoco se contesta en silencio;
  - el fuera de horario (RF-DER-04): el horario que informa el asistente es el de `horario_atencion`, y la derivación fuera de horario sigue sin avisar que no hay atención humana;
  - el tratamiento de datos sensibles: el contexto suma mensajes anteriores a lo que sale a Groq;
  - cómo se cuenta «lo resolvió el asistente» (RF-SUP-05): los casos de información y las repreguntas quedan como cualquier caso respondido.
- `docs/caso8_tabla_de_eventos.md` no tiene un evento para la consulta de información general. Este change no lo agrega.
