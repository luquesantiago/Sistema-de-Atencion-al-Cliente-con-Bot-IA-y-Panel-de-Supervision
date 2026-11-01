# Tasks

Los comandos corren desde la raíz del repo, con el stack levantado (`docker compose up -d --build`).

## 1. Contrato y consulta del backend

- [x] 1.1 Cambiar el filtro común de `PrismaInboxRepository` para incluir todos los casos con `c.fecha_cierre IS NULL`, sin exigir derivación ni pendiente operativo. Mantener el filtro opcional por cliente, el orden y la paginación. Verificar: `docker compose exec backend npx tsc --noEmit`.
- [x] 1.2 Confirmar que la consulta del total y la consulta del detalle usan el mismo criterio de caso abierto. Verificar: `docker compose exec backend npm test`.
- [x] 1.3 Mantener el mapeo `handedOff: record.fecha_derivacion !== null`; agregar pruebas para fecha nula y no nula. Verificar: `docker compose exec backend npm test`.

## 2. Frontend

- [x] 2.1 Verificar que «Todos» permita casos con `handedOff` verdadero y falso, y que «Derivados» exija `handedOff === true`. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 2.2 Verificar que la búsqueda use acceso opcional al cliente y combine `cumplePestana && cumpleBusqueda`. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 2.3 Revisar acciones y estados vacíos para que la inclusión de casos no derivados sea solo de lectura y no permita enviar respuestas de operador a un caso que no está derivado. Verificar: `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.

## 3. Verificación integrada

- [x] 3.1 Con datos ficticios, verificar un caso abierto derivado, uno abierto no derivado, uno abierto con pendiente y uno cerrado mediante `GET /api/bandeja`; comprobar que solo el cerrado queda excluido y que `handedOff` coincide con `fecha_derivacion IS NOT NULL`.
- [ ] 3.2 Verificar manualmente las pestañas «Todos» y «Derivados» y la búsqueda combinada en el panel.
- [x] 3.3 Ejecutar la batería disponible:
  - `docker compose exec backend npx tsc --noEmit`
  - `docker compose exec backend npm test`
  - `docker compose exec frontend npm run lint`
  - `docker compose exec frontend npm run build`
