# Design

## Context

Estado actual de la base y restricciones que definen el enfoque (ver `proposal.md` para el porqué):

- El esquema vigente está en dos migraciones de `backend/prisma/migrations`: `20260928140000_esquema_inicial` (esquema completo, sin `auditoria`) y `20260928140100_catalogos` (valores de los catálogos, `rol` incluido). El flujo es SQL-first (decisión del 28/09/2026): carpeta escrita a mano, `prisma migrate deploy`, `prisma db pull`, `prisma generate`. Nunca `prisma migrate dev`, nunca editar una migración aplicada.
- `caso` no tiene columna de póliza: la decisión 1 del 28/09/2026 de `docs/caso8_der.md` la agrega y `docs/migracion.md` dice que la carga de los vínculos (CASO-001, 011, 012 → POL-00123; CASO-006 → POL-00124) la hace el script de la planilla, que va en otro change. Esta migración solo deja la columna lista.
- `tipo_accion` tiene «baja de póliza», «modificación de póliza» y «alta de conductor»; `tipo_consulta` tiene los diez valores depurados de la planilla. La decisión 3 del 28/09/2026 suma «cambio de teléfono» a los dos (RF-CAR-05).
- La tabla `usuario` tiene `contrasena_hash VARCHAR(255) NOT NULL` y `nombre`/`apellido` `NOT NULL`; `docs/migracion.md` pide `admin` (rol administrador, «Admin Prueba») y `operador` (rol operador, «Operador Prueba») con contraseña `1234`, en una migración SQL para que existan aunque no se haya corrido la migración de la planilla. El panel del Parcial 1 atribuye todo a `operador` (AGENTS.md).
- `backend/package.json` no tiene `bcrypt` ni `bcryptjs`, y este change no puede agregarlos: la dependencia la suma el PR del login del Parcial 2, y la librería va a ser `bcryptjs` (decidido el 29/09/2026 para este change).
- `schema.prisma` es un archivo generado: no se edita a mano, salvo los nombres de relación que `db pull` genera solo.

## Goals / Non-Goals

**Goals:**

- Una única migración, revisable y compatible con datos existentes, que deje la columna, los dos valores de catálogo y los dos usuarios listos.
- Reproducibilidad: que cualquiera pueda regenerar el hash bcrypt y que la migración sea verificable con `SELECT`, sin dependencias nuevas.
- Que `schema.prisma` y los documentos que describen el modelo (el `.puml`, `docs/caso8_der.md`, `docs/migracion.md` y `AGENTS.md`) queden diciendo lo mismo que la base.

**Non-Goals:**

- El script de migración de la planilla, la carga de casos y la creación de Roberto y Graciela (van en otro change).
- La tabla `auditoria` y sus triggers (MVP 2), los endpoints, las pantallas y el login.
- Cualquier cambio de lógica en `backend/src`: hoy el repositorio de clientes es en memoria y no consulta estos modelos con Prisma.

## Decisions

### 1. Una sola migración, con timestamp UTC posterior

Carpeta `backend/prisma/migrations/<AAAAMMDDHHMMSS>_caso_poliza_cambio_telefono_usuarios_prueba/migration.sql`, con `<AAAAMMDDHHMMSS>` = la hora UTC real del día en que se escribe (posterior a `20260928140100`). El nombre descriptivo importa: con `migrate deploy` la lista de migraciones aplicadas es la única bitácora de qué pasó.

El archivo arranca con un bloque de comentario que diga de qué sale y de cuándo, después `SET NAMES utf8mb4;` y recién entonces el `ALTER`, igual que las dos migraciones anteriores: «cambio de teléfono» tiene tilde y sin esa línea el cliente `mysql` del contenedor la guarda mal (problema documentado en la skill).

**Alternativa considerada:** tres carpetas, una por cambio. Se descarta: el alcance es cerrado y un solo archivo es más fácil de revisar, y los tres cambios se aplican en el mismo `migrate deploy`. Ojo con la contrapartida: MySQL no deshace el DDL, así que un fallo a medias deja el `ALTER` aplicado (ver Riesgos).

### 2. `caso.id_poliza`: FK sin índice explícito, colocada después de `id_tipo_consulta`

```sql
ALTER TABLE caso
  ADD COLUMN id_poliza INT UNSIGNED NULL AFTER id_tipo_consulta,
  ADD CONSTRAINT fk_caso_poliza FOREIGN KEY (id_poliza) REFERENCES poliza (id_poliza);
```

- **Sin `KEY` explícito:** InnoDB crea automáticamente el índice de la FK con el nombre de la constraint. Es lo que ya ocurrió con las otras tres FKs opcionales de la misma tabla: en `schema.prisma` aparecen como `@@index([id_tipo_consulta], map: "fk_caso_tipo_consulta")`, `@@index([id_usuario_asignado], map: "fk_caso_usuario")` y `@@index([id_nivel_riesgo], map: "fk_caso_nivel_riesgo")`, igual que `fk_solicitud_poliza` en `solicitud_accion`. El índice cumple para filtrar casos por póliza más adelante.
- **Alternativa considerada:** `KEY ix_caso_poliza (id_poliza)` explícito, como `ix_caso_apertura` o `ix_caso_conversacion`. Se descarta: mezclaría dos estilos en la misma tabla y el nombre del índice cambiaría el `schema.prisma` sin ganar nada.
- **`AFTER id_tipo_consulta`:** mantiene el orden físico igual al del `.puml`. Sin esa palabra MySQL agrega la columna al final, después de `motivo_derivacion`, y el `SHOW CREATE TABLE` deja de coincidir con el diagrama.
- **`NULL`:** la columna es opcional por definición; no cambia nada de lo ya cargado y `db pull` la trae como `Int?`.
- La base no valida que la póliza sea del cliente del caso: el DER no lo pide y ningún RF lo exige. Queda para el backend (ver Open Questions).

### 3. Catálogos: `INSERT` directo de un valor por tabla

```sql
INSERT INTO tipo_accion (nombre) VALUES ('cambio de teléfono');
INSERT INTO tipo_consulta (nombre) VALUES ('cambio de teléfono');
```

Mismo estilo que `20260928140100_catalogos`: `INSERT` seco, sin `WHERE NOT EXISTS` ni `INSERT IGNORE`. `migrate deploy` corre cada migración una sola vez, y si alguien la corre a mano dos veces el `UNIQUE KEY` hace fallar el script, que es justo lo que hay que ver.

### 4. Usuarios de prueba: hash bcrypt literal, `id_rol` por subconsulta

```sql
-- bcrypt, prefijo $2b$, coste 10, de la contraseña 1234
INSERT INTO usuario (id_rol, nombre_usuario, contrasena_hash, nombre, apellido)
SELECT r.id_rol, 'admin',   '$2b$10$...', 'Admin',    'Prueba' FROM rol r WHERE r.nombre = 'administrador';

INSERT INTO usuario (id_rol, nombre_usuario, contrasena_hash, nombre, apellido)
SELECT r.id_rol, 'operador', '$2b$10$...', 'Operador', 'Prueba' FROM rol r WHERE r.nombre = 'operador';
```

- **`id_rol` por subconsulta, nunca `1` y `2` a pelo:** los ids de los catálogos dependen del orden de inserción; si mañana se reordena el `INSERT INTO rol`, el usuario quedaría con el rol equivocado y nadie lo vería hasta que alguien intente una operación que ese rol no le permite. Es el mismo patrón que usa `20260928140100_catalogos` con `JOIN nivel_riesgo n ON n.nombre = t.nivel`.
- **`nombre`/`apellido`:** «Admin Prueba» y «Operador Prueba» son el nombre visible de `docs/migracion.md`; como las dos columnas son `NOT NULL`, se reparte en `nombre` = 'Admin' / 'Operador' y `apellido` = 'Prueba'. Decidido el 29/09/2026 para este change.
- **`activo` y `fecha_alta`:** quedan en los valores por defecto (`TRUE` y `CURRENT_TIMESTAMP`), así los dos usuarios existen y están activos sin escribir las columnas.
- **Algoritmo:** bcrypt, prefijo `$2b$`, coste 10 (10 es el default de `bcryptjs`, la librería que va a usar el login): 60 caracteres, entra de sobra en `VARCHAR(255)`. `docs/migracion.md` decía que el algoritmo lo elige quien programe esta migración y que el login del Parcial 2 usa el mismo; este change lo elige y lo escribe en la sección «Usuarios» de ese documento, que es donde el change de la planilla (el que crea a Roberto y Graciela) lo lee.
- **Comando para generar el hash** (no agrega dependencias a `backend/package.json`: corre en un contenedor descartable):

  ```bash
  docker run --rm python:3-alpine sh -c \
    "pip install --quiet bcrypt && python -c \"import bcrypt; print(bcrypt.hashpw(b'1234', bcrypt.gensalt(rounds=10, prefix=b'2b')).decode())\""
  ```

  Imprime el literal a pegar: 60 caracteres, con la forma `$2b$10$` y 53 de sal y hash codificados. Sale distinto en cada corrida (la sal es aleatoria): lo importante es que todos los hashes pegados validen «1234».
  - Ojo: el coste hay que pasarlo explícito. En Python el default de `bcrypt.gensalt` es 12, no 10; el 10 viene de `bcryptjs`.
  - Alternativa: `docker run --rm httpd:2.4-alpine htpasswd -nbB operador 1234`. Devuelve el hash con prefijo `$2y$`; se prefiere el comando anterior porque deja explícitos el prefijo `$2b$` y el coste.
- MySQL no calcula bcrypt: el hash va como literal en el `INSERT`.

### 5. `schema.prisma`: `db pull` + `generate`, nunca editado a mano

Después de aplicar la migración, `npx prisma db pull` y `npx prisma generate`. El diff esperado es acotado: en `caso`, la columna `id_poliza`, la relación `poliza poliza?` y el `@@index([id_poliza], map: "fk_caso_poliza")`; en `poliza`, la relación inversa `caso caso[]`. Si `db pull` les pone nombres distintos a esas relaciones, se aceptan sin editar (lo que hace la skill). Si el diff toca otra cosa, es señal de que algo se aplicó mal: se revisa antes de commitear.

### 6. `docs/caso8_der.puml`: `id_poliza`, la relación y el render

- En la entidad `caso`, una línea `id_poliza : INT <<FK>>` sin `*` (es opcional, como `id_tipo_consulta`, `id_cliente` en `conversacion` o `id_bien` en `poliza`), ubicada después de `id_tipo_consulta` para respetar el orden físico de la tabla.
- La relación `poliza |o--o{ caso` en el bloque de atención, con `|o` del lado de la póliza porque un caso tiene como máximo una póliza (igual que `poliza |o--o{ solicitud`).
- La línea «Ultima revision» del encabezado, con la fecha de hoy.
- **Los valores de catálogo no se representan en el `.puml`:** el diagrama modela entidades y columnas, no las filas de los catálogos. «cambio de teléfono» queda documentado en `docs/caso8_der.md` y en la migración; no hay nada que cambiar en el `.puml` por eso.
- **El render queda a mano:** `docs/caso8_der.png` y `docs/caso8_der.svg` se regeneran desde el `.puml` con PlantUML, que este change no instala. Si la máquina donde se hace el change no lo tiene, el render se hace antes de la entrega: no bloquea la migración ni el resto de la documentación.

### 7. `docs/caso8_der.md` y `AGENTS.md`: corregir las frases que quedan viejas

Con la migración aplicada y el `.puml` actualizado quedan desactualizadas la línea 4 de `docs/caso8_der.md` (la intro dice que los cambios del 28/09/2026 «están en este documento y todavía no en el diagrama ni en las migraciones», y de paso fecha la revisión en el 21/09/2026) y la introducción de la sección «Decisiones tomadas el 28/09/2026» (dice que «todavía no están en el diagrama ni en las migraciones»). Se corrigen para que digan qué quedó en qué migración y que el diagrama está al día. El resto de la sección no se toca: las decisiones escritas siguen siendo correctas.

La misma afirmación está copiada en `AGENTS.md`, en «Documentación de diseño (Hito 0)» («Los cambios del 28/09 están en el .md y todavía no en el diagrama»), y ese archivo no está en el alcance original del change: se corrige igual porque es la misma regla de mantener la documentación al día que pide `AGENTS.md` en «Flujo de trabajo esperado», paso 5.

### 8. `docs/migracion.md`: dejar escrito el algoritmo del hash

La sección «Usuarios» delegaba la elección («El algoritmo de hash lo elige quien programe la migración de usuarios»). Este change la cierra (bcrypt, prefijo `$2b$`, coste 10) y escribe el valor en el documento, que es el lugar donde lo va a leer el change de la planilla, que crea a Roberto y Graciela y tiene que usar el mismo algoritmo.

## Risks / Trade-offs

- **[El literal del hash queda mal copiado y nadie se entera hasta el login del Parcial 2]** → tarea de verificación que lee el hash de la base y lo compara contra «1234» con un contenedor python descartable, sin dependencias en el repo. Es la razón de que esa comprobación sea explícita y no un «chequear que se ve bien».
- **[La migración falla a medias]** → MySQL no deshace el DDL: el `ALTER` puede quedar aplicado y la migración marcada como fallida (P3018), y las siguientes no se aplican (P3009) hasta resolverla. En desarrollo se corrige el SQL y se recrea la base con `docker compose down -v` (los datos de la planilla todavía no están cargados; cuando estén, el `down -v` borra todo y hay que volver a correr el script).
- **[Editar por error una migración ya aplicada]** → `migrate deploy` no las revisa: el cambio aparecería solo en las bases nuevas y sin aviso. Mitigación: carpeta nueva con timestamp posterior y `git diff` de `backend/prisma/migrations` antes de commitear, que debe mostrar una sola carpeta agregada.
- **[`db pull` reescribe `schema.prisma` entero]** → si el archivo arrastra un cambio ajeno, se sube sin querer. Mitigación: revisar el diff y confirmar que solo toca `caso` y `poliza`.
- **[El `ALTER TABLE` bloquea `caso`]** → en el Parcial 1 la tabla está vacía, así que no molesta. Si alguna vez hay que correrlo sobre una base con casos ya cargados, se planifica aparte.
- **[Los usuarios de prueba quedan con la contraseña `1234` en un repo público]** → es lo que pide `docs/migracion.md`, que además dice que antes de producción se borran o se les cambia la contraseña. Riesgo aceptado y anotado acá para que no se pierda.
- **[La base no impide vincular a un caso una póliza de otro cliente]** → no hay CHECK posible sin información de otras tablas y el DER no lo pide. Queda como Open Question.

## Migration Plan

1. Escribir la carpeta y el `migration.sql` a mano.
2. `docker compose restart backend`: el `command` del servicio corre `npx prisma migrate deploy` antes de `npm run dev`. Los logs deben decir «All migrations have been successfully applied».
3. `docker compose exec backend npx prisma db pull` y luego `npx prisma generate`.
4. `docker compose exec backend npx tsc --noEmit`.
5. Verificaciones con `SELECT` sobre la base (tareas 3.1 a 3.4 de `tasks.md`).
6. `schema.prisma` y la migración se commitean juntos.

**Rollback:** Prisma no tiene rollback de migración. Como el cambio no destruye datos (una columna nullable y filas nuevas), en desarrollo la vía es `docker compose down -v` y `docker compose up -d --build`, que reaplica todo desde cero. No se corrige a mano la tabla `_prisma_migrations`: una base ya sembrada con la planilla se arregla con un script puntual, no editando el historial.

## Open Questions

- **Quién valida que la póliza de un caso sea del cliente de ese caso.** La base no lo controla y el DER no lo pide. La respuesta más simple es que lo valide el backend al registrar el vínculo, pero es una decisión de implementación que se puede tomar más adelante sin cambiar esta migración ni los requirements.
- **RF-CAR-05 es una propuesta del equipo que la agencia todavía no validó** (AGENTS.md, «Decisiones abiertas»). Esta migración carga el valor del catálogo; si la agencia lo rechaza, se saca el valor con otra migración y no hay que tocar ni el esquema ni el resto de la decisión.
