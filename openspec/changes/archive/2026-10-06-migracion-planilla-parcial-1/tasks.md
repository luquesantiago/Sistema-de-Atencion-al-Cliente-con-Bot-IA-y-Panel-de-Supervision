# Tasks

Todos los `SELECT` se corren en el contenedor `db` con `--default-character-set=utf8mb4` y un solo `-e`: el cliente concatena varios `-e` y da error de sintaxis. Forma general:

```bash
docker compose exec db sh -c 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -e "<SQL>"'
```

## 1. Carpeta ignorada, dependencias y comando

- [x] 1.1 Agregar `backend/planilla/` al `.gitignore`. Verificar: con el Excel copiado desde Drive a `backend/planilla/`, `git status --short` no lo muestra y `git check-ignore -v backend/planilla/Caso8_seguros_bot_datos_limpios.xlsx` devuelve la regla
- [x] 1.2 `docker compose exec backend npm install read-excel-file@9.3.10 bcryptjs@3.0.3` y sumar en `scripts` de `backend/package.json` el comando `"migrar-planilla": "tsx scripts/migrar-planilla.ts"`. Verificar: `git diff backend/package.json` muestra las dos dependencias en `dependencies` y el comando, y `docker compose exec backend npm audit --omit=dev` no reporta vulnerabilidades nuevas
- [x] 1.3 En `docs/migracion.md`, sección «Dónde está el Excel», escribir:
  - que, para cargar, el Excel se copia a `backend/planilla/` (ignorada);
  - que el script está en `backend/scripts/migrar-planilla.ts` y se corre con `docker compose exec backend npm run migrar-planilla` sobre una base vacía;
  - que `docker compose down -v` borra los datos y hay que volver a correrlo (`stop`, `restart` y `down` sin `-v` no los borran).

  Verificar: `grep -n "backend/planilla\|npm run migrar-planilla" docs/migracion.md` devuelve las líneas nuevas
- [x] 1.4 En `AGENTS.md`, sección «Parcial 1», sumar a la línea «El Excel limpio no está en el repo» dónde está el script y el comando. Verificar: `grep -n "migrar-planilla" AGENTS.md` devuelve la línea

## 2. Script de carga (`backend/scripts/migrar-planilla.ts`)

- [x] 2.1 Levantar una base recién creada: `docker compose down -v` y `docker compose up -d --build`. Verificar: los logs del backend dicen «All migrations have been successfully applied» y `SELECT COUNT(*) FROM cliente` da 0
- [x] 2.2 Escribir `backend/scripts/migrar-planilla.ts`: conexión con `PrismaMariaDb` y las variables `DATABASE_*` (skill `backend-datos`), lectura de Clientes, Pólizas y Consultas con `readSheet` y columnas por nombre de encabezado, ruta del Excel como argumento opcional y separación de las filas con «migrar» = «No» (decisiones 1 y 2 de `design.md`). Verificar: `docker compose exec backend npx tsc --noEmit` termina sin errores, y `docker compose exec backend npm run migrar-planilla -- planilla/no-existe.xlsx` termina con código distinto de 0 y un mensaje claro, sin escribir nada
- [x] 2.3 Agregar la validación completa previa a la escritura (decisión 2 de `design.md`) y el control previo de base con datos (decisión 3). Verificar: con una copia del Excel en `backend/planilla/` con un DNI titular inexistente en Pólizas, el script lista la fila y el motivo, termina con código distinto de 0 y `SELECT COUNT(*) FROM cliente` sigue en 0. Después borrar la copia
- [x] 2.4 Agregar la carga en una sola transacción con timeout de 60 s, tabla por tabla según la decisión 4 de `design.md`, y las horas de la decisión 5. Incluye a Roberto y Graciela activos, con el hash `bcrypt.hash('seguros1234', 10)`. Verificar: `docker compose exec backend npx tsc --noEmit` termina sin errores
- [x] 2.5 Agregar el informe final de la decisión 6, sin DNI, teléfonos ni textos. Verificar: se ve en la corrida de la tarea 3.1
- [x] 2.6 En `docs/migracion.md`, sección «Usuarios», reemplazar el párrafo de los usuarios históricos: Roberto y Graciela quedan activos, con la contraseña `seguros1234` y el hash bcrypt `$2b$` de coste 10, con la misma advertencia que los usuarios de prueba (repo público; antes de producción se cambia). Verificar: `grep -n "seguros1234" docs/migracion.md` devuelve la línea y `grep -n "desactivados" docs/migracion.md` ya no habla de Roberto ni de Graciela

## 3. Correr la carga y verificar la base

- [x] 3.1 `docker compose exec backend npm run migrar-planilla`. Verificar: termina con código 0. El informe muestra usuario 2, cliente 10, bien_asegurado 6, poliza 8, telefono 8, cliente_telefono 3, conversacion 10, caso 10, mensaje 20, respuesta 10 y alerta 5. Las filas salteadas son POL-00126, POL-00131 y POL-00128 (Pólizas) y CASO-007 y CASO-009 (Consultas), cada una con su motivo
- [x] 3.2 Correr el script de nuevo sobre la misma base. Verificar: aborta sin escribir y sugiere `docker compose down -v`; los conteos de 3.3 no cambian
- [x] 3.3 Conteos por tabla, con este SQL:
  ```sql
  SELECT (SELECT COUNT(*) FROM usuario) usuario,
         (SELECT COUNT(*) FROM cliente) cliente,
         (SELECT COUNT(*) FROM poliza) poliza,
         (SELECT COUNT(*) FROM bien_asegurado) bien,
         (SELECT COUNT(*) FROM telefono) telefono,
         (SELECT COUNT(*) FROM cliente_telefono) cli_tel,
         (SELECT COUNT(*) FROM conversacion) conversacion,
         (SELECT COUNT(*) FROM caso) caso,
         (SELECT COUNT(*) FROM alerta) alerta,
         (SELECT COUNT(*) FROM mensaje) mensaje,
         (SELECT COUNT(*) FROM respuesta) respuesta,
         (SELECT COUNT(*) FROM cobertura) + (SELECT COUNT(*) FROM beneficiario)
           + (SELECT COUNT(*) FROM cuota) + (SELECT COUNT(*) FROM siniestro)
           + (SELECT COUNT(*) FROM verificacion) + (SELECT COUNT(*) FROM solicitud_accion)
           + (SELECT COUNT(*) FROM prospecto) otras
  ```

  Verificar: 4, 10, 8, 6, 8, 3, 10, 10, 5, 20, 10 y 0
- [x] 3.4 Usuarios:
  ```sql
  SELECT u.nombre_usuario, u.nombre, u.apellido, r.nombre rol, u.activo,
         LEFT(u.contrasena_hash, 7) prefijo, CHAR_LENGTH(u.contrasena_hash) largo
  FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
  ORDER BY u.nombre_usuario
  ```

  Verificar: `roberto` es Roberto Castaño, administrador, y `graciela` es Graciela Castaño, operador. Las cuatro filas tienen `activo` en 1, prefijo `$2b$10$` y largo 60
- [x] 3.5 Confirmar que el hash de Roberto y Graciela valida `seguros1234`. Es el mismo método que la tarea 3.4 del change `2026-09-29-migracion-sql-parcial-1`, con contenedor descartable:
  ```bash
  HASHES=$(docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -N -B -e "SELECT contrasena_hash FROM usuario WHERE nombre_usuario IN (\"roberto\",\"graciela\")"')
  docker run --rm -e HASHES="$HASHES" python:3-alpine sh -c "pip install --quiet bcrypt && python -c \"import os,bcrypt; hs=os.environ['HASHES'].split(); print('OK' if len(hs)==2 and all(bcrypt.checkpw(b'seguros1234', h.encode()) for h in hs) else 'FALLA')\""
  ```

  Verificar: imprime `OK`
- [x] 3.6 Conversaciones y casos:
  ```sql
  SELECT SUM(fecha_fin IS NULL) abiertas, SUM(id_cliente IS NOT NULL) con_cliente,
         SUM(asistente_suspendido) suspendidas
  FROM conversacion;
  SELECT SUM(fecha_cierre IS NOT NULL) cerrados, SUM(id_poliza IS NOT NULL) con_poliza,
         SUM(fecha_derivacion = fecha_apertura AND fecha_toma = fecha_apertura) derivados_tomados,
         SUM(id_nivel_riesgo IS NULL) sin_nivel, SUM(motivo_derivacion IS NULL) sin_motivo
  FROM caso;
  SELECT u.nombre_usuario, COUNT(*)
  FROM caso c JOIN usuario u ON u.id_usuario = c.id_usuario_asignado
  GROUP BY u.nombre_usuario
  ```

  Verificar: conversaciones 7, 4 y 0. Casos 3, 4, 10, 10 y 10. Graciela 6 y Roberto 4
- [x] 3.7 Horas en UTC y orden de los mensajes:
  ```sql
  SELECT MIN(fecha_apertura) FROM caso;
  SELECT COUNT(*) FROM mensaje mc
    JOIN respuesta r ON r.id_mensaje_consulta = mc.id_mensaje
    JOIN mensaje ma ON ma.id_mensaje = r.id_mensaje_enviado
  WHERE ma.fecha_hora = mc.fecha_hora + INTERVAL 1 SECOND
    AND r.fecha_hora = ma.fecha_hora AND r.id_usuario IS NULL
  ```

  Verificar: la primera apertura es `2024-04-01 12:15:00` (CASO-001, 09:15 en Argentina) y el conteo da 10
- [x] 3.8 Alertas:
  ```sql
  SELECT ta.nombre, n.nombre nivel, (a.id_nivel_riesgo = ta.id_nivel_riesgo_default) nivel_default,
         (a.fecha_hora = c.fecha_toma AND a.fecha_atencion = c.fecha_toma) horas_ok,
         (a.id_usuario_atencion = c.id_usuario_asignado) atiende_responsable,
         a.id_respuesta IS NULL sin_respuesta
  FROM alerta a
    JOIN tipo_alerta ta ON ta.id_tipo_alerta = a.id_tipo_alerta
    JOIN nivel_riesgo n ON n.id_nivel_riesgo = a.id_nivel_riesgo
    JOIN caso c ON c.id_caso = a.id_caso
  ```

  Verificar: 5 filas con las cuatro columnas de control en 1. Son 2 «Intento de manipulación del asistente», 2 «Pedido de acción crítica» y 1 «Pedido de reembolso (aviso al equipo)»
- [x] 3.9 Cartera (escenarios de `specs/cartera/spec.md`):
  ```sql
  SELECT t.numero, COUNT(DISTINCT ct.id_cliente) clientes, COUNT(DISTINCT cv.id_conversacion) conversaciones
  FROM telefono t
    LEFT JOIN cliente_telefono ct ON ct.id_telefono = t.id_telefono
    LEFT JOIN conversacion cv ON cv.id_telefono = t.id_telefono
  GROUP BY t.numero ORDER BY t.numero;
  SELECT p.numero_poliza, e.nombre estado, p.fecha_inicio, p.fecha_vencimiento, p.id_bien IS NOT NULL con_bien
  FROM poliza p JOIN estado_poliza e ON e.id_estado_poliza = p.id_estado_poliza
  ORDER BY p.numero_poliza
  ```

  Verificar:
  - 5491155551001 tiene 1 cliente y 3 conversaciones, y 5491155551005 y 5491155551009 tienen 1 cliente cada uno.
  - No aparecen POL-00126, POL-00131 ni POL-00128.
  - Ninguna póliza está en un estado fuera del catálogo.
  - Las fechas coinciden con la hoja Pólizas, sin corrimiento de un día.

## 4. Cierre

- [x] 4.1 Borrar el Excel de `backend/planilla/` (opcional: queda en Drive), `docker compose restart backend`, y después `docker compose exec backend npx tsc --noEmit` y `docker compose exec backend npm test`. Verificar: el backend levanta sin el Excel, `tsc` y las pruebas terminan sin errores, y los conteos de 3.3 no cambian
- [x] 4.2 `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`, como comprobaciones globales de `AGENTS.md`. Verificar: terminan sin errores
- [x] 4.3 `git status --short`. Verificar: solo cambian `backend/scripts/migrar-planilla.ts`, `backend/package.json`, `backend/package-lock.json`, `.gitignore`, `docs/migracion.md`, `AGENTS.md` y este change en `openspec/`. No cambian `backend/src` ni `backend/prisma`, y no aparece ningún `.xlsx`
