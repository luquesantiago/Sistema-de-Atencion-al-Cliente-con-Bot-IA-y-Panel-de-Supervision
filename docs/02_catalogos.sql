-- =====================================================================
-- Caso 8 - Carga inicial de catálogos y parámetros
-- Ejecutar después de 01_esquema.sql.
-- Última revisión: 21/09/2026, noche.
-- =====================================================================

-- El script declara su codificación. Sin esta línea, el cliente mysql del
-- contenedor (locale POSIX) lo lee como latin1 y los textos con tilde se
-- guardan mal: 'cotización' queda como 'cotizaciÃ³n' (probado el
-- 21/09/2026 con docker exec y con docker-entrypoint-initdb.d).
SET NAMES utf8mb4;

USE seguros_castano;

-- ---------------------------------------------------------------------
-- Cartera
-- ---------------------------------------------------------------------

INSERT INTO ramo (nombre) VALUES
  ('auto'),
  ('moto'),
  ('vida'),
  ('hogar'),
  ('embarcaciones'),
  ('comercio');

-- Planes informados por la agencia en la entrevista del 16/09/2026.
-- «riesgos incompletos» quedó pendiente de confirmar el nombre real.
INSERT INTO plan (nombre, descripcion) VALUES
  ('terceros', NULL),
  ('todo riesgo', NULL),
  ('terceros incompletos', NULL),
  ('riesgos incompletos', 'Denominación a confirmar con la agencia');

-- Supuesto del equipo (21/09/2026), a confirmar con la agencia: Seguros
-- Castaño es la aseguradora de sus pólizas. La tabla admite otras compañías.
INSERT INTO compania_aseguradora (nombre) VALUES
  ('Seguros Castaño');

-- La agencia trabaja con pesos y dólares.
INSERT INTO moneda (codigo, nombre) VALUES
  ('ARS', 'Peso argentino'),
  ('USD', 'Dólar estadounidense');

-- «Vencida» no es un estado: se calcula con la fecha de vencimiento.
-- «Dada de baja» es el estado que deja una baja aprobada.
INSERT INTO estado_poliza (nombre) VALUES
  ('activa'),
  ('suspendida por mora'),
  ('dada de baja');

INSERT INTO estado_siniestro (nombre) VALUES
  ('registrado'),
  ('en gestión'),
  ('cerrado');

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------

INSERT INTO rol (nombre) VALUES
  ('administrador'),
  ('operador');

-- ---------------------------------------------------------------------
-- Atención
-- ---------------------------------------------------------------------

INSERT INTO origen_mensaje (nombre) VALUES
  ('cliente'),
  ('asistente'),
  ('operador');

-- Valores depurados de la planilla (definición del 21/09/2026, noche). En
-- la migración, «siniestro_urgente» se carga como siniestro y
-- PROMPT_INJECTION no es un tipo de consulta: lo cubre la alerta «Intento
-- de manipulación del asistente». «estado de póliza» sale de RF-ATE-01.
INSERT INTO tipo_consulta (nombre) VALUES
  ('saldo'),
  ('vencimiento'),
  ('estado de póliza'),
  ('cobertura'),
  ('siniestro'),
  ('cotización'),
  ('baja'),
  ('modificación'),
  ('reclamo'),
  ('saludo');

INSERT INTO estado_prospecto (nombre) VALUES
  ('pendiente'),
  ('confirmado'),
  ('descartado');

-- ---------------------------------------------------------------------
-- Verificación y alertas
-- ---------------------------------------------------------------------

INSERT INTO resultado_verificacion (nombre) VALUES
  ('aprobada'),
  ('retenida');

-- orden = 1 es lo más grave: define la prioridad de la bandeja de revisión.
INSERT INTO nivel_riesgo (nombre, orden) VALUES
  ('crítico', 1),
  ('alto', 2),
  ('medio', 3),
  ('bajo', 4);

INSERT INTO tipo_alerta (nombre, id_nivel_riesgo_default)
SELECT t.nombre, n.id_nivel_riesgo
FROM (
  SELECT 'Exposición de datos personales'        AS nombre, 'crítico' AS nivel
  UNION ALL SELECT 'Intento de manipulación del asistente', 'crítico'
  UNION ALL SELECT 'Dato falso o no verificable',           'alto'
  UNION ALL SELECT 'Pedido de acción crítica',              'medio'
  UNION ALL SELECT 'Pedido de reembolso (aviso al equipo)', 'medio'
  UNION ALL SELECT 'Caso derivado sin tomar',               'medio'
) AS t
JOIN nivel_riesgo n ON n.nombre = t.nivel;

-- ---------------------------------------------------------------------
-- Acciones críticas
-- ---------------------------------------------------------------------

INSERT INTO tipo_accion (nombre) VALUES
  ('baja de póliza'),
  ('modificación de póliza'),
  ('alta de conductor');

INSERT INTO estado_solicitud (nombre) VALUES
  ('pendiente'),
  ('aprobada'),
  ('rechazada'),
  ('aplicada');

-- ---------------------------------------------------------------------
-- Horario de atención y parámetros de configuración
-- ---------------------------------------------------------------------

-- Atención humana de lunes a viernes, de 9 a 18, con el mismo horario
-- todos los días (informado por la agencia). Son horas de Argentina, no UTC.
INSERT INTO horario_atencion (dia_semana, hora_apertura, hora_cierre) VALUES
  (1, '09:00', '18:00'),
  (2, '09:00', '18:00'),
  (3, '09:00', '18:00'),
  (4, '09:00', '18:00'),
  (5, '09:00', '18:00');

-- max_intentos_dni = 3 lo definió la agencia (16/09/2026). Los dos valores
-- en minutos son provisorios y los ajusta el administrador.
INSERT INTO parametro_configuracion (clave, valor, descripcion) VALUES
  ('max_intentos_dni',           '3',  'Reintentos de DNI antes de derivar a un operador'),
  ('minutos_max_caso_sin_tomar', '60', 'Minutos que puede estar un caso derivado sin que un operador lo tome'),
  ('minutos_inactividad_sesion', '30', 'Minutos sin mensajes que cierran una conversación sin caso derivado abierto');
