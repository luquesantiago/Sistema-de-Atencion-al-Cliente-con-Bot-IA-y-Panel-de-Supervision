# Proposal

## Why

El esquema de la base todavía no tiene nada de lo que el Parcial 1 necesita para funcionar de punta a punta: la póliza del caso no se puede registrar, el tipo «cambio de teléfono» de RF-CAR-05 no existe en los catálogos y no hay ningún usuario al que atribuir las acciones del panel. Las tres cosas se resuelven en una sola migración SQL escrita a mano, siguiendo el flujo SQL-first de `.claude/skills/backend-datos/SKILL.md`, y el DER tiene que quedar al día.

## What Changes

- **Una migración SQL nueva** en `backend/prisma/migrations/<AAAAMMDDHHMMSS>_.../migration.sql`, con timestamp UTC posterior a `20260928140100_catalogos` (las dos migraciones que ya están). No se edita ninguna migración aplicada.
  - Agrega la columna opcional `caso.id_poliza` con FK `fk_caso_poliza` a `poliza` (decisión 1 del 28/09/2026 de `docs/caso8_der.md`; la carga de los vínculos la hace la migración de la planilla según `docs/migracion.md`).
  - Inserta «cambio de teléfono» en los catálogos `tipo_accion` y `tipo_consulta` (decisión 3 del 28/09/2026 de `docs/caso8_der.md`, que implementa RF-CAR-05).
  - Inserta los dos usuarios de prueba de la sección «Usuarios» de `docs/migracion.md`: `admin` (rol administrador, Admin Prueba) y `operador` (rol operador, Operador Prueba), con contraseña `1234` y el hash bcrypt como literal. Existen en toda base, aunque no se haya corrido la migración de la planilla, porque el panel del Parcial 1 atribuye todo a `operador` (AGENTS.md, «Parcial 1»).
- **`schema.prisma` regenerado** con `prisma db pull` (nunca editado a mano) y cliente con `prisma generate`.
- **`docs/caso8_der.puml` al día**: `caso.id_poliza` como FK opcional, la relación `poliza |o--o{ caso` y la línea «Ultima revision» con la fecha de hoy. El `.puml` modela entidades y columnas, no valores de catálogo, así que los valores nuevos de `tipo_accion` y `tipo_consulta` no tienen representación ahí.
- **`docs/caso8_der.png` y `.svg` regenerados a mano** desde el `.puml`. Es una tarea de alguien que tenga PlantUML y Java: este change no los instala. Si en la máquina no los hay, se sube solo el `.puml` y el render queda pendiente para antes de la entrega.
- **`docs/caso8_der.md` corregido**: las dos frases que dicen que los cambios del 28/09/2026 «todavía no están en el diagrama ni en las migraciones» pasan a decir en qué migración quedó cada cosa y que el diagrama está al día, y se actualiza la fecha de revisión del encabezado (línea 4).
- **`docs/migracion.md` actualizado**: en la sección «Usuarios», donde la elección del algoritmo estaba delegada, se escribe el que se eligió (bcrypt, prefijo `$2b$`, coste 10), para que el change que migra la planilla y crea a Roberto y Graciela use el mismo.
- **`AGENTS.md` corregido**: en «Documentación de diseño (Hito 0)», la frase que dice que los cambios del 28/09 «todavía no [están] en el diagrama» queda vieja con este change.
- **Fuera de alcance**: el script de migración de la planilla (va en otro change; también crea a Roberto y Graciela), la tabla `auditoria` y sus triggers (MVP 2), endpoints, pantallas y login.

## Capabilities

### New Capabilities
- `cartera`: módulo «Gestión de cartera» de `docs/requisitos.md` (RF-CAR-01 a RF-CAR-05). La capability no existe todavía en `openspec/specs/`; este change agrega solo el requirement de RF-CAR-05 que corresponde a lo que entrega.

### Modified Capabilities

Ninguna: `openspec/specs/` está vacío, así que `cartera` es nueva y no hay requirements existentes que cambien.

## Impact

- **Base de datos**: un `ALTER TABLE caso ADD COLUMN` y dos `INSERT` de catálogo, sobre tablas ya existentes. Compatible con datos existentes: la columna nueva es nullable y los catálogos solo suman filas.
- **Backend**: ninguno en código. `backend/src` todavía no consulta estos modelos con Prisma (el repositorio de clientes es en memoria), así que el cambio no toca lógica. `backend/package.json` no cambia: la librería de hash será `bcryptjs`, que suma el PR del login del Parcial 2, no este change (decidido el 29/09/2026 para este change).
- **Documentación**: `docs/caso8_der.puml`, `docs/caso8_der.md` y su render `.png`/`.svg`, `docs/migracion.md` y `AGENTS.md`.
- **RF afectados**: RF-CAR-05, y solo RF-CAR-05. `caso.id_poliza` y los usuarios de prueba salen de `docs/caso8_der.md` y `docs/migracion.md`, no de un RF, así que no llevan requirement.
- **Dependencias de tareas**: este change es prerrequisito del script de migración de la planilla (que carga `caso.id_poliza`) y del flujo del panel del Parcial 1 (que necesita el usuario `operador`).

## Preguntas abiertas

- **RF-CAR-05 es una propuesta del equipo que la agencia todavía no validó** (AGENTS.md, «Decisiones abiertas»: «el cambio de teléfono por WhatsApp (RF-CAR-05) son propuestas del equipo que la agencia todavía no validó. Mientras tanto rigen como están escritas»). Este change carga el valor del catálogo como está escrito; si la agencia lo rechaza, se saca con otra migración, sin tocar el esquema.
- **Quién valida que la póliza de un caso sea del cliente de ese caso.** La base no lo controla, el DER no lo pide y ningún RF lo exige. Queda para cuando se programe el registro del vínculo.

