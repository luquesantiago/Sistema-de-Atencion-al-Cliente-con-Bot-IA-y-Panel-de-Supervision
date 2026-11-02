# Tasks

Los comandos corren desde la raíz del repo, con el stack levantado (`docker compose up -d --build`).

## 1. Contrato y capa de métricas

- [x] 1.1 Definir el tipo de respuesta de `GET /api/dashboard/metrics` con las tres métricas asignadas, el resumen general y los campos de compatibilidad en cero. Verificar: `docker compose exec backend npx tsc --noEmit`.
- [x] 1.2 Crear el caso de uso y el contrato de repositorio de métricas sin agregar tablas ni columnas. Verificar: `docker compose exec backend npx tsc --noEmit`.

## 2. Backend: agregaciones Prisma y endpoint

- [x] 2.1 Implementar con Prisma el conteo de alertas abiertas en niveles `medio`, `alto` y `critico`, excluyendo alertas atendidas. Verificar: `docker compose exec backend npm test`.
- [x] 2.2 Implementar con Prisma `tramitesPorAprobar` sumando prospectos y solicitudes de acción en estado `pendiente`, excluyendo estados decididos. Verificar: `docker compose exec backend npm test`.
- [x] 2.3 Implementar con Prisma `consultasHoy`, `casosCerrados`, `resueltosPorBot` y `tasaAutomatizacion` sobre el día argentino, incluyendo el caso sin consultas. Verificar: `docker compose exec backend npm test`.
- [x] 2.4 Devolver `casosDerivadosSinTomar: 0` y `respuestasRetenidas: 0` sin agregar lógica de esas métricas. Verificar: `docker compose exec backend npm test`.
- [x] 2.5 Registrar `GET /api/dashboard/metrics` en Express y mantener el formato común de errores. Verificar: `docker compose exec backend npm test`.
- [x] 2.6 Agregar pruebas de agregaciones, exclusión de estados, fórmula, división por cero y contrato JSON. Verificar: `docker compose exec backend npm test`.

## 3. Frontend: Dashboard

- [x] 3.1 Crear el cliente API tipado para las métricas y consumirlo desde `Dashboard.tsx`. Verificar: `docker compose exec frontend npm run lint`.
- [x] 3.2 Conectar las tarjetas de alertas de riesgo abiertas y trámites por aprobar. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 3.3 Conectar la sección inferior de resumen general con totales y tasa de automatización. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 3.4 Implementar estados visibles de carga y error sin mostrar ceros como sustituto de un error. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.

## 4. Fila superior de tarjetas KPI

- [x] 4.1 Reorganizar la fila superior como una grilla responsive de cuatro columnas (1 / 2 / 4) conservando el orden «Casos derivados sin tomar», «Respuestas retenidas», «Trámites por aprobar» y «Alertas de riesgo abiertas». Verificar: `docker compose exec frontend npm run build`.
- [x] 4.2 Agregar el valor provisional `—` y los subtextos de «Casos derivados sin tomar» y «Respuestas retenidas» sin hardcodear los valores de las tarjetas conectadas a la API. Verificar: `docker compose exec frontend npm run lint`.
- [x] 4.3 Incorporar los íconos de campana, pausa, documento con tilde y alerta como SVG inline en `iconos.tsx`, con contenedores de fondo semántico suave según los tokens de `docs/design.md`. Verificar: `docker compose exec frontend npm run build`.
- [x] 4.4 Verificar la fila superior en móvil, tablet y escritorio. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.

## 5. Sección inferior: gráfico y resumen operativo

- [x] 5.1 Crear en `App.css` la grilla de tres columnas con el gráfico en dos columnas y el resumen en una, con colapso a una columna por debajo de 1024 px. Verificar: `docker compose exec frontend npm run build`.
- [x] 5.2 Construir «Volumen de chats por hora» con SVG inline nativo (`viewBox="0 0 500 150"`), curva de área suavizada, `<linearGradient>` con `var(--color-primary)` y etiquetas calculadas desde `volumenPorHora`, sin librerías de gráficos. Verificar: `docker compose exec frontend npm run build`.
- [x] 5.3 Implementar «Resumen operativo» con `consultasHoy`, `casosCerrados`, `resueltosPorBot` y `tasaAutomatizacion` recibidos de la API. Verificar: `docker compose exec frontend npm run lint`.
- [x] 5.4 Agregar la barra de progreso dinámica con `tasaAutomatizacion%` y el indicador «Óptimo» (≥ 60 %) o «Moderado», con texto además de color. Verificar: `docker compose exec frontend npm run lint`.
- [x] 5.5 Documentar la decisión de usar SVG nativo y CSS plano en `App.css` conforme a `docs/design.md`. Verificar: revisión de `proposal.md`, `design.md` y la spec.

## 6. Jornada actual y gráfico dinámico

- [x] 6.1 Calcular el rango UTC del día de hoy en `America/Argentina/Buenos_Aires` y usarlo para filtrar `fecha_apertura` y `fecha_cierre`. Verificar: `docker compose exec backend npm test`.
- [x] 6.2 Implementar `volumenPorHora` agrupando los casos creados hoy por hora argentina y devolviendo las 24 horas con `cantidad: 0` cuando no hay consultas. Verificar: `docker compose exec backend npm test`.
- [x] 6.3 Exponer `consultasHoy`, `casosCerrados`, `resueltosPorBot`, `tasaAutomatizacion` y `volumenPorHora` en `GET /api/dashboard/metrics`. Verificar: `docker compose exec backend npx tsc --noEmit`.
- [x] 6.4 Actualizar el tipo `DashboardMetrics` del frontend con los nuevos campos y la forma de `volumenPorHora`. Verificar: `docker compose exec frontend npm run build`.
- [x] 6.5 Eliminar del SVG las coordenadas y etiquetas fijas y calcular puntos, trazo suavizado, área y eje X a partir de `volumenPorHora`, representando los ceros sobre la base. Verificar: `docker compose exec frontend npm run build`.
- [x] 6.6 Conectar «Consultas de hoy», «Casos cerrados», «Resueltos por bot», la barra `tasaAutomatizacion%` y el badge dinámico «Óptimo»/«Moderado». Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 6.7 Agregar pruebas del rango del día, la agregación horaria con horas en cero, la tasa redondeada y el caso sin consultas. Verificar: `docker compose exec backend npm test`.

## 7. Cumplimiento de dependencias y estilos

- [x] 7.1 Verificar que `frontend/package.json` y `frontend/package-lock.json` no contengan `lucide-react` ni otras librerías de íconos, gráficos o estilos. Verificar: `git diff -- frontend/package.json frontend/package-lock.json` sin cambios.
- [x] 7.2 Verificar que `Dashboard.tsx` no importe `lucide-react` y que todos los íconos provengan de `frontend/src/components/iconos.tsx`. Verificar: búsqueda de `lucide` y revisión de imports.
- [x] 7.3 Auditar `Dashboard.tsx` y `App.css` para confirmar que no haya clases de Tailwind ni utilidades de terceros; todo el diseño usa clases propias y tokens de `docs/design.md`. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 7.4 Actualizar `proposal.md`, `design.md` y esta lista para dejar explícito el uso de SVG inline nativo y CSS plano, sin dependencias visuales. Verificar: revisión de los documentos.

## 8. Verificación integrada

- [x] 8.1 Consultar el endpoint con datos de prueba y comparar sus resultados con MySQL, comprobando que cada alerta, trámite y caso se cuente una sola vez. Verificar: `docker compose exec backend npm test`.
- [x] 8.2 Ejecutar la batería disponible:
  - `docker compose exec backend npx tsc --noEmit`
  - `docker compose exec backend npm test`
  - `docker compose exec frontend npm run lint`
  - `docker compose exec frontend npm run build`
