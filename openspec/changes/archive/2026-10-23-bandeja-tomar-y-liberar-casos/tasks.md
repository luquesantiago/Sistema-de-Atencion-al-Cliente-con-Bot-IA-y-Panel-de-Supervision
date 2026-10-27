# Tasks

## 1. Liberar sin reactivar al asistente

- [x] 1.1 `decideRelease` devuelve `{ ok: true }` sin `resumeAssistant`; `InboxRepository.release(caseId, expected)` y `PrismaInboxRepository.release` dejan el caso sin responsable ni `fecha_toma` y no llaman a `releaseSilence`. Pruebas de dominio, aplicación y HTTP: el caso liberado sigue derivado. Verificar: `docker compose exec backend npm test`.
- [x] 1.2 En el panel, «Reanudar Bot» pasa a «Liberar caso» y el aviso dice que el asistente sigue sin responder hasta el cierre. Verificar: `docker compose exec frontend npm run lint` y `npm run build`.
- [x] 1.3 Prueba manual: tomar y liberar un caso derivado deja la conversación con `asistente_suspendido = 1`.

## 2. Toma exclusiva

- [x] 2.1 `decideTake(state, actor)` rechaza con `taken-by-other` el caso de otro responsable; `ManageInbox.take` responde 409. Pruebas: caso sin responsable (permitido), propio (permitido) y de otro (rechazado). Verificar: `docker compose exec backend npx tsc --noEmit` y `npm test`.
- [x] 2.2 En el panel, «Intervenir» queda deshabilitado con el caso de otra persona, y la respuesta y el cierre dicen que solo su responsable actúa.
- [x] 2.3 Prueba manual: con un caso asignado a otro usuario, tomarlo y contestarlo responden 409.

## 3. Documentación

- [x] 3.1 Actualizar en `AGENTS.md` las reglas de Tomar, Liberar, Contestar y cierre.
