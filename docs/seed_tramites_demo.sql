-- =====================================================================
-- Datos de demo para «Trámites por aprobar».
--
-- Carga un alta pendiente y tres cambios de teléfono pendientes. No borra
-- nada: si ya existe un trámite pendiente para el mismo teléfono, lo saltea.
-- Pensado para una base recién migrada; se puede ejecutar más de una vez.
--
-- Uso desde la raíz del repo:
--   docker compose exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' < docs/seed_tramites_demo.sql
-- =====================================================================

SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS seed_tramites_demo;

DELIMITER //

CREATE PROCEDURE seed_tramites_demo()
BEGIN
  DECLARE v_phone INT UNSIGNED;
  DECLARE v_old_phone INT UNSIGNED;
  DECLARE v_conv INT UNSIGNED;
  DECLARE v_case INT UNSIGNED;
  DECLARE v_client INT UNSIGNED;
  DECLARE v_count INT DEFAULT 0;

  -- -------------------------------------------------------------------
  -- Alta pendiente: Camila Torres
  -- -------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count
  FROM prospecto p
  JOIN estado_prospecto ep ON ep.id_estado_prospecto = p.id_estado_prospecto
  JOIN caso c ON c.id_caso = p.id_caso
  JOIN conversacion cv ON cv.id_conversacion = c.id_conversacion
  JOIN telefono t ON t.id_telefono = cv.id_telefono
  WHERE t.numero = '5491155557007'
    AND ep.nombre = 'pendiente'
    AND c.fecha_cierre IS NULL;

  IF v_count = 0 THEN
    SET v_phone = (SELECT id_telefono FROM telefono WHERE numero = '5491155557007' LIMIT 1);
    IF v_phone IS NULL THEN
      INSERT INTO telefono (numero) VALUES ('5491155557007');
      SET v_phone = LAST_INSERT_ID();
    END IF;

    INSERT INTO conversacion (id_telefono, id_cliente, fecha_inicio)
    VALUES (v_phone, NULL, UTC_TIMESTAMP());
    SET v_conv = LAST_INSERT_ID();

    INSERT INTO caso (id_conversacion, id_tipo_consulta, id_nivel_riesgo, fecha_apertura, motivo_derivacion)
    VALUES (
      v_conv,
      (SELECT id_tipo_consulta FROM tipo_consulta WHERE nombre = 'cotización'),
      (SELECT id_nivel_riesgo FROM nivel_riesgo WHERE nombre = 'medio'),
      UTC_TIMESTAMP(),
      'alta pendiente'
    );
    SET v_case = LAST_INSERT_ID();

    INSERT INTO prospecto (id_caso, id_telefono, id_estado_prospecto, nombre_declarado, dni_declarado, fecha_registro)
    VALUES (
      v_case,
      v_phone,
      (SELECT id_estado_prospecto FROM estado_prospecto WHERE nombre = 'pendiente'),
      'Camila Torres',
      '39456789',
      UTC_TIMESTAMP()
    );
  END IF;

  -- -------------------------------------------------------------------
  -- Cambio de teléfono: María del Carmen López
  -- -------------------------------------------------------------------
  SET v_client = (SELECT id_cliente FROM cliente WHERE dni = '30444555' LIMIT 1);
  IF v_client IS NULL THEN
    INSERT INTO cliente (dni, nombre, apellido) VALUES ('30444555', 'María del Carmen', 'López');
    SET v_client = LAST_INSERT_ID();
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM solicitud_accion s
  JOIN tipo_accion ta ON ta.id_tipo_accion = s.id_tipo_accion
  JOIN estado_solicitud es ON es.id_estado_solicitud = s.id_estado_solicitud
  JOIN caso c ON c.id_caso = s.id_caso
  JOIN conversacion cv ON cv.id_conversacion = c.id_conversacion
  JOIN telefono t ON t.id_telefono = cv.id_telefono
  WHERE t.numero = '5491155559999'
    AND ta.nombre = 'cambio de teléfono'
    AND es.nombre = 'pendiente'
    AND c.fecha_cierre IS NULL;

  IF v_count = 0 THEN
    SET v_phone = (SELECT id_telefono FROM telefono WHERE numero = '5491155559999' LIMIT 1);
    IF v_phone IS NULL THEN
      INSERT INTO telefono (numero) VALUES ('5491155559999');
      SET v_phone = LAST_INSERT_ID();
    END IF;

    SET v_old_phone = (SELECT id_telefono FROM telefono WHERE numero = '5491155551005' LIMIT 1);
    IF v_old_phone IS NULL THEN
      INSERT INTO telefono (numero) VALUES ('5491155551005');
      SET v_old_phone = LAST_INSERT_ID();
    END IF;
    INSERT INTO cliente_telefono (id_cliente, id_telefono)
    SELECT v_client, v_old_phone
    WHERE NOT EXISTS (
      SELECT 1 FROM cliente_telefono WHERE id_cliente = v_client AND id_telefono = v_old_phone
    );

    INSERT INTO conversacion (id_telefono, id_cliente, fecha_inicio)
    VALUES (v_phone, v_client, UTC_TIMESTAMP());
    SET v_conv = LAST_INSERT_ID();

    INSERT INTO caso (id_conversacion, id_tipo_consulta, id_nivel_riesgo, fecha_apertura, motivo_derivacion)
    VALUES (
      v_conv,
      (SELECT id_tipo_consulta FROM tipo_consulta WHERE nombre = 'cambio de teléfono'),
      (SELECT id_nivel_riesgo FROM nivel_riesgo WHERE nombre = 'bajo'),
      UTC_TIMESTAMP(),
      'cambio de teléfono'
    );
    SET v_case = LAST_INSERT_ID();

    INSERT INTO solicitud_accion (id_caso, id_tipo_accion, id_estado_solicitud, detalle, fecha_solicitud)
    VALUES (
      v_case,
      (SELECT id_tipo_accion FROM tipo_accion WHERE nombre = 'cambio de teléfono'),
      (SELECT id_estado_solicitud FROM estado_solicitud WHERE nombre = 'pendiente'),
      'El cliente pide vincular el número 5491155559999 desde este WhatsApp.',
      UTC_TIMESTAMP()
    );
  END IF;

  -- -------------------------------------------------------------------
  -- Cambio de teléfono: Sofía Ramírez
  -- -------------------------------------------------------------------
  SET v_client = (SELECT id_cliente FROM cliente WHERE dni = '35666777' LIMIT 1);
  IF v_client IS NULL THEN
    INSERT INTO cliente (dni, nombre, apellido) VALUES ('35666777', 'Sofía', 'Ramírez');
    SET v_client = LAST_INSERT_ID();
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM solicitud_accion s
  JOIN tipo_accion ta ON ta.id_tipo_accion = s.id_tipo_accion
  JOIN estado_solicitud es ON es.id_estado_solicitud = s.id_estado_solicitud
  JOIN caso c ON c.id_caso = s.id_caso
  JOIN conversacion cv ON cv.id_conversacion = c.id_conversacion
  JOIN telefono t ON t.id_telefono = cv.id_telefono
  WHERE t.numero = '5491155559003'
    AND ta.nombre = 'cambio de teléfono'
    AND es.nombre = 'pendiente'
    AND c.fecha_cierre IS NULL;

  IF v_count = 0 THEN
    SET v_phone = (SELECT id_telefono FROM telefono WHERE numero = '5491155559003' LIMIT 1);
    IF v_phone IS NULL THEN
      INSERT INTO telefono (numero) VALUES ('5491155559003');
      SET v_phone = LAST_INSERT_ID();
    END IF;

    SET v_old_phone = (SELECT id_telefono FROM telefono WHERE numero = '5491155553003' LIMIT 1);
    IF v_old_phone IS NULL THEN
      INSERT INTO telefono (numero) VALUES ('5491155553003');
      SET v_old_phone = LAST_INSERT_ID();
    END IF;
    INSERT INTO cliente_telefono (id_cliente, id_telefono)
    SELECT v_client, v_old_phone
    WHERE NOT EXISTS (
      SELECT 1 FROM cliente_telefono WHERE id_cliente = v_client AND id_telefono = v_old_phone
    );

    INSERT INTO conversacion (id_telefono, id_cliente, fecha_inicio)
    VALUES (v_phone, v_client, UTC_TIMESTAMP());
    SET v_conv = LAST_INSERT_ID();

    INSERT INTO caso (id_conversacion, id_tipo_consulta, id_nivel_riesgo, fecha_apertura, motivo_derivacion)
    VALUES (
      v_conv,
      (SELECT id_tipo_consulta FROM tipo_consulta WHERE nombre = 'cambio de teléfono'),
      (SELECT id_nivel_riesgo FROM nivel_riesgo WHERE nombre = 'bajo'),
      UTC_TIMESTAMP(),
      'cambio de teléfono'
    );
    SET v_case = LAST_INSERT_ID();

    INSERT INTO solicitud_accion (id_caso, id_tipo_accion, id_estado_solicitud, detalle, fecha_solicitud)
    VALUES (
      v_case,
      (SELECT id_tipo_accion FROM tipo_accion WHERE nombre = 'cambio de teléfono'),
      (SELECT id_estado_solicitud FROM estado_solicitud WHERE nombre = 'pendiente'),
      'El cliente pide vincular el número 5491155559003 desde este WhatsApp.',
      UTC_TIMESTAMP()
    );
  END IF;

  -- -------------------------------------------------------------------
  -- Cambio de teléfono: Martín Álvarez
  -- -------------------------------------------------------------------
  SET v_client = (SELECT id_cliente FROM cliente WHERE dni = '36777888' LIMIT 1);
  IF v_client IS NULL THEN
    INSERT INTO cliente (dni, nombre, apellido) VALUES ('36777888', 'Martín', 'Álvarez');
    SET v_client = LAST_INSERT_ID();
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM solicitud_accion s
  JOIN tipo_accion ta ON ta.id_tipo_accion = s.id_tipo_accion
  JOIN estado_solicitud es ON es.id_estado_solicitud = s.id_estado_solicitud
  JOIN caso c ON c.id_caso = s.id_caso
  JOIN conversacion cv ON cv.id_conversacion = c.id_conversacion
  JOIN telefono t ON t.id_telefono = cv.id_telefono
  WHERE t.numero = '5491155559004'
    AND ta.nombre = 'cambio de teléfono'
    AND es.nombre = 'pendiente'
    AND c.fecha_cierre IS NULL;

  IF v_count = 0 THEN
    SET v_phone = (SELECT id_telefono FROM telefono WHERE numero = '5491155559004' LIMIT 1);
    IF v_phone IS NULL THEN
      INSERT INTO telefono (numero) VALUES ('5491155559004');
      SET v_phone = LAST_INSERT_ID();
    END IF;

    SET v_old_phone = (SELECT id_telefono FROM telefono WHERE numero = '5491155554004' LIMIT 1);
    IF v_old_phone IS NULL THEN
      INSERT INTO telefono (numero) VALUES ('5491155554004');
      SET v_old_phone = LAST_INSERT_ID();
    END IF;
    INSERT INTO cliente_telefono (id_cliente, id_telefono)
    SELECT v_client, v_old_phone
    WHERE NOT EXISTS (
      SELECT 1 FROM cliente_telefono WHERE id_cliente = v_client AND id_telefono = v_old_phone
    );

    INSERT INTO conversacion (id_telefono, id_cliente, fecha_inicio)
    VALUES (v_phone, v_client, UTC_TIMESTAMP());
    SET v_conv = LAST_INSERT_ID();

    INSERT INTO caso (id_conversacion, id_tipo_consulta, id_nivel_riesgo, fecha_apertura, motivo_derivacion)
    VALUES (
      v_conv,
      (SELECT id_tipo_consulta FROM tipo_consulta WHERE nombre = 'cambio de teléfono'),
      (SELECT id_nivel_riesgo FROM nivel_riesgo WHERE nombre = 'bajo'),
      UTC_TIMESTAMP(),
      'cambio de teléfono'
    );
    SET v_case = LAST_INSERT_ID();

    INSERT INTO solicitud_accion (id_caso, id_tipo_accion, id_estado_solicitud, detalle, fecha_solicitud)
    VALUES (
      v_case,
      (SELECT id_tipo_accion FROM tipo_accion WHERE nombre = 'cambio de teléfono'),
      (SELECT id_estado_solicitud FROM estado_solicitud WHERE nombre = 'pendiente'),
      'El cliente pide vincular el número 5491155559004 desde este WhatsApp.',
      UTC_TIMESTAMP()
    );
  END IF;
END//

DELIMITER ;

CALL seed_tramites_demo();
DROP PROCEDURE seed_tramites_demo;
