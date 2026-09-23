# Sistema de Atención al Cliente con Bot IA y Panel de Supervisión

Trabajo integrador de Prácticas Pre Profesionales 1 (UNLa, 2026): Caso 8, Grupo 11. El cliente es Seguros Castaño, la agencia de seguros que plantea la cátedra.

El sistema tiene tres partes conectadas:

- **Atención automática por WhatsApp** para las consultas de rutina (saldo, vencimiento, estado de póliza), respondidas solo con datos de la cartera.
- **Derivación y seguimiento** por operadores cuando la consulta no se puede responder sola: siniestros, cotizaciones, reclamos o dudas.
- **Panel de supervisión**: verifica cada respuesta antes de enviarla, alerta riesgos y exige aprobación humana para bajas, modificaciones y altas de conductor.

## Stack

| Parte | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8 |
| Backend | Node.js 24 + TypeScript + Express 5 |
| Base de datos | MySQL 8.4 + Prisma 7 |
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

> Estado a septiembre de 2026: en `main` el backend todavía no tiene punto de entrada (`backend/src/index.ts`), así que la API no responde.

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

## Estructura

```
├── frontend/          # panel de supervisión (Vite + React)
├── backend/           # API, Prisma y (más adelante) integración con WhatsApp e IA
├── db/init/           # scripts que MySQL corre al crear la base
├── docs/              # documentación de diseño del Hito 0
├── .agents/skills/    # skills para asistentes de IA
├── AGENTS.md          # reglas del proyecto para asistentes de IA
└── docker-compose.yml
```

## Documentación

En [`docs/`](docs/):

- [`requisitos.md`](docs/requisitos.md): los 27 requisitos funcionales (RF-CAR, RF-ATE, RF-DER, RF-VER, RF-SUP, RF-APR) con su origen en el material del cliente.
- [`caso8_der.md`](docs/caso8_der.md): DER, convenciones de la base y decisiones de modelado. Diagrama en [`caso8_der.svg`](docs/caso8_der.svg).
- [`01_esquema.sql`](docs/01_esquema.sql) y [`02_catalogos.sql`](docs/02_catalogos.sql): esquema de referencia en MySQL.
- [`caso8_tabla_de_eventos.md`](docs/caso8_tabla_de_eventos.md) y [`caso8_diagrama_contexto.puml`](docs/caso8_diagrama_contexto.puml): eventos de negocio y diagrama de contexto.

Las reglas de negocio, las decisiones abiertas y las convenciones de código están resumidas en [`AGENTS.md`](AGENTS.md).

## Cómo trabajamos

- Nadie pushea a `main`: cada tarea va en una rama `feature/<tema>` y entra por pull request.
- Cada integrante commitea su propio trabajo.
- En el commit o el PR se citan los requisitos que toca (por ejemplo `RF-DER-03`).
- Antes de abrir el PR, actualizar la rama con `main`.
- Si usás OpenCode, lee solo `AGENTS.md` y las skills de `.agents/skills/`.

## Entregas

- **Hito 0**: propuesta técnica y arquitectura (stack, DER, wireframes y alcance).
- **Parcial 1 (08/10/2026)**: migración de los datos históricos, CRUD de las entidades principales y flujo operativo inicial.
- **Parcial 2 (05/11/2026)**: reglas de negocio complejas, reportes y métricas, y control de acceso por rol.
