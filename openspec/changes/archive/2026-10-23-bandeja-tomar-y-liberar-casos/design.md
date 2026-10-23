# Design

## Context

- `decideTake` aceptaba cualquier caso de la bandeja, y `ManageInbox.take` lo tomaba con el responsable leído como condición (`take(caseId, actor, expected, at)`).
- `decideRelease` devolvía `resumeAssistant: handedOff` y `PrismaInboxRepository.release` llamaba a `releaseSilence` cuando era verdadero.
- Mientras hay un caso derivado sin cerrar, el asistente no deriva otro en la misma conversación. Esa garantía solo vale si el silencio dura hasta el cierre.
- El CHECK `ck_caso_toma` exige responsable cuando hay `fecha_toma`.

## Goals / Non-Goals

**Goals:**
- Que una conversación no tenga nunca más de un caso derivado abierto.
- Que la regla de quién puede tomar un caso viva en el dominio, con pruebas.

**Non-Goals:**
- Reasignar un caso desde el administrador.
- Volver a atender con el asistente sin cerrar el caso (decisión abierta de AGENTS.md).

## Decisions

1. **Liberar no toca el silencio.** `decideRelease` solo controla que actúe el responsable; `release(caseId, expected)` hace un `updateMany` condicionado por el responsable y deja `id_usuario_asignado` y `fecha_toma` en `NULL`. Alternativa descartada: cerrar el caso al liberar, que mezcla dos acciones que ya existen.
2. **Tomar es exclusivo.** `decideTake(state, actor)` devuelve `taken-by-other` si el caso tiene otro responsable. La condición del `updateMany` de `take` sigue cubriendo la toma simultánea.
3. **Mensajes.** Tomar el caso de otro: «El caso lo tiene otra persona: tiene que liberarlo antes.». Contestarlo: «El caso lo tiene otra persona: solo su responsable puede contestar.».

## Risks / Trade-offs

- Con un único usuario de prueba (`operador`), la toma exclusiva no se ve en el panel hasta que haya login.
- Un caso queda trabado si su responsable no lo libera. Se acepta hasta el Parcial 2.
