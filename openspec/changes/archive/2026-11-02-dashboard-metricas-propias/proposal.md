# Proposal

## Why

El Dashboard necesita mostrar métricas reales de la base MySQL, pero este change cubre únicamente la parte asignada: alertas de riesgo abiertas, trámites por aprobar y el resumen operativo de la jornada actual, incluida la distribución horaria de consultas. Las métricas `casosDerivadosSinTomar` y `respuestasRetenidas` serán desarrolladas por otros integrantes, por lo que la API debe devolverlas como `0` para mantener temporalmente el contrato común del frontend.

## What Changes

- Crear `GET /api/dashboard/metrics` con su ruta y controlador o handler HTTP.
- Implementar con Prisma las consultas dinámicas sobre MySQL para:
  - `alertasRiesgoAbiertas`: alertas abiertas de niveles `medio`, `alto` y `critico`.
  - `tramitesPorAprobar`: prospectos y solicitudes de acción en estado `pendiente`.
  - `consultasHoy`: casos creados hoy, con el día de Argentina (`America/Argentina/Buenos_Aires`) convertido al rango UTC usado en MySQL.
  - `casosCerrados`: casos con `fecha_cierre` dentro del día de hoy.
  - `resueltosPorBot`: casos creados hoy con `fecha_derivacion` en `NULL`.
  - `tasaAutomatizacion`: `Math.round((resueltosPorBot / consultasHoy) * 100)`, o `0` si no hay consultas.
  - `volumenPorHora`: distribución de los casos creados hoy agrupados por hora argentina, con las 24 horas del día y `cantidad: 0` en las horas sin actividad.
- Devolver `casosDerivadosSinTomar: 0` y `respuestasRetenidas: 0` como valores de compatibilidad, sin implementar esas métricas.
- Conectar en `Dashboard.tsx` las tarjetas de alertas y trámites y la sección inferior de la jornada actual.
- Reorganizar la fila superior del Dashboard como una grilla responsive de cuatro tarjetas KPI en una sola fila: una columna en móvil, dos desde 640 px y cuatro desde 1024 px.
- Presentar en ese orden «Casos derivados sin tomar», «Respuestas retenidas», «Trámites por aprobar» y «Alertas de riesgo abiertas», cada una con ícono en contenedor de fondo semántico suave, etiqueta, valor destacado y subtexto.
- Mostrar `—` como valor provisional en «Casos derivados sin tomar» y «Respuestas retenidas» mientras sus métricas sigan sin implementarse, sin hardcodear los valores de las tarjetas conectadas a la API.
- Implementar los íconos como SVG inline con los tokens de `docs/design.md`, sin incorporar Tailwind, `lucide-react` ni otras dependencias visuales.
- Mantener `frontend/package.json` y `frontend/package-lock.json` sin `lucide-react` ni librerías de íconos o estilos; todos los íconos del Dashboard provienen de `frontend/src/components/iconos.tsx`.
- Dividir la sección inferior del Dashboard en una grilla de tres columnas: el gráfico de «Volumen de chats por hora» ocupa dos columnas y el «Resumen operativo» una; por debajo de 1024 px ambos pasan a una sola columna.
- Dibujar el gráfico de volumen con SVG inline nativo (`viewBox="0 0 500 150"`), una curva de área suavizada, un `<linearGradient>` con el color de marca `var(--color-primary)` y las etiquetas del eje X calculadas a partir de `volumenPorHora`.
- Calcular en el frontend los puntos, el trazo suavizado y las etiquetas del gráfico a partir de `volumenPorHora`, sin coordenadas ni valores de datos hardcodeados; una hora sin consultas se representa en la base del gráfico.
- Mostrar en «Resumen operativo» `consultasHoy`, `casosCerrados`, `resueltosPorBot` y `tasaAutomatizacion` recibidos del endpoint, con barra de progreso dinámica y estado «Óptimo» (≥ 60 %) o «Moderado».
- Usar SVG nativo y CSS plano en `App.css` para el gráfico y la sección inferior, sin incorporar librerías de gráficos, Tailwind ni otras dependencias visuales, según `docs/design.md`.
- Mostrar estados explícitos de carga y error en las superficies conectadas.
- No agregar tablas, columnas ni migraciones.

## Capabilities

### Modified Capabilities

- `panel-supervision`: el Dashboard muestra las métricas asignadas calculadas desde MySQL y conserva campos de contrato pendientes con valor cero (RF-SUP-05).

## Impact

- **Backend:** nuevo contrato de métricas, filtro de la jornada argentina, agregación horaria, handler HTTP y repositorio Prisma de solo lectura.
- **Frontend:** cliente API tipado, fila superior con cuatro tarjetas KPI responsive, gráfico SVG dinámico, resumen operativo y estado de carga/error para las superficies asignadas.
- **Base de datos:** solo lecturas de `alerta`, `nivel_riesgo`, `caso`, `prospecto`, `solicitud_accion` y sus catálogos; no hay cambios de esquema.
- **Pruebas:** agregaciones dinámicas por jornada, distribución horaria con horas en cero, exclusión de estados cerrados o decididos, fórmula de automatización, contrato JSON y estados del Dashboard.

## Open Questions

- El mecanismo definitivo de autenticación del panel sigue siendo el del MVP actual: el backend atribuye las acciones al usuario de prueba `operador`; este change no incorpora autenticación Bearer ni un sistema de roles nuevo.
