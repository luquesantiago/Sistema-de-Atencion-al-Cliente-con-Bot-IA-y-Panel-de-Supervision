# Design

## Context

- El backend ya expone el listado y la decisión de prospectos y cambios de teléfono; la foto del DNI se obtiene desde la Bandeja, que a su vez la pide a WAHA sin guardarla.
- La pantalla se agregó sobre `TramitesAprobar.tsx`, que ya tenía el detalle y el formulario de decisión, pero mostraba las dos listas separadas por pestañas y no ofrecía la navegación a la Bandeja después de rechazar un alta.
- `App.tsx` define las páginas del panel; ahora les pasa `onNavegar` para que una página pueda llevar a otra.
- Los estilos de la pantalla viven en `App.css`; la confirmación usa `ConfirmarCambio` y los estados usan `EstadoPanel`.

## Goals / Non-Goals

**Goals:**
- Un solo lugar para revisar y decidir altas y cambios de teléfono.
- Que la persona autorizada vea la evidencia y el estado actual antes de decidir.
- Que una decisión no se aplique dos veces y que un aviso fallido se pueda reintentar sin repetir la decisión.

**Non-Goals:**
- Aprobar bajas, modificaciones de póliza o altas de conductor.
- Cambiar el backend, la base o las reglas de decisión.
- Implementar autenticación real o auditoría inmutable.

## Decisions

1. **Lista única en el cliente.** Se piden las dos listas por separado, se unen en `TramitePendiente` y se ordenan por fecha ascendente. Alternativa descartada: un endpoint combinado en el backend, que hubiera cambiado una API que ya funciona y que no era necesario para esta pantalla.
2. **Paginación independiente y “Cargar más” combinado.** Cada lista conserva su `limit` y `offset` de 25; el botón pide más de la lista que todavía tiene resultados. Alternativa descartada: paginar la unión en el cliente, que obligaría a traer todas las filas.
3. **Un detalle a la vez.** La selección se identifica por sección e id; el detalle se muestra al costado en escritorio y se puede volver a la lista. Alternativa descartada: abrir un modal por trámite, que hubiera ocultado la lista y complicado la comparación.
4. **Foto del DNI a pedido.** No se carga al abrir el detalle: se pide al hacer clic, se muestra con un object URL y se revoca al desmontar. Alternativa descartada: guardar la imagen en el estado global o en el navegador, que hubiera conservado una copia que el sistema no debe guardar.
5. **Confirmación antes de decidir.** Las dos decisiones pasan por `ConfirmarCambio`, que muestra el estado actual y el resultante, incluido el fundamento. Alternativa descartada: aplicar directo desde el formulario, que no permite revisar el cambio antes de una acción irreversible.
6. **Rechazo de alta con navegación.** La respuesta del backend trae el caso; la pantalla muestra “Ir a la Bandeja” y usa `onNavegar` para cambiar de módulo. Alternativa descartada: dejar el aviso sin acción, que obligaba a buscar el caso a mano.
7. **Aviso fallido sin revertir.** Si el cambio de teléfono se aplica pero WhatsApp falla, la decisión queda registrada y la pantalla guarda el id de la notificación para reintentar. Alternativa descartada: revertir la decisión, que contradice que la decisión ya quedó asentada.
8. **Conflicto 409.** Si otra persona resolvió el trámite, la pantalla muestra el error, recarga las listas y deja el detalle en el estado “ya no está pendiente”. Alternativa descartada: reintentar la decisión automáticamente.

## Risks / Trade-offs

- **Paginación en el cliente:** si entran trámites nuevos mientras se pagina, la unión puede mostrar un elemento repetido o saltear uno. Mitigación: el botón “Actualizar” recarga desde cero; la lista se ordena por fecha y el detalle se identifica por sección e id.
- **Foto del DNI perecedera:** WAHA conserva la imagen un tiempo limitado. Mitigación: se pide en el momento y se muestra un mensaje claro si ya no está disponible.
- **Sin autenticación real:** todas las decisiones se atribuyen al usuario de prueba `operador`. Mitigación: se documenta como limitación y se resuelve en el Parcial 2.
- **Componente grande:** `TramitesAprobar.tsx` concentra lista, detalle y decisiones. Mitigación: se mantiene el flujo actual y se puede separar en componentes en un change de refactor.
- **Acciones críticas todavía ausentes:** la descripción del módulo las menciona, pero la pantalla no las lista. Mitigación: se deja explícito en el proposal y se suman cuando existan las APIs.
