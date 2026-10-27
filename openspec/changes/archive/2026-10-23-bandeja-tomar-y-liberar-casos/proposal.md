# Proposal

## Why

El botón «Reanudar Bot» de la Bandeja de Atención (PR #31) sacaba del silencio la conversación de un caso derivado sin cerrarlo. Cuando el cliente volvía a escribir, el asistente lo atendía y, si la consulta se derivaba, abría otro caso derivado en la misma conversación. En la prueba del 22/10/2026 una misma conversación quedó con tres casos derivados abiertos (79, 81 y 83). Eso contradice RF-DER-03: después de derivar, el asistente no responde hasta que se cierre el caso.

Además, cualquier empleado podía tomar el caso que tenía otra persona y quedarse con él. Santiago decidió el 23/10/2026 que un caso tomado no lo puede tomar otro: primero lo libera su responsable.

## What Changes

Decisiones de Santiago del 23/10/2026.

- **Liberar un caso (RF-DER-02, RF-DER-03).**
  - El botón pasa a llamarse «Liberar caso».
  - Solo lo usa el responsable. El caso queda sin responsable y sin `fecha_toma`, porque la base no admite una sin la otra (`ck_caso_toma`).
  - No saca del silencio a la conversación: el asistente sigue sin responder hasta que alguien cierre el caso.
  - La respuesta de `POST /api/bandeja/:idCaso/liberacion` deja de traer `assistantResumed`.
- **Tomar solo un caso sin responsable (RF-DER-02).**
  - **BREAKING:** reemplaza la decisión del 15/10/2026 («aunque lo tenga otra persona»). Tomar el caso de otra persona da 409.
  - Tomar un caso propio no cambia nada.
  - En el panel, «Intervenir» queda deshabilitado y dice quién tiene el caso.
- **Contestar y cerrar (RF-DER-02).** Siguen siendo solo del responsable. Con el caso de otra persona, el sistema ya no pide tomarlo: avisa que solo su responsable puede actuar.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `derivacion-seguimiento`: cambian «Tomar un caso desde la bandeja», «Contestarle al cliente desde la bandeja» y «Cerrar un caso derivado desde la bandeja», y se agrega «Liberar un caso desde la bandeja».

## Impact

- Backend: `domain/case-actions.ts` (`decideTake`, `decideRelease`), `application/manage-inbox.ts`, `domain/inbox.ts` y `infrastructure/prisma-inbox-repository.ts` (`release`), con sus pruebas.
- Frontend: `api/bandeja.ts` y `pages/BandejaAtencion.tsx`.
- `AGENTS.md`: reglas de Tomar, Liberar, Contestar y cierre.
- Sin cambios en la base.

## Preguntas abiertas

- Si el responsable no está, nadie puede destrabar su caso, ni siquiera el administrador. Se puede sumar una reasignación del administrador cuando llegue la autenticación real (Parcial 2).
