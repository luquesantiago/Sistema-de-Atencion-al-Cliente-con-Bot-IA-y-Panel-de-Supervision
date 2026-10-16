# Design

## Context

Estado de `main` en `8730ea7`, con `asistente-con-base` y `asistente-informacion-general` archivados. El porqué está en `proposal.md`.

- **La acción.** `actionForIntent` (`domain/intent.ts`) manda «saldo» a `{ kind: 'handoff' }`. Las respuestas con datos (`AnswerTemplate`: `expirations`, `statuses`, `courtesy`, `agency`) pasan por `sendRewrittenAnswer` (`application/process-incoming-message.ts`): si el cliente no tiene pólizas, deriva con el motivo «cliente sin pólizas»; si no, arma la plantilla (`fillTemplate`), pide la redacción a Groq y la controla con `checkRewrite`. La información de la agencia ya usa otro patrón: `agencyInfoAnswer` devuelve `null` si falta un dato y el flujo deriva.
- **El cliente del dominio.** `CustomerPolicy` (`domain/customer.ts`) tiene número, ramo, estado y fecha de vencimiento. `PrismaCustomerRepository` lee `poliza` (activas) con `ramo` y `estado_poliza`; no lee `moneda`, `prima_mensual` ni `cuota`. `InMemoryCustomerRepository` carga `backend/fixtures/clientes-ficticios.json` y valida cada campo.
- **La base.** `cuota` tiene `numero_cuota` (único por póliza), `fecha_vencimiento` (`DATE`), `importe` (`DECIMAL(12,2)`, `CHECK >= 0`) y `fecha_pago` (`DATE`, nula si no se pagó). No tiene `activo` ni dónde marcar un dato de ejemplo. `moneda` tiene `ARS` y `USD`. La migración de la planilla no escribe en `cuota`: hoy está vacía en todas las bases.
- **El control de la redacción.** `checkRewrite` (`domain/rewrite-check.ts`) compara el multiconjunto de datos de la plantilla y de la redacción: pólizas, fechas, los demás números (cada grupo de dígitos por separado), estados, ramos, días y «vence»/«venció»/«vencida». No mira el orden. Los términos prohibidos se cuentan contra la plantilla: «cuota», «saldo» y «deuda» ya están en la lista, así que la redacción puede usar «cuota» tantas veces como la plantilla, y no puede sumar «saldo» ni «deuda».
- **La cartera migrada está vencida por fecha** (`docs/migracion.md`). POL-00123 es de Juan García (números 5491155551001 y 5491155551009 vinculados) y POL-00124 de María del Carmen López (5491155551005); la prima de POL-00124 no tenía símbolo y se tomó como pesos.

## Goals / Non-Goals

**Goals:**
- Que la cuenta del saldo (qué cuota está vencida, qué está paga, cuánto suma) sea una función pura del dominio, con su prueba, y que el flujo solo decida responder o derivar.
- Que la redacción no pueda cambiar un importe, su moneda ni convertir una cuota vencida en una por vencer.
- Que las cuotas de ejemplo no se carguen sin que alguien lo pida y que nunca pisen cuotas existentes.

**Non-Goals:**
- Registrar pagos, generar cuotas para pólizas nuevas o mostrarlas en el panel.
- Distinguir en la base las cuotas de ejemplo de las reales.
- Responder el saldo de una sola póliza: como el vencimiento y el estado, se responden todas.

## Decisions

### 1. La póliza del dominio trae su moneda y sus cuotas

`CustomerPolicy` suma:

- `currency: 'ARS' | 'USD'`, con la lista en `domain/customer.ts` (como `ramos`) y un guardián `isCurrency`. Una moneda fuera de la lista lanza en `customerFromRecord`, como un ramo desconocido;
- `installments: Array<{ number: number; dueDate: string; amountCents: number; paid: boolean }>`, con `dueDate` en `aaaa-mm-dd` y ordenadas por número.

El importe va en centavos enteros: `DECIMAL(12,2)` llega de Prisma como `Decimal`, se pasa a texto con dos decimales y de ahí a entero, así las sumas no tienen error de punto flotante.

`PrismaCustomerRepository` suma `moneda` y `cuota` (ordenadas por `numero_cuota`) al `include` de las pólizas.

*Alternativas descartadas:*
- **Un método aparte, `installmentsOf(customerId)`, solo para el saldo**: agranda la interfaz de `CustomerRepository` y el flujo tendría dos fuentes del mismo cliente. Con a lo sumo una cuota por mes de vigencia, leerlas con el cliente cuesta poco.
- **Sumar en SQL**: la frontera entre vencida y por vencer depende de la fecha de hoy en Argentina, que el dominio ya calcula (`argentinaToday`), y la suma en el dominio se prueba sin base.

### 2. La cuenta y la plantilla del saldo, en el dominio

`domain/balance.ts` (nuevo) exporta:

- `policyBalance(policy, now)`: cuenta las cuotas sin pagar (`paid === false`) y las separa en vencidas (`dueDate < argentinaToday(now)`) y por vencer (el resto, incluida la que vence hoy), con la cantidad y la suma en centavos de cada grupo;
- `balanceTemplate(customer, now): string | null`: devuelve `null` si el cliente no tiene pólizas o alguna póliza no tiene cuotas; si no, la plantilla.

`formatAmount(cents, currency)` escribe el importe siempre igual: `$ 45.000,00` o `US$ 45.000,00`, con punto de miles, coma decimal y un espacio común. No usa `Intl.NumberFormat`, que en `es-AR` mete un espacio no separable y depende de la versión de ICU.

Textos propuestos (el equipo los revisa en el PR):

```
{nombre}, este es el detalle de las cuotas sin pagar de sus pólizas:
- POL-00123 (auto): 2 cuotas vencidas sin pagar por $ 90.000,00 y 3 cuotas por vencer por $ 135.000,00.
- POL-00123 (auto): 2 cuotas vencidas sin pagar por $ 90.000,00 y ninguna cuota por vencer.
- POL-00123 (auto): ninguna cuota vencida sin pagar y 3 cuotas por vencer por $ 135.000,00.
- POL-00123 (auto): no tiene ninguna cuota pendiente de pago.
```

En singular: «1 cuota vencida sin pagar», «1 cuota por vencer». Las líneas van ordenadas por número de póliza, como en los vencimientos. La plantilla no usa «saldo» ni «deuda»: siguen prohibidos en la redacción.

El flujo suma `'balance'` a `AnswerTemplate`, `actionForIntent('saldo')` devuelve `{ kind: 'answer', template: 'balance' }` y `sendRewrittenAnswer` deriva con el motivo «póliza sin cuotas registradas» cuando `balanceTemplate` devuelve `null`, antes de pedir la redacción. El chequeo de «cliente sin pólizas» que ya existe queda primero, con su motivo.

*Alternativa descartada:* **responder las pólizas con cuotas y derivar el resto**. Partir una consulta entre una respuesta y una derivación no existe hoy en el flujo, y la regla es derivar ante un dato ausente.

### 3. El control de la redacción suma importes y el orden en el saldo

En `rewrite-check.ts`:

- **Importes.** Antes que las pólizas y las fechas se sacan los importes con el patrón `(us\$|\$) ?\d{1,3}(\.\d{3})*,\d{2}` (sobre el texto normalizado) y entran al multiconjunto como `importe:<moneda><número>`, sin el espacio. Así sus dígitos no se cuentan como números sueltos, y cambiar el formato («45000 pesos»), la moneda o el número hace que no coincidan.
- **Vencidas, por vencer y ninguna.** La lista de palabras pasa de `vencida` a `vencidas?` y suma `por vencer` y `ningun[ao]?`. «Ninguna» es lo único que separa «ninguna cuota por vencer» de «una cuota por vencer», y «no tiene ninguna cuota pendiente» de «tiene cuotas pendientes»: por eso la línea de una póliza con todo pago dice «ninguna» (ajuste de la implementación, 13/10/2026).
- **Orden, solo en el saldo.** `checkRewrite` recibe una opción `ordered`: los datos se comparan en el orden en que aparecen en el texto, no solo como multiconjunto. Sin el orden, «2 cuotas vencidas por $ 90.000,00 y 3 por vencer por $ 135.000,00» y la misma frase con los grupos cambiados tienen los mismos datos. El vencimiento y el estado siguen sin orden, para no derivar más que hoy.

Las instrucciones de la redacción (`rewriteInstructions`) suman los importes a lo que no se cambia y piden mantener el orden de los datos.

*Alternativa descartada:* **mandar el saldo como texto fijo, sin redacción**. AGENTS.md pide que el LLM vuelva a redactar la plantilla con los datos, y el control en orden alcanza para que no cambie su sentido.

### 4. Las descripciones de la lista no cambian

La descripción de «saldo» ya es «cuánto debe o cuánto le falta pagar», y la de «otra consulta» ya incluye «cómo pagar o los medios de pago». Se prueba a mano con Groq que «¿cómo pago?» siga cayendo en «otra consulta».

### 5. Las cuotas de ejemplo, en un script aparte

`backend/scripts/cargar-cuotas-ejemplo.ts`, con el comando `npm run cargar-cuotas-ejemplo`. La generación de las cuotas es una función pura en `backend/scripts/cuotas-ejemplo.ts`, con su prueba en `backend/scripts/cuotas-ejemplo.test.ts` (Vitest toma cualquier `*.test.ts` fuera de `node_modules`, y `tsc --noEmit` ya compila `scripts/`).

- **Qué carga.** Busca POL-00123 y POL-00124 de «Seguros Castaño» y, de cada una, su titular. A todas las pólizas activas de cada titular les genera una cuota por mes: la primera vence el día de `fecha_inicio`, y las siguientes el mismo día de cada mes (el último día si el mes es más corto), mientras sea anterior a `fecha_vencimiento`. El importe es `prima_mensual`. Las de López quedan todas pagas; de las de García, las dos últimas de cada póliza quedan sin pagar. Una cuota paga lleva `fecha_pago` igual a su vencimiento.
- **Qué controla antes de escribir.** Que `cuota` esté vacía, que existan las dos pólizas y que todas las pólizas elegidas tengan prima. Si algo falla, no escribe nada y lo informa.
- **Cómo escribe.** Un `createMany` dentro de una transacción. Al final informa cuántas cuotas cargó por número de póliza, sin DNI ni teléfonos, y recuerda que son datos de ejemplo.
- **Cómo se quitan.** Mientras sean las únicas cuotas, vaciando la tabla (`DELETE FROM cuota`). Queda en `docs/migracion.md`.

*Alternativas descartadas:*
- **Una migración SQL**: corre antes de que existan las pólizas, que carga un script, y en cualquier base, incluida la de producción.
- **Sumarlo a `migrar-planilla`**: mezcla datos históricos con datos inventados, y quien migra la planilla los cargaría sin pedirlo.
- **Una columna `cuota.es_ejemplo`**: es una columna fuera del DER para algo provisorio. La marca queda en la documentación.
- **Calcular el saldo con `prima_mensual`**: inventaría un dato que la planilla no tiene.

## Risks / Trade-offs

- [La demo no muestra cuotas por vencer, porque la cartera migrada venció en 2024] → las pruebas del dominio y del flujo cubren los cuatro textos con fixtures, con una fecha de hoy fija.
- [El cliente ve las cuotas de ejemplo como reales] → quedan documentadas en `docs/migracion.md` y en «Decisiones abiertas»; el script lo recuerda al terminar. Es el mismo trato que la dirección y el teléfono de ejemplo.
- [Se cargan cuotas reales sin vaciar antes la tabla y quedan mezcladas] → el script se niega si la tabla no está vacía, y la documentación dice que antes de cargar las reales se vacía.
- [El control en orden deriva redacciones correctas que cambian el orden de los datos] → las instrucciones piden mantener el orden; si en la prueba con Groq deriva seguido, se ajustan las instrucciones, no el control.
- [Leer las cuotas con cada cliente agrega una consulta a cada identificación] → son pocas filas por póliza y una sola consulta con `include`.
- [Una prima sin símbolo tomada como pesos (POL-00124) sale en pesos] → es la decisión de la migración, sigue abierta en «Decisiones abiertas».

## Migration Plan

1. Sin migración de base: `schema.prisma` no cambia.
2. Después de desplegar el backend, en la máquina de la demo: `docker compose exec backend npm run cargar-cuotas-ejemplo`, después de `migrar-planilla`.
3. Para volver atrás: vaciar `cuota` (el asistente vuelve a derivar todas las consultas de saldo, por falta de cuotas) o revertir el código (vuelve a derivar por la intención).
