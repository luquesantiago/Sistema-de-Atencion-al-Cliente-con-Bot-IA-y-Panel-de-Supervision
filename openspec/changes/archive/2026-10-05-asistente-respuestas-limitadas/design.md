# Design

## Context

Estado actual (el porqué está en `proposal.md`):

- `ProcessIncomingMessage` (`backend/src/application/process-incoming-message.ts`) recibe un `IncomingWhatsAppMessage` y responde por `WhatsAppClient`. Esa parte la dejó armada el change `canal-whatsapp-waha` y no cambia:
  - el webhook con secreto;
  - la cola por remitente;
  - la resolución de `@lid`;
  - la marca de mensaje procesado (`processedMessageIds`);
  - el 500 con estado deshecho si el proceso falla.
- El DNI se detecta con `normalizeDni`: saca todo lo que no es dígito de todo el mensaje y exige de 7 a 8 dígitos. Así, «¿vence el 15/11/2026?» da `15112026` y se toma como un DNI, y una pregunta con un número suelto deja de ser un DNI. Se reemplaza (decisión 2).
- `AiClient` (`domain/ai-client.ts`) tiene `classify` (tres categorías, JSON libre validado a mano) y `generateResponse` (texto libre). `OpenAiCompatibleClient` llama a `POST {AI_API_URL}/chat/completions` con `fetch`.
- Los clientes salen de `CUSTOMERS_JSON` (`infrastructure/in-memory-customer-repository.ts`), que se parsea con un `as Customer[]` sin validar. `CustomerPolicy.status` usa `ACTIVE | SUSPENDED | CANCELLED`, que no son los valores de `estado_poliza` (activa, suspendida por mora, dada de baja).
- El backend no tiene pruebas ni Vitest. `tsconfig` es estricto, con `noUncheckedIndexedAccess`.

### Lo verificado de Groq

Verificado el 05/10/2026 en console.groq.com/docs (`/structured-outputs` y `/rate-limits`):

- `openai/gpt-oss-20b` figura entre los modelos con modo estricto (`strict: true`). La doc dice que usa decodificación restringida, que garantiza que la salida cumpla el esquema y que nunca devuelve JSON inválido.
- En modo estricto, todos los campos tienen que estar en `required` y todos los objetos tienen que llevar `additionalProperties: false`. Admite `enum`. No admite streaming ni tools junto con la salida estructurada.
- Se pide con `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` en la API compatible con OpenAI.
- Vuelto a confirmar el 05/10/2026, al implementar (tarea 3.2): `openai/gpt-oss-20b` sigue en la lista de modo estricto, junto con `openai/gpt-oss-120b` y `qwen/qwen3.8-27b`, y la respuesta llega como texto JSON en `choices[0].message.content`.
- **Plan gratuito** para `openai/gpt-oss-20b`: 30 pedidos por minuto, 1.000 por día, 8.000 tokens por minuto y 200.000 por día. Si se pasa, responde 429 con `retry-after`.

### Por qué no Open-Jev

Revisado el 05/10/2026 (`github.com/Zefan-Cai/Open-Jev`, commit `bd41188`):

- **No se puede conectar a Groq.** Cada modelo es un adaptador LoRA más un cabezal de decisión propio sobre una base Qwen, y hay que correrlo con PyTorch. Una API de chat como la de Groq solo devuelve texto generado, no la salida de ese cabezal.
- **No entra en la PC.** Son unos 4,6 GB de pesos. En la única prueba en CPU que documentan cargó con unos 3,2 GB de RAM y un pedido tardó 17 s; la WSL tiene unos 3,7 GB, compartidos con MySQL, el backend y WAHA.
- **El Space público es una demo:** atiende de a un pedido y recibiría DNI y mensajes de clientes.
- **Calidad:** el modelo de 2B acertó el 64,8% en su piloto de ruteo (BANKING77, en inglés), contra el 82,4% de una búsqueda por palabras clave. No hay evaluaciones en español.

Lo que sí se toma es el patrón: el modelo elige una opción de una lista cerrada y no redacta para decidir. Con la salida estructurada estricta, Groq lo garantiza.

## Goals / Non-Goals

**Goals:**
- Que toda regla crítica viva en el código y tenga una prueba: el DNI primero, el cliente identificado, la derivación de siniestros y cotizaciones, el silencio, el control de la redacción y que nunca se ejecute una acción.
- Que el decisor se pueda cambiar por otro motor sin tocar el flujo.
- Cambios chicos: el canal, el webhook y la cola quedan como están.

**Non-Goals:**
- Persistir algo en la base, leer catálogos o tocar migraciones.
- Detectar manipulación (RF-VER-01) o generar alertas (RF-VER-02).
- Casos por intención («un caso por consulta»): sin base no hay casos.

## Decisions

### 1. Tabla de intención a acción, en el dominio

Un archivo nuevo, `domain/intent.ts`, define:
- la lista cerrada de intenciones: los 11 valores de `tipo_consulta`, tal como están en las migraciones, más `no es de seguros` y `no sé`;
- una función pura `actionForIntent(intent)`, que devuelve un tipo discriminado.

| Intención | Acción |
|---|---|
| vencimiento | responder: plantilla de vencimientos |
| estado de póliza | responder: plantilla de estados |
| saludo | responder: plantilla de cortesía |
| baja, modificación, cambio de teléfono | mandar a aprobar |
| siniestro, cotización, saldo, cobertura, reclamo, no sé | derivar |
| no es de seguros | ignorar |

En la descripción de cada opción, el prompt le aclara al modelo que el agradecimiento va en «saludo», el alta de conductor en «modificación», el accidente en «siniestro» y el reembolso en «reclamo». Ninguno de esos agrega valores a la lista.

**Por qué la intención y no la acción:** la regla «siniestro y cotización se derivan siempre» queda en una tabla del código que el modelo no puede saltear, y la intención va a servir después para abrir un caso por consulta. La alternativa (que el modelo elija la acción) obligaba a controlar la acción con otra señal, como palabras clave.

### 2. Estado por número, en memoria

`ProcessIncomingMessage` guarda un estado por número de teléfono (un tipo discriminado por `stage`), además de `processedMessageIds`:

- `awaiting_dni`: tiene la consulta guardada (el primer mensaje) y los DNI no reconocidos que lleva;
- `awaiting_new_customer_answer`: lleva lo mismo, la consulta guardada y los intentos, para que un «no» seguido de un DNI correcto responda el primer mensaje;
- `awaiting_name`;
- `identified`: tiene el `id` del cliente de prueba, no el DNI;
- `silenced`: después de derivar o de mandar a aprobar.

Un número sin estado está como `awaiting_dni`, con cero intentos. Todo vive hasta que se reinicia el backend: es provisional, hasta que entre la base. Hoy existe `pendingQuestions`, y el «deshacer si falla» se generaliza: se guarda una foto del estado de ese número antes de procesar y, si algo lanza (en la práctica, el envío por WhatsApp), se restaura y se saca la marca del `messageId`. Así, el reintento de WAHA arranca igual que la primera vez. **Una falla de Groq no lanza:** el flujo la convierte en derivación (decisión 6).

**Detección del DNI:** una función pura, `findDni(text)`, reemplaza a `normalizeDni`. Busca un número de 7 u 8 dígitos, escrito junto o separado en grupos con puntos, espacios o guiones (`30111222`, `30.111.222`, `30 111 222`, `30-111-222`), que no forme parte de un número más largo ni de una fecha (`dd/mm/aaaa`). Devuelve los dígitos o `null`. Si el mensaje trae un DNI y además una pregunta, se toma solo el DNI y la pregunta se pierde: el cliente recibe la bienvenida y la vuelve a escribir. Es una limitación aceptada para no complicar el flujo provisional.

Flujo por mensaje, en orden:

1. Si `silenced`: no se envía nada y no se llama a Groq. Log `silenciado`.
2. Si `awaiting_name`: se deriva, con cualquier texto.
3. Si `identified`: se clasifica el mensaje y se aplica la acción.
4. Si el mensaje trae un DNI y estaba en `awaiting_dni` o en `awaiting_new_customer_answer`:
   - si se reconoce, pasa a `identified`. Si hay una consulta guardada, se clasifica y se aplica su acción; si no la hay, o si la consulta resulta «no es de seguros», se manda la bienvenida;
   - si no se reconoce, suma un intento. En el 1.º, pregunta si es cliente nuevo (`awaiting_new_customer_answer`). En el 2.º y el 3.º, vuelve a pedir el DNI. En el 4.º, deriva.
5. Si estaba en `awaiting_new_customer_answer` sin DNI, el sí o el no lo resuelve **el código, sin Groq**, con una función pura, `parseYesNo`. Con el texto en minúsculas y sin tildes, sin signos al principio:
   - empieza con «si», «soy nuevo» o «soy nueva»: es un sí, y le pide el nombre (`awaiting_name`);
   - cualquier otra cosa, empiece con «no» o no: se toma como un no, igual que en la regla 9 para el teléfono, y le vuelve a pedir el DNI (`awaiting_dni`, conservando la consulta guardada y los intentos).

   Así no sale ningún texto a Groq antes de identificar al cliente, como pide la spec.
6. Si estaba en `awaiting_dni` sin DNI: pide el DNI y guarda el texto solo si no había una consulta guardada. No suma intento.

Derivar y mandar a aprobar ponen el número en `silenced` **antes** de enviar. Si el envío falla, la foto lo restaura.

Los cuatro pedidos de DNI son: el inicial, el que sigue al «no es cliente nuevo» y dos reintentos más. Coincide con «3 reintentos y derivación al cuarto DNI no reconocido» de la skill `dominio-seguros`.

### 3. El decisor detrás de `AiClient`

`domain/ai-client.ts` pasa a ser:

```ts
export interface AiClient {
  classifyIntent(text: string): Promise<Intent>
  rewrite(input: { template: string; question: string | null }): Promise<string>
}
```

Cualquier error (red, HTTP distinto de 2xx, cuerpo inesperado, valor fuera del `enum`) se lanza como excepción, y el flujo decide qué hacer.

`OpenAiCompatibleClient` implementa la interfaz:

- La decisión usa `response_format` con `json_schema`, `strict: true` y un objeto `{ intencion: enum }`, con `required` y `additionalProperties: false`. Corre con `temperature: 0`.
- `rewrite` usa el esquema `{ texto: string }` con el mismo modo estricto.
- La respuesta se vuelve a validar en el código contra la misma lista, aunque Groq la garantice. Esto se debe a que la regla crítica no depende del proveedor.
- Cada pedido corta a los 10 s (`AbortSignal.timeout`), para que una demora de Groq no deje al cliente sin respuesta. Es un valor técnico, no de negocio.
- Prompts:
  - **Decisión:** «Elegí la intención del mensaje del cliente de una agencia de seguros», con una línea por opción. El mensaje del cliente va como contenido del usuario, separado de las instrucciones.
  - **Redacción:** «Reescribí este mensaje para que suene natural y cordial, en español rioplatense y tratando al cliente de usted. No cambies, agregues ni quites números de póliza, fechas, estados, ramos ni números. No agregues links ni datos nuevos. No prometas nada. No menciones bots ni inteligencia artificial, y no digas que sos una persona.» Recibe la plantilla completada y la pregunta del cliente como contexto.

**Qué sale a Groq:** el texto del cliente con todo lo que `findDni` reconoce como DNI reemplazado por `[DNI]`, y la plantilla completada, que solo tiene datos del cliente identificado: nombre de pila, número, ramo, fecha y estado de sus pólizas. Nunca sale el DNI. El reemplazo lo hace una función pura, `maskDni`, que usa la misma expresión que `findDni`, así que los dos reconocen los mismos formatos. **Se aplica en `ProcessIncomingMessage`, antes de cada llamada al `AiClient`**, no en el adaptador: vale para cualquier motor.

### 4. Plantillas (propuestas por este change, revisa el equipo en el PR)

Se escriben con usted, igual que el mensaje de derivación de `AGENTS.md`. Las marcadas como fijas se envían tal cual; las demás pasan por la redacción y el control. Van en `domain/templates.ts`, como funciones puras.

| Uso | Texto | Redacción |
|---|---|---|
| Pedir DNI (primera vez) | «Hola, gracias por comunicarse con Seguros Castaño. Para poder ayudarlo, ¿me indica su número de DNI?» | fija |
| Pedir DNI (de nuevo) | «Para poder ayudarlo, necesito su número de DNI.» | fija |
| DNI no reconocido (1.º) | «No encontramos ese DNI entre nuestros clientes. ¿Es usted cliente nuevo de Seguros Castaño?» | fija |
| DNI no reconocido (2.º y 3.º) | «No encontramos ese DNI. ¿Podría revisarlo y escribirlo de nuevo?» | fija |
| Cliente nuevo | «Gracias por elegirnos. Para que un miembro de nuestro equipo pueda contactarlo, ¿me indica su nombre y apellido?» | fija |
| Bienvenida | «Gracias, {nombre}. ¿En qué lo puedo ayudar?» | fija |
| Cortesía (saludo) | «Gracias por escribirnos, {nombre}. ¿En qué lo puedo ayudar?» | redactada |
| Vencimientos | «{nombre}, estos son los vencimientos de sus pólizas:» y una línea por póliza: «- {número} ({ramo}): vence el {dd/mm/aaaa}.» o «venció el {dd/mm/aaaa}.» | redactada |
| Estados | «{nombre}, este es el estado de sus pólizas:» y una línea por póliza: «- {número} ({ramo}): {estado}.» | redactada |
| Derivación | «Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle.» (`AGENTS.md`) | fija |
| Mandar a aprobar | «Recibimos su pedido. Un miembro de nuestro equipo lo va a revisar y se va a comunicar con usted.» | fija |

- `{nombre}` es el nombre de pila del cliente de prueba.
- **Estado de cada póliza:**
  - «dada de baja» y «suspendida por mora» se muestran tal cual;
  - «activa» con la fecha de vencimiento anterior a hoy se muestra como «vencida».

  «Hoy» es la fecha en `America/Argentina/Buenos_Aires` (`docs/caso8_der.md`). El reloj se inyecta para poder probarlo.
- **Cliente sin pólizas:** vencimiento o estado se derivan (dato ausente, RF-ATE-02).

### 5. Control de la redacción

Una función pura, `checkRewrite(template, draft)` en `domain/rewrite-check.ts`, devuelve `ok` o el motivo del rechazo. Rechaza si:

- el draft está vacío;
- hay un link: `http`, `www.`, un dominio del tipo `algo.com` o `.ar`, o un `@`;
- no coincide el **multiconjunto** de datos de la plantilla y del draft. Se compara, normalizado a minúsculas y sin tildes:
  - los números de póliza (`POL-\d+`);
  - las fechas (`dd/mm/aaaa`);
  - toda otra secuencia de dígitos (montos, números sueltos);
  - los estados del catálogo y «vencida»;
  - los ramos del catálogo;
  - las palabras «vence» y «venció», para que una póliza vencida no pase a decir que vence.
- tiene un término de la **lista de prohibidos**, buscado por raíz y sin tildes. La lista es una constante del dominio, con su prueba:
  - compromisos de acciones: `registrad`, `aprobad`, `confirmad`, `procesad`, `gestionad`, `dimos de baja`, `dada de baja` (salvo que esté en la plantilla), `modificad`, `reembols`, `devolv`;
  - temas que se derivan y datos que no están en la plantilla: `cobertura`, `plan `, `cotiz`, `precio`, `siniestro`, `saldo`, `deuda`, `cuota`;
  - presentación: `soy una persona`, `soy un humano`, `inteligencia artificial`, `bot`.

  Un término que ya está en la plantilla no cuenta (por ejemplo, «dada de baja» como estado).

Así se detecta tanto un dato agregado como uno cambiado o quitado. Lo que no detecta es una frase sin números ni términos de la lista: es un riesgo aceptado (ver «Risks / Trade-offs»). Si el modelo pasa una fecha a otro formato («15 de noviembre»), se rechaza: es preferible derivar a enviar algo sin comprobar.

Si se rechaza o si `rewrite` lanza, **se deriva**. Es la decisión de Santiago; la alternativa era mandar la plantilla tal cual. El motivo queda en el log, sin el texto.

### 6. Fallas de Groq

- Si falla `classifyIntent`, se deriva.
- Si falla `rewrite`, se deriva.
- El sí o el no del cliente nuevo no usa Groq (decisión 2), así que no puede fallar por el proveedor.

En ningún caso se responde 500. El webhook sigue respondiendo 500 solo si `execute` lanza, y eso queda para el envío por WhatsApp. Una respuesta de póliza usa dos pedidos a Groq; el resto, uno o ninguno.

### 7. Clientes de prueba

- `backend/fixtures/clientes-ficticios.json`:

  ```json
  { "aviso": "Datos ficticios para probar el asistente. No son clientes reales.", "clientes": [ … ] }
  ```

  - **DNI:** del 99000001 en adelante. Son poco probables, no imposibles: la marca de ficticios la da el archivo, no el número.
  - **Pólizas:** `POL-90001` en adelante, para no chocar con las de la planilla (`POL-00123`…).
  - **Ramos** y **estados:** los de los catálogos.
  - **Casos:** al menos un cliente con dos pólizas (una vigente y una activa ya vencida), uno con una póliza suspendida por mora y uno sin pólizas.
  - **Clientes:** solo personas, sin teléfonos.
- `customer.ts`: `CustomerPolicy` pasa a `{ number, ramo, status: 'activa' | 'suspendida por mora' | 'dada de baja', expirationDate }`, con la fecha en `aaaa-mm-dd`. Se va `coverages`, que nadie usa. `Customer` conserva el `id` (en los fixtures, `ficticio-1`…), que es lo que guarda el estado `identified`, y suma `findById` en el repositorio.
- `InMemoryCustomerRepository` se queda con su constructor. Una función, `customerRepositoryFromFixtures()`, lee el archivo con una ruta relativa al módulo (`import.meta.url`) y **valida cada campo**, sin `as`. Si el archivo no es válido, el backend no arranca y muestra el error.
- `index.ts` deja de usar `CUSTOMERS_JSON`. La variable se va de `docker-compose.yml` y de `.env.example`. El contenedor monta `./backend`, así que el archivo está adentro.

### 8. Pruebas con Vitest

- `vitest` como dependencia de desarrollo del backend y un script `"test": "vitest run"`. El comando de `AGENTS.md` queda `docker compose exec backend npm test`.
- Pruebas en `backend/src/**/*.test.ts`, con un `AiClient` falso que contesta lo que pide cada prueba y registra lo que recibe, un `WhatsAppClient` falso que guarda lo enviado y un reloj fijo. Las pruebas usan los DNI 99… y no leen el `.env` ni llaman a Groq.
- `OpenAiCompatibleClient` se prueba con un `fetch` falso: el cuerpo lleva `response_format` estricto con el `enum`, y un valor fuera de la lista lanza.

## Risks / Trade-offs

- [El modelo toma una consulta real por «no es de seguros» y el cliente no recibe nada] → La descripción de la opción pide elegirla solo cuando el mensaje claramente no tiene que ver con seguros, y ante la duda elegir «no sé». Queda una línea de log por cada mensaje ignorado. Es un riesgo aceptado por Santiago.
- [Una falla momentánea de Groq deriva y deja el número en silencio hasta el reinicio] → En la demo se resuelve con `docker compose restart backend`. Queda en el log.
- [El control rechaza redacciones válidas, por ejemplo cuando el modelo escribe la fecha con palabras] → El prompt pide no cambiar el formato. Si en las pruebas manuales se deriva demasiado, se ajusta el prompt, no el control.
- [Límite del plan gratuito: 30 pedidos por minuto y 1.000 por día] → Alcanza para la demo. Un 429 deriva (decisión 6).
- [El estado en memoria se pierde al reiniciar: DNI validado, consulta guardada, intentos y silencio] → Es provisional hasta que entre la base, y es lo que eligió Santiago.
- [La pregunta del cliente llega a la redacción y puede traer una inyección] → El control de datos, links y términos prohibidos se aplica igual a cualquier draft, y la decisión de la acción no depende de la redacción. Una frase inyectada sin números ni términos de la lista puede pasar: es un riesgo aceptado por Santiago, que eligió mandar la pregunta para que la respuesta suene a tono.
- [La lista de prohibidos rechaza redacciones válidas] → Se deriva. Si en las pruebas manuales pasa seguido, se ajusta el prompt.
- [Un DNI escrito junto con la pregunta hace perder la pregunta] → El cliente recibe la bienvenida y la vuelve a escribir.

## Migration Plan

1. Cada integrante saca `CUSTOMERS_JSON` de su `.env` (si queda, se ignora) y carga los valores de Groq: `AI_API_URL=https://api.groq.com/openai/v1`, su `AI_API_KEY` y `AI_MODEL=openai/gpt-oss-20b`. Sin la clave, toda consulta de un cliente identificado se deriva.
2. `docker compose exec backend npm install` para instalar Vitest.
3. Para volver atrás, se revierte el merge: no hay datos ni migraciones de por medio.

## Open Questions

- «no es de seguros» y «no sé» no están en `tipo_consulta`. Cuando entre la base («un caso por consulta», con FK a `tipo_consulta`), el change de la base tiene que decidir cómo se guardan: un valor nuevo en el catálogo, un caso sin tipo o no abrir caso. No cambia nada de este change.
