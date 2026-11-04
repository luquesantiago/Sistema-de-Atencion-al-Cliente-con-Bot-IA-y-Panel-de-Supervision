-- Migración de solo datos (change configuracion-agencia, design.md, decisión 1).
-- Suma filas a dos catálogos: no cambia ningún dato migrado ni el esquema.
SET NAMES utf8mb4;

-- Pedido de grúa o asistencia y consulta de cómo pagar (RF-ATE-01). Antes se derivaban
-- como «otra consulta».
INSERT INTO tipo_consulta (nombre) VALUES
  ('asistencia mecánica'),
  ('medios de pago');

-- Datos de la agencia que carga el administrador desde Configuración. Arrancan vacíos: la
-- agencia no los informó, y el asistente deriva o no los menciona hasta que se carguen.
INSERT INTO parametro_configuracion (clave, valor, descripcion) VALUES
  ('telefono_asistencia', '',
   'Sin informar por la agencia: teléfono de grúa o asistencia que informa el asistente'),
  ('email_agencia', '',
   'Sin informar por la agencia: email de Seguros Castaño que informa el asistente'),
  ('web_agencia', '',
   'Sin informar por la agencia: web de Seguros Castaño que informa el asistente'),
  ('medios_pago', '',
   'Sin informar por la agencia: medios de pago que informa el asistente');
