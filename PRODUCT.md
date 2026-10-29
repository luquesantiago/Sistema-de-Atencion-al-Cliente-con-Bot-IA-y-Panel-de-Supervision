# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operadores y un administrador de Seguros Castaño (agencia de seguros argentina). Atienden de lunes a viernes de 9 a 18 (configurable) desde un panel interno de supervisión, con casos que llegan del asistente de WhatsApp.

## Product Purpose

Sistema de atención al cliente con tres capacidades conectadas: atención automática por WhatsApp para consultas de rutina, derivación y seguimiento por operadores humanos, y panel de supervisión que verifica respuestas contra la cartera, alerta riesgos y controla acciones contractuales. Éxito: el sistema funciona de punta a punta, procesa los datos históricos migrados y permite operar y supervisar con trazabilidad completa.

## Positioning

La cartera de clientes y pólizas es la fuente de verdad. El bot informa, pero nunca dispone ni modifica contratos por sí solo. Ante una duda entre responder o derivar, se deriva.

## Operating Context

- Atención humana de lunes a viernes de 9 a 18 (configurable); el asistente de WhatsApp contesta siempre, deriva fuera de horario y el caso queda pendiente hasta la apertura.
- Flujo operativo: identificación por DNI (o teléfono vinculado a un cliente activo), derivación a la bandeja de operadores, aprobación de acciones críticas, auditoría de cada respuesta, corrección, derivación, aprobación y rechazo.
- Parcial 1 (08/10/2026): demostración de punta a punta con datos históricos migrados. El login del panel usa usuarios de prueba (`admin` y `operador`, clave `1234`) de forma client-side; el backend atribuye todo al usuario de prueba `operador`. La autenticación real de servidor llega en el Parcial 2 (05/11/2026) con control de acceso por rol.
- Stack: React 19 + TypeScript + Vite en `frontend/`; Node.js + Express + Prisma 7 + MySQL 8.4 en `backend/`; WAHA para WhatsApp; Groq (`openai/gpt-oss-20b`) para la IA del asistente; todo en Docker Compose.

## Capabilities and Constraints

- Módulos del panel: Dashboard, Bandeja de Atención, Trámites por Aprobar y Base de Clientes.
- El asistente solo responde con información de la cartera del cliente identificado o con información de la agencia; deriva ante duda, siniestros, cotizaciones y pedidos contractuales.
- Login de panel hoy provisional (client-side, credenciales de prueba a la vista por requerimiento de la demo del Parcial 1); se sustituye por auth de servidor en el Parcial 2.
- Fechas almacenadas en UTC y mostradas en hora argentina.
- Fuera de alcance: emisión ni cotización de pólizas, integración con compañías, contabilidad, cobranzas, pagos, otros canales y app móvil para clientes.

## Brand Commitments

- Nombre: Seguros Castaño. Tono: claro, profesional y natural rioplatense (voseo).
- Paleta bordó y crema: fija e inamovible (tokens centralizados en `docs/design.md` §1).
- Efectos Liquid Glass sutiles solo en superficies de apoyo; controles, tablas y formularios sólidos para legibilidad.
- Interfaz en español; prioridad de densidad operativa, lectura rápida, estados visibles y acciones inequívocas sobre decoración.

## Evidence on Hand

- `docs/requisitos.md` (29 requisitos funcionales), `docs/caso8_der.md` (DER y convenciones de modelado), `docs/migracion.md` (reglas de migración), `docs/design.md` (sistema de diseño).
- `backend/planilla/` con el Excel histórico limpio; `backend/fixtures/clientes-ficticios.json` reservado a pruebas automatizadas.
- Sin credenciales reales ni datos de producción en el repositorio.

## Product Principles

1. La cartera es la fuente de verdad; el asistente informa, no dispone contratos.
2. Ante la duda entre responder o derivar, derivar.
3. Toda acción crítica es auditable: actor, timestamp, motivo, estado anterior y nuevo.
4. Una regla crítica nunca vive solo en un handler HTTP, un componente React o un prompt de IA.
5. Preferir cambios pequeños, nombres explícitos y las APIs existentes del proyecto antes que nuevas abstracciones.

## Accessibility & Inclusion

- Interfaz en español rioplatense; contraste suficiente, foco visible y navegación por teclado exigidos por `docs/design.md` §7.
- WCAG 2.1 AA como mínimo: etiquetas visibles en cada campo, errores con texto explicativo (nunca solo color), indicadores de estado con texto e icono.
