# Design

## Context

- **Por qué hace falta la carga y qué quedó decidido:** ver `proposal.md`.
- **El esquema ya está completo.** Lo forman las tres migraciones de `backend/prisma/migrations`, y el cliente de Prisma se genera en `backend/src/generated/prisma`. Ningún código del backend usa todavía ese cliente: el repositorio de clientes es en memoria. La conexión sigue la skill `backend-datos`: adaptador `@prisma/adapter-mariadb`, las variables `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` y `DATABASE_NAME` que ya pone el compose, y `allowPublicKeyRetrieval: true`, solo para desarrollo.
- **El contenedor `backend` solo monta `./backend`.** El Excel tiene que estar en una carpeta dentro de `backend/` para que el script lo vea.
- **Las celdas del Excel llegan así** (verificado el 06/10/2026 sobre la hoja Consultas):
  - `read-excel-file` devuelve las fechas como `Date` a las 00:00 UTC del día.
  - Las horas, que van en celdas aparte, llegan como `Date` del 30/12/1899 en UTC: por ejemplo, `1899-12-30T09:15:00Z` es 09:15.
  - Los casos sin hora traen 00:00 y las resoluciones traen 23:59.
- **La hoja Consultas ya trae lo que antes había que sacar del log** (verificado el 06/10/2026):
  - `funcionario_asignado` está completo en los 10 casos que se migran.
  - `poliza` tiene valor en CASO-001, 006, 011 y 012, y está vacía en CASO-002, 004 y 008.
  - `tipo_consulta` y `tipo_alerta` ya traen los nombres del catálogo: CASO-003 y CASO-010 vienen sin tipo y con «Intento de manipulación del asistente», y CASO-006 trae «Pedido de reembolso (aviso al equipo)».
  - Por eso el script no lee Log_Resoluciones.
- **Las restricciones de la base marcan las horas:**
  - `ck_caso_fechas` exige apertura ≤ derivación ≤ toma ≤ cierre.
  - `ck_caso_toma` exige que un caso tomado tenga responsable.
  - `ck_alerta_fechas` exige atención ≥ alerta.
  - `ck_alerta_atencion` exige quién y cuándo, o ninguno de los dos.
  - `ck_conversacion_fechas` exige que el fin no sea anterior al inicio.
  - `respuesta.fecha_hora` es `DATETIME` sin milisegundos, y `mensaje.fecha_hora` es `DATETIME(3)`.

## Goals / Non-Goals

**Goals:**

- Una carga de todo o nada: si algo falla, la base queda como estaba.
- Validar toda la planilla antes de escribir, con un informe de problemas por fila.
- Que el resultado coincida exactamente con los conteos de `proposal.md` (Impact) y con los escenarios de `specs/cartera/spec.md`.
- Que la carga se pueda repetir en cualquier máquina que tenga el Excel, sin que el repo guarde datos de clientes.

**Non-Goals:**

- Poder correr el script dos veces sobre la misma base. Para recargar: `docker compose down -v`, levantar el stack y correrlo de nuevo.
- Pruebas automáticas (decisión del equipo, 06/10/2026). La verificación son los `SELECT` de `tasks.md`.
- Leer las hojas Leeme, Log_Resoluciones, Cambios y Pendientes.

## Decisions

### 1. Script versionado en `backend/scripts/`, Excel en una carpeta ignorada

- **Script:** `backend/scripts/migrar-planilla.ts`, versionado. Queda fuera de `src/` porque no es parte de la aplicación: el backend no lo importa y `tsx watch` no lo recarga. `tsc --noEmit` igual lo revisa, porque `tsconfig.json` no tiene `include` y compila todo `backend/`.
- **Excel:** se guarda en Drive y se copia a `backend/planilla/Caso8_seguros_bot_datos_limpios.xlsx` solo para cargar. `.gitignore` suma `backend/planilla/`. Después de cargar se puede borrar: los datos quedan en el volumen `db_data`.
- **Imports:** el cliente de Prisma se importa como `../src/generated/prisma/client.js`. Con `module: nodenext` los imports relativos llevan `.js`.
- **Dependencias en `backend/package.json`**, en `dependencies`: `read-excel-file@9.3.10` y `bcryptjs@3.0.3`, que trae sus propios tipos. Se instalan con `docker compose exec backend npm install read-excel-file@9.3.10 bcryptjs@3.0.3`, y `package-lock.json` se commitea con ellas.
- **Comando:** en `scripts` de `package.json`, `"migrar-planilla": "tsx scripts/migrar-planilla.ts"`. Se corre con `docker compose exec backend npm run migrar-planilla`, y con `-- <ruta>` para otro archivo. Si no se le pasa ruta, usa `planilla/Caso8_seguros_bot_datos_limpios.xlsx`.
- **Nada corre al levantar el stack:** sin el Excel, el backend arranca igual.
- **Alternativas consideradas:**
  - Script fuera del repo, con dependencias instaladas con `npm install --no-save`. Se descarta (decisión del equipo, 06/10/2026): si el script se pierde, no se pueden recargar los datos después de un `down -v`, y el revisor del PR no vería el código.
  - Script en `backend/fixtures/`. Se descarta: esa carpeta es para datos ficticios marcados (`AGENTS.md`).

### 2. Lectura con `read-excel-file`, validación completa y después escritura

1. **Leer:** se usa `readSheet(ruta, nombreDeHoja)` de `read-excel-file/node` (la hoja va como segundo argumento; un objeto `{ sheet }` se ignora y devuelve la primera hoja, verificado el 06/10/2026) para Clientes, Pólizas y Consultas. Cada fila se pasa a un objeto según los encabezados de la fila 1. El script busca las columnas por nombre, no por posición.
2. **Filtrar:** las filas con «migrar» = «No» se separan con su `motivo_no_migra` para el informe final.
3. **Validar todo antes de escribir.** Se juntan todos los problemas y, si hay alguno, el script los lista con hoja, id de fila y motivo, termina con código distinto de 0 y no abre la conexión de escritura. Se valida:
   - columnas obligatorias presentes y con el tipo esperado;
   - DNI de 7 u 8 dígitos y teléfono de 10 a 15 dígitos;
   - `dni_titular` existe en Clientes;
   - la `poliza` de un caso está entre las pólizas que se migran;
   - `ramo`, `estado_poliza`, `tipo_consulta`, `tipo_alerta` y la moneda existen en sus catálogos;
   - `funcionario_asignado` es «Roberto» o «Graciela»;
   - inicio ≤ vencimiento;
   - apertura ≤ cierre;
   - patentes sin repetir.
4. **Escribir** (decisión 3).

- **Alternativa considerada:** `exceljs` 4.4.0. Se descarta porque su última versión estable es de octubre de 2023 y `npm audit` da 2 vulnerabilidades moderadas. Tampoco se usa el paquete `xlsx` de npm, que tiene vulnerabilidades altas sin arreglo.

### 3. Una transacción, y aborta si la base ya tiene datos

- **Control previo:** antes de abrir la transacción, el script cuenta las filas de `cliente` y busca si existen los usuarios `roberto` o `graciela`. Si hay alguno, aborta sin escribir y sugiere `docker compose down -v`.
- **Transacción:** toda la escritura va en `prisma.$transaction(async (tx) => …, { timeout: 60_000 })`. El timeout por defecto, de 5 s, no alcanza para unos cien `INSERT` secuenciales. Solo hay DML, así que InnoDB deshace todo si algo falla.
- **Ids de catálogo:** se buscan por nombre, nunca escritos a pelo. Si falta un nombre, la transacción falla y se avisa.
- **Alternativa considerada:** una carga que se pueda repetir, con upsert por DNI, número de póliza y usuario. Se descarta porque casos, conversaciones y mensajes no tienen una clave natural en la base: `caso_id` de la planilla no se guarda.

### 4. Cómo se carga cada tabla

- **`usuario`**:
  - Roberto Castaño (`roberto`, administrador) y Graciela Castaño (`graciela`, operador), con `activo = TRUE` (decisión del equipo, 06/10/2026).
  - El hash es `bcrypt.hash('seguros1234', 10)` de `bcryptjs`: da `$2b$10$…`, de 60 caracteres. Es el mismo algoritmo que la migración de los usuarios de prueba.
  - `funcionario_asignado` se resuelve contra estos dos registros.
- **`cliente`**:
  - `dni` (solo dígitos), `apellido` y `nombre`.
  - Las columnas `polizas`, `titular_en_planilla` y `observaciones` no se cargan.
- **`bien_asegurado`**:
  - Se crea uno por póliza que trae `bien_descripcion`; las de vida no lo traen.
  - `descripcion`, `patente_matricula` (en mayúsculas y sin espacios ni guiones, o `NULL`), `direccion`, `marca`, `modelo` y `anio`.
- **`poliza`**:
  - Se carga con `numero_poliza` y con el titular (por `dni_titular`).
  - La compañía es «Seguros Castaño»; ramo, estado y moneda se buscan por nombre (la moneda por su código).
  - `prima_mensual` y `observaciones` van tal como vienen.
  - `fecha_inicio` y `fecha_vencimiento` son `DATE` y se toman de los componentes UTC del `Date` de la celda, sin pasar por hora argentina.
  - Si el estado es «vencida», se carga «activa» (`docs/migracion.md`).
- **`telefono`**: un registro por número distinto de Consultas.
- **`cliente_telefono`**:
  - Si el caso tiene póliza, el número se vincula con el titular de esa póliza.
  - Si el vínculo ya existe, no se duplica: CASO-001 y CASO-011 comparten número y titular.
- **`conversacion`**:
  - Una por caso. `fecha_inicio` es la apertura y `fecha_fin` es el cierre, o `NULL` si el caso está abierto.
  - `id_cliente` es el titular de la póliza del caso, o `NULL`.
  - `asistente_suspendido = FALSE` en las 10 (decisión del equipo, 06/10/2026; ver Open Questions en `proposal.md`).
- **`caso`**:
  - `fecha_apertura = fecha_derivacion = fecha_toma` = la apertura, y `fecha_cierre` es el cierre o `NULL`.
  - `id_usuario_asignado` sale de `funcionario_asignado`.
  - `id_tipo_consulta` va por nombre, o `NULL` si viene vacío.
  - `id_poliza` es la póliza del caso, o `NULL`.
  - `motivo_derivacion` e `id_nivel_riesgo` quedan en `NULL`: la planilla no los trae y no está definido quién marca el nivel del caso.
- **`mensaje`**: dos por caso.
  - Uno de origen «cliente», con `mensaje_usuario`, a la hora de apertura.
  - Otro de origen «asistente», con `respuesta_bot_ia`, a la apertura + 1 s.
- **`respuesta`**:
  - Una por caso, con el texto del bot.
  - `id_mensaje_consulta` es el mensaje del cliente e `id_mensaje_enviado` es el del asistente.
  - `id_usuario` queda en `NULL` y `fecha_hora` es la apertura + 1 s.
  - Sin verificación (`docs/caso8_der.md`, «Redundancias aceptadas»). Las respuestas no se corrigen: son la evidencia de los fallos.
- **`alerta`**: una por caso con `tipo_alerta`.
  - El nivel es `tipo_alerta.id_nivel_riesgo_default`.
  - `fecha_hora = fecha_atencion` = la apertura, que es la hora de la toma.
  - `id_usuario_atencion` es el responsable del caso.
  - `id_respuesta` queda en `NULL`: las cinco alertas son por lo que pidió el cliente, no por lo que respondió el bot.
- **Orden de inserción:** usuarios, clientes, bienes, pólizas, teléfonos, vínculos y después, caso por caso, conversación, caso, mensajes, respuesta y alerta.

### 5. Horas: de hora argentina a UTC

Argentina es UTC−3 todo el año. Para cada fecha y hora:

1. Tomar año, mes y día de la celda de fecha, en UTC.
2. Tomar hora y minutos de la celda de hora, en UTC.
3. Calcular `Date.UTC(año, mes, día, hora + 3, minutos)`.

No se usa la zona horaria del proceso ni `Intl`: el contenedor corre en UTC y el corrimiento es fijo.

- **Ejemplos:**
  - CASO-001, 01/04/2024 a las 09:15 → `2024-04-01T12:15:00Z`.
  - Cierre a las 23:59 → `02:59:00Z` del día siguiente.
- **Casos sin hora:** abren a las 00:00 (CASO-010 y CASO-011), que ya viene así en la celda.
- **Hora del bot:** 1 s después del mensaje del cliente, y no 1 ms, porque `respuesta.fecha_hora` no guarda milisegundos y MySQL redondearía.
- **Alternativa considerada:** todo dentro del mismo segundo (el bot a la apertura + 1 ms) y la alerta vinculada a la respuesta del bot. Se descarta (decisión del equipo, 06/10/2026).

### 6. Informe final

Al terminar bien, el script imprime:

- cuántas filas cargó por tabla: usuario (solo las nuevas), cliente, bien_asegurado, poliza, telefono, cliente_telefono, conversacion, caso, mensaje, respuesta y alerta;
- las filas salteadas, con hoja, id (`numero_poliza` o `caso_id`) y `motivo_no_migra`.

Esperado: POL-00126, POL-00131 y POL-00128 en Pólizas, y CASO-007 y CASO-009 en Consultas.

No imprime DNI, teléfonos ni textos de los mensajes: solo ids de la planilla y conteos.

### 7. Documentación

- **`docs/migracion.md`:**
  - «Dónde está el Excel» suma que, para cargar, se copia a `backend/planilla/` (ignorada), que el script está en `backend/scripts/migrar-planilla.ts`, que se corre con `docker compose exec backend npm run migrar-planilla` sobre una base vacía, y que `docker compose down -v` borra los datos y hay que volver a correrlo.
  - En «Usuarios», el párrafo de los históricos pasa a decir que Roberto y Graciela quedan activos con la contraseña `seguros1234`, con la misma advertencia que los usuarios de prueba: el repo es público y antes de producción se cambia.
- **`AGENTS.md`** (Parcial 1): la línea «El Excel limpio no está en el repo» suma dónde está el script y el comando para correrlo.

## Risks / Trade-offs

- **[Un `docker compose down -v` borra los datos migrados]** → se recargan copiando el Excel a `backend/planilla/` y corriendo el script. `stop`, `restart` y `down` sin `-v` no los borran.
- **[La contraseña `seguros1234` queda en el script y en `docs/migracion.md`, en un repo público, y los usuarios están activos]** → riesgo aceptado por el equipo (06/10/2026), igual que `1234` en los usuarios de prueba. Antes de producción se cambia.
- **[Dos dependencias de producción para una carga que se corre pocas veces]** → `bcryptjs` la va a usar igual el login del Parcial 2. `read-excel-file` es chica (4 dependencias, `npm audit` sin vulnerabilidades el 06/10/2026).
- **[Las conversaciones abiertas quedan sin `asistente_suspendido`]** → no hay efecto mientras el asistente use los fixtures. Queda anotado en `proposal.md` para el change que lo conecte a la base.
- **[Tiempos irreales en métricas]** → la toma es a la hora de apertura y el cierre a las 23:59. Ya está advertido en `docs/migracion.md`.
- **[Los datos de clientes de la planilla quedan en la base local]** → el script no los imprime y la carpeta está ignorada. El volumen `db_data` no se sube a ningún lado.

## Migration Plan

1. `docker compose down -v` y `docker compose up -d --build`, para tener una base recién migrada.
2. Copiar el Excel desde Drive a `backend/planilla/`.
3. `docker compose exec backend npm run migrar-planilla`.
4. Verificar con los `SELECT` de `tasks.md`.
5. Opcional: borrar el Excel de `backend/planilla/`.

**Rollback:** si el script falla, la transacción no deja nada. Si la carga terminó pero está mal: `docker compose down -v`, `up -d --build`, corregir y volver a correr.
