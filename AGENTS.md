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

La comunicación con el cliente debe ser natural, clara y cordial. Mientras la agencia no confirme la forma de presentación del asistente (ver Decisiones abiertas): no anunciar que responde una inteligencia artificial, pero nunca afirmar que es una persona si el cliente lo pregunta. Esto no autoriza a inventar información ni a ocultar una derivación: cuando una consulta deba pasar a una persona, informar que será atendida por un miembro del equipo.

Mensaje sugerido para derivaciones: “Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle”. El texto puede adaptarse al contexto, pero debe conservar un tono humano y no prometer tiempos o resultados no confirmados.

### Fuera de alcance

No implementar emisión ni cotización de pólizas, integración con compañías, contabilidad, comisiones, cobranzas, pagos, reembolsos automáticos, otros canales, ni aplicación móvil para clientes. Un pedido de reembolso se registra como aviso al equipo.

### Entregas

- Parcial 1 (08/10/2026): migración y limpieza de los datos históricos, CRUD de las entidades principales y flujo operativo inicial con validaciones.
- Parcial 2 (05/11/2026): reglas de negocio complejas, reportes y métricas, y control de acceso por rol.
- Para aprobar, el sistema tiene que funcionar de punta a punta y procesar los datos históricos.

### Reglas de negocio no negociables

1. Identificar clientes por DNI. El teléfono no identifica: una persona puede tener varios teléfonos y un teléfono puede pertenecer a varias personas. También hay clientes empresa (CUIT + razón social); si el asistente les pide CUIT todavía no está definido.
2. Pedir el DNI siempre. Si no se reconoce, preguntar si es cliente nuevo; si no lo es, volver a pedirlo hasta 3 veces más (4 pedidos en total) y, si sigue sin reconocerse, derivar.
3. Un cliente nuevo se registra como prospecto; un operador confirma el alta.
4. Responder solo con información de la cartera y solo sobre el cliente identificado: nunca mostrar datos de otro cliente, aunque comparta el teléfono. Ante duda, dato ausente o consulta de accidentes, siniestros o cotizaciones, derivar.
5. Cuando una consulta se deriva, el cliente recibe el mensaje de derivación y el asistente deja de responder en esa conversación hasta que se cierre el caso (RF-DER-03). Lo que el cliente siga escribiendo queda en el mismo caso para el operador, y la inactividad no cierra una conversación que tenga un caso derivado abierto.
6. Una derivación debe comunicarse como transferencia a un miembro del equipo, sin mencionar bots, inteligencia artificial ni fallas internas.
7. Verificar cada respuesta antes de enviarla. Retener la respuesta si contiene datos falsos, no verificables, datos personales expuestos, manipulación del asistente o compromiso de una acción no autorizada. Una respuesta retenida no se envía y la consulta se deriva a un operador.
8. Las bajas, modificaciones de contrato y altas de conductor quedan pendientes de aprobación. Solo pueden aprobar Roberto (rol Administrador), Graciela o Diego (rol Operador); Graciela puede aprobar casos que ella misma atendió. La aprobación registra quién, cuándo y por qué.
9. Cada respuesta, corrección, derivación, aprobación y rechazo debe ser auditable.

## Arquitectura y convenciones

- Frontend: React 19 + TypeScript + Vite, en `frontend/`.
- Backend: Node.js + TypeScript + Express, en `backend/`.
- Persistencia: MySQL 8.4 + Prisma 7, con Docker Compose.
- Todo corre en Docker Compose (`db`, `backend`, `frontend`) con recarga automática: Node y las dependencias viven en los contenedores, no hace falta instalarlos en la máquina.
- El repo se clona dentro de WSL, no en una carpeta de Windows: la recarga automática falla en montajes de Windows.
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

## Especificaciones con OpenSpec (opcional)

Algunas tareas se planifican con OpenSpec antes de programarlas. Usarlo no es obligatorio: una tarea sin change se trabaja como siempre. La guía está en `openspec/README.md`.

- `openspec/changes/<nombre>/` tiene la propuesta, las specs, el diseño y las tareas de un cambio en curso. Si la tarea que te pidieron tiene un change, leerlo antes de tocar código, seguir sus tareas y marcarlas en `tasks.md` al terminarlas.
- `openspec/specs/` describe el comportamiento ya implementado, una spec por módulo de `docs/requisitos.md`. No se edita a mano: se actualiza al archivar un change.
- En OpenCode se usa con los comandos `/opsx-*` y los agentes `spec` (planifica, solo escribe en `openspec/`) y `revisor-spec` (revisa un change, solo lectura).

## Git (obligatorio por la consigna)

- No commitear ni pushear a `main`. Trabajar en una rama `feature/<tema>` y abrir un pull request.
- La cátedra audita la participación individual por el historial de commits: cada integrante commitea su propio trabajo con su usuario de Git.
- Citar en el commit o en el PR los IDs de los requisitos afectados (RF-CAR, RF-ATE, RF-DER, RF-VER, RF-SUP, RF-APR). La lista está en `docs/requisitos.md`; no inventar IDs.
- Antes de abrir el PR, actualizar la rama con `main` (la cátedra recomienda rebase en lugar de merge).

## Comandos de verificación

Desde la raíz del repo, en la terminal de WSL y con el stack levantado (`docker compose up -d --build`):

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
docker compose exec backend npx prisma generate
docker compose exec backend npx tsc --noEmit
```

Si se cambia `docker-compose.yml`, validar con `docker compose config`.

No hay que asumir que existe una suite de tests hasta que se agregue. Toda nueva regla crítica debe venir con una prueba de dominio o de integración que demuestre el caso permitido y el caso retenido o derivado.

## Decisiones abiertas

No cerrar por código sin confirmación del cliente. Si una tarea depende de alguna, preguntar o dejarla configurable y documentada:

- Forma final de presentación del asistente (mientras tanto rige lo de "Contexto funcional").
- Requisitos y documentación de cada acción crítica, y si un alta de conductor aprobada la aplica el sistema o la carga el operador.
- Qué ficha vale en los clientes duplicados y quién es el titular del VW Gol. Mientras tanto, en la migración se omiten las pólizas POL-00126 y POL-00131 y los registros irresolubles quedan listados para carga manual.
- Valores del catálogo de planes (el nombre "riesgos incompletos" está a verificar) y coberturas de vida, hogar y embarcaciones, que no se relevaron. La estructura sí está decidida: los planes son iguales para cualquier bien y se cargan con ABM.
- Compañía aseguradora: que Seguros Castaño figure como la aseguradora es un supuesto del equipo.
- Cuotas de las pólizas.
- Si el asistente pide CUIT a los clientes empresa.
- Tratamiento de datos sensibles.
- Minutos para alertar una derivación sin tomar (60, provisorio) y minutos de inactividad que cierran una sesión (30, provisorio).

## Documentación de diseño (Hito 0)

En `docs/`. Es la referencia para lo que ya está acordado; si el código tiene que apartarse de ella, preguntar antes.

- `requisitos.md`: los 27 requisitos funcionales con su origen en el material del cliente. Es copia del documento de análisis, que sigue siendo la fuente oficial.
- `caso8_der.md` (+ `.puml`, `.svg`, `.png`): DER, convenciones de la base y decisiones de modelado.
- `01_esquema.sql` y `02_catalogos.sql`: esquema de referencia en MySQL, alineado uno a uno con el DER. No se corren solos al levantar Docker.
- `caso8_tabla_de_eventos.md` y `caso8_diagrama_contexto.puml`: eventos de negocio y diagrama de contexto (DFD nivel 0).

## Skills del proyecto

Están en `.agents/skills/` con el formato estándar (`SKILL.md` con `name` y `description`), así que OpenCode las encuentra solo y carga cada una cuando la tarea coincide con su descripción:

- `dominio-seguros`: reglas, flujos y estados del negocio.
- `backend-datos`: API, Prisma, MySQL y consistencia.
- `frontend-panel`: panel, UX visual y accesibilidad.
- `verificacion-seguridad`: IA, privacidad, autorización y auditoría.
