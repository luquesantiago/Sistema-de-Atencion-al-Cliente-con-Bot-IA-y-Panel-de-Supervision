# Skill: Dominio de seguros

## Cuándo usarla

Usar al diseñar o modificar clientes, prospectos, teléfonos, pólizas, coberturas, pagos, siniestros, conversaciones, derivaciones o trámites.

## Principios

- La cartera es la fuente de verdad; el bot no completa datos faltantes.
- El DNI identifica al cliente. Los teléfonos son relaciones, no identificadores.
- Informar y ejecutar son capacidades separadas.
- La duda deriva a una persona y no produce una respuesta especulativa.
- Una derivación comunica el pase de esa consulta a un miembro del equipo, pero no suspende la respuesta automática del chat.
- La comunicación debe sonar humana y natural; no mencionar ni insinuar que responde un bot o una inteligencia artificial.

## Estados mínimos

Modelar estados explícitos y transiciones válidas para conversación, alerta, derivación y trámite. Una solicitud crítica debe pasar por `pendiente`, `aprobada` o `rechazada`; nunca aplicar el cambio mientras está pendiente.

Las bajas, modificaciones de contrato y altas de conductor requieren aprobación. Un reembolso es solo un aviso operativo y no una acción automática.

## Identificación y derivación

Pedir DNI en cada identificación. Ante DNI desconocido, ofrecer alta como prospecto, permitir hasta tres reintentos y derivar al superar el límite. Registrar el motivo de toda derivación y el operador responsable cuando exista. Comunicar la derivación con una frase como: “Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle”. Después de ese mensaje, una nueva pregunta del cliente debe evaluarse y responderse normalmente si está dentro del alcance y puede verificarse. No mencionar bots, IA, errores internos ni tiempos de respuesta no confirmados.

## Criterios de implementación

- Codificar invariantes en funciones o servicios testeables, no solo en componentes o prompts.
- Usar tipos discriminados para estados y acciones cuando sea posible.
- No inventar catálogos, coberturas, compañías ni documentación pendiente de confirmar.
- Registrar actor, fecha, motivo y transición en las operaciones sensibles.
- Los pendientes de negocio requieren configuración o una decisión documentada, no valores ocultos.

## Casos que deben probarse

- DNI válido con uno o varios teléfonos.
- Teléfono compartido por varios clientes sin identificar automáticamente a ninguno.
- Tres intentos fallidos y derivación en el cuarto evento.
- Consulta rutinaria respaldada por cartera.
- Dato ausente, siniestro o cotización que deriva sin responder.
- Baja, modificación o alta de conductor retenida hasta aprobación.
- Reembolso registrado como aviso, sin mutar una póliza.