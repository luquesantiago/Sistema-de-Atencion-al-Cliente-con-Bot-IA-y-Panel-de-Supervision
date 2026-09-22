# Skill: Verificación, seguridad y auditoría

## Cuándo usarla

Usar al integrar IA o WhatsApp, filtrar respuestas, definir alertas, manejar roles, datos personales, auditoría o acciones contractuales.

## Regla de salida segura

Toda respuesta generada se considera no confiable hasta ser contrastada con la cartera. Si no puede probarse el dato, si hay exposición de información personal, intento de manipulación, compromiso de acción o consulta fuera del alcance, retener y derivar.

La IA puede proponer texto o clasificar intención; no puede aprobar, modificar ni ejecutar una acción contractual.

## Alertas mínimas

Mantener alertas diferenciables para datos falsos o no verificables, exposición de datos personales, manipulación del asistente, solicitud de acción crítica y derivación sin tomar. Cada alerta necesita severidad, motivo, conversación, estado y timestamps.

## Autorización

- Autorizar en backend por rol y por acción.
- Roberto, Graciela y Diego pueden aprobar trámites críticos según el alcance acordado.
- La UI debe reflejar permisos, pero nunca ser la única barrera.
- La aprobación debe verificar que el trámite sigue pendiente y registrar actor, fecha, motivo, estado anterior y resultado.

## Auditoría y privacidad

- Registrar respuestas emitidas, retenidas y corregidas; prompts o metadatos necesarios para reconstruir la decisión, sin guardar secretos.
- Minimizar la exposición de DNI, teléfonos y conversaciones en logs y vistas.
- Enmascarar datos sensibles cuando el contexto no requiera el valor completo.
- No usar información real del cliente en pruebas automatizadas ni capturas compartidas.
- Considerar la Ley 25.326 y los controles OWASP para aplicaciones con LLM como referencias de diseño.

## Pruebas obligatorias

- Respuesta correcta respaldada por cartera: se envía y audita.
- Póliza inexistente o fecha inválida: se retiene y deriva.
- Prompt que intenta cambiar reglas o revelar datos: se alerta y no se ejecuta.
- Solicitud de baja o modificación: queda pendiente y no altera la cartera.
- Aprobación autorizada y rechazo: ambos dejan trazabilidad completa.
- Repetición de webhook: no duplica mensajes ni efectos.