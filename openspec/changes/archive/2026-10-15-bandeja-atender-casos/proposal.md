# Proposal

## Why

La Bandeja de Atención muestra los casos derivados, pero no deja hacer nada con ellos. Un caso derivado que no es de un prospecto no se puede cerrar de ninguna forma, así que la conversación queda en silencio para siempre (RF-DER-03) y el caso se acumula en la bandeja. Nadie puede contestarle al cliente, y el responsable del caso no se puede asignar (RF-DER-02). Para mostrar el sistema de punta a punta, un empleado tiene que poder tomar el caso, contestarle al cliente por WhatsApp y cerrarlo, y entonces el asistente vuelve a atender.

Hay dos problemas más que se resuelven con el mismo flujo:

- **El alta rechazada no le llega al cliente.** Hoy el rechazo de un prospecto cierra el caso y nadie le avisa nada.
- **El operador no puede ver las imágenes que manda el cliente.** No ve la foto del DNI que tiene que comparar con los datos del alta, ni las fotos que el cliente manda después de derivar (por ejemplo, las de un siniestro). Solo ve el texto «el cliente envió una imagen».

## What Changes

Decisiones de Santiago del 15/10/2026. El cómo está en `design.md`.

- **Tomar un caso desde la bandeja (RF-DER-02).**
  - Quien lo toma queda como responsable.
  - Un caso que tiene otra persona también se puede tomar, por ejemplo los casos migrados de Roberto o Graciela.
  - Si el caso ya se había tomado antes, `fecha_toma` conserva la primera toma.
- **Contestarle al cliente desde la bandeja (RF-DER-02, RF-SUP-01).**
  - Solo en casos derivados, que son los que tienen al asistente en silencio.
  - El texto sale por WhatsApp desde el número del asistente.
  - Queda guardado como respuesta escrita por el empleado (`respuesta.id_usuario`) y como mensaje de origen «operador».
  - Si el caso no tiene responsable, contestar lo toma. Si lo tiene otra persona, primero hay que tomarlo.
- **Cerrar un caso derivado desde la bandeja con «Cerrar caso» (RF-DER-02, RF-DER-03).**
  - Solo cierra el responsable.
  - Al cerrar, la conversación sale del silencio (`asistente_suspendido = false`) y el asistente espera a que el cliente vuelva a escribir, sin mandarle nada.
  - Si el caso tiene un alta pendiente o un alta rechazada, cerrar pide un motivo, porque el empleado pudo haber cargado el cliente a mano o el caso se derivó por error.
    - Con el alta pendiente, el prospecto queda descartado.
    - El motivo se anota en el prospecto.
  - Los demás casos, incluidas las bajas y las modificaciones, se cierran sin motivo.
  - El cambio de teléfono pendiente no se cierra desde la bandeja: sigue decidiéndose en Trámites.
- **Cierre con alertas sin atender (RF-SUP-04).** Si el caso tiene alertas sin atender, para cerrarlo hay que confirmar que se revisaron. Esas alertas quedan atendidas por quien cierra.
- **El rechazo del alta ya no cierra el caso (RF-ATE-05).**
  - El prospecto queda descartado.
  - El caso queda abierto, tomado por quien rechazó y con el asistente en silencio, para que un empleado le explique el motivo al cliente desde la bandeja y después lo cierre.
  - La bandeja lo muestra con la etiqueta «Alta rechazada · avisar al cliente».
  - La aprobación sigue igual que hoy.
- **Imágenes del cliente visibles sin guardar una copia (RF-SUP-01, RF-ATE-05).**
  - Afecta a las imágenes que el sistema ya procesa: la foto del DNI del cliente nuevo y las imágenes que llegan a una conversación en silencio.
  - Se guarda el identificador del mensaje de WhatsApp de esa imagen.
  - La bandeja la muestra en la conversación cuando el empleado la pide. El backend la trae de WAHA en ese momento y la reenvía sin escribirla en disco ni en la base.
  - Si la imagen ya no está disponible, la conversación lo dice.
- **Documentación.**
  - AGENTS.md: la bandeja deja de ser de solo lectura, se describen tomar, contestar y cerrar, y se aclara cómo se ven las imágenes sin guardar una copia.
  - `docs/caso8_der.md` y el `.puml` suman la columna nueva de `mensaje`.

**Fuera de alcance**:

- **La pantalla de Trámites por Aprobar.** Hoy es un cartel fijo en el frontend. Tampoco entran ahí la foto del DNI ni la redirección a la bandeja al rechazar un alta. Este change deja lista la API: la decisión devuelve el caso para poder redirigir.
- **Corregir respuestas del asistente (RF-SUP-03).**
- **La alerta por caso derivado sin tomar** y el motor de verificación (RF-VER).
- **Autenticación real y autorización por rol en el backend (RF-SUP-07, Parcial 2).** Todo lo que se hace desde el panel se atribuye al usuario de prueba `operador`.
- **Descartar mensajes repetidos usando el identificador de WhatsApp.** Se guarda solo el de las imágenes.
- **Imágenes que hoy el canal ignora** (las que no son la foto del DNI ni llegan a una conversación en silencio), audios y archivos.
- **Avisarle al cliente que su alta se aprobó.**

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `derivacion-seguimiento`: se agregan tres requirements:
  - tomar un caso (RF-DER-02);
  - contestarle al cliente desde la bandeja (RF-DER-02);
  - cerrar un caso derivado, que saca la conversación del silencio (RF-DER-02, RF-DER-03).
- `panel-supervision`:
  - se modifica «Cada conversación queda guardada»: la imagen guarda la referencia al mensaje de WhatsApp;
  - se modifica «Bandeja de atención priorizada por gravedad»: deja de ser de solo lectura y suma la etiqueta «Alta rechazada»;
  - se modifica «Conversación completa de un caso de la bandeja»: muestra las imágenes y quién contestó;
  - se agrega un requirement para el cierre de un caso con alertas sin atender (RF-SUP-04).
- `atencion-automatizada`: se modifica «El cliente nuevo queda como prospecto». El rechazo deja el caso abierto y tomado, y la foto del DNI queda visible desde el panel sin copia (RF-ATE-05).

No se citan, porque este change no los cumple o no los cambia:
- RF-SUP-03, porque no se corrigen respuestas;
- RF-SUP-06, porque la tabla de auditoría queda para el MVP 2: tomar, contestar y cerrar quedan registrados en el caso, la respuesta y el prospecto, no en una auditoría inalterable;
- RF-SUP-07, porque no hay autorización por rol.

## Impact

- **Código (backend):**
  - `domain/`:
    - un módulo nuevo con las reglas de tomar, contestar y cerrar (quién puede, qué casos, cuándo pide motivo o la revisión de alertas);
    - `inbox.ts` suma la etiqueta del alta rechazada y la marca de imagen en los mensajes;
    - `message.ts` y `conversation.ts` llevan el identificador de WhatsApp de la imagen;
    - `whatsapp-client.ts` suma la descarga de una imagen.
  - `application/`:
    - `manage-inbox.ts` suma las acciones y la imagen;
    - `process-incoming-message.ts` pasa el identificador de la imagen al guardar.
  - `infrastructure/`:
    - `prisma-inbox-repository.ts`: las acciones y el filtro del alta rechazada;
    - `prisma-request-management-repository.ts`: el rechazo no cierra el caso, y el cierre y la salida del silencio pasan a un módulo compartido;
    - `prisma-conversation-store.ts`: guarda el identificador;
    - `waha-whatsapp-client.ts`: trae la imagen de WAHA.
  - `http/app.ts`:
    - `POST /api/bandeja/:idCaso/toma`, `/respuestas` y `/cierre`;
    - `GET /api/bandeja/:idCaso/mensajes/:idMensaje/imagen`;
    - la decisión del prospecto devuelve `casoId`.
- **Código (frontend):**
  - `api/bandeja.ts` suma las acciones y la imagen;
  - `pages/BandejaAtencion.tsx` suma «Tomar», la caja para contestar, «Cerrar caso» con su confirmación (motivo y alertas cuando corresponde) y las imágenes en la conversación.
- **Base:**
  - una migración agrega `mensaje.id_imagen_whatsapp` (texto, nulo);
  - `schema.prisma` se regenera.
  - Es una columna que el DER no tiene: la decidió Santiago el 15/10/2026 y el change actualiza el DER.
- **WAHA:** la descarga de la imagen depende de que el motor GOWS pueda volver a bajar un mensaje ya recibido. La primera tarea lo comprueba. Si no se puede, el panel muestra que la imagen no está disponible y el resto del change sigue igual.
- **Comportamiento que cambia:** rechazar un alta ya no cierra el caso ni saca la conversación del silencio.
- **Riesgos:**
  - **Fotos de DNI en una API sin autenticación.** La API del panel no tiene autenticación hasta el Parcial 2 y con este change expone fotos de DNI, además de los DNI y teléfonos que ya expone. El panel corre en local.
  - **WhatsApp a números migrados.** Contestar en un caso migrado le manda un WhatsApp al número que figura en la planilla. Riesgo aceptado por Santiago: los casos migrados se van a cerrar sin contestarles.
  - **Todo queda a nombre de `operador`**, aunque se entre como `admin`.
  - **Reasignaciones sin historial.** Tomar un caso que tenía otra persona no deja historial de la reasignación (no hay auditoría todavía); queda una línea en el log.
  - **WAHA puede guardar un archivo temporal.** Si WAHA escribe la imagen en su disco al descargarla, ese archivo es temporal (lo comprueba la tarea de WAHA).
- **Preguntas abiertas que el change no cierra** (de «Decisiones abiertas» de AGENTS.md):
  - tratamiento de datos sensibles: mostrar la foto del DNI en el panel lo hace más urgente;
  - qué hace el asistente con los audios, las fotos y los archivos sin texto: el change no cambia qué imágenes procesa, solo permite verlas;
  - si después de derivar el asistente deja de responder del todo: sigue RF-DER-03 y el silencio dura hasta el cierre;
  - minutos para alertar una derivación sin tomar: tomar deja `fecha_toma`, pero el change no alerta.
