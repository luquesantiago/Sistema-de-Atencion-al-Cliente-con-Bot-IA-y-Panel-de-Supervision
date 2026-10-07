-- Migración de solo datos (change asistente-con-base, design.md, decisión 5).
-- El asistente se calla mientras la conversación tiene asistente_suspendido = TRUE.
-- Las conversaciones abiertas con un caso derivado sin cerrar (las 7 abiertas de la
-- planilla) quedan en silencio hasta que un operador cierre ese caso (RF-DER-03).
-- Reemplaza la decisión del 06/10/2026 de cargarlas con FALSE. En una base sin la
-- planilla no cambia nada.
SET NAMES utf8mb4;

UPDATE conversacion c
   SET c.asistente_suspendido = TRUE
 WHERE c.fecha_fin IS NULL
   AND EXISTS (SELECT 1 FROM caso k
                WHERE k.id_conversacion = c.id_conversacion
                  AND k.fecha_derivacion IS NOT NULL
                  AND k.fecha_cierre IS NULL);
