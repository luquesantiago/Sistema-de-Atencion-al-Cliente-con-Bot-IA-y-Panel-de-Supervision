-- Referencia a la imagen que mandó el cliente (change bandeja-atender-casos, design.md,
-- decisión 7). Guarda el id serializado del mensaje de WhatsApp en WAHA, solo en los mensajes
-- de imagen, para que el panel pida la imagen al momento: la imagen no se guarda (RF-ATE-05).
-- Los mensajes anteriores quedan en NULL. Decisión de Santiago del 15/10/2026.
SET NAMES utf8mb4;

ALTER TABLE mensaje ADD COLUMN id_imagen_whatsapp VARCHAR(255) NULL;
