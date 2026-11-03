# Documentación del sistema

## Sistema de Atención al Cliente con Bot IA y Panel de Supervisión

**Cliente:** Seguros Castaño  
**Materia:** Prácticas Pre Profesionales 1 — UNLa, 2026  
**Caso:** 8 — Grupo 11  
**Repositorio:** `luquesantiago/Sistema-de-Atencion-al-Cliente-con-Bot-IA-y-Panel-de-Supervision`  
**Documento generado:** 22/10/2026

---

## 1. Resumen ejecutivo

El sistema resuelve tres necesidades de la agencia:

1. **Atención automática por WhatsApp** para consultas de rutina: saldo, vencimiento, estado de póliza, saludo e información de la agencia.
2. **Derivación y seguimiento** de las consultas que no puede resolver el asistente: siniestros, cotizaciones, reclamos, pedidos de baja o modificación, clientes nuevos y casos que no se entienden.
3. **Panel de supervisión** para que operadores y administradores vean la bandeja priorizada, revisen conversaciones, respondan, cierren casos, aprueben trámites y administren la cartera.

La regla central es: **la cartera de clientes y pólizas es la fuente de verdad; el bot informa, pero nunca modifica contratos por sí solo**. Toda acción contractual (baja, modificación, alta de conductor) queda pendiente de aprobación humana.

El sistema está implementado como una aplicación web con:

- frontend React que corre en `http://localhost:5173`;
- backend Express que corre en `http://localhost:3000`;
- MySQL 8.4 en el puerto `3307`;
- WAHA como puente con WhatsApp;
- Groq como proveedor de IA.

---

## 2. Estado del repositorio (leer antes de exponer)

Hay una diferencia importante entre el clon local y la última versión publicada.

| Punto | Clon local | `origin/main` (GitHub) |
|---|---|---|
| Rama | `main` | `main` |
| Último commit | `1d0091a` — "fix planilla" | `c8628b8` — merge PR #31 |
| Fecha | 16/10/2026 | 22/10/2026 |
| Cantidad de commits | 81 | 106 |
| `BandejaAtencion.tsx` | 14 líneas (stub) | 851 líneas (UI completa) |
| `App.css` | versión anterior | +2.218 líneas de cambios |
| Nuevos módulos backend | no están | `manage-inbox`, `risk-level`, `handoff`, `case-actions`, `inbox`, `prisma-inbox-repository`, `prisma-case-closing` |

**Este documento describe `origin/main`**, que es la versión más completa y la que conviene mostrar en la exposición.

Si se va a exponer desde la carpeta local, antes hay que actualizar:

```bash
cd ~/proyectos/Sistema-de-Atencion-al-Cliente-con-Bot-IA-y-Panel-de-Supervision
git status
git stash
git pull --rebase origin main
git stash pop
```

Cambios locales sin commitear detectados al generar este documento:

- `backend/planilla/Caso8_seguros_bot_datos_limpios.xlsx`
- `frontend/src/App.css`
- `frontend/src/App.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/iconos.tsx`
- `frontend/src/index.css`
- `frontend/src/pages/BaseClientes.tsx`
- `frontend/src/pages/TramitesAprobar.tsx`
- sin trackear: `.env.bak-20261008`

No se modificó ni se commiteó nada del repositorio para generar este documento.

---

## 3. Arquitectura general

```
WhatsApp del cliente
        |
        v
   WAHA (GOWS)  --- webhook POST /webhooks/whatsapp --->  Backend Express
        ^                                                   |
        |                                                   +--> MySQL (Prisma)
        |                                                   |
        +------------- API de WAHA (respuestas) <-----------+
                                                            |
                                                            +--> Groq (clasificación y redacción)
                                                            |
Panel React (navegador) --- API REST ---> Backend Express --+
```

### Capas del backend

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| Entrada HTTP | `backend/src/http/` | Rutas, webhook, validación de secretos, manejo de errores |
| Aplicación | `backend/src/application/` | Casos de uso: procesar mensaje, gestionar cartera, trámites, bandeja |
| Dominio | `backend/src/domain/` | Reglas puras: intenciones, riesgo, handoff, conversación, saldo, DNI, acciones |
| Infraestructura | `backend/src/infrastructure/` | Adaptadores concretos: Prisma, WAHA, Groq, cola, configuración |
| Composición | `backend/src/index.ts` | Une todas las piezas y arranca el servidor |

### Stack

| Parte | Tecnología |
|---|---|
| Frontend | React 19.2 + TypeScript + Vite 8.3 |
| Backend | Node.js 24 + TypeScript 7 + Express 5.2 |
| Base de datos | MySQL 8.4 + Prisma 7.10 |
| Mensajería | WAHA con motor GOWS (no oficial) |
| IA | Groq, modelo `openai/gpt-oss-20b`, API compatible con OpenAI |
| Pruebas | Vitest 5 |
| Entorno | Docker Compose |

---

## 4. Flujo completo del bot

### 4.1. Entrada de un mensaje

1. El cliente escribe al WhatsApp vinculado.
2. WAHA recibe el mensaje y hace `POST /webhooks/whatsapp` al backend con el header `X-Webhook-Secret`.
3. `requireWebhookSecret` valida el secreto **antes de leer el cuerpo**. Si no coincide, responde `401`.
4. `parseWahaWebhook` normaliza el aviso. Los mensajes ignorados (grupos, canales, audios, imágenes fuera de contexto) responden `200` para que WAHA no los reintente.
5. `KeyedQueue` procesa **un mensaje por remitente a la vez**, en orden.
6. Si el remitente viene como `@lid`, se resuelve el teléfono real con `findPhoneByLid`.
7. `ProcessIncomingMessage.execute()` ejecuta el flujo de negocio.

### 4.2. Identificación

- Si el número está vinculado a **un solo cliente activo**, se identifica sin pedir DNI.
- Si está vinculado a **varios**, pide DNI.
- Si **no está vinculado**, pregunta si la persona ya es cliente o es nueva.
- Si dice que es cliente existente, pide DNI.
- Si el DNI no se reconoce, vuelve a preguntar. Al cuarto DNI no reconocido, deriva.
- Si dice que es cliente nuevo, pide nombre y apellido, luego DNI y luego foto del DNI. Guarda un `prospecto` pendiente y deriva para que un operador confirme el alta.
- Si el DNI pertenece a otro cliente, o en una conversación identificada se da otro DNI, deriva.
- La información de la agencia se puede responder antes de identificarse.

### 4.3. Clasificación de la intención

El proveedor de IA elige una intención de una **lista cerrada**:

- saldo
- vencimiento
- estado de póliza
- cobertura
- siniestro
- cotización
- baja
- modificación
- reclamo
- saludo
- cambio de teléfono
- información de la agencia
- no es de seguros
- otra consulta
- no se entiende

El contexto son los últimos 4 mensajes del cliente y del asistente, con el DNI tapado y marcados como datos, no como instrucciones.

### 4.4. Acción según la intención

| Intención | Acción |
|---|---|
| Saldo | Responde con cuotas impagas por póliza; si falta el dato, deriva |
| Vencimiento / estado | Responde con todas las pólizas del cliente |
| Saludo / agradecimiento | Responde con cortesía, sin derivar |
| Información de la agencia | Responde ramos, planes, dirección, teléfono y horario |
| Cambio de teléfono desde número vinculado | Pide que escriba desde el número nuevo |
| Cambio de teléfono desde número no vinculado | Registra solicitud pendiente y sigue atendiendo |
| Baja / modificación / alta de conductor | Avisa que el equipo lo revisará y deja de responder |
| Siniestro / cotización / cobertura / reclamo / otra consulta | Deriva y deja de responder |
| No es de seguros | Texto fijo, sin derivar |
| No se entiende | Repregunta hasta 2 veces; al tercer mensaje seguido, deriva |
| Cliente nuevo | Junta datos, registra prospecto, deriva |

### 4.5. Verificación de la respuesta

Antes de enviar, el sistema compara la redacción del modelo contra la plantilla:

- No puede cambiar números de póliza, fechas, estados, ramos, importes, monedas ni cuotas vencidas/por vencer.
- No puede agregar links, `@` ni términos prohibidos.
- No puede revelar el DNI ni datos de otros clientes.
- Si la redacción no pasa, no se envía: se deriva y se deja constancia.

### 4.6. Silencio después de derivar

Cuando el asistente deriva, avisa que el pedido queda en revisión o registra un prospecto, la conversación queda **en silencio** (`asistente_suspendido = true`). El asistente no responde más hasta que se cierre el caso derivado. Lo que el cliente escriba se guarda en ese caso para el operador.

La inactividad no cierra una conversación con un caso derivado abierto. Al cerrar el último caso derivado, el asistente vuelve a atender.

### 4.7. Nivel de riesgo

Al derivar, el caso recibe el nivel más grave entre:

- el nivel del tipo de consulta;
- el nivel del motivo de derivación;
- el nivel de sus alertas sin atender (esto se calcula para ordenar la bandeja).

Niveles: `crítico` (1), `alto` (2), `medio` (3), `bajo` (4).

Un siniestro grave puede subir de `alto` a `crítico`. El cliente nunca ve el nivel.

---

## 5. Base de datos

### 5.1. Entidades principales

| Tabla | Función |
|---|---|
| `cliente` | Persona por DNI o empresa por CUIT y razón social. Registro único. |
| `telefono` | Número normalizado, esté o no vinculado a un cliente. |
| `cliente_telefono` | Relación N:M entre clientes y teléfonos. |
| `compania_aseguradora` | Compañía de la póliza. Hoy se asume Seguros Castaño. |
| `ramo` | Catálogo: auto, moto, vida, hogar, embarcaciones, comercio. |
| `plan` | Catálogo de planes, genérico para cualquier ramo. |
| `bien_asegurado` | Vehículo, inmueble, embarcación o comercio asegurado. |
| `poliza` | Contrato: titular, compañía, ramo, bien, vigencia, prima, moneda y estado. |
| `estado_poliza` | Activa, suspendida por mora, dada de baja. |
| `cobertura` | Cobertura de una póliza, asociada a un plan. |
| `beneficiario` | Beneficiarios de seguros de vida. |
| `cuota` | Vencimiento, importe y fecha de pago. |
| `siniestro` | Siniestro con numeración y estado. |
| `conductor` / `poliza_conductor` | Conductores agregados a pólizas. |
| `conversacion` | Sesión de WhatsApp con un teléfono. Guarda si el asistente está suspendido. |
| `caso` | Una consulta. Guarda tipo, responsable, nivel de riesgo, póliza y fechas. |
| `mensaje` | Cada mensaje del caso, con origen y fecha. |
| `respuesta` | Texto generado, escrito por operador o corrección. |
| `verificacion` | Resultado del control previo al envío. |
| `alerta` | Alerta concreta sobre un caso o una respuesta. |
| `prospecto` | Datos de un cliente nuevo pendiente de confirmación. |
| `solicitud_accion` | Pedido de baja, modificación, alta de conductor o cambio de teléfono. |
| `usuario` / `rol` | Usuarios de la agencia y perfiles. |
| `parametro_configuracion` | Parámetros configurables y datos de la agencia. |
| `horario_atencion` | Días y horas de atención humana. |
| `auditoria` | Prevista para el MVP 2; **no existe todavía**. |

### 5.2. Catálogos

- **Ramos:** auto, moto, vida, hogar, embarcaciones, comercio.
- **Estados de póliza:** activa, suspendida por mora, dada de baja.
- **Estados de siniestro:** registrado, en gestión, cerrado.
- **Roles:** administrador, operador.
- **Origen de mensaje:** cliente, asistente, operador.
- **Tipos de consulta:** saldo, vencimiento, estado de póliza, cobertura, siniestro, cotización, baja, modificación, reclamo, saludo, cambio de teléfono, información de la agencia.
- **Estados de prospecto:** pendiente, confirmado, descartado.
- **Resultado de verificación:** aprobada, retenida.
- **Nivel de riesgo:** crítico, alto, medio, bajo.
- **Tipos de acción:** baja de póliza, modificación de póliza, alta de conductor, cambio de teléfono.
- **Estados de solicitud:** pendiente, aprobada, rechazada, aplicada.

### 5.3. Datos que se calculan, no se guardan

- **Estado del caso:** cerrado si tiene `fecha_cierre`; en atención si tiene `fecha_toma`; derivado si tiene `fecha_derivacion`; si no, abierto.
- **Vigencia de la póliza:** vencida si `fecha_vencimiento` es anterior a hoy en Argentina.
- **Número nuevo de un cambio de teléfono:** sale de la conversación del caso.
- **Tipo de respuesta:** generada por el asistente si `id_usuario` es nulo; escrita por operador si no; corrección si tiene `id_respuesta_origen`.

### 5.4. Reglas de integridad destacadas

- DNI, CUIT, teléfono, patente y número de póliza por compañía son únicos.
- Una persona o empresa debe tener el grupo completo de datos.
- Las fechas de un caso respetan el orden apertura ≤ derivación ≤ toma ≤ cierre.
- Un caso tomado tiene responsable; una alerta atendida registra quién y cuándo; una solicitud decidida registra quién, cuándo y fundamento.
- Las entidades maestras usan baja lógica (`activo`). Los registros históricos (mensajes, respuestas, alertas, cuotas) no se borran.

---

## 6. API HTTP

| Método | Ruta | Función |
|---|---|---|
| POST | `/webhooks/whatsapp` | Recibe mensajes de WAHA |
| GET | `/health` | Estado del backend |
| GET | `/api/tramites/prospectos` | Lista altas de prospectos pendientes |
| POST | `/api/tramites/prospectos/:id/decision` | Aprueba o rechaza un alta |
| GET | `/api/tramites/cambios-telefono` | Lista cambios de teléfono pendientes |
| POST | `/api/tramites/cambios-telefono/:id/decision` | Aprueba o rechaza un cambio de teléfono |
| POST | `/api/tramites/cambios-telefono/:id/notificacion` | Reintenta el aviso de una decisión |
| GET | `/api/clientes` | Lista y busca clientes |
| GET | `/api/clientes/:id` | Detalle de un cliente con pólizas y teléfonos |
| POST | `/api/clientes` | Alta de cliente |
| PATCH | `/api/clientes/:id` | Edición de identidad |
| DELETE | `/api/clientes/:id` | Baja lógica |
| POST | `/api/clientes/:id/telefonos` | Vincula teléfono |
| DELETE | `/api/clientes/:id/telefonos/:telefonoId` | Desvincula teléfono |
| POST | `/api/clientes/:id/polizas` | Alta de póliza |
| PATCH | `/api/polizas/:id` | Edición de póliza |
| PUT | `/api/polizas/:id/coberturas` | Reemplaza coberturas |
| GET | `/api/catalogos` | Ramos, planes, monedas y estados |
| GET | `/api/bandeja` | Bandeja priorizada y paginada |
| GET | `/api/bandeja/:idCaso` | Detalle y conversación del caso |
| POST | `/api/bandeja/:idCaso/toma` | Toma el caso |
| POST | `/api/bandeja/:idCaso/liberacion` | Libera el caso |
| POST | `/api/bandeja/:idCaso/respuestas` | Responde al cliente por WhatsApp |
| POST | `/api/bandeja/:idCaso/cierre` | Cierra el caso |
| GET | `/api/bandeja/:idCaso/mensajes/:idMensaje/imagen` | Obtiene una imagen desde WAHA sin guardarla |

Errores: `400` validación, `404` no encontrado, `409` transición inválida, `401` secreto de webhook incorrecto.

---

## 7. Frontend

### 7.1. Pantallas

| Módulo | Archivo | Estado en `origin/main` |
|---|---|---|
| Login | `pages/Login.tsx` | Completo, simulado |
| Dashboard | `pages/Dashboard.tsx` | Completo, con placeholders para métricas |
| Bandeja de Atención | `pages/BandejaAtencion.tsx` | Completo: lista, detalle, chat, tomar, responder, cerrar, imágenes, prioridad |
| Trámites por Aprobar | `pages/TramitesAprobar.tsx` | Solo estado vacío; la API de trámites sí existe |
| Base de Clientes | `pages/BaseClientes.tsx` | Completo: búsqueda, ficha, ABM de cliente, teléfonos y pólizas |

### 7.2. Navegación y roles

- `admin` y `operador`, contraseña `1234`, login simulado en el cliente.
- El administrador entra al Dashboard; el operador entra a la Bandeja.
- El backend atribuye todas las acciones del panel al usuario de prueba `operador`.
- La autenticación real y la autorización por rol quedan para el Parcial 2.

### 7.3. Diseño

- Paleta castaño y crema definida en `docs/design.md`.
- Tokens CSS en `index.css`; estilos de componentes y pantallas en `App.css`.
- Efecto "Liquid Glass" moderado en sidebar, tarjetas y búsqueda.
- Tablas y formularios con fondos sólidos para asegurar legibilidad.
- Responsive con breakpoints en 768 px y 1024 px.
- Estados siempre con texto e icono, nunca solo color.

---

## 8. Explicación archivo por archivo

### 8.1. Raíz del repositorio

| Archivo | Explicación |
|---|---|
| `README.md` | Presentación del proyecto, stack, puesta en marcha, WAHA, migraciones, estructura, documentación y entregas. Es la puerta de entrada. |
| `AGENTS.md` | Reglas de negocio, alcance, convenciones, seguridad, flujo de trabajo, comandos de verificación, decisiones abiertas y skills. Es la constitución del proyecto. |
| `docker-compose.yml` | Define `db`, `backend`, `frontend` y `waha`. El backend aplica migraciones antes de arrancar. MySQL corre en UTC. WAHA solo se levanta con el perfil `whatsapp`. |
| `.env.example` | Plantilla de variables: base, IA, WhatsApp y WAHA. No contiene secretos reales. |
| `.gitignore` | Excluye dependencias, builds, `.env`, sesiones de WAHA y archivos generados. |

### 8.2. Skills para asistentes de IA (`.claude/skills/`)

| Archivo | Explicación |
|---|---|
| `dominio-seguros/SKILL.md` | Reglas, flujos y estados del negocio de seguros. |
| `backend-datos/SKILL.md` | API, Prisma, MySQL y consistencia; flujo SQL-first. |
| `frontend-panel/SKILL.md` | Panel, UX, accesibilidad y cumplimiento de `docs/design.md`. |
| `frontend-design/SKILL.md` | Proceso de diseño visual para UI nueva, adaptado a la paleta fija del proyecto. |
| `frontend-design/LICENSE.txt` | Licencia Apache 2.0 del material original de Anthropic. |
| `verificacion-seguridad/SKILL.md` | IA, privacidad, autorización y auditoría. |

Estos archivos no forman parte del runtime; son instrucciones para que los asistentes de código respeten las reglas del proyecto.

### 8.3. Configuración de OpenCode (`.opencode/`)

| Archivo | Explicación |
|---|---|
| `agents/spec.md` | Agente que planifica cambios escribiendo solo en `openspec/`. |
| `agents/revisor-spec.md` | Agente de solo lectura que revisa un change. |
| `commands/opsx-apply.md` | Aplica las tareas de un change. |
| `commands/opsx-archive.md` | Archiva un change terminado. |
| `commands/opsx-explore.md` | Explora el estado de las specs. |
| `commands/opsx-propose.md` | Propone un change nuevo. |
| `commands/opsx-sync.md` | Sincroniza specs con el código. |
| `commands/opsx-update.md` | Actualiza un change en curso. |

### 8.4. Backend: configuración y contenedor

| Archivo | Explicación |
|---|---|
| `backend/package.json` | Dependencias y scripts: `dev`, `test`, `migrar-planilla`, `cargar-cuotas-ejemplo`, `postinstall`. |
| `backend/package-lock.json` | Árbol exacto de dependencias. Generado por npm. |
| `backend/tsconfig.json` | Configuración TypeScript estricta, módulos ESM y salida. |
| `backend/Dockerfile` | Imagen `node:24-slim` con OpenSSL, necesaria para Prisma. |
| `backend/.gitignore` | Excluye `node_modules`, generados y archivos locales. |
| `backend/README.md` | Documenta las APIs de trámites y cartera: contratos, ejemplos y códigos de error. |
| `backend/prisma7.config.ts` | Configuración de Prisma 7 (adapter y ruta del esquema). |

### 8.5. Backend: composición y entrada

| Archivo | Explicación |
|---|---|
| `backend/src/index.ts` | Crea el adaptador MariaDB, el cliente Prisma, WAHA, Groq y todos los casos de uso. Resuelve el actor del panel como `operador` y arranca Express. |
| `backend/src/http/app.ts` | Define el webhook y todas las rutas REST. Valida el secreto, parsea paginación, traduce errores de dominio a HTTP y protege el webhook con una cola por remitente. |
| `backend/src/infrastructure/config.ts` | Lee y valida las variables de entorno obligatorias. Falla al arrancar si falta alguna. |

### 8.6. Backend: aplicación

| Archivo | Explicación |
|---|---|
| `process-incoming-message.ts` | Corazón del bot. Identifica, clasifica, decide la acción, arma la plantilla, pide la redacción, valida, guarda y responde. Maneja prospectos, cambio de teléfono, derivaciones, riesgo, imágenes y silencio. |
| `manage-inbox.ts` | Casos de uso de la bandeja: listar, ver detalle, tomar, liberar, responder y cerrar. Valida responsable, estado, motivo, alertas y confirmaciones. |
| `manage-requests.ts` | Casos de uso de trámites: listar prospectos y cambios de teléfono, aprobar o rechazar, aplicar vínculos y notificar por WhatsApp. |
| `manage-customers.ts` | Consulta de cartera: listado con búsqueda, paginación y detalle por cliente. |
| `manage-customer-edits.ts` | ABM de cartera: alta y edición de clientes, vínculos de teléfono, alta y edición de pólizas y reemplazo de coberturas. |

### 8.7. Backend: dominio

| Archivo | Explicación |
|---|---|
| `ai-client.ts` | Interfaces del proveedor de IA: clasificación de intención, urgencia, redacción y estado del cliente. |
| `whatsapp-client.ts` | Interfaz del canal: enviar texto, enviar imagen, resolver `@lid` y descargar imagen. |
| `message.ts` | Tipo normalizado de mensaje entrante de WhatsApp. |
| `intent.ts` | Lista cerrada de intenciones, acción asociada y límite de repreguntas. |
| `conversation.ts` | Modelo de conversación, casos, mensajes, contexto, cierre por inactividad y cierre por reinicio. |
| `customer.ts` | Tipos de cliente, póliza, cobertura, cuota y contrato del repositorio de cartera. |
| `customer-edits.ts` | Validación y tipos de entrada para el ABM de cartera. |
| `dni.ts` | Búsqueda y enmascarado de DNI en textos. |
| `templates.ts` | Textos fijos y plantillas de respuesta: derivación, DNI, prospecto, saldo, vencimiento, cortesía, etc. También calcula vencimiento con hora argentina. |
| `balance.ts` | Agrupa cuotas vencidas y por vencer, formatea importes con moneda y arma la plantilla de saldo. |
| `agency-info.ts` | Arma la respuesta de información de la agencia y valida que estén todos los datos. |
| `rewrite-check.ts` | Verifica que la redacción del modelo conserve números, fechas, importes, monedas, ramos, planes, dirección, teléfono y horario. Rechaza links y términos prohibidos. |
| `risk-level.ts` | Define niveles, orden, urgencia, nivel por tipo de consulta, por motivo y el más grave. |
| `handoff.ts` | Motivos de derivación y su descripción; distingue datos faltantes y fallas del proveedor. |
| `case-actions.ts` | Decisiones puras de tomar, liberar, responder y cerrar; errores y planes de cierre. |
| `inbox.ts` | Modelo de la bandeja: entradas, mensajes, alertas, etiquetas, espera y orden por gravedad. |
| `request-management.ts` | Modelo de trámites: prospectos, cambios de teléfono, decisiones, resultados y errores. |

### 8.8. Backend: infraestructura

| Archivo | Explicación |
|---|---|
| `openai-compatible-client.ts` | Cliente de Groq. Arma los prompts de clasificación y redacción, exige salida estructurada y valida la respuesta. |
| `waha-webhook.ts` | Valida el secreto, parsea el payload de WAHA, decide qué ignorar y enmascara datos para los logs. |
| `waha-whatsapp-client.ts` | Envía textos e imágenes por WAHA, resuelve `@lid`, descarga imágenes y controla tamaño y tipo. |
| `keyed-queue.ts` | Cola que serializa el procesamiento por clave (teléfono), para respetar el orden de los mensajes. |
| `prisma-conversation-store.ts` | Persiste conversaciones, casos, mensajes, respuestas, prospectos y cambios de teléfono. Aplica silencio y cierres. |
| `prisma-customer-repository.ts` | Consulta clientes, teléfonos, pólizas, coberturas y cuotas; arma listado y detalle. |
| `prisma-customer-edit-repository.ts` | Altas y ediciones de cartera en transacciones; normaliza fechas y valida ventanas de vigencia. |
| `prisma-request-management-repository.ts` | Persiste decisiones de trámites, aplica vínculos de teléfono y cierra casos. |
| `prisma-inbox-repository.ts` | Consulta la bandeja con orden SQL por gravedad, estado y espera; arma entradas, detalle, alertas y acciones. |
| `prisma-case-closing.ts` | Funciones de toma y cierre de casos, liberación de silencio y búsqueda del usuario de prueba. |
| `prisma-agency-info.ts` | Lee ramos, planes, horario, dirección y teléfono desde la base. |
| `in-memory-conversation-store.ts` | Implementación en memoria para pruebas. |
| `in-memory-customer-repository.ts` | Repositorio en memoria a partir de fixtures, para pruebas. |
| `in-memory-agency-info.ts` | Fuente de información de agencia en memoria, para pruebas. |

### 8.9. Backend: Prisma y migraciones

| Archivo | Explicación |
|---|---|
| `prisma/schema.prisma` | Esquema generado con `prisma db pull`. Describe todas las tablas y relaciones. No se edita a mano. |
| `prisma/migrations/migration_lock.toml` | Fija el motor de migraciones en MySQL. |
| `20260928140000_esquema_inicial/migration.sql` | Crea el esquema base del DER. |
| `20260928140100_catalogos/migration.sql` | Carga los catálogos iniciales. |
| `20260929204929_caso_poliza_cambio_telefono_usuarios_prueba/migration.sql` | Agrega `caso.id_poliza`, los tipos de cambio de teléfono y los usuarios de prueba. |
| `20261007174525_asistente_suspendido_conversaciones_abiertas/migration.sql` | Agrega `asistente_suspendido` y ajusta conversaciones abiertas. |
| `20261007235643_informacion_agencia/migration.sql` | Carga parámetros de dirección, teléfono y horario de la agencia. |
| `20261015185550_mensaje_id_imagen_whatsapp/migration.sql` | Agrega la referencia al mensaje de imagen de WhatsApp. |

### 8.10. Backend: scripts, fixtures y planilla

| Archivo | Explicación |
|---|---|
| `scripts/migrar-planilla.ts` | Lee el Excel limpio, valida todo y carga clientes, pólizas, teléfonos, casos, conversaciones, alertas y usuarios históricos en una transacción. |
| `scripts/cargar-cuotas-ejemplo.ts` | Carga cuotas ficticias para dos clientes migrados, para poder demostrar la consulta de saldo. |
| `scripts/cuotas-ejemplo.ts` | Lógica pura de generación de cuotas de ejemplo. |
| `scripts/cuotas-ejemplo.test.ts` | Pruebas de la generación de cuotas. |
| `fixtures/clientes-ficticios.json` | Clientes y pólizas ficticios para pruebas automatizadas. No son datos reales. |
| `planilla/Caso8_seguros_bot_datos_limpios.xlsx` | Planilla histórica limpia. Es la fuente de la migración. |

### 8.11. Base de datos: inicialización

| Archivo | Explicación |
|---|---|
| `db/init/01-prisma-shadow-db.sh` | Crea la base "shadow" que Prisma necesita para comparar migraciones. Se ejecuta al crear el contenedor de MySQL. |

### 8.12. Frontend: configuración

| Archivo | Explicación |
|---|---|
| `frontend/package.json` | Dependencias React, Vite, ESLint y scripts `dev`, `build`, `lint`, `preview`. |
| `frontend/package-lock.json` | Árbol exacto de dependencias. |
| `frontend/vite.config.ts` | Configuración de Vite y plugin de React. |
| `frontend/index.html` | Documento raíz; monta la aplicación. |
| `frontend/tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | Configuración TypeScript del proyecto, de la app y de Vite. |
| `frontend/eslint.config.js` | Reglas de lint para React, hooks y refresh. |
| `frontend/.gitignore` | Excluye dependencias, build y archivos locales. |
| `frontend/README.md` | Notas de la plantilla de Vite. |
| `frontend/public/favicon.svg` | Ícono del panel. |

### 8.13. Frontend: código fuente

| Archivo | Explicación |
|---|---|
| `src/main.tsx` | Punto de entrada de React; monta `App`. |
| `src/App.tsx` | Shell: decide login o panel, navegación, sidebar, capa ambiental y página activa. |
| `src/navigation.ts` | Catálogo de módulos con id, nombre, descripción e ícono. |
| `src/usuario.ts` | Tipo de usuario y creación de los usuarios de prueba `admin` y `operador`. |
| `src/index.css` | Reset, tokens de color, tipografía y estilos globales. |
| `src/App.css` | Estilos de login, panel, sidebar, tablas, tarjetas, bandeja, chat, modales, formularios y responsive. |
| `src/api/clientes.ts` | Cliente HTTP de cartera: listado, detalle, alta, edición, baja, teléfonos y pólizas. |
| `src/api/catalogos.ts` | Cliente HTTP de catálogos. |
| `src/api/bandeja.ts` | Cliente HTTP de la bandeja: listar, detalle, tomar, liberar, responder, cerrar e imagen. |
| `src/api/usuarios.ts` | Tipos y funciones de usuario del panel. |
| `src/api/respuesta.ts` | Utilidades para leer respuestas y errores de la API. |
| `src/components/Sidebar.tsx` | Navegación lateral, marca, usuario y cierre de sesión; menú móvil. |
| `src/components/PageHeader.tsx` | Encabezado reutilizable de página. |
| `src/components/EstadoPanel.tsx` | Estado vacío o informativo con título, descripción y acciones. |
| `src/components/ConfirmarCambio.tsx` | Modal de confirmación que muestra valor actual y nuevo. |
| `src/components/FormularioCliente.tsx` | Alta y edición de cliente; el DNI no se modifica. |
| `src/components/FormularioPoliza.tsx` | Alta y edición de póliza, bien asegurado y coberturas. |
| `src/components/ChatHeader.tsx` | Cabecera del chat con cliente, prioridad, alertas y acciones. |
| `src/components/iconos.tsx` | Íconos SVG propios: módulos, estados, alerta, reloj, menú, saludo, etc. |
| `src/pages/Login.tsx` | Login simulado con validación y usuarios de prueba. |
| `src/pages/Dashboard.tsx` | Vista del administrador con indicadores y estado vacío; el operador ve un acceso directo a la bandeja. |
| `src/pages/BandejaAtencion.tsx` | Lista priorizada, detalle de conversación, imágenes, respuesta, toma, liberación y cierre con confirmación. Se actualiza cada 5 segundos. |
| `src/pages/TramitesAprobar.tsx` | Estado vacío de trámites; la pantalla completa queda pendiente. |
| `src/pages/BaseClientes.tsx` | Búsqueda, ficha, alta, edición, baja, teléfonos y pólizas con confirmación. |

### 8.14. Documentación (`docs/`)

| Archivo | Explicación |
|---|---|
| `requisitos.md` | Los 29 requisitos funcionales con su origen en el material del cliente. |
| `design.md` | Sistema de diseño: tokens, paleta, tipografía, componentes, accesibilidad y responsive. Es obligatorio para todo el frontend. |
| `caso8_der.md` | DER, convenciones, entidades por módulo, datos calculados, restricciones y decisiones de modelado. |
| `caso8_der.puml` | Fuente PlantUML del DER. |
| `caso8_der.png` / `caso8_der.svg` | Diagramas exportados. El SVG y el PNG no incluyen el último cambio de `mensaje.id_imagen_whatsapp`. |
| `caso8_diagrama_contexto.puml` | Diagrama de contexto (DFD nivel 0). |
| `caso8_tabla_de_eventos.md` | 24 eventos de negocio, estímulos, respuestas y requisitos asociados. |
| `migracion.md` | Reglas de la migración de la planilla, datos que se saltean, cuotas de ejemplo y usuarios históricos. |
| `01_esquema.sql` | Esquema MySQL del Hito 0. No se ejecuta; el vigente está en las migraciones. |
| `02_catalogos.sql` | Catálogos del Hito 0. No se ejecuta. |

### 8.15. OpenSpec: configuración y specs

| Archivo | Explicación |
|---|---|
| `openspec/config.yaml` | Configuración de OpenSpec. |
| `openspec/README.md` | Guía de uso de OpenSpec en el proyecto. |
| `openspec/specs/atencion-automatizada/spec.md` | Comportamiento del bot: recepción, identificación, intenciones, respuestas, saldo, verificación, prospectos, agencia y repreguntas. |
| `openspec/specs/cartera/spec.md` | Registro único, migración, teléfonos, cambio de teléfono y cuotas de ejemplo. |
| `openspec/specs/derivacion-seguimiento/spec.md` | Silencio, riesgo, tomar, responder y cerrar casos. |
| `openspec/specs/panel-supervision/spec.md` | Conversaciones guardadas, bandeja priorizada, detalle, imágenes y cierre con alertas. |
| `openspec/specs/aprobacion-acciones-criticas/spec.md` | El asistente nunca ejecuta acciones contractuales. |

### 8.16. OpenSpec: changes archivados

Cada carpeta representa un cambio terminado y archivado. Contiene `.openspec.yaml` (metadatos), `proposal.md` (propuesta), `design.md` (diseño), `tasks.md` (tareas) y una o más specs.

| Change | Contenido |
|---|---|
| `2026-09-29-migracion-sql-parcial-1` | Migración SQL inicial; spec de cartera. |
| `2026-10-05-asistente-respuestas-limitadas` | Asistente sin base, respuestas limitadas; specs de atención, derivación y aprobación. |
| `2026-10-05-canal-whatsapp-waha` | Canal WAHA; spec de atención. |
| `2026-10-06-migracion-planilla-parcial-1` | Migración de la planilla; spec de cartera. |
| `2026-10-08-asistente-con-base` | Asistente conectado a la base; specs de atención, cartera, derivación y panel. |
| `2026-10-08-asistente-informacion-general` | Información de agencia y contexto; spec de atención. |
| `2026-10-13-asistente-responde-saldo` | Respuesta de saldo; specs de atención y cartera. |
| `2026-10-15-bandeja-atencion-lectura` | Bandeja de solo lectura y nivel de riesgo; specs de derivación y panel. |
| `2026-10-15-bandeja-atender-casos` | Tomar, responder, cerrar e imágenes; specs de atención, derivación y panel. |

### 8.17. Pruebas automatizadas

| Archivo | Qué cubre |
|---|---|
| `application/manage-inbox.test.ts` | Listar, tomar, liberar, responder y cerrar casos; errores y permisos. |
| `application/process-incoming-message.test.ts` | Identificación, intenciones, derivaciones, prospectos, silencio y verificación. |
| `domain/agency-info.test.ts` | Respuesta de información de agencia y datos faltantes. |
| `domain/balance.test.ts` | Cuotas vencidas y por vencer, monedas y formato. |
| `domain/case-actions.test.ts` | Decisiones de tomar, liberar, responder y cerrar. |
| `domain/conversation.test.ts` | Casos, contexto, cierre por inactividad y reinicio. |
| `domain/customer-edits.test.ts` | Validación de altas y ediciones de cartera. |
| `domain/dni.test.ts` | Búsqueda y enmascarado de DNI. |
| `domain/handoff.test.ts` | Motivos y descripciones de derivación. |
| `domain/inbox.test.ts` | Etiquetas, espera y orden por gravedad. |
| `domain/intent.test.ts` | Lista de intenciones y acción asociada. |
| `domain/rewrite-check.test.ts` | Redacciones válidas y rechazadas. |
| `domain/risk-level.test.ts` | Niveles por tipo, motivo y urgencia. |
| `domain/templates.test.ts` | Plantillas y cálculo de vencimiento. |
| `http/app.test.ts` | Webhook, rutas, validaciones, errores y secreto. |
| `infrastructure/in-memory-conversation-store.test.ts` | Persistencia en memoria. |
| `infrastructure/in-memory-customer-repository.test.ts` | Repositorio en memoria y fixtures. |
| `infrastructure/openai-compatible-client.test.ts` | Prompts, salida estructurada y errores del proveedor. |
| `infrastructure/prisma-agency-info.test.ts` | Lectura de información de agencia desde la base. |
| `infrastructure/prisma-customer-edit-repository.test.ts` | Altas y ediciones en base. |
| `infrastructure/prisma-customer-repository.test.ts` | Listado y detalle de cartera. |
| `infrastructure/prisma-inbox-repository.test.ts` | Orden, paginación, detalle y acciones de la bandeja. |
| `infrastructure/waha-webhook.test.ts` | Parseo de WAHA, secretos y datos ignorados. |
| `infrastructure/waha-whatsapp-client.test.ts` | Envío, `@lid`, imágenes y límites. |
| `scripts/cuotas-ejemplo.test.ts` | Generación de cuotas de ejemplo. |

---

## 9. Commits y autores

### 9.1. Totales por autor

Se contabilizan los 106 commits publicados en `origin/main` entre el 16/09/2026 y el 22/10/2026.

| Autor | Commits | Detalle |
|---|---:|---|
| Santiago Luque | 53 | `luquesantiago` (32) + `Santiago Luque` (21) |
| Valentino Villella | 21 | |
| Maia Yael Rodriguez | 15 | `MaiaYaeel` (14) + merge a su nombre (1) |
| Valentina Herrera | 11 | `valentinaherrera-01` (8) + `Valentina Herrera` (3) |
| Alejo | 6 | `alejocabecas-commits` (3) + `Alejo` (3) |
| **Total** | **106** | |

Se abrieron y mergearon **31 pull requests** (`#1` a `#31`).

### 9.2. Hitos del historial

| Fecha | Commit | Autor | Aporte |
|---|---|---|---|
| 16/09/2026 | `3e7cc9e` | Santiago Luque | Commit inicial |
| 17/09/2026 | `9bc9e4f` | Santiago Luque | Docker de desarrollo y frontend Vite |
| 21/09/2026 | `feda020` | Santiago Luque | Backend Express + Prisma |
| 22/09/2026 | `36ee9fd` | Santiago Luque | Fechas en UTC |
| 23/09/2026 | `3ad9f22` | Santiago Luque | Documentación del Hito 0 y skills |
| 24/09/2026 | `85a88d8` | Santiago Luque | OpenSpec y agentes |
| 24/09/2026 | `fc29e99` | Santiago Luque | Fuera de horario y alertas |
| 28/09/2026 | `6d0af8a` | Santiago Luque | Migraciones SQL-first |
| 29/09/2026 | `cff5900`, `4c5648e`, `ad2d851`, `b99ac06` | Valentina Herrera | Base visual, navegación, componentes y shell del panel |
| 01/10/2026 | `d614ad7` | Maia Yaeel | Login simulado con roles |
| 05/10/2026 | `db6b4e4` | Santiago Luque | Canal WhatsApp con WAHA |
| 05/10/2026 | `f81bd1d` | Santiago Luque | Asistente con respuestas limitadas |
| 06/10/2026 | `76f18ce` | Santiago Luque | Migración de la planilla |
| 07/10/2026 | `ab2584c` | Santiago Luque | Asistente con base y silencio persistente |
| 07/10/2026 | `466cd9a`, `a8fc545` | Valentino Villella | API y panel de cartera |
| 08/10/2026 | `f553a26` | Santiago Luque | Información de agencia, contexto y repreguntas |
| 13/10/2026 | `ef979e2` | Santiago Luque | Respuesta de saldo |
| 15/10/2026 | `8499aad` | Santiago Luque | Bandeja de solo lectura y riesgo |
| 15/10/2026 | `d5c60e5` | Santiago Luque | Tomar, contestar y cerrar desde la bandeja |
| 15/10/2026 | `28aeeb0`, `259cbeb` | Valentino Villella | ABM de cartera y alta de pólizas |
| 16/10/2026 | `be63120` | Valentino Villella | Implementación de `docs/design.md` |
| 17/10/2026 | `90fc339`, `b900cce`, `3e16be3` | Valentina Herrera | Design system: tokens, navegación y componentes |
| 18/10/2026 | `6ed7e90` | Valentino Villella | Skill `frontend-design` |
| 22/10/2026 | `911efc2`, `e2da1b4` | Maia Yaeel | Semáforo de prioridades, alertas e intervenir/reanudar |
| 22/10/2026 | `c8628b8` | Maia Yael Rodriguez | Merge final del PR #31 |

### 9.3. Cómo se trabajó

- Nadie pushea a `main`: cada tarea va en una rama `feature/<tema>` y entra por pull request.
- Cada integrante commitea con su propio usuario.
- Los mensajes citan los requisitos afectados (`RF-CAR`, `RF-ATE`, `RF-DER`, `RF-VER`, `RF-SUP`, `RF-APR`).
- Antes de abrir un PR se actualiza la rama con `main`.
- Hay commits de merge que conservan el nombre del autor del PR y otros que figuran como `Santiago Luque` por el merge.

---

## 10. Guion sugerido para la exposición

### Minuto 0 a 1: problema

La agencia pierde consultas repetitivas y no tiene trazabilidad. Graciela atiende llamados todo el día; no hay forma de saber si un caso se resolvió; el bot anterior inventaba datos.

### Minuto 1 a 2: solución

Tres capacidades: bot por WhatsApp con datos reales, derivación con seguimiento y panel de supervisión con aprobación humana. La cartera es la fuente de verdad.

### Minuto 2 a 4: arquitectura

Mostrar el diagrama: WAHA → backend → MySQL/Groq → panel. Explicar las cuatro capas y por qué la lógica vive en dominio y no en el prompt.

### Minuto 4 a 7: demo o recorrido

1. Cliente escribe por WhatsApp.
2. El bot identifica por número o DNI.
3. Consulta saldo o vencimiento y responde con datos de la cartera.
4. Si pide una baja, el bot avisa que queda en revisión y deja de responder.
5. El caso aparece en la Bandeja, priorizado por gravedad.
6. El operador toma, responde y cierra.
7. En Base de Clientes se ve la cartera y se puede editar.

### Minuto 7 a 9: base de datos y migración

Mostrar el DER y explicar: cliente único por DNI, teléfonos N:M, póliza → cobertura → plan, caso con fechas, silencio, riesgo y auditoría prevista. La planilla se migra con un script transaccional y las cuotas de ejemplo están marcadas como ficticias.

### Minuto 9 a 10: seguridad y control

- El bot no ejecuta acciones contractuales.
- Verificación de redacción antes de enviar.
- Alertas por manipulación, datos expuestos, dato falso y caso sin tomar.
- Aprobación humana con actor, fecha y fundamento.
- Secreto en el webhook y datos sensibles enmascarados en logs.

### Minuto 10 a 11: estado y próximos pasos

- Parcial 1: flujo de punta a punta y migración.
- Falta: pantalla completa de Trámites, métricas reales, auditoría, autenticación de servidor y autorización por rol.
- El clon local está atrasado; la versión publicada es la que se muestra.

### Minuto 11 a 12: cierre

La cartera manda. El bot informa. La persona decide. Todo queda registrado.

---

## 11. Aclaraciones y limitaciones

1. **El documento describe `origin/main`**, no el clon local atrasado.
2. **Trámites por Aprobar** todavía es una pantalla vacía; la API de trámites ya está implementada.
3. **Dashboard** muestra indicadores sin valores reales; las métricas quedan para el Parcial 2.
4. **Login** es simulado en el navegador; el backend atribuye todo a `operador`. La autenticación real queda para el Parcial 2.
5. **Auditoría** está modelada pero la tabla no existe hasta el MVP 2.
6. **Datos de ejemplo:** dirección, teléfono, cuotas y usuarios históricos están marcados como ficticios o provisorios en `docs/migracion.md` y `docs/caso8_der.md`.
7. **WAHA no es la API oficial de Meta.** Usa un WhatsApp vinculado por QR; mientras está levantado, contesta a cualquiera que escriba.
8. **La cartera migrada está vencida por fecha**, por lo que la demo de saldo muestra cuotas vencidas y la cartera activa puede dar 0.
9. **Las imágenes no se guardan:** solo se guarda el id del mensaje de WhatsApp y se piden a WAHA en el momento. WAHA las conserva 30 segundos.
10. **El repositorio es público:** las contraseñas de prueba y los secretos de ejemplo deben cambiarse antes de producción.
