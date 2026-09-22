# AGENTS.md

## Propósito del proyecto

Sistema de atención para Seguros Castaño con tres capacidades conectadas:

- atención automática por WhatsApp para consultas de rutina;
- derivación y seguimiento por operadores humanos;
- panel de supervisión que verifica respuestas contra la cartera, alerta riesgos y controla acciones contractuales.

La cartera de clientes y pólizas es la fuente de verdad. El bot informa, pero nunca dispone ni modifica contratos por sí solo.

## Contexto funcional obligatorio

### Alcance de la primera etapa

Incluye gestión de clientes, teléfonos, prospectos, pólizas, coberturas, vencimientos, situación de pago, siniestros, conversaciones, derivaciones, verificación de respuestas, alertas, aprobación de acciones críticas, métricas, perfiles de acceso y auditoría.

El asistente opera únicamente por WhatsApp. La atención humana funciona de lunes a viernes de 9 a 18, configurable; el asistente puede contestar siempre, pero fuera de ese horario debe informar que no hay atención humana hasta la apertura.

La comunicación con el cliente debe ser natural, clara y cordial, sin frases, etiquetas ni explicaciones que den a entender que está respondiendo un bot o una inteligencia artificial. Esto no autoriza a inventar información ni a ocultar una derivación: cuando una consulta deba pasar a una persona, informar que será atendida por un miembro del equipo.

Mensaje sugerido para derivaciones: “Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle”. El texto puede adaptarse al contexto, pero debe conservar un tono humano y no prometer tiempos o resultados no confirmados.

### Fuera de alcance

No implementar emisión ni cotización de pólizas, integración con compañías, contabilidad, comisiones, cobranzas, pagos, reembolsos automáticos, otros canales, ni aplicación móvil para clientes. Un pedido de reembolso se registra como aviso al equipo.

### Reglas de negocio no negociables

1. Identificar clientes por DNI. El teléfono no identifica: una persona puede tener varios teléfonos y un teléfono puede pertenecer a varias personas.
2. Pedir el DNI siempre. Si no se reconoce, preguntar si es cliente nuevo; reintentar como máximo tres veces y luego derivar.
3. Un cliente nuevo se registra como prospecto; un operador confirma el alta.
4. Responder solo con información de la cartera. Ante duda, dato ausente o consulta de accidentes, siniestros o cotizaciones, derivar.
5. Una consulta que deba derivarse debe recibir el mensaje sugerido de derivación, pero la respuesta automática permanece activa en el chat para atender nuevas preguntas que el cliente realice.
6. Una derivación debe comunicarse como transferencia a un miembro del equipo, sin mencionar bots, inteligencia artificial ni fallas internas.
7. Verificar cada respuesta antes de enviarla. Retener la respuesta si contiene datos falsos, no verificables, datos personales expuestos, manipulación del asistente o compromiso de una acción no autorizada.
8. Las bajas, modificaciones de contrato y altas de conductor quedan pendientes de aprobación. Solo Roberto, Graciela o Diego pueden aprobar; la aprobación registra quién, cuándo y por qué.
9. Cada respuesta, corrección, derivación, aprobación y rechazo debe ser auditable.

## Arquitectura y convenciones

- Frontend: React 19 + TypeScript + Vite, en `frontend/`.
- Backend: Node.js + TypeScript + Express, en `backend/`.
- Persistencia: MySQL 8.4 + Prisma 7, con Docker Compose.
- La aplicación debe trabajar con fechas almacenadas en UTC y convertirlas a hora argentina solo para mostrar.
- Mantener separación entre reglas de dominio, acceso a datos, transporte HTTP, integración de mensajería y presentación.
- Evitar que un handler HTTP, componente React o prompt de IA sea la única implementación de una regla crítica.
- Mantener TypeScript estricto y no silenciar errores con `any`, `@ts-ignore` o aserciones innecesarias.
- Preferir cambios pequeños, nombres explícitos y APIs existentes del proyecto antes que nuevas abstracciones.

## Guía visual y de contenido

- Interfaz de supervisión en español, con tono claro, profesional y natural para Argentina.
- Preservar la dirección de los mockups: sidebar azul marino, fondo gris muy claro, superficies blancas, azul para acción primaria, verde para éxito, ámbar para advertencia y rojo para riesgo o rechazo.
- Priorizar densidad operativa, lectura rápida, estados visibles y acciones inequívocas sobre decoración.
- Las alertas deben comunicar gravedad y motivo; no usar color como única señal.
- Mantener los módulos del panel: Dashboard, Bandeja de Atención, Trámites por Aprobar y Base de Clientes.
- No presentar datos ficticios como datos reales. Los fixtures deben estar marcados o documentados.

## Seguridad, privacidad y auditoría

- Tratar DNI, teléfonos, pólizas, conversaciones y datos de siniestros como información sensible.
- Aplicar autorización por rol en backend; ocultar una acción en frontend nunca es suficiente.
- Validar entradas y salidas en los límites del sistema. No confiar en texto generado por IA.
- No guardar secretos, tokens, contraseñas ni datos de producción en el repositorio.
- Toda mutación contractual debe tener actor, timestamp, motivo, estado anterior y estado nuevo.
- Ante una duda entre responder o derivar, derivar.

## Flujo de trabajo esperado

1. Leer la skill aplicable antes de cambiar una superficie del proyecto.
2. Localizar la regla de negocio y su prueba o punto de integración más cercano.
3. Implementar el cambio mínimo, preservando APIs y estilo existentes.
4. Verificar primero el slice afectado y después ejecutar las comprobaciones globales disponibles.
5. Actualizar documentación o decisiones abiertas cuando el cambio modifique el comportamiento acordado.

## Comandos de verificación

Desde `frontend/`:

```powershell
npm run lint
npm run build
```

Desde `backend/`:

```powershell
npm run postinstall
npx tsc --noEmit
```

Para el entorno completo:

```powershell
docker compose config
docker compose up --build
```

No hay que asumir que existe una suite de tests hasta que se agregue. Toda nueva regla crítica debe venir con una prueba de dominio o de integración que demuestre el caso permitido y el caso retenido o derivado.

## Decisiones abiertas

No cerrar por código sin confirmación del cliente: documentación formal para cada acción crítica, duplicados históricos y titularidad del vehículo repetido, catálogo de planes y coberturas, compañías aseguradoras, estados de póliza y cuotas, tratamiento de datos sensibles, tiempo máximo de alerta para derivaciones sin tomar y forma final de presentación del asistente.

## Skills del proyecto

- `skills/dominio-seguros/SKILL.md`: reglas, flujos y estados del negocio.
- `skills/backend-datos/SKILL.md`: API, Prisma, MySQL y consistencia.
- `skills/frontend-panel/SKILL.md`: panel, UX visual y accesibilidad.
- `skills/verificacion-seguridad/SKILL.md`: IA, privacidad, autorización y auditoría.