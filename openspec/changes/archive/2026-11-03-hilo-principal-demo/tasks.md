# Tasks

## 1. Regla de cuotas en el dominio

- [x] 1.1 Crear `backend/src/domain/installments.ts` con `installmentPlan({ startDate, endDate, premiumCents })`, una cuota mensual desde el inicio, el mismo día de cada mes o el último si el mes es más corto, mientras venza antes del vencimiento, y la función que valida `paidInstallments` contra la cantidad de cuotas vencidas a `argentinaToday(now)`. Agregar `installments.test.ts` con la póliza que empieza hoy, el inicio el 31 de enero, las cuotas vencidas, la cantidad pagas obligatoria si hay vencidas, la cantidad fuera de rango (caso rechazado) y la cantidad válida (caso permitido). Verificar: `docker compose exec backend npm test` y `npx tsc --noEmit`.
- [x] 1.2 Hacer que `backend/scripts/cuotas-ejemplo.ts` use `installmentPlan` en vez de su copia de la regla, sin cambiar su comportamiento. Verificar: `cuotas-ejemplo.test.ts` pasa sin cambios con `docker compose exec backend npm test`.

## 2. Plan de cuotas en el alta de póliza (backend)

- [x] 2.1 En `domain/customer-edits.ts`, exigir `premiumCents` en `parseCreatePolicy` y aceptar `paidInstallments` (entero ≥ 0). Sumar a `customer-edits.test.ts` el alta sin prima (rechazada) y con prima (permitida). Verificar: `docker compose exec backend npm test`.
- [x] 2.2 Inyectar el reloj en `ManageCustomerEdits`, armar el plan en el dominio (`createPolicyInstallments`, que valida las cuotas pagas) y, en `createPolicy`, crear las cuotas con `createMany` en la misma transacción: las primeras `paidInstallments` con su vencimiento como fecha de pago y las demás sin pagar. El proyecto no tiene pruebas contra la base: el plan se prueba en `customer-edits.test.ts` (póliza que empieza hoy, cuotas vencidas con 2 pagas, pagas sin declarar y de más), las filas en `prisma-customer-edit-repository.test.ts` (`installmentRows`) y el endpoint en `app.test.ts` (400 sin escribir nada); la atomicidad la da la transacción única y se comprueba a mano contra la base de la demo. Verificar: `docker compose exec backend npm test` y `npx tsc --noEmit`.
- [x] 2.3 Agregar en `process-incoming-message.test.ts` (o `balance.test.ts`) el caso de una póliza con el plan generado por `installmentPlan`: «¿cuánto debo?» responde las cuotas vencidas y las por vencer sin derivar, y una póliza sin cuotas sigue derivando. Verificar: `docker compose exec backend npm test`.

## 3. Plan de cuotas en el alta de póliza (panel)

- [x] 3.1 En `frontend/src/api/clientes.ts` y `components/FormularioPoliza.tsx`, marcar la prima mensual como obligatoria, calcular con la misma regla cuántas cuotas habría vencidas y, si hay alguna, pedir «Cuotas ya pagas (de N vencidas)». Mostrar el error 400 del backend tal como llega. Verificar: `docker compose exec frontend npm run lint` y `npm run build`.
- [x] 3.2 En `pages/BaseClientes.tsx`, sumar al resumen de la confirmación del alta la línea de cuotas: cantidad, importe, cuántas pagas, y la primera y la última fecha. Seguir `docs/design.md`. Verificar: `docker compose exec frontend npm run build` y alta manual de una póliza que empieza hoy y otra con inicio hace tres meses.

## 4. Aviso al aprobar un alta

- [x] 4.1 En `domain/request-management.ts` y `prisma-request-management-repository.ts`, agregar `recordProspectNotification` y `getProspectNotification`: 404 si no existe y 409 si el prospecto no está confirmado. Verificar: `docker compose exec backend npx tsc --noEmit`.
- [x] 4.2 En `application/manage-requests.ts`, hacer `decideProspect` async: al aprobar, enviar el texto fijo del alta después de la transacción, guardar el mensaje y devolver `notificationSent`. Al rechazar no se envía nada. Agregar `retryProspectNotification`. Probar con dobles: aprobación con envío ok, envío que falla (decisión registrada, `notificationSent: false`, sin mensaje), rechazo sin envío y reintento de un prospecto no confirmado (409). Verificar: `docker compose exec backend npm test`.
- [x] 4.3 En `http/app.ts`, agregar `POST /api/tramites/prospectos/:id/notificacion` y devolver `notificationSent` en la decisión. Sumar los casos a `app.test.ts`. Verificar: `docker compose exec backend npm test`.

## 5. Trámites: reintento e «Ir a la ficha del cliente»

- [x] 5.1 En `navigation.ts`, `App.tsx` y `pages/BaseClientes.tsx`, agregar el destino `clientes: { customerId }`, que abre la ficha al llegar. Verificar: `docker compose exec frontend npm run lint` y `npm run build`.
- [x] 5.2 En `api/tramites.ts` y `pages/TramitesAprobar.tsx`:
  - generalizar el aviso a `notificacion: { tipo, id }`;
  - mostrar «Ir a la ficha del cliente» en el aviso de éxito de la aprobación;
  - si el aviso falló, mostrar la advertencia con «Reintentar aviso» y la acción de la ficha;
  - sumar el aviso por WhatsApp al resumen de la confirmación.

  Verificar: `docker compose exec frontend npm run build` y aprobación manual de un alta con WAHA apagado (aviso fallido y reintento) y encendido.

## 6. Carga de clientes ficticios para la demo

- [x] 6.1 Crear `backend/scripts/datos-demo.ts`, que arma el set de `design.md` a partir de la fecha de carga y los dos números, y valida los números (solo dígitos, hasta 15, distintos). Las cuotas salen de `installmentPlan`. Agregar `datos-demo.test.ts` con:
  - cuotas vencidas y por vencer de POL-00001;
  - POL-00002 al día;
  - POL-00003 vencida;
  - POL-00005 sin cuotas;
  - el número compartido por Martín y Sofía;
  - Elena inactiva;
  - números inválidos o iguales (rechazados).

  Verificar: `docker compose exec backend npm test`.
- [x] 6.2 Crear `backend/scripts/cargar-demo.ts` y el script `cargar-demo` en `package.json`:
  - sin `--confirmar` solo informa qué haría;
  - con `--confirmar` valida, borra en una transacción de hijos a padres y escribe el set;
  - informa cantidades y el caso límite de cada número, sin DNI.

  Verificar: correrlo dos veces seguidas con `docker compose exec backend npm run cargar-demo -- --confirmar`, comprobar con SQL que quedan 5 clientes, 6 pólizas y los catálogos y usuarios intactos, y que una corrida sin `--confirmar` no cambia nada.
- [x] 6.3 Documentar en `docs/migracion.md` la sección «Datos de demostración»: los clientes, el caso límite de cada uno, las variables `DEMO_TELEFONO_CLIENTE` y `DEMO_TELEFONO_COMPARTIDO`, el comando y cómo volver a la planilla recreando `db_data` sin tocar la sesión de WAHA. Sumar el comando a AGENTS.md y a la skill `backend-datos`. Verificar: seguir la documentación desde cero y llegar a la base de la demo.

## 7. Documentación de las reglas y verificación integral

- [x] 7.1 Actualizar AGENTS.md:
  - «Decisiones abiertas»: cuotas de las pólizas, con el plan mensual por la prima como supuesto provisorio, la fecha de pago supuesta y las cuotas no regeneradas al editar;
  - ABM: alta de póliza con prima obligatoria y cuotas;
  - Bandeja/Trámites: aviso del alta aprobada e «Ir a la ficha».

  Verificar: releer las secciones y que no contradigan las specs del change.
- [x] 7.2 Correr todas las comprobaciones: `docker compose exec frontend npm run lint`, `docker compose exec frontend npm run build`, `docker compose exec backend npx prisma generate`, `docker compose exec backend npx tsc --noEmit`, `docker compose exec backend npm test` y `openspec validate hilo-principal-demo --strict`.
- [ ] 7.3 Prueba manual del hilo completo por WhatsApp sobre la base de la demo:
  1. Escribir desde un número no vinculado: «no soy cliente», preguntar por la agencia, pedir contratar, mandar nombre, DNI y foto.
  2. Aprobar en Trámites: llega el aviso; usar «Ir a la ficha del cliente».
  3. Dar de alta una póliza que empieza hoy.
  4. Desde WhatsApp, pedir «mis datos», «mis pólizas» y «¿cuánto debo?»: responde las cuotas por vencer sin derivar.
  5. Recorrer los casos límite de la tabla de `design.md`.

  Verificar: anotar el resultado en el PR.
