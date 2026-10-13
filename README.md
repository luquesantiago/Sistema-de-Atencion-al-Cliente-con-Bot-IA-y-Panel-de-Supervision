# Sistema de Atención al Cliente con Bot IA y Panel de Supervisión

Trabajo integrador de Prácticas Pre Profesionales 1 (UNLa, 2026): Caso 8, Grupo 11. El cliente es Seguros Castaño, la agencia de seguros que plantea la cátedra.

El sistema tiene tres partes conectadas:

- **Atención automática por WhatsApp** para las consultas de rutina (saldo, vencimiento, estado de póliza), respondidas con datos de la cartera, y para las preguntas generales sobre la agencia (seguros, planes, dirección, teléfono y horario).
- **Derivación y seguimiento** por operadores cuando la consulta no se puede responder sola: siniestros, cotizaciones, reclamos o dudas.
- **Panel de supervisión**: verifica cada respuesta antes de enviarla, alerta riesgos y exige aprobación humana para bajas, modificaciones y altas de conductor.

## Stack

| Parte | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8 |
| Backend | Node.js 24 + TypeScript + Express 5 |
| Base de datos | MySQL 8.4 + Prisma 7 |
| Mensajería | WhatsApp con WAHA (motor GOWS, no oficial) |
| IA del asistente | Groq (`openai/gpt-oss-20b`) |
| Entorno | Docker Compose |

## Qué necesitás

- Docker con Docker Compose. En Windows: Docker Desktop con WSL 2 y Ubuntu.
- Git.
- Clonar el repo **dentro de WSL** (por ejemplo en `~/proyectos`), no en una carpeta de Windows: la recarga automática falla en esas carpetas.

No hace falta instalar Node: las dependencias se instalan dentro de los contenedores.

## Cómo levantarlo

```bash
git clone https://github.com/luquesantiago/Sistema-de-Atencion-al-Cliente-con-Bot-IA-y-Panel-de-Supervision.git
cd Sistema-de-Atencion-al-Cliente-con-Bot-IA-y-Panel-de-Supervision
cp .env.example .env          # y cambiar las contraseñas de ejemplo
docker compose up -d --build
```

| Servicio | Dirección |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3000 |
| MySQL | `localhost:3307` (usuario, contraseña y base del `.env`) |

Comandos útiles:

```bash
docker compose logs -f backend                # ver los logs de un servicio
docker compose exec backend npx prisma <...>  # Prisma se corre dentro del contenedor
docker compose down                           # apagar (los datos de MySQL se conservan)
docker compose down -v                        # apagar y borrar la base
```

Antes de abrir un pull request, con el entorno levantado:

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
docker compose exec backend npx tsc --noEmit
```

## WhatsApp (WAHA)

El asistente recibe y contesta por WhatsApp a través de [WAHA](https://waha.devlike.pro/) con el motor GOWS: un servicio no oficial que se conecta a WhatsApp Web por websocket, sin navegador, con un WhatsApp vinculado por QR. No es la API oficial de Meta, que exige verificar el negocio. WAHA le avisa cada mensaje al backend (`POST /webhooks/whatsapp`, con el header `X-Webhook-Secret`) y el backend contesta por la API de WAHA.

El servicio `waha` solo arranca con el perfil `whatsapp`: si no vas a probar WhatsApp, no hace falta levantarlo. El backend igual necesita las variables `WHATSAPP_*` en el `.env`, y si faltan las `WAHA_DASHBOARD_*`, compose avisa en cada comando: para las dos cosas alcanzan los valores de ejemplo de `.env.example`.

Para probarlo:

1. En el `.env`, cambiar los valores de ejemplo de `WHATSAPP_API_KEY`, `WHATSAPP_WEBHOOK_SECRET`, `WAHA_DASHBOARD_USERNAME` y `WAHA_DASHBOARD_PASSWORD`, porque el repo es público. Van sin `:` ni `;`. `WHATSAPP_API_URL` queda en `http://waha:3000`.
2. Crear la carpeta de la sesión antes del primer arranque (si la crea Docker, queda de root y WAHA no puede escribir en ella):
   ```bash
   mkdir -p ~/waha-sesion
   ```
3. Levantar el backend y WAHA (el frontend no hace falta):
   ```bash
   docker compose up -d db backend
   docker compose --profile whatsapp up -d waha
   ```
4. Entrar a http://localhost:8080/dashboard con el usuario y la contraseña del `.env`. En la sesión `seguros-castano`, escanear el QR con el teléfono (WhatsApp → Dispositivos vinculados). Hay que hacerlo enseguida: los QR duran unos 2 minutos y medio en total desde que arranca la sesión. El QR también sale en la terminal, con `docker compose logs -f --tail 40 waha`.
   - Si el QR vence, reiniciar **solo la sesión**. El botón para reiniciar o apagar el **servidor** del dashboard apaga el contenedor (el servicio va sin `restart`), y entonces hay que volver a levantarlo con `docker compose --profile whatsapp up -d waha`.
5. Ver que la sesión quede en `WORKING`. Los eventos se ven en vivo en http://localhost:8080/dashboard/event-monitor, y los mensajes procesados, en `docker compose logs -f backend`.
6. Al terminar, apagarlo. Mientras está levantado, el asistente le contesta a cualquiera que le escriba a ese número.
   ```bash
   docker compose --profile whatsapp stop waha
   ```

La sesión vinculada queda en `~/waha-sesion`, fuera del repo, y se reanuda sola la próxima vez que se levanta `waha`, sin pedir el QR. No se sube ni se comparte: con ella se puede usar ese WhatsApp.

## Base de datos y migraciones

El esquema de MySQL se maneja con migraciones SQL escritas a mano (SQL-first), en `backend/prisma/migrations`. `backend/prisma/schema.prisma` no se escribe a mano: se genera desde la base.

- Las migraciones pendientes se aplican solas cuando arranca el backend. Después de un `git pull` que trae migraciones nuevas: `docker compose restart backend`.
- Para cambiar la base:
  1. Crear la carpeta `backend/prisma/migrations/<AAAAMMDDHHMMSS>_<nombre>/` (fecha y hora en UTC) con un `migration.sql` que tenga el SQL del cambio.
  2. Aplicarla y regenerar el schema y el cliente:
     ```bash
     docker compose exec backend npx prisma migrate deploy
     docker compose exec backend npx prisma db pull
     docker compose exec backend npx prisma generate
     ```
  3. Commitear juntos la migración y `schema.prisma`.
- No usar `prisma migrate dev` y no editar una migración que ya está en `main`: el cambio va en una migración nueva.
- Si el backend no arranca por una migración (en los logs aparece P3005, P3009 o P3018), en desarrollo se arregla borrando la base, con lo que se pierden los datos de prueba: `docker compose down -v` y volver a levantar.

## Estructura

```
├── frontend/          # panel de supervisión (Vite + React)
├── backend/           # API, Prisma, WhatsApp e IA
├── db/init/           # scripts que MySQL corre al crear la base
├── docs/              # documentación de diseño del Hito 0
├── .claude/skills/    # skills para asistentes de IA (OpenCode y Claude Code)
├── .opencode/         # agentes y comandos de OpenCode
├── openspec/          # specs y cambios planificados con OpenSpec (opcional)
├── AGENTS.md          # reglas del proyecto para asistentes de IA
└── docker-compose.yml
```

## Documentación

En [`docs/`](docs/):

- [`requisitos.md`](docs/requisitos.md): los 29 requisitos funcionales (RF-CAR, RF-ATE, RF-DER, RF-VER, RF-SUP, RF-APR) con su origen en el material del cliente.
- [`caso8_der.md`](docs/caso8_der.md): DER, convenciones de la base y decisiones de modelado. Diagrama en [`caso8_der.svg`](docs/caso8_der.svg).
- [`01_esquema.sql`](docs/01_esquema.sql) y [`02_catalogos.sql`](docs/02_catalogos.sql): esquema en MySQL como quedó en el Hito 0. El vigente está en `backend/prisma/migrations`.
- [`caso8_tabla_de_eventos.md`](docs/caso8_tabla_de_eventos.md) y [`caso8_diagrama_contexto.puml`](docs/caso8_diagrama_contexto.puml): eventos de negocio y diagrama de contexto.
- [`migracion.md`](docs/migracion.md): reglas de la migración de la planilla histórica y de los usuarios. El Excel limpio no está en el repo.

Las reglas de negocio, las decisiones abiertas y las convenciones de código están resumidas en [`AGENTS.md`](AGENTS.md).

## Cómo trabajamos

- Nadie pushea a `main`: cada tarea va en una rama `feature/<tema>` y entra por pull request.
- Cada integrante commitea su propio trabajo.
- En el commit o el PR se citan los requisitos que toca (por ejemplo `RF-DER-03`).
- Antes de abrir el PR, actualizar la rama con `main`.
- Si usás OpenCode, toma las reglas de `AGENTS.md`, las skills de `.claude/skills/` y los agentes y comandos de `.opencode/`.
- Si usás Claude Code, toma las reglas de `AGENTS.md` y las skills de `.claude/skills/`. No crees un `CLAUDE.md` (tampoco con `/init`): si existe, Claude Code deja de leer `AGENTS.md`.
- Planificar una tarea con OpenSpec antes de programarla es opcional; la guía está en [`openspec/README.md`](openspec/README.md).

## Entregas

- **Hito 0**: propuesta técnica y arquitectura (stack, DER, wireframes y alcance).
- **Parcial 1 (08/10/2026)**: migración de los datos históricos, CRUD de las entidades principales y flujo operativo inicial.
- **Parcial 2 (05/11/2026)**: reglas de negocio complejas, reportes y métricas, y control de acceso por rol.
