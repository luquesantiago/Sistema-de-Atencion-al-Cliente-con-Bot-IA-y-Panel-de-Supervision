# Tasks

## 1. Documentación del alcance

- [x] 1.1 Aclarar en `AGENTS.md`, `docs/requisitos.md`, `docs/design.md`, el DER y la tabla de eventos que el bloqueo es interno y no bloquea al contacto en WhatsApp. Verificar: revisar que las descripciones distingan el descarte en backend de la recepción técnica por WAHA y que no alteren los requisitos oficiales.
- [x] 1.2 Registrar el cambio como delta de `panel-supervision` y describir su alcance, decisiones y límites. Verificar: revisar la Requirement y los escenarios contra el comportamiento implementado.
- [x] 1.3 Confirmar que el código y las pruebas cubren mensajes entrantes descartados y respuestas manuales rechazadas para números bloqueados. Verificar: pruebas focalizadas del backend, `docker compose exec backend npx tsc --noEmit`, `docker compose exec frontend npm run lint` y `docker compose exec frontend npm run build`.
- [x] 1.4 Actualizar las exportaciones del DER desde `caso8_der.puml`. Verificar: `docker run --rm --network none -v "$PWD/docs:/data" plantuml/plantuml:1.2026.8 -tsvg /data/caso8_der.puml` y el mismo comando con `-tpng`.
- [x] 1.5 Comprobar el diff documental. Verificar: `git diff --check`.
