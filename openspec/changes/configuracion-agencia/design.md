# Design

## Context

Motivación: ver `proposal.md`. Requisitos: ver `specs/`.

Estado actual:

- **Lectura de los datos.**
  - `PrismaAgencyInfoSource.read()` lee en cada consulta `ramo`, `plan` y `horario_atencion`, y las claves `direccion_agencia` y `telefono_agencia` de `parametro_configuracion` (`valor VARCHAR(255)`).
  - `agencyInfoFromRows` deja afuera lo inactivo.
  - `agencyInfoAnswer` arma la plantilla y los literales que controla `checkRewrite`, y devuelve `null` si falta un dato; en ese caso se deriva.
- **Base de datos.**
  - `horario_atencion` tiene una fila por día con atención (`dia_semana` de 1 a 7, `uk_horario_dia`, `CHECK hora_cierre > hora_apertura`).
  - `plan.activo` también filtra los planes elegibles en las coberturas de una póliza nueva.
- **Intenciones.**
  - Salen de una lista cerrada (`intent.ts`), con descripciones en `openai-compatible-client.ts`.
  - Hoy grúa y medios de pago se describen como «otra consulta».
- **Respuesta de la agencia.**
  - `process-incoming-message.ts` la responde en varias etapas: inicio, esperando si ya es cliente, esperando el DNI, oferta al cliente nuevo, cambio de teléfono pendiente e identificado.
  - Tiene un `sendAgencyInfo` y, después, repite la pregunta pendiente.
- **Nivel de riesgo.** `queryTypeRiskLevel` (`risk-level.ts`) da el nivel por tipo, y la Bandeja lo usa para la gravedad.
- **Dependencia.** El control de rol (`requireRole`) llega con `acceso-por-rol`, que se implementa antes.

## Goals / Non-Goals

**Goals:**
- Un módulo de administración para los datos de la agencia, sin cambiar el esquema.
- Dos intenciones nuevas que reutilicen el camino de la información de la agencia.

**Non-Goals:**
- Renombrar o crear ramos y planes. Siguen siendo catálogos de migración: solo se activan o desactivan.
- Feriados.
- Historial y auditoría de cambios (MVP 2).
- Alertar sobre derivaciones sin tomar según el horario (RF-VER-03).
- Datos por compañía aseguradora.

## Decisions

### 1. Datos nuevos como claves de `parametro_configuracion`

Una migración de solo datos suma:
- las claves `telefono_asistencia`, `email_agencia`, `web_agencia` y `medios_pago`, con `valor = ''` y una descripción que dice que la agencia no lo informó;
- «asistencia mecánica» y «medios de pago» a `tipo_consulta`.

`agencyInfoKeys` y `AgencyInfo` suman los cuatro campos, que valen `null` si están vacíos.

La marca de dato de ejemplo o no informado sale de la `descripcion`: si empieza con «Dato de ejemplo» o con «Sin informar», el módulo la muestra. Al guardar un valor, la descripción pasa a la definitiva («Teléfono de grúa o asistencia que informa el asistente»).

- **Por qué:** cumple la regla de no agregar tablas ni columnas fuera del DER. El límite de 255 caracteres de `valor` alcanza para los medios de pago.

### 2. Validación en el dominio y guardado en una transacción

`domain/agency-settings.ts` tiene `parseAgencySettings(body)`, que valida y normaliza:
- textos sin espacios de más;
- teléfonos con dígitos, espacios, `+`, `-` o paréntesis, hasta 50 caracteres;
- email con un formato simple;
- web `http(s)://…`;
- medios de pago hasta 255 caracteres;
- horario `HH:MM` con cierre posterior a la apertura;
- al menos un ramo activo, un plan activo y un día con atención.

`PrismaAgencyInfoSource.save(settings)` hace todo en una sola transacción:
- `upsert` de los parámetros;
- reemplazo de `horario_atencion`: borra los días sin atención y hace `upsert` por día de los demás;
- `updateMany` de `activo` en `ramo` y en `plan`.

- **API:**
  - `GET /api/configuracion/agencia` devuelve los datos, las marcas y la vista previa;
  - `PUT /api/configuracion/agencia` guarda;
  - `POST /api/configuracion/agencia/vista-previa` arma la vista previa de un borrador sin guardar.

  Los tres llevan `requireSession` y `requireRole('administrador')`.

### 3. Grúa y medios de pago: textos fijos, por el camino de la información de la agencia

- `intent.ts` suma `'asistencia mecánica'` y `'medios de pago'`, y `actionForIntent` les asigna dos acciones nuevas: `{ kind: 'assistance' }` y `{ kind: 'payment-methods' }`.
- Las descripciones del proveedor de IA las separan de «otra consulta», de saldo y de siniestro. Un mensaje que cuenta un siniestro sigue siendo siniestro.
- **Textos fijos**, en `templates.ts`. Los propone el change y los revisa el equipo en el PR:
  - **Grúa:** «Para una grúa o asistencia mecánica, comuníquese al {teléfono}. Además, su pedido será derivado a un miembro de nuestro equipo, quien hará el seguimiento.»
  - **Medios de pago:** «Estos son los medios de pago de Seguros Castaño: {texto}»
- **Sin redacción de la IA:** el número y el CBU o el alias llegan tal cual, sin pasar por `checkRewrite`.
- **En el flujo:**
  - Cada etapa que hoy trata «información de la agencia» trata también estas dos intenciones, y después repite la pregunta pendiente igual que hoy.
  - La grúa con número usa el mismo camino de derivación del motivo «intención», cambiando el mensaje de derivación por el texto fijo con el número; en la identificación usa `handoffIdentifying`.
  - Sin dato cargado, las dos derivan con el mensaje habitual y el motivo «dato ausente».
- **Alternativa descartada:** pasar estos textos por la redacción de la IA con literales. Agrega riesgo de alterar un CBU sin ganar nada, porque el administrador ya escribe el texto.

### 4. Email y web en la información de la agencia

`agencyInfoAnswer` agrega «Nuestro email es … y nuestra web es …» solo con los datos cargados, y los suma a los literales. No pasan a ser obligatorios.

### 5. Módulo del panel

- **Navegación.** `navigation.ts` suma el módulo `configuracion` («Configuración»). `Sidebar` lo muestra solo al rol administrador, como el Dashboard.
- **`pages/Configuracion.tsx`.** Tiene secciones Contacto, Asistencia y pagos, Horario y Seguros y planes, más la vista previa al costado, que se pide al backend con un retardo después de cada cambio. La confirmación usa `ConfirmarCambio`. Sigue `docs/design.md` y el estilo de Base de Clientes.

## Risks / Trade-offs

- **[El LLM confunde grúa con siniestro u otra consulta]** → Descripciones y ejemplos en la lista. Si elige «otra consulta», el resultado es el de hoy (deriva sin número), que es seguro.
- **[Desactivar un plan usado en pólizas]** Las coberturas existentes no cambian; solo deja de ofrecerse y de poder elegirse en coberturas nuevas. → La confirmación lo avisa.
- **[Dejar al asistente sin datos]** → La validación exige dirección, teléfono, un ramo, un plan y un día.
- **[Sin auditoría]** → Igual que el ABM hasta el MVP 2; queda en la proposal.

## Migration Plan

- La migración de datos se aplica sola al reiniciar el backend.
- Los datos nuevos arrancan vacíos, así que el comportamiento es el de hoy hasta que el administrador los carga.
- Rollback: revertir el PR. Las filas nuevas de catálogo y de parámetros no molestan.

## Open Questions

Ninguna que cambie el diseño. Las de negocio están en `proposal.md`.
