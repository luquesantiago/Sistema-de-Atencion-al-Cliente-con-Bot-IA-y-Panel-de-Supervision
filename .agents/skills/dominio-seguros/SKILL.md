---
name: dominio-seguros
description: Reglas de negocio de Seguros Castaño. Cubre identificación por DNI, prospectos, teléfonos, pólizas, coberturas, pagos, siniestros, conversaciones, casos, derivaciones y trámites críticos, con sus estados. Usar al diseñar o modificar cualquiera de esas entidades o flujos, o al escribir pruebas de reglas de negocio.
---

# Skill: Dominio de seguros

## Cuándo usarla

Usar al diseñar o modificar clientes, prospectos, teléfonos, pólizas, coberturas, pagos, siniestros, conversaciones, derivaciones o trámites.

## Principios

- La cartera es la fuente de verdad; el bot no completa datos faltantes.
- El DNI identifica al cliente. Los teléfonos son relaciones, no identificadores.
- Informar y ejecutar son capacidades separadas.
- La duda deriva a una persona y no produce una respuesta especulativa.
- Una derivación pasa la consulta a un miembro del equipo y el asistente deja de responder en esa conversación hasta que se cierre el caso (RF-DER-03).
- La comunicación debe sonar humana y natural. Mientras la agencia no confirme cómo se presenta el asistente, no anunciar que es una inteligencia artificial, pero nunca afirmar que es una persona si el cliente lo pregunta.

## Estados mínimos

Modelar estados explícitos y transiciones válidas para conversación, alerta, derivación y trámite. Una solicitud crítica debe pasar por `pendiente`, `aprobada` o `rechazada`; nunca aplicar el cambio mientras está pendiente.

Las bajas, modificaciones de contrato y altas de conductor requieren aprobación. Un reembolso es solo un aviso operativo y no una acción automática.

Decisiones ya tomadas sobre estados:

- Una baja de póliza aprobada cambia el estado de la póliza a "dada de baja".
- "Vencida" no es un estado: se calcula con la fecha de vencimiento.
- Se abre un caso por consulta; un caso puede tener varios mensajes.
- Una conversación es una sesión que se cierra tras un tiempo de inactividad (30 minutos, provisorio), salvo que tenga un caso derivado sin cerrar: en ese caso sigue abierta hasta que se cierre el caso.

## Identificación y derivación

Pedir DNI en cada identificación. Ante DNI desconocido, preguntar si es cliente nuevo: si lo es, tomar sus datos como prospecto (un operador confirma el alta); si no, volver a pedir el DNI hasta 3 veces más (4 pedidos en total) y derivar si sigue sin reconocerse. Una vez identificado, informar solo datos de ese cliente, aunque el teléfono lo compartan otras personas. Hay clientes empresa (CUIT + razón social); si el asistente les pide CUIT todavía no está definido.

Registrar el motivo de toda derivación y el operador responsable cuando exista. Comunicar la derivación con una frase como: "Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle". Después de ese mensaje, el asistente no responde más en esa conversación hasta que se cierre el caso; lo que escriba el cliente queda en el mismo caso para el operador. No mencionar bots, IA, errores internos ni tiempos de respuesta no confirmados.

Fuera del horario de atención humana (lunes a viernes de 9 a 18, configurable) el asistente responde igual. Si deriva, manda el mensaje de derivación habitual, sin avisar que no hay atención humana, y el caso queda pendiente hasta la apertura. El tiempo para alertar un caso derivado sin tomar corre solo dentro del horario.

## Criterios de implementación

- Codificar invariantes en funciones o servicios testeables, no solo en componentes o prompts.
- Usar tipos discriminados para estados y acciones cuando sea posible.
- No inventar catálogos, coberturas, compañías ni documentación pendiente de confirmar.
- Registrar actor, fecha, motivo y transición en las operaciones sensibles.
- Los pendientes de negocio requieren configuración o una decisión documentada, no valores ocultos. La lista está en "Decisiones abiertas" de `AGENTS.md`.
- Los requisitos (`docs/requisitos.md`) y la tabla de eventos (`docs/caso8_tabla_de_eventos.md`) describen qué tiene que pasar en cada flujo; citar el RF que corresponde.

## Casos que deben probarse

- DNI válido con uno o varios teléfonos.
- Teléfono compartido por varios clientes: no se identifica a nadie sin DNI y, una vez identificado, no se muestran datos de los otros.
- DNI desconocido: pregunta si es cliente nuevo; si no lo es, 3 reintentos y derivación al cuarto DNI no reconocido.
- Cliente nuevo registrado como prospecto, sin alta hasta que un operador la confirme.
- Consulta rutinaria respaldada por cartera.
- Dato ausente, siniestro o cotización que deriva sin responder.
- Mensaje del cliente después de una derivación: el asistente no responde y el mensaje queda en el caso.
- Consulta derivada fuera de horario: el cliente recibe el mensaje de derivación habitual, sin aviso de horario, y la alerta de caso sin tomar no salta antes de la apertura.
- Baja, modificación o alta de conductor retenida hasta aprobación.
- Reembolso registrado como aviso, sin mutar una póliza.
