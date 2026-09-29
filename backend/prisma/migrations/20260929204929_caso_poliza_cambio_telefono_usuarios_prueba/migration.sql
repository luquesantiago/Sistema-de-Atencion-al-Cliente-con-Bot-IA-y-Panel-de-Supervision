-- =====================================================================
-- Caso 8 - Migración del Parcial 1: póliza del caso, el nuevo tipo
-- «Cambio de teléfono» y usuarios de prueba. Escrita el 29/09/2026 (UTC).
--
-- Sale de las decisiones del 28/09/2026 de docs/caso8_der.md:
--   1. caso.id_poliza, opcional, con FK a poliza (la carga de los
--      vínculos seguros la hace la migración de la planilla, ver
--      docs/migracion.md).
--   3. El nuevo tipo «Cambio de teléfono» en los catálogos tipo_accion y tipo_consulta,
--      para el pedido de RF-CAR-05.
-- Y de docs/migracion.md, sección «Usuarios»: los usuarios de prueba
-- admin y operador, con contraseña 1234 y hash bcrypt como literal.
--
-- Todo suma: la columna es nullable y los catálogos solo ganan una fila,
-- así que no se cambia nada de lo ya cargado. No se edita ninguna
-- migración anterior (flujo SQL-first de la skill backend-datos).
-- =====================================================================

-- El script declara su codificación. Sin esta línea, el cliente mysql del
-- contenedor (locale POSIX) lo lee como latin1 y los textos con tilde se
-- guardan mal: el texto con tilde se guarda como 'cambio de telÃ©fono'.
SET NAMES utf8mb4;

-- Póliza del caso: opcional, porque la mayoría de los casos no tiene una.
-- Sin KEY explícito: InnoDB crea el índice de la FK con el nombre de la
-- constraint, igual que en las otras tres FKs opcionales de esta tabla.
ALTER TABLE caso
  ADD COLUMN id_poliza INT UNSIGNED NULL AFTER id_tipo_consulta,
  ADD CONSTRAINT fk_caso_poliza FOREIGN KEY (id_poliza) REFERENCES poliza (id_poliza);

-- ---------------------------------------------------------------------
-- «Cambio de teléfono» (RF-CAR-05): se registra en solicitud_accion con
-- este tipo, sin columnas nuevas, y el asistente lo clasifica como una
-- intención más de tipo_consulta. No genera la alerta «Pedido de acción
-- crítica»: es un dato de cartera, no una acción crítica.
-- Los valores de las dos migraciones anteriores siguen intactos.
-- ---------------------------------------------------------------------
INSERT INTO tipo_accion (nombre) VALUES ('cambio de teléfono');
INSERT INTO tipo_consulta (nombre) VALUES ('cambio de teléfono');

-- ---------------------------------------------------------------------
-- Usuarios de prueba para el Parcial 1: sin login todavía, el backend
-- atribuye lo que se hace desde el panel al usuario operador. Ver
-- docs/migracion.md, sección «Usuarios».
--
-- Contraseña 1234 en los dos, hash bcrypt literal generado el 29/09/2026
-- con coste 10 y prefijo $2b$ (verificado contra 1234 antes de pegarlo).
-- El rol sale por subconsulta, nunca por id escrito a pelo: depende del
-- orden de carga de la migración de catálogos.
-- ---------------------------------------------------------------------
INSERT INTO usuario (nombre_usuario, contrasena_hash, nombre, apellido, id_rol, activo)
  VALUES (
    'admin',
    '$2b$10$jrfyHg3lRdD2mGSUyM0Lh.EIZbpE8VUbmlZfwXigMkqCdR0G3Gdkm',
    'Admin',
    'Prueba',
    (SELECT r.id_rol FROM rol r WHERE r.nombre = 'administrador'),
    1
  );

INSERT INTO usuario (nombre_usuario, contrasena_hash, nombre, apellido, id_rol, activo)
  VALUES (
    'operador',
    '$2b$10$jrfyHg3lRdD2mGSUyM0Lh.EIZbpE8VUbmlZfwXigMkqCdR0G3Gdkm',
    'Operador',
    'Prueba',
    (SELECT r.id_rol FROM rol r WHERE r.nombre = 'operador'),
    1
  );
