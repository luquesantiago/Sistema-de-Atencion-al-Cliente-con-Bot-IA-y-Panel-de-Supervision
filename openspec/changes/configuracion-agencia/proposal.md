# Proposal

## Why

Lo que el asistente informa de la empresa solo se puede cambiar con una migración SQL:
- los ramos y los planes;
- la dirección y el teléfono, que todavía son de ejemplo;
- el horario.

Faltan además datos que los clientes piden y que hoy terminan derivados. El más grave es el número de grúa o asistencia: fuera de horario el caso espera a la apertura (RF-DER-04), y el cliente varado no tiene a quién llamar.

RF-SUP-07 reserva la configuración para el perfil de administración. Este change le da a Roberto un módulo para mantener esos datos, y hace que el asistente use los nuevos.

## What Changes

- **Módulo «Configuración» del panel**, solo para el rol administrador. Lo protege el control de rol del change `acceso-por-rol`, que tiene que estar implementado antes. Permite editar:
  - la dirección y el teléfono de la agencia, que son obligatorios;
  - datos nuevos y opcionales: el **teléfono de grúa o asistencia**, el **email**, la **web** y los **medios de pago** (texto libre, hasta 255 caracteres);
  - el horario de atención: qué días se atiende y de qué hora a qué hora;
  - qué ramos y qué planes están activos, con al menos uno de cada uno.

  Además:
  - Muestra una vista previa de lo que va a contestar el asistente.
  - Pide confirmación con el valor actual y el nuevo.
  - Marca los datos que siguen siendo de ejemplo.
- **Pedido de grúa o asistencia.** Es una intención nueva, «asistencia mecánica». Si el número está cargado, el asistente contesta en un solo mensaje el número y el aviso de derivación, y **además deriva** el caso para el seguimiento. Si no está cargado, deriva como hoy. **BREAKING (comportamiento acordado):** hoy un pedido de grúa siempre deriva sin dar el número.
- **Medios de pago.** Es una intención nueva, «medios de pago». Si el texto está cargado, el asistente lo contesta **sin derivar**; si no, deriva como hoy.
- **Información de la agencia.** Suma el email y la web cuando están cargados.
- **Respuestas fijas.** Las de grúa y de medios de pago se mandan sin redacción de la IA, así el número y el CBU o el alias llegan tal cual los cargó el administrador.
- **Mismos momentos que la información de la agencia.** Las respuestas de grúa y de medios de pago se dan en los mismos momentos que la información de la agencia: también antes de identificarse, pero no mientras se toman los datos del alta ni en silencio.
- **Nivel de riesgo.** El pedido de grúa derivado queda con nivel **medio**, por su urgencia.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `panel-supervision`: se agrega el requirement del módulo de Configuración de la información de la agencia (RF-SUP-07, RF-ATE-06).
- `atencion-automatizada`:
  - la lista de intenciones suma «asistencia mecánica» y «medios de pago», y cambia el escenario que hoy los manda a «otra consulta» (RF-ATE-01);
  - la información de la agencia suma el email y la web (RF-ATE-06);
  - se agregan los requirements de grúa y de medios de pago (RF-ATE-01, RF-ATE-02, RF-DER-01).
- `derivacion-seguimiento`: el nivel de riesgo por tipo suma «asistencia mecánica» con nivel medio (RF-DER-01).

## Impact

- **Base de datos.** Una migración de solo datos:
  - `tipo_consulta` suma «asistencia mecánica» y «medios de pago»;
  - `parametro_configuracion` suma `telefono_asistencia`, `email_agencia`, `web_agencia` y `medios_pago`, vacíos y descriptos como no informados.

  Sin tablas ni columnas nuevas.
- **Backend.**
  - Dominio: `intent.ts`, `agency-info.ts`, `risk-level.ts`, `templates.ts`, un módulo nuevo de validación de la configuración de la agencia, y `conversation.ts` (tipos de consulta).
  - Infraestructura: `prisma-agency-info.ts` (lectura y escritura), `openai-compatible-client.ts` (descripción de las intenciones nuevas).
  - Aplicación: `process-incoming-message.ts` (las dos intenciones en cada etapa donde hoy se responde la información de la agencia).
  - HTTP: endpoints de Configuración en `app.ts`, protegidos con `requireRole('administrador')`.
- **Frontend.** Módulo nuevo `pages/Configuracion.tsx`, `api/configuracion.ts`, `navigation.ts` y `Sidebar.tsx` (solo administrador).
- **Documentación.**
  - AGENTS.md: módulos del panel, el punto 4 del Parcial 1 sobre grúa y medios de pago, y «Decisiones abiertas».
  - `docs/requisitos.md` (RF-ATE-06, si se amplían los datos), la skill `frontend-panel` y `docs/design.md` si suma componentes.

## Preguntas abiertas (no se cierran en este change)

- **RF-ATE-06 y estas respuestas nuevas son propuestas del equipo** que la agencia todavía no validó (Decisiones abiertas). Este change permite cargar los datos reales, pero no los inventa: los nuevos arrancan vacíos y el asistente deriva hasta que el administrador los cargue.
- **El número de grúa** puede ser de la agencia o de la compañía aseguradora real. Que Seguros Castaño figure como la aseguradora es un supuesto del equipo.
- **Los medios de pago** solo se informan: cobranzas y pagos siguen fuera de alcance.
- **Las ediciones de Configuración no se auditan** hasta el MVP 2, igual que el ABM de Base de Clientes.
