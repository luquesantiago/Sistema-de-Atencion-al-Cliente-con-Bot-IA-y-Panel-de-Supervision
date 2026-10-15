# Proposal

## Why

Cuando el asistente deriva, el caso queda en la base y la conversación en silencio (RF-DER-03), pero nadie lo ve: la Bandeja de Atención del panel es un cartel de «No hay casos derivados» y no hay ningún endpoint que la alimente. Roberto Castaño: «No tenemos forma de saber si una consulta (…) fue resuelta o quedó en el aire» (RF-DER-02). Para mostrar el sistema de punta a punta, un caso derivado por WhatsApp tiene que aparecer en el panel con su conversación completa (RF-SUP-01) y en orden de gravedad (RF-SUP-02).

Hoy además no hay con qué ordenar por gravedad: `caso.id_nivel_riesgo` existe en el esquema, pero el asistente nunca lo completa, y las alertas de los casos migrados ya están atendidas.

## What Changes

Decisiones de Santiago del 15/10/2026 (el cómo está en `design.md`):

- **Bandeja de Atención de solo lectura (RF-SUP-01, RF-SUP-02, RF-DER-02).**
  - Lista los casos abiertos (sin `fecha_cierre`) que están derivados o que tienen algo pendiente de aprobación: un prospecto pendiente o una solicitud de cambio de teléfono pendiente.
  - Cada fila muestra la gravedad (con texto, no solo color), el cliente (o el teléfono y «Sin identificar» si la conversación no tiene cliente), el tipo de consulta, el motivo de la derivación, el último mensaje, el responsable (o «Sin tomar») y el tiempo de espera.
  - Etiquetas: el caso de un cliente nuevo dice «Alta pendiente · se decide en Trámites»; el de una baja o modificación, «Pedido pendiente de aprobación» (todavía no se registra la solicitud: desvío provisional del Parcial 1); el de un cambio de teléfono, «Cambio de teléfono pendiente · se decide en Trámites».
  - Orden: primero la gravedad, después los sin tomar y después el que más espera. Lo hace la consulta a la base, antes de paginar.
  - La bandeja y el caso abierto se actualizan solos cada pocos segundos, sin recargar la página.
  - Al elegir un caso, se ve la conversación completa, con el origen (cliente, asistente u operador) y la fecha y hora de cada mensaje en hora argentina.
- **El asistente registra el nivel de riesgo del caso cuando deriva (RF-DER-01, RF-SUP-02).** Decisión del equipo del 15/10/2026:
  - por tipo de consulta: siniestro **alto**, o **crítico** si es grave; reclamo **alto**; cotización, cobertura, baja y modificación **medio**;
  - por motivo: cliente nuevo, DNI no reconocido al cuarto intento, DNI de otra persona, cliente identificado inexistente y redacción rechazada **medio**; otra consulta, no se entendió la consulta, falta de dato (cliente sin pólizas, póliza sin cuotas, datos de la agencia incompletos) y fallas del proveedor o de la redacción **bajo**;
  - si aplican el tipo y el motivo, gana el más grave;
  - el caso de un cambio de teléfono pendiente lleva nivel **bajo**, aunque no se derive.
- **El proveedor de IA marca la urgencia de un siniestro (RF-DER-01, RF-ATE-04).** En la misma clasificación de la intención, con salida estructurada estricta, el modelo elige `grave` o `normal`. Grave es: personas heridas, riesgo de vida o una emergencia en curso (incendio, inundación activa, vehículo varado en la ruta). El código pone alto como piso y la IA solo puede subirlo a crítico; si la urgencia falta o no es válida, queda alto. La urgencia no cambia la acción: el siniestro se deriva siempre.
- **Gravedad que muestra la bandeja:** la más grave entre el nivel del caso, el de sus alertas sin atender y el que corresponde a su tipo de consulta. Un caso sin ninguno de los tres (por ejemplo, un caso migrado sin tipo) se muestra «Sin nivel», al final.
- **Documentación:** AGENTS.md suma los niveles de riesgo al derivar y la bandeja al flujo del Parcial 1.

**Fuera de alcance** (van en changes siguientes):
- tomar, responder y cerrar un caso desde la bandeja: mientras tanto, un caso derivado que no sea de un prospecto sigue sin poder cerrarse;
- la pantalla de Trámites por Aprobar;
- la alerta por caso derivado sin tomar (60 minutos dentro del horario) y el motor de verificación (RF-VER);
- los indicadores del Dashboard y las métricas (RF-SUP-05);
- mostrar las redacciones rechazadas que no se enviaron;
- autorización por rol en el backend (Parcial 2): las dos pantallas de prueba ven la misma bandeja.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `panel-supervision`: se agregan dos requirements:
  - la bandeja de atención priorizada por gravedad, con responsable y espera (RF-SUP-02, RF-DER-02);
  - el detalle de un caso de la bandeja con la conversación completa (RF-SUP-01).
- `derivacion-seguimiento`: se agrega un requirement: el nivel de riesgo que el asistente registra al derivar, con la urgencia del siniestro (RF-DER-01).

No se citan, porque este change no los cumple o no los cambia:
- RF-DER-03: el silencio después de derivar no cambia;
- RF-SUP-03 y RF-SUP-04: no se corrige ni se cierra nada desde la bandeja;
- RF-VER-03: no se crean alertas;
- RF-SUP-07: no hay autorización por rol en el backend.

## Impact

- **Código (backend):**
  - `domain/`: un módulo nuevo para el nivel de riesgo al derivar y otro para la bandeja (filtros, gravedad, orden y etiquetas); `ai-client.ts` e `intent.ts`: la clasificación devuelve también la urgencia; `conversation.ts`: la derivación y el cambio de teléfono llevan el nivel de riesgo;
  - `application/`: `process-incoming-message.ts` calcula el nivel en cada derivación; un caso de uso nuevo para la bandeja, de solo lectura;
  - `infrastructure/`: `openai-compatible-client.ts` (esquema con `urgencia`), `prisma-conversation-store.ts` (escribe `caso.id_nivel_riesgo`) y un repositorio Prisma nuevo para la bandeja;
  - `http/app.ts`: `GET /api/bandeja` y `GET /api/bandeja/:idCaso`.
- **Código (frontend):** `pages/BandejaAtencion.tsx` deja de ser un cartel; un módulo nuevo en `api/` para la bandeja.
- **Base:** no hay migración, tablas ni columnas nuevas; `schema.prisma` no cambia. Se empieza a escribir `caso.id_nivel_riesgo`, que ya existe.
- **Riesgos:**
  - la urgencia la decide el modelo: puede marcar normal un siniestro grave (queda alto, nunca más bajo) o grave uno que no lo es;
  - el nivel se fija al derivar: lo que el cliente escriba después, en silencio, no lo cambia aunque la situación empeore;
  - el orden por gravedad es una consulta SQL escrita a mano (Prisma no ordena por una expresión calculada), sin prueba automática contra la base: se verifica a mano con la base migrada;
  - la actualización automática consulta la base cada pocos segundos desde cada panel abierto;
  - mientras no exista «cerrar», los casos derivados se acumulan en la bandeja;
  - los siete casos migrados abiertos aparecen tomados por Roberto o Graciela, con la espera contada desde 2024.
- **Preguntas abiertas que el change no cierra** (de «Decisiones abiertas» de AGENTS.md):
  - minutos para alertar una derivación sin tomar (60, provisorio): la bandeja muestra la espera, pero no alerta;
  - si después de derivar el asistente deja de responder del todo: sigue rigiendo RF-DER-03;
  - tratamiento de datos sensibles: el mensaje del cliente sale a Groq igual que hoy; la urgencia no agrega datos.
