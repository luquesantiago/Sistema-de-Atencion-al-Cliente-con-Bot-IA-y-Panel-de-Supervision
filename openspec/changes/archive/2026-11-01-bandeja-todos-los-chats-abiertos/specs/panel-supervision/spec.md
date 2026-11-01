# Spec Delta

## MODIFIED Requirements

### Requirement: Bandeja de atención de casos abiertos

El sistema SHALL mostrar en la Bandeja de Atención del panel todos los casos sin cerrar (`fecha_cierre IS NULL`), incluidos los casos atendidos por el asistente que no están derivados ni tienen un pendiente operativo, ordenados por gravedad, estado de toma y tiempo de espera, con el cliente o el teléfono si no está identificado, el tipo de consulta, el motivo de derivación cuando exista, el último mensaje, el responsable y el estado de derivación (RF-SUP-02).

El sistema SHALL calcular `handedOff` como verdadero únicamente cuando `caso.fecha_derivacion IS NOT NULL`, y como falso cuando `caso.fecha_derivacion IS NULL` (RF-SUP-01, RF-SUP-02).

#### Scenario: Todos incluye casos derivados y no derivados
- **WHEN** hay un caso abierto derivado y otro caso abierto atendido por el asistente sin derivación ni pendiente operativo
- **THEN** la pestaña «Todos» muestra ambos casos

#### Scenario: Derivados solo incluye casos derivados
- **WHEN** hay casos abiertos con y sin fecha de derivación
- **THEN** la pestaña «Derivados» muestra únicamente los casos cuyo `handedOff` es verdadero

#### Scenario: Un caso cerrado no aparece
- **WHEN** un caso tiene `fecha_cierre` no nula
- **THEN** no aparece en ninguna pestaña de la Bandeja

#### Scenario: El motivo no determina la derivación
- **WHEN** un caso tiene `fecha_derivacion` nula y un motivo nulo, o tiene `fecha_derivacion` no nula y el motivo es nulo
- **THEN** `handedOff` es falso en el primer caso y verdadero en el segundo

#### Scenario: La búsqueda se combina con la pestaña
- **WHEN** el usuario escribe un teléfono, nombre o patente y elige una pestaña
- **THEN** la lista conserva solo los casos que cumplen simultáneamente el filtro de la pestaña y la búsqueda, sin descartar casos cuyo cliente sea nulo

#### Scenario: El detalle conserva la conversación abierta
- **WHEN** el usuario elige un caso abierto no derivado desde «Todos»
- **THEN** el panel muestra la conversación completa y conserva `handedOff` en falso sin crear una derivación
