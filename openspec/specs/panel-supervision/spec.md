# panel-supervision Specification

## Purpose
Módulo «Panel de supervisión» de `docs/requisitos.md`: la conservación de las conversaciones, la bandeja de revisión, la corrección de respuestas, el cierre de casos, las métricas y el control de acceso por perfil (RF-SUP-01 a RF-SUP-07).

## Requirements

### Requirement: Cada conversación queda guardada

El sistema SHALL guardar cada mensaje de las conversaciones por WhatsApp que el asistente procesa, lo que escribe el cliente, lo que le envía el asistente y lo que le envía un empleado desde el panel, cada uno con su origen y su fecha y hora, en el caso de la consulta a la que pertenece, para que el equipo pueda revisar lo que preguntó el cliente y lo que se le respondió (RF-SUP-01).

#### Scenario: Consulta y respuesta
- **WHEN** un cliente identificado hace una consulta y el asistente le responde
- **THEN** el mensaje del cliente y la respuesta quedan guardados en el mismo caso, cada uno con su origen y su fecha y hora, y la respuesta queda enlazada al mensaje que responde

#### Scenario: Consulta escrita antes de identificarse
- **WHEN** el cliente escribe una consulta, el asistente le pide que se identifique y, ya identificado, responde esa consulta
- **THEN** la consulta, los mensajes de la identificación y la respuesta quedan guardados en el mismo caso, y la respuesta queda enlazada a la consulta

#### Scenario: Mensaje sin respuesta
- **WHEN** el cliente escribe un mensaje que el asistente no contesta, porque no es de seguros o porque la conversación está en silencio
- **THEN** el mensaje queda guardado igual, en un caso no cerrado de la conversación

#### Scenario: Foto sin copia
- **WHEN** el asistente procesa una foto que mandó el cliente
- **THEN** queda guardado un mensaje del cliente con un texto que dice que mandó una imagen y la referencia al mensaje de WhatsApp de esa imagen, y la imagen no se guarda

#### Scenario: Respuesta de un empleado
- **WHEN** un empleado le escribe al cliente desde la Bandeja de Atención
- **THEN** queda guardado en el caso un mensaje de origen operador con el texto enviado y su fecha y hora, y una respuesta con el empleado que la escribió

#### Scenario: Lo guardado no se pisa
- **WHEN** el asistente o un empleado guarda un mensaje nuevo
- **THEN** no borra ni modifica ningún mensaje ni respuesta guardados antes

### Requirement: Bandeja de atención de casos abiertos

El sistema SHALL mostrar en la Bandeja de Atención del panel una fila por cada conversación que tenga algún caso sin cerrar (`fecha_cierre IS NULL`), incluidos los casos atendidos por el asistente que no están derivados ni tienen un pendiente operativo; la fila representa al caso más relevante de esa conversación: el derivado si lo hay, si no el que tiene una solicitud de cambio de teléfono pendiente y, si no, el más reciente, y muestra los datos y permite las acciones de ese caso. Las filas se ordenan primero por gravedad, después los que no tienen responsable y después por mayor tiempo de espera, con la gravedad escrita y no solo en color, el cliente, el tipo de consulta, el motivo de la derivación cuando exista, el último mensaje, el responsable y el estado de derivación, y actualizándose sola cada pocos segundos mientras está abierta (RF-SUP-02). La gravedad de un caso es la más grave entre el nivel de riesgo del caso, el de sus alertas sin atender y el que corresponde a su tipo de consulta según la regla de derivación; un caso sin ninguno de los tres se muestra «Sin nivel», después de los de nivel bajo. La espera se cuenta desde la derivación o, si el caso no se derivó, desde la solicitud pendiente. Las fechas se muestran en hora argentina. Desde la bandeja, un empleado puede tomar, contestar y cerrar casos según los requirements de `derivacion-seguimiento`; los casos no derivados se muestran en modo de solo lectura.

El sistema SHALL calcular `handedOff` como verdadero únicamente cuando `caso.fecha_derivacion IS NOT NULL`, y como falso cuando `caso.fecha_derivacion IS NULL` (RF-SUP-01, RF-SUP-02).

#### Scenario: Orden por gravedad
- **WHEN** hay un caso derivado de reclamo, uno de siniestro grave y uno de consulta no entendida, todos sin tomar
- **THEN** la bandeja los muestra en este orden: el de siniestro con «Crítico», el de reclamo con «Alto» y el de consulta no entendida con «Bajo»

#### Scenario: A igual gravedad, primero los sin tomar
- **WHEN** hay dos casos con la misma gravedad, uno con responsable y otro sin responsable
- **THEN** el que no tiene responsable aparece primero y muestra «Sin tomar»

#### Scenario: A igual gravedad y estado, el que más espera
- **WHEN** hay dos casos sin tomar con la misma gravedad, derivados a distinta hora
- **THEN** aparece primero el que se derivó antes, con su tiempo de espera

#### Scenario: Alerta sin atender más grave que el caso
- **WHEN** un caso derivado con nivel medio tiene una alerta sin atender de nivel crítico
- **THEN** la bandeja lo muestra con gravedad «Crítico»

#### Scenario: Caso migrado sin nivel
- **WHEN** un caso migrado de la planilla sigue abierto y derivado, no tiene nivel de riesgo ni alertas sin atender y su tipo de consulta es siniestro
- **THEN** la bandeja lo muestra con gravedad «Alto», con su responsable

#### Scenario: Caso sin ningún nivel
- **WHEN** un caso derivado no tiene nivel de riesgo, ni alertas sin atender, ni un tipo de consulta con nivel
- **THEN** la bandeja lo muestra con «Sin nivel», después de los casos de nivel bajo

#### Scenario: Conversación sin cliente identificado
- **WHEN** un caso derivado pertenece a una conversación en la que nadie se identificó
- **THEN** la bandeja muestra el teléfono y «Sin identificar», y no muestra el nombre de ningún cliente, aunque el número esté vinculado a alguno

#### Scenario: Alta pendiente
- **WHEN** un caso derivado tiene un prospecto pendiente de confirmación
- **THEN** la bandeja lo muestra con la etiqueta «Alta pendiente · se decide en Trámites»

#### Scenario: Alta rechazada
- **WHEN** un caso derivado sin cerrar tiene un prospecto descartado
- **THEN** la bandeja lo muestra con la etiqueta «Alta rechazada · avisar al cliente»

#### Scenario: Baja o modificación pedida
- **WHEN** un caso derivado es de una baja o de una modificación
- **THEN** la bandeja lo muestra con la etiqueta «Pedido pendiente de aprobación»

#### Scenario: Cambio de teléfono pendiente
- **WHEN** un caso sin cerrar y sin derivar tiene una solicitud de cambio de teléfono pendiente
- **THEN** la bandeja lo muestra con la etiqueta «Cambio de teléfono pendiente · se decide en Trámites», con nivel bajo y la espera contada desde la solicitud

#### Scenario: Todos incluye casos derivados y no derivados
- **WHEN** hay un caso abierto derivado en una conversación y otro caso abierto atendido por el asistente sin derivación ni pendiente operativo en otra conversación
- **THEN** la pestaña «Todos» muestra las dos conversaciones

#### Scenario: Una conversación con varias consultas es una sola fila
- **WHEN** en una misma conversación el asistente respondió saldo, estado y vencimiento y los tres casos siguen sin cerrar
- **THEN** la bandeja muestra una sola fila para esa conversación, con el caso de vencimiento, que es el más reciente, y el total cuenta una conversación

#### Scenario: El caso derivado representa a su conversación
- **WHEN** una conversación tiene un caso de saldo respondido por el asistente y, después, un caso de siniestro derivado, los dos sin cerrar
- **THEN** la bandeja muestra una sola fila con el caso de siniestro, su gravedad y sus acciones, y la pestaña «Derivados» la incluye

#### Scenario: El detalle de cualquier caso abierto sigue disponible
- **WHEN** se pide el detalle de un caso abierto que no es el que representa a su conversación
- **THEN** el panel muestra la conversación completa de ese caso

#### Scenario: Derivados solo incluye casos derivados
- **WHEN** hay casos abiertos con y sin fecha de derivación
- **THEN** la pestaña «Derivados» muestra únicamente las filas cuyo caso tiene `handedOff` verdadero

#### Scenario: Un caso cerrado no aparece
- **WHEN** un caso tiene `fecha_cierre` no nula
- **THEN** no aparece en ninguna pestaña de la Bandeja

#### Scenario: El motivo no determina la derivación
- **WHEN** un caso tiene `fecha_derivacion` nula y un motivo nulo, o tiene `fecha_derivacion` no nula y el motivo es nulo
- **THEN** `handedOff` es falso en el primer caso y verdadero en el segundo

#### Scenario: La búsqueda se combina con la pestaña
- **WHEN** el usuario escribe un teléfono, nombre o patente y elige una pestaña
- **THEN** la lista conserva solo los casos que cumplen simultáneamente el filtro de la pestaña y la búsqueda, sin descartar casos cuyo cliente sea nulo

#### Scenario: El detalle conserva la conversación abierta
- **WHEN** el usuario elige un caso abierto no derivado desde «Todos»
- **THEN** el panel muestra la conversación completa y conserva `handedOff` en falso sin crear una derivación

#### Scenario: Caso que se cierra
- **WHEN** un empleado cierra un caso desde la bandeja
- **THEN** el caso deja de aparecer en la bandeja

#### Scenario: Bandeja vacía
- **WHEN** no hay ningún caso que cumpla las condiciones
- **THEN** la bandeja dice que no hay casos para atender

#### Scenario: La bandeja no modifica nada
- **WHEN** un usuario del panel abre la bandeja y elige casos, sin tomar, contestar ni cerrar ninguno
- **THEN** ningún caso, conversación, mensaje ni marca de silencio cambia

#### Scenario: La bandeja se actualiza sola
- **WHEN** la bandeja está abierta en el panel y el asistente deriva un caso nuevo, o el cliente de un caso abierto en el detalle escribe otro mensaje
- **THEN** a los pocos segundos la bandeja muestra el caso nuevo en su lugar del orden y el detalle muestra el mensaje nuevo, sin que el usuario recargue la página ni pierda el caso elegido

#### Scenario: El orden vale para todas las páginas
- **WHEN** hay más conversaciones que las que entran en una página
- **THEN** la primera página tiene las más graves de toda la bandeja, no las más graves de una parte

#### Scenario: Paginación
- **WHEN** el panel pide la bandeja con un límite fuera de 1 a 100 o un desplazamiento negativo
- **THEN** el sistema rechaza el pedido con un error de validación, sin consultar los casos

### Requirement: Conversación completa de un caso de la bandeja

El sistema SHALL mostrar, al elegir un caso de la Bandeja de Atención, todos los mensajes guardados de la conversación de ese caso, en el orden en que se guardaron, con el origen de cada uno (cliente, asistente u operador), el empleado que escribió cada mensaje de origen operador, su fecha y hora en hora argentina y la marca de cuáles pertenecen al caso elegido, junto con el cliente identificado o el teléfono y «Sin identificar» y las alertas sin atender del caso con su tipo y su nivel, sin modificar nada; los mensajes que guardan la referencia a una imagen del cliente permiten verla, obtenida de WhatsApp en el momento en que se pide, sin guardar una copia en el sistema (RF-SUP-01, RF-ATE-05).

#### Scenario: Conversación derivada
- **WHEN** un usuario del panel elige un caso que el asistente derivó después de varios mensajes
- **THEN** ve los mensajes del cliente y las respuestas del asistente de toda la conversación, en orden, con origen y hora, incluido lo que el cliente escribió después de la derivación

#### Scenario: Conversación con varios casos
- **WHEN** la conversación del caso elegido tiene otros casos, por ejemplo una consulta de vencimiento respondida antes de un reclamo
- **THEN** se ven todos los mensajes de la conversación y los del caso elegido quedan marcados

#### Scenario: Mensaje de un empleado
- **WHEN** la conversación tiene un mensaje que un empleado le escribió al cliente desde la bandeja
- **THEN** se ve con origen operador y el nombre del empleado que lo escribió

#### Scenario: Foto del DNI de un cliente nuevo
- **WHEN** un usuario del panel elige el caso de un alta pendiente y pide ver la foto del DNI que mandó la persona
- **THEN** ve la imagen, obtenida de WhatsApp en ese momento; el sistema no guarda una copia de la imagen y el navegador no la conserva en caché

#### Scenario: Imagen después de derivar
- **WHEN** el cliente mandó una foto a una conversación en silencio y un usuario del panel pide verla
- **THEN** ve la imagen, obtenida de WhatsApp en ese momento, sin que el sistema guarde una copia

#### Scenario: Imagen que ya no está disponible
- **WHEN** un usuario del panel pide ver una imagen que WhatsApp ya no entrega
- **THEN** el panel dice que la imagen ya no está disponible y el resto de la conversación se sigue viendo

#### Scenario: Imagen sin referencia
- **WHEN** la conversación tiene un mensaje de imagen guardado antes de este cambio, sin referencia al mensaje de WhatsApp
- **THEN** se ve el texto que dice que el cliente mandó una imagen, sin opción de verla

#### Scenario: Imagen de una conversación que no está en la bandeja
- **WHEN** el panel pide la imagen de un mensaje que no pertenece a la conversación del caso elegido, o de un caso que no está en la bandeja
- **THEN** el sistema responde que no la encontró y no consulta WhatsApp

#### Scenario: Caso que no está en la bandeja
- **WHEN** el panel pide el detalle de un caso cerrado o de un caso abierto sin derivar y sin nada pendiente
- **THEN** el sistema responde que no lo encontró en la bandeja, sin mostrar la conversación

#### Scenario: Identificador inválido
- **WHEN** el panel pide el detalle con un identificador de caso que no es un entero positivo
- **THEN** el sistema rechaza el pedido con un error de validación

### Requirement: Un caso con alertas sin atender se cierra con revisión explícita

El sistema SHALL rechazar el cierre de un caso que tiene alertas sin atender, salvo que quien lo cierra confirme en el mismo pedido que las revisó; con esa confirmación, el caso se cierra y cada una de esas alertas queda atendida por quien cerró, con la fecha y hora del cierre (RF-SUP-04).

#### Scenario: Cierre sin confirmar la revisión
- **WHEN** el responsable de un caso derivado con una alerta sin atender intenta cerrarlo sin confirmar que la revisó
- **THEN** el sistema rechaza el cierre indicando que hay alertas sin revisar, el panel las muestra con su tipo y su nivel, y el caso y las alertas no cambian

#### Scenario: Cierre con la revisión confirmada
- **WHEN** el responsable de un caso derivado con dos alertas sin atender lo cierra confirmando que las revisó
- **THEN** el caso queda cerrado y las dos alertas quedan atendidas por ese empleado, con la fecha y hora del cierre

#### Scenario: Caso sin alertas pendientes
- **WHEN** el responsable cierra un caso derivado cuyas alertas ya están atendidas o que no tiene alertas
- **THEN** el sistema no le pide confirmar ninguna revisión

### Requirement: El endpoint devuelve las métricas asignadas del Dashboard

El sistema SHALL ofrecer `GET /api/dashboard/metrics` con una respuesta JSON cuyos valores asignados se calculen en tiempo real mediante Prisma sobre MySQL, y SHALL devolver `casosDerivadosSinTomar` y `respuestasRetenidas` como `0` mientras esas métricas sean implementadas por sus responsables (RF-SUP-05).

La respuesta SHALL tener esta estructura:

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

Los valores numéricos del ejemplo son ilustrativos, excepto los dos campos de compatibilidad que SHALL permanecer en `0` en este change. `volumenPorHora` SHALL contener las 24 horas del día argentino, en orden, incluidas las horas sin consultas con `cantidad: 0`; el ejemplo abrevia el array.

#### Scenario: Métricas calculadas desde la base
- **WHEN** existen alertas, trámites y casos con distintos estados en MySQL
- **THEN** el endpoint devuelve los conteos y la tasa calculados desde esos registros, sin valores hardcodeados

#### Scenario: Campos todavía no implementados
- **WHEN** se consulta el endpoint antes de que estén implementadas las métricas de otros integrantes
- **THEN** `casosDerivadosSinTomar` y `respuestasRetenidas` aparecen con valor numérico `0` y el resto del contrato permanece disponible

### Requirement: El Dashboard presenta una fila superior de cuatro tarjetas KPI

El sistema SHALL mostrar en la fila superior del Dashboard cuatro tarjetas KPI en una única grilla responsive: una columna en móvil, dos desde 640 px y cuatro desde 1024 px. Cada tarjeta SHALL incluir un ícono en contenedor con fondo semántico suave, etiqueta, valor destacado y subtexto, respetando los tokens de `docs/design.md` (RF-SUP-05).

El orden SHALL ser: «Casos derivados sin tomar», «Respuestas retenidas», «Trámites por aprobar» y «Alertas de riesgo abiertas».

Las tarjetas «Trámites por aprobar» y «Alertas de riesgo abiertas» SHALL mostrar los valores recibidos del endpoint. Las tarjetas «Casos derivados sin tomar» y «Respuestas retenidas» SHALL mostrar `—` como valor provisional mientras sus métricas no estén implementadas.

#### Scenario: Fila de KPI responsive
- **WHEN** el administrador abre el Dashboard en un ancho de móvil, tablet o escritorio
- **THEN** las cuatro tarjetas se distribuyen en una, dos o cuatro columnas respectivamente, sin cambiar su orden

#### Scenario: Tarjetas conectadas a la API
- **WHEN** el endpoint devuelve `tramitesPorAprobar` y `alertasRiesgoAbiertas`
- **THEN** esas tarjetas muestran los valores recibidos con el valor en tipografía destacada y junto a su subtexto

#### Scenario: Métricas todavía no implementadas
- **WHEN** se muestra la fila superior antes de implementar `casosDerivadosSinTomar` y `respuestasRetenidas`
- **THEN** sus tarjetas muestran `—` y conservan los subtextos «60 minutos para alertar, valor provisional.» y «Se retienen y derivan, nunca se envían.»

### Requirement: Las alertas de riesgo abiertas se cuentan por nivel

El sistema SHALL contar en `alertasRiesgoAbiertas` las alertas con `fecha_atencion IS NULL` cuyos niveles sean `medio`, `alto` o `critico`, sin contar alertas ya atendidas (RF-SUP-05).

#### Scenario: Alerta abierta de nivel permitido
- **WHEN** existe una alerta sin `fecha_atencion` con nivel `medio`, `alto` o `critico`
- **THEN** se incluye una vez en `alertasRiesgoAbiertas`

#### Scenario: Alerta atendida o nivel no incluido
- **WHEN** una alerta tiene `fecha_atencion` o su nivel no es `medio`, `alto` ni `critico`
- **THEN** no se incluye en `alertasRiesgoAbiertas`

### Requirement: Los trámites pendientes se agrupan en un total

El sistema SHALL calcular `tramitesPorAprobar` como la suma de prospectos y solicitudes de acción cuyo estado de catálogo sea `pendiente` (RF-SUP-05).

#### Scenario: Prospectos y solicitudes pendientes
- **WHEN** existen prospectos pendientes y solicitudes de acción pendientes
- **THEN** el endpoint suma ambos tipos en `tramitesPorAprobar`

#### Scenario: Trámite ya decidido
- **WHEN** un prospecto o una solicitud de acción está aprobado, rechazado, descartado u otro estado no pendiente
- **THEN** no se incluye en `tramitesPorAprobar`

### Requirement: El resumen operativo se calcula sobre la jornada actual

El sistema SHALL calcular el resumen operativo usando exclusivamente el día de hoy en `America/Argentina/Buenos_Aires`, convertido al rango UTC equivalente para comparar con las columnas `DateTime` de MySQL (RF-SUP-05).

- `consultasHoy` SHALL contar los casos con `fecha_apertura` dentro del rango de hoy.
- `casosCerrados` SHALL contar los casos con `fecha_cierre` dentro del rango de hoy, aunque se hayan creado otro día.
- `resueltosPorBot` SHALL contar los casos creados hoy cuyo `fecha_derivacion` sea `NULL`.
- `tasaAutomatizacion` SHALL ser `Math.round((resueltosPorBot / consultasHoy) * 100)` y SHALL devolver `0` cuando `consultasHoy` sea `0`.

#### Scenario: Casos de hoy y de otros días
- **WHEN** existen casos creados hoy, casos creados ayer y casos cerrados hoy
- **THEN** `consultasHoy` y `resueltosPorBot` solo consideran los creados hoy, mientras que `casosCerrados` considera los cerrados hoy sin importar cuándo se crearon

#### Scenario: Tasa de automatización
- **WHEN** `consultasHoy` es mayor que `0`
- **THEN** `tasaAutomatizacion` es el porcentaje redondeado de casos creados hoy sin `fecha_derivacion` sobre `consultasHoy`

#### Scenario: Sin consultas hoy
- **WHEN** no existen casos creados hoy
- **THEN** `consultasHoy`, `resueltosPorBot` y `tasaAutomatizacion` devuelven `0` sin dividir por cero

### Requirement: El volumen por hora agrupa las consultas de hoy

El sistema SHALL devolver `volumenPorHora` como un array ordenado con las 24 horas del día argentino (`00hs` a `23hs`) y la cantidad de casos creados hoy en cada hora, incluyendo `cantidad: 0` para las horas sin consultas (RF-SUP-05).

#### Scenario: Consultas distribuidas en el día
- **WHEN** existen casos creados hoy a distintas horas argentinas
- **THEN** cada caso se cuenta una sola vez en la hora que le corresponde

#### Scenario: Horas sin consultas
- **WHEN** no hay casos creados hoy en una hora determinada
- **THEN** esa hora aparece en `volumenPorHora` con `cantidad: 0`

#### Scenario: Cambio de día en Argentina
- **WHEN** en UTC ya es el día siguiente pero en Argentina todavía es el día anterior
- **THEN** la agregación sigue el día argentino y no el día UTC

### Requirement: La sección inferior divide gráfico y resumen operativo

El sistema SHALL organizar la sección inferior del Dashboard en una grilla de tres columnas con `gap` y `margin-top` de `1.5rem`: el bloque «Volumen de chats por hora» SHALL ocupar dos columnas y el bloque «Resumen operativo» una columna. Por debajo de 1024 px ambos bloques SHALL pasar a una sola columna (RF-SUP-05).

El bloque «Volumen de chats por hora» SHALL usar SVG inline nativo con `viewBox="0 0 500 150"` y SHALL calcular dinámicamente desde `volumenPorHora` los puntos, el `<path>` de área suavizada y las etiquetas del eje X. No SHALL contener coordenadas ni cantidades hardcodeadas. Una hora con `cantidad: 0` SHALL representarse sobre la base del gráfico. SHALL mantener el `<linearGradient>` con el color de marca `var(--color-primary)` y SHALL implementarse con SVG nativo y CSS plano en `App.css`, sin librerías de gráficos ni dependencias visuales adicionales.

Los íconos SHALL provenir de componentes SVG inline de `frontend/src/components/iconos.tsx`, y `frontend/package.json` no SHALL incluir `lucide-react` ni librerías de íconos, gráficos o estilos. Si falta un ícono, se agrega como componente SVG inline en ese archivo.

El bloque «Resumen operativo» SHALL mostrar los valores recibidos del endpoint: «Consultas de hoy» con `consultasHoy`, «Casos cerrados» con `casosCerrados` y «Resueltos por bot» con `resueltosPorBot`. SHALL incluir una barra de progreso horizontal cuyo ancho sea `tasaAutomatizacion%` y un indicador textual de estado «Óptimo» cuando la tasa sea mayor o igual a 60 % o «Moderado» en caso contrario.

#### Scenario: Grilla de la sección inferior
- **WHEN** el administrador abre el Dashboard en escritorio
- **THEN** el gráfico ocupa dos tercios de la fila inferior y el resumen operativo el tercio restante

#### Scenario: Gráfico dinámico
- **WHEN** el endpoint devuelve `volumenPorHora` con distintas cantidades
- **THEN** el trazo y las etiquetas del eje X cambian según esos datos y no según coordenadas fijas

#### Scenario: Hora sin consultas
- **WHEN** una entrada de `volumenPorHora` tiene `cantidad: 0`
- **THEN** su punto se dibuja sobre la base del gráfico, sin inventar un valor

#### Scenario: Adaptación responsive
- **WHEN** el ancho disponible es menor a 1024 px
- **THEN** el gráfico y el resumen operativo se apilan en una sola columna

#### Scenario: Progreso de automatización óptimo
- **WHEN** `tasaAutomatizacion` es mayor o igual a 60
- **THEN** la barra se rellena con ese porcentaje y el indicador muestra «Óptimo»

#### Scenario: Progreso de automatización moderado
- **WHEN** `tasaAutomatizacion` es menor a 60
- **THEN** la barra se rellena con ese porcentaje y el indicador muestra «Moderado»

### Requirement: El Dashboard muestra estados de carga y error

El sistema SHALL conectar las tarjetas de alertas de riesgo abiertas y trámites por aprobar y la sección inferior al endpoint, mostrando estados explícitos de carga y error (RF-SUP-05).

#### Scenario: Carga inicial
- **WHEN** el administrador abre el Dashboard antes de recibir la respuesta
- **THEN** las superficies asignadas muestran un estado de carga y no muestran datos ficticios

#### Scenario: Error del endpoint
- **WHEN** falla la consulta de métricas
- **THEN** el Dashboard informa el error sin reemplazarlo por conteos cero

#### Scenario: Métricas disponibles
- **WHEN** el endpoint responde correctamente
- **THEN** las tarjetas, el gráfico y el resumen operativo muestran los valores recibidos y actualizados
