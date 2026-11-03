-- Cambio de datos del cliente (nombre o apellido) pedido por WhatsApp: el asistente lo
-- registra como solicitud pendiente en Trámites, sin derivar la conversación.
-- «cambio de datos» entra en los dos catálogos, igual que «cambio de teléfono»:
--   1. tipo_consulta: el tipo del caso de la conversación.
--   2. tipo_accion: el tipo de la solicitud_accion pendiente que decide el operador.
SET NAMES utf8mb4;

INSERT INTO tipo_consulta (nombre) VALUES ('cambio de datos');
INSERT INTO tipo_accion (nombre) VALUES ('cambio de datos');
