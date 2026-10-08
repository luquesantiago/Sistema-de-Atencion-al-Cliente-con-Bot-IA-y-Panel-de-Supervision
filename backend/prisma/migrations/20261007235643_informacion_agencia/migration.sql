-- Migración de solo datos (change asistente-informacion-general, design.md, decisión 2).
-- Suma filas a dos catálogos: no cambia ningún dato migrado ni el esquema.
SET NAMES utf8mb4;

-- «información de la agencia» (RF-ATE-06): consulta de los ramos, los planes y los
-- datos de contacto de la agencia. Decisión de Santiago del 07/10/2026.
INSERT INTO tipo_consulta (nombre) VALUES ('información de la agencia');

-- Dirección y teléfono que informa el asistente. Son datos de ejemplo: la agencia no
-- los informó (decisión de Santiago del 07/10/2026).
INSERT INTO parametro_configuracion (clave, valor, descripcion) VALUES
  ('direccion_agencia', 'Ficticia 123',
   'Dato de ejemplo, la agencia no lo informó: dirección de Seguros Castaño que informa el asistente'),
  ('telefono_agencia', '11 7816-8015',
   'Dato de ejemplo, la agencia no lo informó: teléfono de Seguros Castaño que informa el asistente');
