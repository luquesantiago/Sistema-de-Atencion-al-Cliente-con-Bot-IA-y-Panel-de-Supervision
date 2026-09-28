# Specs con OpenSpec (SDD)

Spec-Driven Development: antes de programar una tarea se escribe y se revisa qué tiene que hacer el sistema (la spec), y recién después se implementa siguiendo esas tareas. Usamos [OpenSpec](https://github.com/Fission-AI/OpenSpec) con OpenCode. **Es opcional**: una tarea sin change se trabaja como siempre.

## Qué hay en el repo

| Ruta | Qué es |
|---|---|
| `openspec/config.yaml` | Contexto y reglas que OpenSpec le pasa a la IA: idioma, fuentes del proyecto, capacidades por módulo y cita de RF. |
| `openspec/changes/<nombre>/` | Un cambio en curso: `proposal.md` (qué y por qué), `specs/` (qué tiene que hacer el sistema), `design.md` (cómo) y `tasks.md` (pasos). |
| `openspec/specs/<módulo>/spec.md` | Comportamiento ya implementado. Empieza vacío y se completa al archivar cada change. |
| `.opencode/commands/opsx-*.md` | Comandos de OpenCode generados por OpenSpec. No se editan a mano. |
| `.opencode/agents/spec.md` | Agente para planificar: lee todo el repo, pero solo escribe en `openspec/`. |
| `.opencode/agents/revisor-spec.md` | Subagente que revisa un change contra los requisitos, el DER y `AGENTS.md`. Solo lectura. |

## Instalación (una vez, en la terminal de WSL)

La app sigue corriendo en Docker. Node hace falta en WSL solo para la CLI de OpenSpec.

```bash
# 1. Node 24 (LTS) con nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 24

# 2. OpenSpec, en la misma versión que generó los comandos del repo
npm install -g @fission-ai/openspec@1.13.2
openspec config set delivery commands   # que `openspec update` genere solo comandos, como están en el repo

# 3. OpenCode
curl -fsSL https://opencode.ai/install | bash
```

Después, dentro del repo: `opencode`, `/models` y elegir un modelo. Los modelos gratuitos de OpenCode Zen cambian seguido y pueden usar lo que les mandás para mejorar el modelo: no les pases datos reales ni secretos.

## Flujo de un cambio

1. Crear la rama desde `main` actualizado: `git switch -c feature/<tema>`.
2. En OpenCode, pasar al agente `spec` con Tab.
3. Opcional: `/opsx-explore` para pensar el cambio antes de escribirlo.
4. `/opsx-propose <qué querés, con los RF>`. Ejemplo: `/opsx-propose Horario de atención configurable por el administrador (RF-DER-04)`. Crea `openspec/changes/<nombre>/` y al final `revisor-spec` lo revisa.
5. Leer los cuatro archivos. Para corregir: `/opsx-update` o editar a mano.
6. Pasar al agente `build` y correr `/opsx-apply <nombre>`: implementa las tareas y las va tildando en `tasks.md`.
7. Verificar con los comandos de `AGENTS.md`.
8. Volver al agente `spec` y correr `/opsx-archive <nombre>`: mueve el change a `openspec/changes/archive/` y pasa sus requirements a `openspec/specs/`.
9. Commit y PR como siempre, citando los RF. El change archivado va en el mismo PR que el código.

## Convenciones

- Una capacidad por módulo de `docs/requisitos.md`: `cartera`, `atencion-automatizada`, `derivacion-seguimiento`, `verificacion-alertas`, `panel-supervision` y `aprobacion-acciones-criticas`.
- Specs en español. Quedan en inglés los encabezados de OpenSpec (`## ADDED Requirements`, `### Requirement:`, `#### Scenario:`), WHEN/THEN y SHALL/MUST, porque el validador los busca.
- Cada requirement termina con el RF del que sale, por ejemplo `(RF-DER-04)`.
- Para chequear la estructura de un change: `openspec validate <nombre> --strict`.

## Actualizar OpenSpec

```bash
npm install -g @fission-ai/openspec@<versión>
openspec config set delivery commands
openspec update
```

Commitear lo que cambie en `.opencode/commands/` y actualizar la versión en esta guía.
