-- Número bloqueado desde la Bandeja de Atención: mientras telefono.bloqueado esté en TRUE,
-- el asistente ignora los mensajes de ese número (no responde ni los guarda). Se cambia con
-- los botones «Bloquear número» y «Desbloquear usuario» del chat.
SET NAMES utf8mb4;

ALTER TABLE telefono ADD COLUMN bloqueado BOOLEAN NOT NULL DEFAULT FALSE;
