# Spec Delta

## Purpose

Módulo «Gestión de cartera» de `docs/requisitos.md`: el registro único de clientes, pólizas, coberturas y planes, la identificación por DNI, el registro de vencimientos y estados, los siniestros, los teléfonos de contacto y el pedido de cambio de teléfono (RF-CAR-01 a RF-CAR-05). El valor «cambio de teléfono» en los catálogos sale de RF-CAR-05 y de las decisiones 2 y 3 del 28/09/2026 de `docs/caso8_der.md`.

## ADDED Requirements

### Requirement: El catálogo de tipos incluye el cambio de teléfono

La base de datos SHALL tener el valor «cambio de teléfono» en el catálogo `tipo_accion`, que enumera los tipos de pedido que se registran en `solicitud_accion`, y en el catálogo `tipo_consulta`, que enumera las intenciones que clasifica el asistente (RF-CAR-05).

#### Scenario: Tipo de acción disponible para el pedido de cambio de teléfono
- **WHEN** se consulta el catálogo `tipo_accion`
- **THEN** entre sus valores está «cambio de teléfono», junto a los tipos de acción que ya tenía

#### Scenario: Intención disponible para la consulta de un número nuevo
- **WHEN** se consulta el catálogo `tipo_consulta`
- **THEN** entre sus valores está «cambio de teléfono», junto a los tipos de consulta que ya tenía
