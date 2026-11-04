# Design

## Context

Motivación y alcance: ver `proposal.md`. Requisitos: ver `specs/`.

Estado actual que condiciona el enfoque:

- **Aprobación del alta.** `PrismaRequestManagementRepository.decideProspect` crea el cliente, vincula el teléfono, cierra el caso y saca la conversación del silencio en una transacción serializable. No envía nada.
- **Aviso del cambio de teléfono.** `ManageRequests.decidePhoneChange` ya resuelve el aviso con este patrón:
  - el envío va después de la transacción;
  - `recordPhoneChangeNotification` guarda el mensaje del asistente en el caso;
  - si el envío falla, se devuelve `notificationSent: false`;
  - `POST /api/tramites/cambios-telefono/:id/notificacion` reintenta.
- **Alta de póliza.** `PrismaCustomerEditRepository.createPolicy` crea la póliza, el bien y las coberturas en una transacción. La prima es opcional y no se crea ninguna cuota.
- **Generación de cuotas.** La regla ya existe en `backend/scripts/cuotas-ejemplo.ts` (`exampleInstallments`): una cuota mensual desde el inicio, el mismo día de cada mes o el último si el mes es más corto, mientras venza antes del vencimiento. La función está fuera de `src/`.
- **Saldo.** `balanceTemplate` (`domain/balance.ts`) ya responde con las cuotas registradas: una cuota está vencida si su vencimiento es anterior a hoy en Argentina, y está paga si tiene fecha de pago. No cambia.
- **Navegación del panel.** `OpcionesNavegacion` solo lleva un destino para la Bandeja.
- **Migración de la planilla.** `migrar-planilla` se niega a correr si la base ya tiene clientes o los usuarios `roberto` y `graciela`.
- **Volúmenes.** La base vive en el volumen `db_data`. La sesión de WAHA está en `${HOME}/waha-sesion`, fuera de ese volumen.

## Goals / Non-Goals

**Goals:**

- Reusar los patrones que ya existen: el aviso con reintento del cambio de teléfono y la regla de cuotas de ejemplo. No se crea ningún mecanismo nuevo.
- Que la regla de generación de cuotas viva en una sola función del dominio, probada, que usen el alta de póliza y los scripts.
- Una carga de demo que se pueda correr varias veces y que deje la base en un estado conocido.

**Non-Goals:**

- Editar o regenerar las cuotas de una póliza existente, o marcar cuotas como pagas desde el panel.
- Cambiar la regla del saldo o la derivación por dato ausente.
- Avisar automáticamente el rechazo de un alta: el operador lo explica desde la Bandeja, como hoy.
- Cambiar `migrar-planilla` o `cargar-cuotas-ejemplo`.
- Auditoría de estas acciones: la tabla `auditoria` queda para el MVP 2, como el resto del ABM.

## Decisions

### 1. Aviso del alta: el mismo patrón del cambio de teléfono

`ManageRequests.decideProspect` pasa a ser `async`:
- primero aplica la decisión en el repositorio, como hoy;
- si la decisión fue aprobar, envía el texto fijo al teléfono de la conversación.

Los métodos del repositorio para el aviso del alta copian a los del cambio de teléfono:
- `recordProspectNotification(id, text, sentAt)` guarda el mensaje del asistente en el caso del alta;
- `getProspectNotification(id)` devuelve el teléfono si el prospecto está confirmado, 404 si no existe y 409 si no está confirmado.

El nuevo endpoint `POST /api/tramites/prospectos/:id/notificacion` reintenta el aviso. La respuesta de la decisión suma `notificationSent` solo al aprobar.

El texto vive junto a los del cambio de teléfono, en `manage-requests.ts`. Lo propone el change y el equipo lo revisa en el PR:

> «Su alta como cliente de Seguros Castaño fue confirmada. Desde ahora puede consultarnos por este WhatsApp sobre sus pólizas.»

- **Por qué después de la transacción:** WhatsApp no participa de la transacción. Si el envío fuera adentro, una falla de WAHA revertiría el alta. Así la decisión queda registrada igual (spec).
- **Alternativa descartada:** que el operador avise a mano desde la Bandeja. El caso ya queda cerrado, y «Contestar» solo funciona en casos derivados abiertos. Reabrirlo contradice el cierre al aprobar.
- **Mensaje en el caso cerrado:** el aviso queda en el caso del alta aunque esté cerrado, igual que el del cambio de teléfono. Así queda visible en la conversación.

### 2. «Ir a la ficha del cliente»

- **Navegación.** `OpcionesNavegacion` suma `clientes?: { customerId: number }`. `App` lo guarda como destino inicial de Base de Clientes, igual que `bandejaInicial`, y `BaseClientes` abre esa ficha al montar con la misma acción que «Ver detalle».
- **Aviso de éxito.** En `TramitesAprobar`, el aviso de éxito de la aprobación lleva la acción «Ir a la ficha del cliente» con el `clienteId` que ya devuelve la decisión.
- **Tipo del aviso.** `notificacionId` se generaliza a `notificacion: { tipo: 'prospecto' | 'telefono'; id }`, para que el reintento llame al endpoint que corresponde.
- **Si el aviso falló,** el panel muestra «Reintentar aviso» y también «Ir a la ficha del cliente».

### 3. Plan de cuotas en el alta de póliza

- **Una sola regla en el dominio.** La regla de vencimientos e importes se mueve a `backend/src/domain/installments.ts` como una función pura `installmentPlan({ startDate, endDate, premiumCents })`, que devuelve `{ number, dueDate, amountCents }[]`. `scripts/cuotas-ejemplo.ts` la usa en vez de su copia. Las pruebas que ya tiene siguen pasando sin cambios, y así se demuestra que la regla es la misma.
- **Validación.** `parseCreatePolicy` (`domain/customer-edits.ts`) exige `premiumCents` con el tope que ya existe, y acepta `paidInstallments`, un entero mayor o igual a 0. La cantidad de cuotas vencidas se calcula con `argentinaToday(now)`, la misma fecha que usa el saldo. La regla de cuántas pueden estar pagas también es una función pura del dominio, con su prueba:
  - si hay cuotas vencidas, `paidInstallments` es obligatorio y no puede superar esa cantidad;
  - si no hay, solo se acepta 0 o que no venga.
- **Escritura.** `createPolicy` crea las cuotas con `createMany` dentro de la misma transacción. Las primeras `paidInstallments` llevan su vencimiento como fecha de pago.
- **Reloj.** El caso de uso recibe un reloj inyectable (`() => Date`), igual que `ManageRequests`, para poder probar las cuotas vencidas.
- **Panel.** `FormularioPoliza` marca la prima como obligatoria y calcula con la misma regla cuántas cuotas habría vencidas. Si hay alguna, muestra «Cuotas ya pagas (de N vencidas)». El resumen de la confirmación suma la línea de las cuotas. El backend es la fuente de verdad: si la cuenta del panel difiere (por ejemplo, porque cambió el día), responde 400 con el mensaje.
- **Alternativas descartadas:**
  - Suponer que las cuotas vencidas están pagas o impagas: inventa pagos o deuda.
  - Generar cuotas solo para las pólizas que empiezan hoy o después: el ABM quedaría inconsistente según la fecha de inicio.
  - Cargar las cuotas una por una en el formulario: mucha carga para el operador y sin una regla para la demo.

### 4. Carga de la demo: `scripts/cargar-demo.ts`

- **Separación.** Igual que `cargar-cuotas-ejemplo`, el script separa una parte pura de la escritura:
  - `scripts/datos-demo.ts` arma el set de datos a partir de la fecha de carga y los números, y se prueba con `datos-demo.test.ts`;
  - `scripts/cargar-demo.ts` valida, borra y escribe.
- **Comando.** `npm run cargar-demo -- --confirmar`. Sin `--confirmar`, solo informa qué haría.
- **Números de WhatsApp.**
  - Se pasan con `docker compose exec -e DEMO_TELEFONO_CLIENTE=… -e DEMO_TELEFONO_COMPARTIDO=… backend npm run cargar-demo -- --confirmar`.
  - Si una variable no está, se usa un número ficticio: `5490000000001` o `5490000000002`.
  - Los números se validan antes de borrar, con el formato de `telefono.numero`: solo dígitos y hasta 15.
- **Borrado.** Una transacción interactiva borra de los hijos a los padres: `verificacion`, `alerta`, `respuesta`, `mensaje`, `solicitud_accion`, `prospecto`, `caso`, `conversacion`, `cuota`, `cobertura`, `beneficiario`, `poliza_conductor`, `conductor`, `siniestro`, `poliza`, `bien_asegurado`, `cliente_telefono`, `telefono` y `cliente`. Si una FK exige otro orden, la prueba de integración lo detecta. No se reinician los `AUTO_INCREMENT`: los ids nuevos no chocan con estados que el backend tenga en memoria.
- **Fechas relativas.** Los vencimientos e inicios se calculan desde la fecha de carga, para que en cualquier día de la demo haya cuotas vencidas y por vencer. Las cuotas se arman con la misma `installmentPlan`.
- **Números de póliza.** Van de POL-00001 a POL-00006, así el primer alta del panel recibe POL-00007.
- **Marca de ficticio.** Las pólizas llevan en `observaciones` el texto «Dato ficticio de demostración». Los clientes llevan el apellido «Demo», porque `cliente` no tiene observaciones y no se agregan columnas. Los DNI son de la serie 991000xx, que no se usa en la planilla.

**Set de datos.** «hoy» es la fecha de carga en Argentina. Todas las primas se expresan por mes.

| Cliente | DNI | Teléfono | Pólizas | Caso límite que prueba |
|---|---|---|---|---|
| Lucía Demo | 99100001 | `DEMO_TELEFONO_CLIENTE`, solo ella | **POL-00001** auto, ARS, activa: inicio hace 4 meses, vence en 8, prima $ 45.000, 2 pagas → 2 vencidas sin pagar y el resto por vencer. **POL-00002** hogar, USD, activa: inicio hace 3 meses, vence en 9, prima US$ 20, todas las vencidas pagas. **POL-00003** moto, ARS, activa pero vencida por fecha: inicio hace 14 meses, vence hace 2, todas pagas | Identificación sin DNI; varias pólizas y monedas en vencimiento, estado, saldo y mis pólizas; cuotas vencidas y por vencer; póliza al día; póliza vencida |
| Martín Demo | 99100002 | `DEMO_TELEFONO_COMPARTIDO` | **POL-00004** auto, ARS, activa: inicio hoy, vence en 12, prima $ 38.000 → solo cuotas por vencer. **POL-00006** moto, ARS, suspendida por mora: inicio hace 5 meses, vence en 7, prima $ 15.000, 2 pagas → 3 vencidas sin pagar | Número compartido, que exige el DNI; estado «suspendida por mora»; cuotas solo por vencer |
| Sofía Demo | 99100003 | `DEMO_TELEFONO_COMPARTIDO` | **POL-00005** vida, ARS, activa: inicio hace 2 meses, vence en 10, sin prima ni cuotas | Número compartido; el saldo se deriva por dato ausente; DNI de otra persona desde el número de Martín |
| Carlos Demo | 99100004 | ninguno | ninguna | Desde un número no vinculado: «ya soy cliente» + DNI abre el cambio de teléfono; «mis pólizas» sin pólizas |
| Elena Demo | 99100005 | ninguno, dada de baja | ninguna | DNI de un cliente que ya no está activo |

- **Bienes ficticios.** Las pólizas de auto, moto y hogar llevan un bien asegurado con descripción «Bien ficticio de demostración» y una patente o dirección ficticia. No llevan coberturas.
- **Hilo principal.** El cliente nuevo de la demo escribe desde cualquier número que no esté en las variables.

## Risks / Trade-offs

- **[Borrar la base por error]** El script borra todo lo operativo y los datos históricos. → Exige `--confirmar`, valida todo antes de borrar, y la documentación dice cómo volver a la planilla:
  ```bash
  docker compose stop db backend
  docker compose rm -f db
  docker volume rm <proyecto>_db_data
  docker compose up -d
  docker compose exec backend npm run migrar-planilla
  ```
  `db_data` no incluye la sesión de WAHA.
- **[Aviso duplicado]** Si WhatsApp envía el aviso pero falla el guardado, el panel muestra éxito y el log deja la línea. Un reintento manual posterior lo mandaría de nuevo. → Es el mismo riesgo aceptado en el cambio de teléfono: el panel solo ofrece reintentar cuando el envío falló.
- **[Fecha de pago supuesta]** Las cuotas que el operador declara pagas llevan su vencimiento como fecha de pago. → Queda documentado como supuesto. El saldo solo mira si hay fecha de pago, no cuál es.
- **[El día cambia entre el formulario y el backend]** La cantidad de cuotas vencidas puede diferir cerca de medianoche. → Decide el backend, que responde 400 con el mensaje, y el operador corrige.
- **[Cliente que escribe antes del aviso]** El aviso sale después de cerrar el caso, así que el cliente podría escribir en ese instante y recibir la bienvenida antes del aviso. → Se acepta: los dos mensajes son correctos en cualquier orden.
- **[API]** La prima pasa a ser obligatoria en `POST /api/clientes/:id/polizas`. El único consumidor es el panel, que se actualiza en el mismo change.

## Migration Plan

- Sin migraciones de base.
- Al traer la rama, `docker compose restart backend` alcanza.
- La carga de demo es opcional y se corre a mano antes de la presentación.
- Rollback: revertir el PR. Las cuotas creadas por altas de póliza quedan en la base y son válidas para la regla del saldo.

## Open Questions

- El texto del aviso del alta: lo revisa el equipo en el PR.
