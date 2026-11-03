# Tasks

## 1. Backend

- [x] 1.1 En `prisma-inbox-repository.ts`, agregar al listado y al total la condición del caso representante (derivado, después cambio de teléfono pendiente, después el más reciente), sin aplicarla al detalle por caso. Probar en `prisma-inbox-repository.test.ts` que el listado y el total la llevan y el detalle no. Verificar: `docker compose exec backend npm test` y `npx tsc --noEmit`.
- [x] 1.2 Comprobar contra la base de la demo que una charla con tres consultas da una fila y el total cuenta una conversación, y que el detalle de los otros casos sigue respondiendo. Verificar: `GET /api/bandeja` y `GET /api/bandeja/:id` antes y después.

## 2. Panel y documentación

- [x] 2.1 Ajustar en `BandejaAtencion.tsx` los textos de la lista que cuentan casos para que hablen de conversaciones o chats. Verificar: `docker compose exec frontend npm run lint` y `npm run build`.
- [x] 2.2 Actualizar AGENTS.md (Bandeja de Atención e «Ir al chat»). Verificar: releer y que no contradiga la spec del change.
- [x] 2.3 Correr todas las comprobaciones de AGENTS.md y `openspec validate bandeja-una-fila-por-conversacion --strict`.
