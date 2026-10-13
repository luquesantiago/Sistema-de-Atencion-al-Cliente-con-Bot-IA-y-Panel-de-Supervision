# Proposal

## Why

El esquema ya está completo en `backend/prisma/migrations`, pero la base no tiene ningún dato de la agencia: ni clientes ni pólizas, y tampoco los casos históricos. La cátedra evalúa en el Parcial 1 (08/10/2026) la migración y limpieza de los datos históricos, y `AGENTS.md` pide que el sistema funcione de punta a punta procesando esos datos. Hay que cargar en la base el Excel limpio (`Caso8_seguros_bot_datos_limpios.xlsx`) siguiendo `docs/migracion.md` al pie de la letra.

## What Changes

- **Un script de carga de los datos históricos**, `backend/scripts/migrar-planilla.ts`, versionado en el repo, que lee las hojas Clientes, Pólizas y Consultas del Excel limpio y escribe con el cliente de Prisma. Se corre a mano con `docker compose exec backend npm run migrar-planilla`, sobre una base vacía. Carga clientes, bienes asegurados, pólizas, teléfonos y sus vínculos, conversaciones, casos, mensajes, respuestas, alertas y los usuarios históricos `roberto` y `graciela`. Respeta la columna «migrar» y al terminar informa cuántos registros cargó por tabla y qué filas salteó, con su `motivo_no_migra`.
- **El Excel no va en el repo**: tiene datos reales de clientes. Se guarda en Drive y, para cargar, se copia a `backend/planilla/`, una carpeta que Git ignora y que el contenedor ve porque monta `./backend`. Después de cargar se puede borrar de ahí: los datos quedan en la base.
- **Dos dependencias nuevas en `backend/package.json`**: `read-excel-file` 9.3.10 para leer el xlsx y `bcryptjs` 3.0.3 para el hash, que también va a usar el login del Parcial 2. Este change adelanta `bcryptjs`, que el change `2026-09-29-migracion-sql-parcial-1` dejaba para el PR del login. También suma el comando `npm run migrar-planilla`.
- **Roberto y Graciela quedan activos, con la contraseña `seguros1234`** (decisión del equipo, 06/10/2026). Se aparta de `docs/migracion.md`, que los pedía desactivados y con una contraseña al azar. El hash es bcrypt `$2b$`, coste 10, el mismo que los usuarios de prueba. Riesgo aceptado: la contraseña queda escrita en el script y en `docs/migracion.md`, en un repo público, como la de `admin` y `operador`.
- **`.gitignore`**: suma `backend/planilla/`.
- **`docs/migracion.md`**: dónde se copia el Excel, dónde está el script, cómo se corre y la nueva regla de los usuarios históricos.
- **`AGENTS.md`**: la línea del Parcial 1 sobre la planilla nombra el script y el comando.
- **No cambia el esquema**: no hay migraciones SQL, tablas ni columnas nuevas, y `schema.prisma` no se toca.
- **Fuera de alcance**: endpoints, pantallas, login, la tabla `auditoria`, cargar Log_Resoluciones como tabla, coberturas, beneficiarios, cuotas y siniestros (la planilla no trae plan ni hoja de siniestros), solicitudes de acción para los pedidos históricos de baja y modificación (`docs/migracion.md` no las pide) y conectar el asistente a la base, que sigue usando `backend/fixtures/clientes-ficticios.json` y va en otro change.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities
- `cartera`: suma tres requirements sobre lo que la base tiene después de la carga: cada cliente una sola vez e identificado por DNI, las pólizas con vencimiento y estado, y los teléfonos de las consultas con su vínculo N:M (RF-CAR-01, RF-CAR-02 y RF-CAR-03). Lo que sale solo de `docs/migracion.md` (casos, conversaciones, mensajes, alertas y usuarios históricos) no lleva requirement, igual que en `2026-09-29-migracion-sql-parcial-1`.

## Impact

- **Base de datos**: solo `INSERT`, en una transacción. Sobre una base recién creada quedan: usuario 4 (los cuatro activos), cliente 10, poliza 8, bien_asegurado 6, telefono 8, cliente_telefono 3, conversacion 10, caso 10, alerta 5, mensaje 20 y respuesta 10. cobertura, beneficiario, cuota, siniestro, verificacion, solicitud_accion y prospecto quedan en 0.
- **Repo**: `backend/scripts/migrar-planilla.ts`, `backend/package.json` y `backend/package-lock.json`, `.gitignore`, `docs/migracion.md`, `AGENTS.md` y este change. `backend/src` y `backend/prisma` no cambian.
- **Quien no tiene el Excel** levanta el backend igual y no tiene los datos migrados. La demo corre en una máquina que los tenga (`docs/migracion.md`).
- **`docker compose down -v` borra los datos migrados** (el volumen `db_data`): para recuperarlos se copia el Excel a `backend/planilla/` y se vuelve a correr el script. `stop`, `restart` y `down` sin `-v` no los borran.
- **RF afectados**: RF-CAR-01, RF-CAR-02 y RF-CAR-03.

## Preguntas abiertas

Decisiones abiertas de `AGENTS.md` de las que depende la carga. No se cierran acá: el script aplica lo que dice `docs/migracion.md` mientras tanto.

- **Clientes duplicados y titular del VW Gol**: el duplicado exacto quedó en una sola fila («García Juan Carlos») y POL-00126 y POL-00131 no se migran.
- **Inconsistencias entre hojas**: CASO-002, CASO-004 y CASO-008 quedan sin póliza, y las primas sin símbolo (POL-00124, 00125, 00128 y 00133) se cargan en pesos.
- **Compañía aseguradora**: todas las pólizas van a «Seguros Castaño», que es un supuesto del equipo.
- **Cuotas de las pólizas**: no se cargan; las cuotas sueltas quedan en observaciones.
- **Tratamiento de datos sensibles**: el script carga DNI, teléfonos y conversaciones reales de la planilla en la base local.
- **Apellido de Graciela**: «Castaño» es un supuesto (`docs/migracion.md`).
- **Conversaciones abiertas con `asistente_suspendido = FALSE`** (decisión del equipo, 06/10/2026): las 7 conversaciones con un caso derivado abierto quedan sin la marca. Cuando el asistente lea la base, el change que lo conecte tiene que decidir si respeta RF-DER-03 mirando la marca o los casos derivados sin cerrar; con la marca sola, el asistente respondería en esas conversaciones.
