# Proposal

## Why

El hilo principal del sistema (una persona que no es cliente consulta por la agencia, pide el alta, un operador la aprueba, carga su primera póliza y el cliente consulta sus datos, sus pólizas y su saldo) se corta en tres puntos:

- al aprobar el alta, el cliente no recibe ningún aviso, aunque el mensaje de derivación le prometió que el equipo se iba a comunicar;
- el panel no lleva de la aprobación a la ficha donde se carga la póliza;
- «¿cuánto debo?» se deriva siempre para una póliza recién cargada, porque el alta de póliza no registra cuotas.

El saldo es la consulta que dio origen al sistema: RF-CAR-02 pide una respuesta cierta a «¿cuánto me falta pagar?» y RF-ATE-01 la pone como el primer ejemplo de lo que el asistente responde solo.

Para mostrar el hilo y sus casos límite en la demo del Parcial 2 (05/11/2026), también hace falta una base con clientes ficticios armados a propósito, que se cargue de cero sin tocar la migración de la planilla.

## What Changes

- **Aviso al aprobar un alta (RF-ATE-05).**
  - Al aprobar un prospecto en Trámites, el cliente recibe por WhatsApp un texto fijo que confirma el alta.
  - El aviso queda guardado como mensaje del asistente en el caso del alta.
  - Si el envío falla, la decisión queda registrada igual, el panel lo avisa y ofrece reintentar. Es el mismo patrón que ya usa el cambio de teléfono (RF-CAR-05).
- **De la aprobación a la ficha.** El aviso de éxito de la aprobación ofrece «Ir a la ficha del cliente», que abre Base de Clientes con la ficha del cliente nuevo.
- **Plan de cuotas en el alta de póliza (RF-CAR-02, RF-ATE-01, RF-ATE-02).**
  - **BREAKING (API del panel):** la prima mensual pasa a ser obligatoria en el alta de póliza (`POST /api/clientes/:id/polizas`).
  - En la misma transacción del alta se genera una cuota por mes, desde el inicio de la vigencia hasta el vencimiento, por el importe de la prima. Es la misma regla que ya usan las cuotas de ejemplo.
  - Si alguna cuota ya venció al momento de la carga, el operador indica cuántas de esas están pagas. El sistema no lo supone.
  - El diálogo de confirmación del alta muestra el resumen de las cuotas.
  - La regla del saldo no cambia: una póliza sin cuotas (las migradas) sigue derivando la consulta (regla 4 de AGENTS.md).
- **Carga de clientes ficticios para la demo (RF-CAR-01, RF-CAR-02, RF-CAR-03).**
  - Es un script aparte (`npm run cargar-demo`) que vacía los datos de cartera y de atención y carga clientes, teléfonos, pólizas y cuotas ficticios pensados para probar los casos límite del asistente.
  - Conserva los catálogos, los parámetros, el horario y los usuarios.
  - Solo escribe con una confirmación explícita.
  - Los números de WhatsApp de la demo se pasan por variables de entorno, no quedan en el repo.
  - La migración de la planilla no cambia y sigue siendo la carga de los datos históricos.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `atencion-automatizada`: el requirement «El alta se aprueba o rechaza desde Trámites» suma el aviso al cliente, el reintento y el acceso a la ficha (RF-ATE-05).
- `cartera`: se agregan el requirement del plan de cuotas en el alta de póliza (RF-CAR-02) y el de la carga de clientes ficticios para la demo (RF-CAR-01).

## Impact

- **Backend.**
  - `application/manage-requests.ts` y `infrastructure/prisma-request-management-repository.ts`: aviso y reintento del alta.
  - `http/app.ts`: un endpoint nuevo `POST /api/tramites/prospectos/:id/notificacion`, y `notificationSent` en la respuesta de la decisión.
  - `domain/customer-edits.ts` e `infrastructure/prisma-customer-edit-repository.ts`: prima obligatoria, cuotas pagas declaradas y generación de cuotas.
  - La regla de generación pasa de `scripts/cuotas-ejemplo.ts` al dominio, para que la usen el alta y los scripts.
  - Script nuevo `scripts/cargar-demo.ts` con su prueba.
- **Frontend.**
  - `pages/TramitesAprobar.tsx` y `api/tramites.ts`: aviso fallido, reintento e «Ir a la ficha del cliente».
  - `navigation.ts`, `App.tsx` y `pages/BaseClientes.tsx`: abrir una ficha al llegar.
  - `components/FormularioPoliza.tsx` y `api/clientes.ts`: prima obligatoria, cuotas pagas y resumen.
- **Base de datos:** sin migraciones. Se usan las tablas `cuota`, `cliente`, `telefono`, `cliente_telefono` y `poliza` como están.
- **Documentación.** `docs/migracion.md` suma la sección de los datos de demo. AGENTS.md agrega el comando y actualiza las decisiones abiertas de cuotas y del ABM. También se actualiza la skill `backend-datos`.

## Preguntas abiertas (no se cierran en este change)

- **Cuotas de las pólizas** (Decisiones abiertas de AGENTS.md). La agencia no informó cómo son sus cuotas. El plan mensual por el importe de la prima es un supuesto del equipo y queda documentado como provisorio.
- **Fecha de pago de las cuotas que el operador declara pagas.** No se conoce, y se registra su fecha de vencimiento, como en las cuotas de ejemplo. Queda como supuesto.
- **Cambios de prima o de vigencia en una póliza que ya tiene cuotas.** Este change no regenera las cuotas al editar la póliza; queda para otro change.
- **Cuotas de las pólizas migradas.** Siguen sin cuotas y su saldo se deriva hasta que la agencia informe las reales.
