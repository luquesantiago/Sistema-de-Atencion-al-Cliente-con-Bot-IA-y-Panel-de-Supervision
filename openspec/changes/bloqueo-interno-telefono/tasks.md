# Tasks

## 1. Documentación del alcance

- [x] 1.1 Aclarar en `AGENTS.md`, `docs/requisitos.md`, `docs/design.md`, el DER y la tabla de eventos que el bloqueo es interno y no bloquea al contacto en WhatsApp. Verificar: revisar que las descripciones distingan el descarte en backend de la recepción técnica por WAHA y que no alteren los requisitos oficiales.
- [x] 1.2 Registrar el cambio como delta de `panel-supervision` y describir su alcance, decisiones y límites. Verificar: revisar la Requirement y los escenarios contra el comportamiento implementado.
- [x] 1.3 Confirmar que el código y las pruebas cubren mensajes entrantes descartados y respuestas manuales rechazadas para números bloqueados. Verificar: pruebas focalizadas del backend, `docker compose exec backend npx tsc --noEmit`, `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 1.4 Actualizar las exportaciones del DER desde `caso8_der.puml`. Verificar: `docker run --rm --network none -v "$PWD/docs:/data" plantuml/plantuml:1.2026.8 -tsvg /data/caso8_der.puml` y el mismo comando con `-tpng`.
- [x] 1.5 Comprobar el diff documental. Verificar: `git diff --check`.

## 2. Bloqueo automático ante amenaza

- [x] 2.1 Cuando el detector clasifica positivamente una amenaza, registrar y derivar el mensaje, activar `telefono.bloqueado` y hacer que la amenaza reemplace el motivo/prioridad anterior, sin alterar la fecha ni responsable de una derivación ya abierta. Verificar: prueba focalizada de `process-incoming-message.test.ts`, prueba de orden SQL de `prisma-inbox-repository.test.ts`, `docker compose exec backend npx tsc --noEmit`, `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 2.2 Cubrir clasificación positiva, falla del proveedor, mensajes posteriores descartados y rollback del bloqueo si no se completa el guardado. Verificar: `docker compose exec backend npm test -- src/application/process-incoming-message.test.ts -t "bloqueo automático"` y `docker compose exec backend npm test -- src/infrastructure/in-memory-conversation-store.test.ts`.
- [x] 2.3 Confirmar que el botón existente puede deshacer el bloqueo automático y documentar el disparador y los límites del bloqueo interno. Verificar: `docker compose exec backend npm test -- src/http/app.test.ts -t "bloquea y desbloquea el número del caso"` y `git diff --check`.
