# Design

## Context

El backend usa Express, casos de uso y repositorios Prisma sobre MySQL 8.4. El frontend `Dashboard.tsx` actualmente muestra valores vacíos y debe consumir un contrato común que también pueda ser completado por otros integrantes.

Este change implementa únicamente tres métricas y deja las otras dos en cero de forma explícita y temporal. No se persisten contadores calculados.

## Decisions

### 1. Contrato HTTP

`GET /api/dashboard/metrics` devuelve:

```json
{
  "casosDerivadosSinTomar": 0,
  "respuestasRetenidas": 0,
  "tramitesPorAprobar": 4,
  "alertasRiesgoAbiertas": 1,
  "consultasHoy": 10,
  "casosCerrados": 6,
  "resueltosPorBot": 8,
  "tasaAutomatizacion": 80,
  "volumenPorHora": [
    { "hora": "00hs", "cantidad": 0 },
    { "hora": "08hs", "cantidad": 3 },
    { "hora": "09hs", "cantidad": 5 }
  ]
}
```

Los números del ejemplo son ilustrativos. Todos los valores implementados deben calcularse en tiempo real con Prisma sobre MySQL, excepto `casosDerivadosSinTomar` y `respuestasRetenidas`, que devuelven `0` por compatibilidad mientras sus responsables implementan esas partes. `volumenPorHora` devuelve las 24 horas del día argentino, en orden, incluidas las horas con `cantidad: 0`; el ejemplo abrevia el array.

### 2. Criterios de cálculo

- `alertasRiesgoAbiertas` cuenta alertas con `fecha_atencion IS NULL` cuyo nivel sea `medio`, `alto` o `critico`. Cada alerta se cuenta una sola vez.
- `tramitesPorAprobar` suma prospectos con estado `pendiente` y solicitudes de acción con estado `pendiente`. No cuenta decisiones aprobadas, rechazadas, descartadas ni otros estados finales.
- El día de hoy se calcula en `America/Argentina/Buenos_Aires` y se convierte a un rango UTC (`inicioDelDia <= fecha < inicioDelDiaSiguiente`) para comparar contra las columnas `DateTime` de MySQL. Argentina no aplica horario de verano.
- `consultasHoy` cuenta casos con `fecha_apertura` dentro del rango de hoy.
- `casosCerrados` cuenta casos con `fecha_cierre` dentro del rango de hoy, aunque se hayan creado otro día.
- `resueltosPorBot` cuenta los casos creados hoy cuyo `fecha_derivacion` es `NULL`.
- `tasaAutomatizacion` es `Math.round((resueltosPorBot / consultasHoy) * 100)`; si `consultasHoy` es `0`, devuelve `0`.
- `volumenPorHora` agrupa los casos creados hoy por hora argentina y devuelve las 24 horas (`00hs` a `23hs`) con su cantidad, incluidas las que quedan en `0`.

El repositorio obtiene los casos que se crearon hoy o se cerraron hoy en una sola consulta Prisma y calcula el resumen en memoria; no se reconstruye desde la Bandeja paginada ni desde datos hardcodeados del frontend.

### 3. Transporte y acceso

La ruta se registra en `createApp` y delega en una capa de aplicación/repositorio, manteniendo la separación existente. El acceso sigue el contexto actual del MVP y no recibe un actor o rol desde el cuerpo del request. No se incorpora autenticación Bearer.

### 4. Dashboard

`Dashboard.tsx` carga las métricas al abrirse para el administrador. Mientras espera, muestra un estado de carga estable; si falla la API, muestra un error explícito y no convierte el error en ceros. Cuando responde, reemplaza los valores de las tarjetas de alertas y trámites y muestra la jornada actual en el gráfico y el resumen operativo.

La fila superior se organiza como una única grilla responsive de cuatro tarjetas: una columna en móvil, dos desde 640 px y cuatro desde 1024 px. El orden es «Casos derivados sin tomar», «Respuestas retenidas», «Trámites por aprobar» y «Alertas de riesgo abiertas». Cada tarjeta incluye un ícono en un contenedor con fondo semántico suave, etiqueta, valor en tipografía destacada y subtexto. Las dos primeras conservan `—` como valor provisional mientras sus métricas no estén implementadas; las dos últimas muestran los valores del endpoint.

Los íconos se implementan como SVG inline en `frontend/src/components/iconos.tsx`, reutilizando el componente base existente. Si falta un ícono, se agrega en ese mismo archivo y no se instala una librería externa. `frontend/package.json` y `frontend/package-lock.json` no incorporan `lucide-react` ni dependencias de iconografía o estilos porque `docs/design.md` exige CSS plano y prohíbe dependencias con fines visuales.

Los textos permanecen en español, los estados se expresan con texto además de color y se respetan los tokens y componentes definidos en `docs/design.md`.

### 5. Sección inferior: gráfico y resumen operativo

La sección inferior se divide en una grilla de tres columnas definida en `App.css` (`grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 1.5rem`). El gráfico ocupa dos columnas y el resumen una; por debajo de 1024 px la grilla colapsa a una sola columna.

El gráfico «Volumen de chats por hora» se dibuja con SVG inline nativo (`viewBox="0 0 500 150"`) a partir de `volumenPorHora`. El frontend calcula la cantidad máxima, escala cada cantidad a una coordenada Y, distribuye los puntos en X y arma con esos puntos el `<path>` de área suavizada; no hay coordenadas ni cantidades hardcodeadas. Una hora con `cantidad: 0` queda sobre la base del gráfico. El eje X se genera con las etiquetas del array recibido, sin una lista fija de horarios. Se mantiene el `<linearGradient>` con el color de marca `var(--color-primary)`.

No se agrega una librería de gráficos porque `docs/design.md` exige CSS plano y prohíbe dependencias con fines visuales; el SVG es parte del markup y los estilos complementarios viven en `App.css`.

El «Resumen operativo» consume los valores del endpoint: `consultasHoy`, `casosCerrados`, `resueltosPorBot` y `tasaAutomatizacion`. La barra de progreso usa `tasaAutomatizacion` como ancho dinámico y un indicador textual «Óptimo» (≥ 60 %) o «Moderado», con los pares semánticos de `docs/design.md` para que el estado no dependa solo del color.

## Alternatives considered

- **Calcular las métricas en React:** descartado porque la base es la fuente de verdad y las APIs operativas son paginadas.
- **Implementar las cinco métricas en este change:** descartado porque `casosDerivadosSinTomar` y `respuestasRetenidas` pertenecen a otras partes asignadas.
- **Persistir contadores:** descartado porque los valores se deducen de las entidades existentes.
