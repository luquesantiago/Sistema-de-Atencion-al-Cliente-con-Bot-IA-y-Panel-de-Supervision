# Tasks

Los comandos corren desde la raíz del repo, en la WSL, con el stack levantado (`docker compose up -d --build`).

- No se lee ni se muestra el `.env`.
- Los SELECT se corren en el contenedor `db` con `docker compose exec db sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "…"'`, con un solo `-e`. No muestran DNI, teléfonos completos ni textos de mensajes.
- Los DNI y los números de las pruebas manuales los elige Santiago y no se escriben en el repo ni en el chat.
- Las pruebas de Vitest usan clientes ficticios (DNI 99…, pólizas POL-9…), sin base y sin Groq, con una fecha de hoy fija.

## 1. La póliza del dominio trae su moneda y sus cuotas

- [x] 1.1 En `domain/customer.ts`, sumar la lista de monedas (`ARS`, `USD`) con su guardián `isCurrency`, y `currency` e `installments` a `CustomerPolicy` (decisión 1 de `design.md`). Verificar: `docker compose exec backend npx tsc --noEmit` solo marca los lugares que arman pólizas, que se arreglan en 1.2 y 1.3.
- [x] 1.2 En `infrastructure/prisma-customer-repository.ts`, sumar `moneda` y `cuota` (ordenadas por `numero_cuota`) al `include` y a `CustomerRecord`, y convertir `importe` a centavos enteros y `fecha_vencimiento` a `aaaa-mm-dd` sin zona horaria. En `prisma-customer-repository.test.ts`:
  - **permitido:** una póliza con dos cuotas, una paga y otra no, queda con la moneda, los centavos exactos (por ejemplo `12345.67` → `1234567`) y `paid` correcto;
  - **rechazado:** una moneda que no está en la lista lanza, como un ramo desconocido.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 1.3 En `backend/fixtures/clientes-ficticios.json` sumar `currency` e `installments` a cada póliza, con cuotas vencidas, por vencer y pagas, una póliza en USD y una póliza sin cuotas; actualizar el aviso si hace falta y el parser de `in-memory-customer-repository.ts` para validar los campos nuevos. En su prueba: **rechazado:** una cuota sin `dueDate` válido o con importe negativo no carga. Verificar: `docker compose exec backend npm test` y `docker compose exec backend npx tsc --noEmit` pasan.

## 2. La cuenta y la plantilla del saldo

- [x] 2.1 Crear `domain/balance.ts` con `policyBalance`, `formatAmount` y `balanceTemplate` (decisión 2 de `design.md`), con los textos propuestos. En `balance.test.ts`:
  - **permitido:**
    - separa vencidas y por vencer con la fecha de Argentina (una cuota que vence hoy es por vencer; a las 23:30 de Argentina del día anterior todavía no venció);
    - no cuenta las pagas;
    - suma en centavos sin error (tres cuotas de `$ 0,10` dan `$ 0,30`);
    - los cuatro textos de línea, el singular y el orden por número de póliza;
    - `formatAmount` escribe `$ 1.234.567,89` y `US$ 45,00`;
  - **derivado:** devuelve `null` con un cliente sin pólizas y con un cliente que tiene una póliza sin cuotas aunque las otras tengan.

  Verificar: `docker compose exec backend npm test` pasa.

## 3. El control de la redacción

- [x] 3.1 En `domain/rewrite-check.ts`, sumar los importes con su moneda al multiconjunto (antes que pólizas y fechas), pasar `vencida` a `vencidas?`, sumar `por vencer` y la opción `ordered` (decisión 3 de `design.md`). En `rewrite-check.test.ts`:
  - **permitido:** una redacción del saldo que cambia las palabras pero conserva importes, monedas, cantidades y el orden; con `$45.000,00` sin espacio también pasa;
  - **derivado:**
    - cambia un importe, lo escribe `45000 pesos`, cambia `$` por `US$` o lo quita;
    - intercambia el grupo de vencidas con el de por vencer (con `ordered`);
    - suma «saldo» o «deuda»;
  - **sin cambios:** las pruebas de vencimientos, estados e información de la agencia que ya existen siguen pasando sin `ordered`.

  Verificar: `docker compose exec backend npm test` pasa.
- [x] 3.2 En `infrastructure/openai-compatible-client.ts`, sumar a `rewriteInstructions` los importes a lo que no se cambia y el pedido de mantener el orden de los datos; ajustar su prueba si compara el texto. Verificar: `docker compose exec backend npm test` pasa.

## 4. El flujo responde el saldo

- [x] 4.1 En `domain/intent.ts`, sumar `'balance'` a `AnswerTemplate` y mandar «saldo» a `{ kind: 'answer', template: 'balance' }`. En `intent.test.ts`: **permitido:** «saldo» responde con `balance`; **derivado:** siniestro, cotización, cobertura, reclamo y «otra consulta» siguen derivando. Verificar: `docker compose exec backend npm test` pasa.
- [x] 4.2 En `application/process-incoming-message.ts`, armar la plantilla del saldo en `sendRewrittenAnswer`, con `checkRewrite` en orden, y derivar con el motivo «póliza sin cuotas registradas» cuando `balanceTemplate` devuelve `null`, sin pedir la redacción. En `process-incoming-message.test.ts`:
  - **permitido:** un cliente con cuotas sin pagar pregunta cuánto debe y recibe la redacción, en el caso de tipo «saldo»; uno con todo pago recibe «no tiene ninguna cuota pendiente de pago»;
  - **derivado:**
    - una póliza sin cuotas: deriva y el `FakeAi` no recibió ningún pedido de redacción;
    - un cliente sin pólizas: deriva con «cliente sin pólizas»;
    - una redacción que cambia un importe: no se envía, queda guardada como rechazada y deriva;
    - la conversación queda en silencio después de cada derivación.

  Verificar: `docker compose exec backend npm test` y `docker compose exec backend npx tsc --noEmit` pasan.
- [x] 4.3 Actualizar el `FakeAi` y los clientes de `http/app.test.ts` si arman pólizas, y cualquier otro lugar que construya un `CustomerPolicy`. Verificar: `docker compose exec backend npm test` pasa entero.
- [x] 4.4 En AGENTS.md, punto 4 de «Parcial 1: alcance y flujo»: sumar «Saldo: responde el asistente con las cuotas sin pagar de cada póliza, una línea por póliza; si una póliza no tiene cuotas registradas, deriva» y sacar «saldo» de «Cualquier otra cosa». Verificar: `git grep -n "saldo" AGENTS.md` muestra la línea nueva y ya no aparece en la de «Cualquier otra cosa».

## 5. Cuotas de ejemplo

- [x] 5.1 Crear `backend/scripts/cuotas-ejemplo.ts` con la función pura que genera las cuotas de una póliza (decisión 5 de `design.md`) y `backend/scripts/cuotas-ejemplo.test.ts`:
  - **permitido:** una vigencia de un año da 12 cuotas numeradas desde 1, con la prima como importe; un inicio el 31 cae el 30 o el 28/29 en los meses cortos; con `unpaid = 2` las dos últimas quedan sin `fecha_pago` y las demás pagas en su vencimiento; con `unpaid = 0` todas pagas;
  - **rechazado:** una póliza sin prima lanza.

  Verificar: `docker compose exec backend npm test` muestra las pruebas de `scripts/cuotas-ejemplo.test.ts` entre las que corrieron, y pasan.
- [ ] 5.2 Crear `backend/scripts/cargar-cuotas-ejemplo.ts` y el comando `cargar-cuotas-ejemplo` en `backend/package.json`: controla que `cuota` esté vacía, que existan POL-00123 y POL-00124 y que las pólizas elegidas tengan prima; carga en una transacción; informa los conteos por número de póliza sin DNI ni teléfonos y recuerda que son datos de ejemplo. Verificar, con la planilla migrada:
  - `docker compose exec backend npm run cargar-cuotas-ejemplo` termina bien;
  - un SELECT de `numero_poliza`, cantidad de cuotas y cantidad sin `fecha_pago` por póliza muestra cuotas solo en las pólizas de los titulares de POL-00123 y POL-00124, con 2 sin pagar en cada póliza del primero y 0 en las de la segunda;
  - correrlo de nuevo no escribe nada e informa que la tabla no está vacía;
  - `docker compose exec backend npx tsc --noEmit` pasa.
- [x] 5.3 En `docs/migracion.md`, sumar la sección «Cuotas de ejemplo»: que la planilla no trae cuotas, qué carga el script y a qué clientes, que son datos ficticios mientras la agencia no informe los reales, el comando para cargarlas, que se quitan con `DELETE FROM cuota` mientras sean las únicas, y que antes de cargar cuotas reales hay que vaciar la tabla. En AGENTS.md, en «Decisiones abiertas», completar «Cuotas de las pólizas» con «Mientras tanto, las cuotas de la base son de ejemplo (`docs/migracion.md`)». Verificar: `git grep -n "cargar-cuotas-ejemplo" -- docs/migracion.md` muestra el comando, y `git grep -n "Cuotas de las pólizas" AGENTS.md` muestra la línea completada.

## 6. Prueba de punta a punta (manual, con Santiago)

- [ ] 6.1 Con la planilla y las cuotas de ejemplo cargadas, desde números identificados que no estén en silencio (si el vinculado está en silencio por los casos migrados, se cierra el caso desde el panel o se usa un número no vinculado y el DNI):
  1. como el titular de POL-00123: «¿cuánto debo?» → una línea por póliza con las 2 cuotas vencidas sin pagar y su importe;
  2. como la titular de POL-00124: «¿cuánto me falta pagar?» → «no tiene ninguna cuota pendiente de pago» en cada póliza;
  3. como otro cliente migrado: «¿cuánto debo?» → mensaje de derivación y silencio;
  4. «¿cómo pago?» → mensaje de derivación (cae en «otra consulta», no en saldo).

  Verificar: cada respuesta llega por WhatsApp como se describe, y un SELECT de `caso` muestra los casos de tipo «saldo» y el motivo «póliza sin cuotas registradas» en la derivación del punto 3. Si Groq reordena los datos y se deriva seguido, se anota y se ajustan las instrucciones de la tarea 3.2.

## 7. Verificaciones globales

- [ ] 7.1 Correr los comandos de AGENTS.md: `docker compose exec frontend npm run lint`, `docker compose exec frontend npm run build`, `docker compose exec backend npx prisma generate`, `docker compose exec backend npx tsc --noEmit` y `docker compose exec backend npm test`. Verificar: todos terminan sin errores y `git diff --exit-code backend/prisma/schema.prisma` no muestra cambios.
- [x] 7.2 `openspec validate asistente-responde-saldo --strict`. Verificar: no reporta errores.
