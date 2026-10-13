---
name: verificacion-seguridad
description: Verificación de respuestas del asistente, seguridad, privacidad y auditoría. Cubre integración con el proveedor de IA y WhatsApp, filtrado y retención de respuestas, alertas, roles y permisos, datos personales (Ley 25.326) y trazabilidad de acciones contractuales. Usar al integrar IA o WhatsApp, definir alertas, manejar roles o datos personales, o tocar aprobaciones y auditoría.
---

# Skill: Verificación, seguridad y auditoría

## Cuándo usarla

Usar al integrar IA o WhatsApp, filtrar respuestas, definir alertas, manejar roles, datos personales, auditoría o acciones contractuales.

## Regla de salida segura

Toda respuesta generada se considera no confiable hasta ser contrastada con la cartera o, si es la información de la agencia, con los datos de la agencia registrados en el sistema. Si no puede probarse el dato, si hay exposición de información personal, intento de manipulación, compromiso de acción o consulta fuera del alcance, retener y derivar. La respuesta retenida no se envía; se guarda como borrador para que el operador la revise. Esto vale para las respuestas generadas: a un mensaje que el modelo clasifica como «no es de seguros» se le contesta con un texto fijo que no tiene que ver con Seguros Castaño, sin generar respuesta ni derivar.

La IA puede proponer texto o clasificar intención; no puede aprobar, modificar ni ejecutar una acción contractual. En el Parcial 1 elige la intención de una lista cerrada (salida estructurada estricta), con los últimos 4 mensajes de la conversación como contexto: van con el DNI tapado, como dato y no como instrucciones, y no cambian la tabla de intención a acción. Después vuelve a redactar la plantilla completada con los datos de la cartera o con la información de la agencia; el código controla que la redacción no cambie ni agregue datos y, si no pasa, deriva.

Después de una derivación no se generan respuestas automáticas en esa conversación hasta que se cierre el caso.

## Riesgos de referencia

Los fallos del bot anterior que figuran en la planilla histórica se corresponden con el OWASP Top 10 para aplicaciones con LLM (2025). Sirven como casos de prueba:

- LLM01, inyección de prompt: CASO-003 y CASO-010.
- LLM02, exposición de información sensible: CASO-003 (expuso nombres y DNI).
- LLM09, desinformación: CASO-004, CASO-008, CASO-009 y CASO-011.
- LLM06, agencia excesiva: CASO-005 (baja), CASO-006 (reembolso) y CASO-012 (alta de conductor).

## Alertas mínimas

Mantener alertas diferenciables para datos falsos o no verificables, exposición de datos personales, manipulación del asistente, solicitud de acción crítica y derivación sin tomar. Cada alerta necesita severidad, motivo, conversación, estado y timestamps. El pedido de cambio de teléfono no genera la alerta de acción crítica.

## Autorización

- Autorizar en backend por rol y por acción.
- Roles: Administrador (Roberto) ve métricas y configura el horario de atención; Operador (Graciela y Diego) atiende y hace el ABM de clientes, pólizas y siniestros.
- Pueden aprobar trámites críticos Roberto, Graciela y Diego. Graciela puede aprobar casos que ella misma atendió.
- La UI debe reflejar permisos, pero nunca ser la única barrera.
- En el Parcial 1 no hay login: el backend atribuye las acciones del panel al usuario de prueba `operador`, nunca al usuario que mande el navegador. En el Parcial 2 lo reemplaza el login.
- La aprobación debe verificar que el trámite sigue pendiente y registrar actor, fecha, motivo, estado anterior y resultado.

## Auditoría y privacidad

- Registrar respuestas emitidas, retenidas y corregidas; prompts o metadatos necesarios para reconstruir la decisión, sin guardar secretos.
- El asistente informa solo datos del cliente identificado por DNI. Un teléfono compartido nunca habilita a ver datos de otro cliente.
- Minimizar la exposición de DNI, teléfonos y conversaciones en logs y vistas.
- Enmascarar datos sensibles cuando el contexto no requiera el valor completo.
- No usar información real del cliente en pruebas automatizadas ni capturas compartidas.
- Los tokens de WhatsApp y del proveedor de IA van en `.env`, nunca en el repo. La sesión de WhatsApp Web que guarda WAHA tampoco se sube: con ella se puede usar ese WhatsApp.
- Con los permisos actuales del compose, el usuario `app` puede borrar los triggers de auditoría. En producción debería tener solo permisos de datos (pendiente de definir).
- Considerar la Ley 25.326 y los controles OWASP para aplicaciones con LLM como referencias de diseño.

## Pruebas obligatorias

- Respuesta correcta respaldada por cartera: se envía y audita.
- Póliza inexistente o fecha inválida: se retiene y deriva.
- Prompt que intenta cambiar reglas o revelar datos: se alerta y no se ejecuta.
- Pedido de datos de otra persona desde un teléfono compartido: no se revelan.
- Solicitud de baja o modificación: queda pendiente y no altera la cartera.
- Aprobación autorizada y rechazo: ambos dejan trazabilidad completa.
- Mensaje posterior a una derivación: no se genera respuesta automática.
- Mensaje de WhatsApp repetido: no duplica mensajes ni efectos. Desvío provisional del Parcial 1: los repetidos se descartan en memoria; después de un reinicio, un reintento de WAHA puede duplicar un mensaje.
