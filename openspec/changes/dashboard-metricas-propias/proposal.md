# Proposal

## Why

El Dashboard necesita mostrar métricas reales de la base MySQL, pero este change cubre únicamente la parte asignada: alertas de riesgo abiertas, trámites por aprobar y el resumen general de casos y automatización. Las métricas `casosDerivadosSinTomar` y `respuestasRetenidas` serán desarrolladas por otros integrantes, por lo que la API debe devolverlas como `0` para mantener temporalmente el contrato común del frontend.

## What Changes

- Crear `GET /api/dashboard/metrics` con su ruta y controlador o handler HTTP.
- Implementar con Prisma las consultas dinámicas sobre MySQL para:
  - `alertasRiesgoAbiertas`: alertas abiertas de niveles `medio`, `alto` y `critico`.
  - `tramitesPorAprobar`: prospectos y solicitudes de acción en estado `pendiente`.
  - `resumenGeneral.totalAbiertos` y `totalCerrados`.
  - `resumenGeneral.tasaAutomatizacionBot`, calculada como `(casos con fecha_derivacion IS NULL / total_casos) * 100`.
- Devolver `casosDerivadosSinTomar: 0` y `respuestasRetenidas: 0` como valores de compatibilidad, sin implementar esas métricas.
- Conectar en `Dashboard.tsx` las tarjetas de alertas y trámites y la sección de resumen general.
- Reorganizar la fila superior del Dashboard como una grilla responsive de cuatro tarjetas KPI en una sola fila: una columna en móvil, dos desde 640 px y cuatro desde 1024 px.
- Presentar en ese orden «Casos derivados sin tomar», «Respuestas retenidas», «Trámites por aprobar» y «Alertas de riesgo abiertas», cada una con ícono en contenedor de fondo semántico suave, etiqueta, valor destacado y subtexto.
- Mostrar `—` como valor provisional en «Casos derivados sin tomar» y «Respuestas retenidas» mientras sus métricas sigan sin implementarse, sin hardcodear los valores de las tarjetas conectadas a la API.
- Implementar los íconos como SVG inline con los tokens de `docs/design.md`, sin incorporar Tailwind, `lucide-react` ni otras dependencias visuales.
- Mostrar estados explícitos de carga y error en las superficies conectadas.
- No agregar tablas, columnas ni migraciones.

## Capabilities

### Modified Capabilities

- `panel-supervision`: el Dashboard muestra las métricas asignadas calculadas desde MySQL y conserva campos de contrato pendientes con valor cero (RF-SUP-05).

## Impact

- **Backend:** nuevo contrato de métricas, handler HTTP y repositorio o servicio Prisma de solo lectura.
- **Frontend:** cliente API tipado, fila superior con cuatro tarjetas KPI responsive, íconos SVG inline y estado de carga/error para las tres superficies asignadas.
- **Base de datos:** solo lecturas de `alerta`, `nivel_riesgo`, `caso`, `prospecto`, `solicitud_accion` y sus catálogos; no hay cambios de esquema.
- **Pruebas:** agregaciones dinámicas, exclusión de estados cerrados o decididos, fórmula de automatización, contrato JSON y estados del Dashboard.

## Open Questions

- El mecanismo definitivo de autenticación del panel sigue siendo el del MVP actual: el backend atribuye las acciones al usuario de prueba `operador`; este change no incorpora autenticación Bearer ni un sistema de roles nuevo.
