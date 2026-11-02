# Tasks

Los comandos corren desde la raíz del repo, con el stack levantado (`docker compose up -d --build`).

## 1. Contrato y capa de métricas

- [x] 1.1 Definir el tipo de respuesta de `GET /api/dashboard/metrics` con las tres métricas asignadas, el resumen general y los campos de compatibilidad en cero. Verificar: `docker compose exec backend npx tsc --noEmit`.
- [x] 1.2 Crear el caso de uso y el contrato de repositorio de métricas sin agregar tablas ni columnas. Verificar: `docker compose exec backend npx tsc --noEmit`.

## 2. Backend: agregaciones Prisma y endpoint

- [ ] 2.1 Implementar con Prisma el conteo de alertas abiertas en niveles `medio`, `alto` y `critico`, excluyendo alertas atendidas. Verificar: `docker compose exec backend npm test`.
- [x] 2.2 Implementar con Prisma `tramitesPorAprobar` sumando prospectos y solicitudes de acción en estado `pendiente`, excluyendo estados decididos. Verificar: `docker compose exec backend npm test`.
- [ ] 2.3 Implementar con Prisma `totalAbiertos`, `totalCerrados` y la fórmula de `tasaAutomatizacionBot`, incluyendo el caso sin casos. Verificar: `docker compose exec backend npm test`.
- [x] 2.4 Devolver `casosDerivadosSinTomar: 0` y `respuestasRetenidas: 0` sin agregar lógica de esas métricas. Verificar: `docker compose exec backend npm test`.
- [x] 2.5 Registrar `GET /api/dashboard/metrics` en Express y mantener el formato común de errores. Verificar: `docker compose exec backend npm test`.
- [ ] 2.6 Agregar pruebas de agregaciones, exclusión de estados, fórmula, división por cero y contrato JSON. Verificar: `docker compose exec backend npm test`.

## 3. Frontend: Dashboard

- [x] 3.1 Crear el cliente API tipado para las métricas y consumirlo desde `Dashboard.tsx`. Verificar: `docker compose exec frontend npm run lint`.
- [ ] 3.2 Conectar las tarjetas de alertas de riesgo abiertas y trámites por aprobar. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [ ] 3.3 Conectar la sección inferior de resumen general con totales y tasa de automatización. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 3.4 Implementar estados visibles de carga y error sin mostrar ceros como sustituto de un error. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.

## 4. Verificación integrada

- [ ] 4.1 Consultar el endpoint con datos de prueba y comparar sus resultados con MySQL, comprobando que cada alerta, trámite y caso se cuente una sola vez. Verificar: `docker compose exec backend npm test`.
- [x] 4.2 Ejecutar la batería disponible:
  - `docker compose exec backend npx tsc --noEmit`
  - `docker compose exec backend npm test`
  - `docker compose exec frontend npm run lint`
  - `docker compose exec frontend npm run build`
