# Proposal

## Why

«¿Cuánto debo?» y «¿cuánto me falta pagar?» son de las preguntas más frecuentes de la agencia (CASO-001; Roberto Castaño: «¿cuánto me falta pagar?») y RF-ATE-01 pone el saldo entre las consultas que el asistente responde solo. Hoy se derivan todas: en `asistente-respuestas-limitadas` se decidió derivarlas «porque los clientes de prueba no tienen esos datos (RF-ATE-02)». La tabla `cuota` ya existe en la base (`docs/caso8_der.md`: «Permite responder "¿cuánto me falta pagar?" sin gestionar cobros»), pero la planilla histórica no registra cuotas ni pagos, así que la tabla está vacía y nadie la lee.

Para el Parcial 2 (05/11/2026) el asistente tiene que responder el saldo con lo que haya registrado y, para mostrarlo, hacen falta cuotas en la base.

## What Changes

Decisiones de Santiago del 13/10/2026 (el cómo está en `design.md`):

- **El asistente responde el saldo (RF-ATE-01, RF-CAR-02).** La intención «saldo» pasa de derivar a responder con una plantilla nueva, que la IA solo vuelve a redactar, como el vencimiento y el estado:
  - una línea por póliza del cliente identificado, con el número, el ramo, las cuotas vencidas sin pagar y su importe, y las cuotas por vencer y su importe. Así responde las dos preguntas: «¿cuánto debo?» (lo vencido) y «¿cuánto me falta pagar?» (todo lo impago);
  - una cuota está vencida cuando su fecha de vencimiento es anterior a la fecha de hoy en Argentina, igual que una póliza;
  - los importes van con la moneda de la póliza ($ o US$) y no se suman entre pólizas;
  - una póliza con todas sus cuotas pagas se informa como sin cuotas pendientes.
- **Sin cuotas registradas, deriva (RF-ATE-02).** Si el cliente no tiene pólizas o alguna de sus pólizas no tiene ninguna cuota registrada, el asistente no responde y deriva, como con cualquier dato ausente. El saldo no se calcula con la prima mensual: sería inventar un dato que la planilla no tiene.
- **La redacción no puede cambiar importes ni el sentido de las cuotas (RF-ATE-02).** El control de la redacción suma los importes con su moneda, y «vencida(s)» y «por vencer», a los datos que tienen que quedar iguales. Si la IA cambia un importe, su formato o su moneda, o pasa una cuota de vencida a por vencer, se deriva.
- **Cuotas de ejemplo para la demo (RF-CAR-02).** Un script aparte y opcional, `npm run cargar-cuotas-ejemplo`, que se corre después de `migrar-planilla`:
  - carga cuotas mensuales, con la prima mensual como importe, para todas las pólizas de dos clientes migrados con número vinculado: el titular de POL-00123 (Juan García), con las dos últimas cuotas de cada póliza sin pagar, y la titular de POL-00124 (María del Carmen López), con todas pagas. Los demás clientes quedan sin cuotas, para mostrar la derivación;
  - se niega a escribir si la tabla `cuota` ya tiene filas, y carga todo en una transacción;
  - la marca de «ficticio» queda documentada, sin columna nueva: mientras la agencia no informe las cuotas reales, todo lo que hay en `cuota` es de ejemplo.
- **Documentación:**
  - `docs/migracion.md`: una sección para las cuotas de ejemplo;
  - AGENTS.md: el punto 4 de «Parcial 1: alcance y flujo» (el saldo deja de estar en lo que se deriva) y, en «Decisiones abiertas», que mientras no se definan las cuotas, las de la base son de ejemplo.

**Fuera de alcance:**
- medios de pago, cobranzas y registrar pagos: siguen fuera de alcance y «¿cómo pago?» se sigue derivando;
- mostrar las cuotas en el panel o cargarlas con ABM;
- cobertura y reclamo: se siguen derivando;
- la verificación de RF-VER-02.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `atencion-automatizada`:
  - se agrega un requirement: el saldo de todas las pólizas (RF-ATE-01, RF-ATE-02);
  - cambian dos:
    - la acción que sale de la intención: «saldo» responde en lugar de derivar (RF-ATE-01);
    - la redacción controlada: suma los importes, la moneda y «vencida»/«por vencer» (RF-ATE-02).
- `cartera`:
  - se agrega un requirement: las cuotas de ejemplo para la demo (RF-CAR-02).

No se citan, porque este change no los cumple o no los cambia:
- RF-DER-03: el silencio después de derivar no cambia;
- RF-ATE-04: siniestros y cotizaciones se siguen derivando;
- RF-VER-02: no hay verificación ni alertas;
- RF-SUP-05: no hay métricas.

## Impact

- **Código (backend):**
  - `domain/`:
    - `customer.ts`: la póliza suma su moneda y sus cuotas;
    - `intent.ts`: «saldo» pasa a responder con la plantilla nueva;
    - `templates.ts`: la plantilla del saldo y el formato de los importes;
    - `rewrite-check.ts`: los importes y «vencida»/«por vencer» como datos;
  - `infrastructure/`:
    - `prisma-customer-repository.ts`: lee la moneda y las cuotas;
    - `in-memory-customer-repository.ts` y `backend/fixtures/clientes-ficticios.json`: moneda y cuotas de prueba;
  - `application/process-incoming-message.ts` y su prueba: deriva si una póliza no tiene cuotas;
  - `backend/scripts/cargar-cuotas-ejemplo.ts`, nuevo, y su comando en `backend/package.json`.

  El canal, el almacén de conversaciones, el cliente de IA (la descripción de «saldo» ya dice «cuánto debe o cuánto le falta pagar») y el panel no cambian.
- **Base:** no hay migración, tablas ni columnas nuevas; `schema.prisma` no cambia. El script escribe solo en `cuota`.
- **Riesgos:**
  - con la cartera migrada, que está vencida por fecha, todas las cuotas de ejemplo quedan vencidas: la demo no muestra cuotas por vencer (las cubren las pruebas);
  - el cliente recibe las cuotas de ejemplo como reales, igual que la dirección y el teléfono de ejemplo;
  - la marca de ejemplo vive solo en la documentación: si algún día se cargan cuotas reales sin vaciar antes la tabla, la base no distingue unas de otras;
  - las primas sin símbolo se tomaron como pesos (`docs/migracion.md`), y una es la de POL-00124: sus cuotas de ejemplo salen en pesos;
  - el control es más estricto: si la redacción cambia el formato de un importe («$ 45.000,00» por «45000 pesos»), se deriva;
  - un cliente con una póliza sin cuotas no recibe el saldo de las otras: se deriva toda la consulta.
- **Preguntas abiertas que el change no cierra** (de «Decisiones abiertas» de AGENTS.md):
  - las cuotas de las pólizas: el asistente lee las que haya; las de la base son de ejemplo hasta que la agencia informe las reales;
  - la moneda de las primas sin símbolo: se siguen tomando como pesos;
  - el tratamiento de datos sensibles: los importes de las cuotas pasan a salir a Groq en la plantilla que se redacta, como ya salen las fechas y los estados;
  - cómo se cuenta «lo resolvió el asistente» (RF-SUP-05): un caso de saldo respondido queda como cualquier caso respondido.
