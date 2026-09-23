# DER — Caso 8: Sistema de Atención al Cliente con Bot IA y Panel de Supervisión

Seguros Castaño — PPP 1, UNLa, Grupo 11. Entregable del Hito 0.
Diagrama: `caso8_der.puml` / `.png` / `.svg`. Última revisión: 21/09/2026 (noche).

## Convenciones aplicadas

- Nombres de tablas y columnas en **español**, en singular y en `snake_case`.
- Claves primarias **autoincrementales**, siempre `id_<entidad>`.
- **Toda referencia entre tablas se hace por id.** Ningún texto (un número de teléfono, un código de moneda, el nombre de un estado) se usa como identificador.
- **Estados y tipos van en tablas catálogo**, nunca como texto libre.
- **Lo que se deduce de otros datos no se guarda**: el estado del caso y la vigencia de la póliza se calculan (ver más abajo).
- **Baja lógica** (`activo : BOOLEAN`) en las entidades maestras: cliente, teléfono, plan, compañía, ramo, bien asegurado, póliza, cobertura, beneficiario, siniestro, conductor, usuario. En la póliza, `activo = false` es solo para un registro cargado por error: una baja aprobada no toca `activo`, cambia el estado a «dada de baja».
- **Sin baja lógica** en mensajes, respuestas, verificaciones, alertas, cuotas y auditoría: son registros históricos y borrarlos, aunque sea lógicamente, rompe la trazabilidad que es el eje del proyecto. En las tablas de vínculo (`cliente_telefono`, `poliza_conductor`), desvincular es borrar la fila.
- **Formatos normalizados que exige la base**: DNI de 7 u 8 dígitos, CUIT de 11 dígitos, teléfono de 10 a 15 dígitos, patente o matrícula en mayúsculas y sin espacios ni guiones. El formato previsto del teléfono es E.164 sin el «+» (con código de país), pero la base no exige el código de país ni el 9 de los celulares: los normaliza el backend y la regla del 9 está pendiente.
- **Fechas y horas en UTC.** El servidor MySQL corre en UTC para que `CURRENT_TIMESTAMP` y `NOW()` coincidan con Prisma, que siempre escribe en UTC. La hora argentina se usa solo para mostrar y para comparar con `horario_atencion`, cuyas horas están en hora argentina. «Hoy», por ejemplo para saber si una póliza venció, es la fecha de Argentina.
- En el diagrama, `<<UK1>>` marca las columnas de una misma restricción única compuesta.
- Motor previsto: MySQL 8.4 con Prisma. La decisión Prisma-first vs SQL-first quedó abierta. Los scripts empiezan con `SET NAMES utf8mb4` para que los textos con tilde se guarden bien aunque se corran con el cliente `mysql` del contenedor.

## Entidades por módulo

### Cartera
| Entidad | Para qué está |
|---|---|
| `cliente` | Registro único de cada cliente. Una persona se identifica por DNI (con apellido y nombre) y una empresa por CUIT (con razón social); la base exige uno de los dos grupos completo. DNI y CUIT son únicos: resuelven los duplicados de la planilla. |
| `telefono` | Número normalizado, independiente del cliente. Incluye los números de WhatsApp que todavía no están vinculados a ningún cliente. |
| `cliente_telefono` | Relación N:M: un cliente puede tener varios teléfonos y un teléfono pertenecer a varios clientes. |
| `compania_aseguradora` | Compañía de cada póliza. Por ahora el equipo asume que Seguros Castaño es la aseguradora de todas (supuesto a confirmar con la agencia); la tabla queda para registrar otras compañías si la agencia opera con ellas. |
| `moneda` | Catálogo de monedas (código ISO 4217): peso argentino y dólar. **Una moneda por póliza.** |
| `ramo` | Catálogo de tipos de seguro. Elimina el problema «Automotor / auto / AUTO». |
| `plan` | Catálogo de planes con ABM: terceros, todo riesgo, etc. Es genérico, no depende del ramo. |
| `bien_asegurado` | Qué se asegura. Una sola tabla para todos los ramos; el ramo lo define la póliza. `patente_matricula` (única) para vehículos y embarcaciones, `direccion` para inmuebles y comercios, y `marca`, `modelo` y `anio` opcionales. |
| `poliza` | Contrato: titular, compañía, ramo, bien, vigencia, prima mensual, moneda y estado. El número de póliza es único dentro de cada compañía. |
| `estado_poliza` | Catálogo con los estados que decide una persona: activa, suspendida por mora, dada de baja. «Dada de baja» es el estado que deja una baja aprobada. |
| `cobertura` | Cada cobertura de una póliza, asociada a un plan. Estructura póliza → cobertura → plan. |
| `beneficiario` | Beneficiarios de seguros de vida, hoy enterrados en observaciones. |
| `cuota` | Vencimiento, importe y fecha de pago. Permite responder «¿cuánto me falta pagar?» sin gestionar cobros. |
| `siniestro` | Siniestros registrados, con su estado. |
| `estado_siniestro` | Catálogo de estados del siniestro. |
| `conductor` | Conductores agregados a pólizas (por ejemplo, el hijo del titular de CASO-012), identificados por DNI. |
| `poliza_conductor` | Relación N:M: una persona puede manejar en varias pólizas. Se completa al aplicar una solicitud «alta de conductor» aprobada. |

### Seguridad y configuración
| Entidad | Para qué está |
|---|---|
| `rol` | Administrador y operador. |
| `usuario` | Usuarios de la agencia, con rol y contraseña hasheada. Reemplaza el texto libre («Graciela», «ROBERTO»). |
| `parametro_configuracion` | Clave–valor para los parámetros configurables: tope de reintentos de DNI, minutos de un caso derivado sin tomar y minutos de inactividad que cierran una conversación sin caso derivado abierto. |
| `horario_atencion` | Horario de atención humana: una fila por día con atención (1 = lunes … 7 = domingo), con hora de apertura y de cierre, en hora argentina. |

### Atención
| Entidad | Para qué está |
|---|---|
| `conversacion` | **Sesión** de WhatsApp con un número (FK a `telefono`). Termina (`fecha_fin`) tras el tiempo de inactividad configurado; el próximo mensaje abre una conversación nueva y el asistente vuelve a pedir el DNI. Si tiene un caso derivado sin cerrar, la inactividad no la cierra: sigue abierta hasta que se cierre el caso, el asistente sigue sin responder y lo que escribe el cliente queda en ese caso. Guarda si el asistente está suspendido. El cliente es nulo hasta que la persona se identifica. |
| `caso` | **Uno por consulta**, con varios mensajes hasta resolverse. Lleva el tipo de consulta (nulo mientras no se conoce), responsable asignado, nivel de riesgo y las fechas de apertura, derivación, toma y cierre; el estado se deduce de esas fechas. |
| `mensaje` | Cada mensaje del caso, con su origen. La fecha guarda milisegundos para ordenar la conversación. |
| `origen_mensaje` | Catálogo: cliente, asistente, operador. |
| `tipo_consulta` | Catálogo de tipos de consulta que detecta el asistente (flujo F12 del diagrama de contexto). Normaliza la columna `tipo_consulta_detectado` de la planilla. |
| `prospecto` | Datos que el asistente junta de un cliente nuevo, con su estado. Puede registrar un teléfono de contacto distinto del de la conversación. Al confirmarse, se vincula al cliente creado. |
| `estado_prospecto` | Catálogo: pendiente, confirmado, descartado. |

### Verificación y supervisión
| Entidad | Para qué está |
|---|---|
| `respuesta` | Cada texto de respuesta como **fila separada**, que no se pisa: la que genera el asistente (`id_usuario` nulo), la que escribe un operador (`id_usuario` = el empleado) y la que corrige a otra (`id_respuesta_origen`). `id_mensaje_enviado` enlaza con el mensaje si efectivamente salió. El caso se obtiene por el mensaje consultado. |
| `verificacion` | Resultado del análisis previo al envío: como máximo una por respuesta, con resultado y nivel de riesgo. |
| `resultado_verificacion` | Catálogo: aprobada, retenida. |
| `nivel_riesgo` | Catálogo con campo `orden`, que es lo que ordena la bandeja de revisión por gravedad. |
| `tipo_alerta` | Catálogo de alertas, cada una con su nivel de riesgo por defecto. |
| `alerta` | Alerta concreta sobre un caso o una respuesta, con quién la atendió y cuándo. |
| `auditoria` | Registro inalterable: entidad afectada, id del registro, acción, usuario y fecha. Dos triggers rechazan cualquier UPDATE o DELETE. |

### Acciones críticas
| Entidad | Para qué está |
|---|---|
| `solicitud_accion` | Pedido de baja, modificación o alta de conductor en estado pendiente. Nunca la origina el sistema como cambio directo. Al decidirse registra quién, cuándo y con qué fundamento. |
| `tipo_accion` | **Catálogo fijo en tabla**: baja de póliza, modificación de póliza, alta de conductor. |
| `estado_solicitud` | Catálogo: pendiente, aprobada, rechazada, aplicada. |

## Datos que se calculan en lugar de guardarse

- **Estado del caso**: cerrado si tiene `fecha_cierre`; en atención si tiene `fecha_toma`; derivado si tiene `fecha_derivacion`; si no, abierto. Reabrir un caso es vaciar `fecha_cierre`.
- **Vigencia de la póliza**: está vencida cuando `fecha_vencimiento` es anterior a hoy (fecha de Argentina, no la del servidor en UTC). La cartera activa son las pólizas en estado «activa» que no vencieron y tienen `activo = true`.
- **Tipo de respuesta**: generada por el asistente si `id_usuario` es nulo; escrita por un operador si no lo es; corrección si tiene `id_respuesta_origen`. Si se envió o no, lo dice `id_mensaje_enviado`.

## Restricciones que controla la base

- Orden de las fechas: caso (apertura ≤ derivación ≤ toma ≤ cierre), conversación, alerta, solicitud de acción y siniestro (ocurrencia ≤ registro), además de la vigencia de la póliza.
- Un caso tomado tiene responsable; una alerta atendida registra quién y cuándo; una solicitud decidida registra quién, cuándo y con qué fundamento.
- Formato de DNI, CUIT, teléfono, patente o matrícula y código de moneda; persona o empresa en `cliente`; días y rango horario en `horario_atencion`.
- Unicidad: DNI, CUIT, teléfono, patente o matrícula, número de póliza por compañía, número de siniestro, cuota por póliza, conductor por DNI.

## Redundancias aceptadas

- **`alerta.id_caso`** repite el caso de la respuesta cuando la alerta tiene una. Se mantiene porque hay alertas sin respuesta («caso derivado sin tomar»); el backend valida que coincidan.
- **El texto de una respuesta enviada** queda en `respuesta` y en `mensaje`: `respuesta` es el registro del proceso (borrador, verificación, corrección) y `mensaje` es la conversación tal como la vio el cliente.
- **Marca y modelo** del bien son texto libre, aunque el modelo determina la marca. Para este alcance no se justifica un catálogo de modelos.

## Catálogos propuestos (valores iniciales)

- **ramo**: auto, moto, vida, hogar, embarcaciones, comercio.
- **compania_aseguradora**: Seguros Castaño (supuesto del equipo).
- **moneda**: ARS (peso argentino), USD (dólar estadounidense).
- **estado_poliza**: activa, suspendida por mora, dada de baja.
- **estado_siniestro**: registrado, en gestión, cerrado.
- **rol**: administrador, operador.
- **origen_mensaje**: cliente, asistente, operador.
- **tipo_consulta**: saldo, vencimiento, estado de póliza, cobertura, siniestro, cotización, baja, modificación, reclamo, saludo. En la migración, «siniestro_urgente» se carga como siniestro; PROMPT_INJECTION no es un tipo de consulta (lo cubre la alerta «Intento de manipulación del asistente»). «Estado de póliza» sale de RF-ATE-01.
- **estado_prospecto**: pendiente, confirmado, descartado.
- **resultado_verificacion**: aprobada, retenida.
- **nivel_riesgo** (orden 1 = más grave): 1 crítico, 2 alto, 3 medio, 4 bajo.
- **tipo_alerta** con su nivel por defecto:
  | Tipo de alerta | Nivel |
  |---|---|
  | Exposición de datos personales | crítico |
  | Intento de manipulación del asistente | crítico |
  | Dato falso o no verificable | alto |
  | Pedido de acción crítica | medio |
  | Pedido de reembolso (aviso al equipo) | medio |
  | Caso derivado sin tomar | medio |
- **tipo_accion**: baja de póliza, modificación de póliza, alta de conductor.
- **estado_solicitud**: pendiente, aprobada, rechazada, aplicada.
- **horario_atencion**: lunes a viernes de 9 a 18, según informó la agencia.
- **parametro_configuracion**: `max_intentos_dni` = 3; `minutos_max_caso_sin_tomar` = 60 y `minutos_inactividad_sesion` = 30 (provisorios).

## Decisiones tomadas el 21/09/2026

1. El ramo se guarda solo en la póliza (se sacó de `bien_asegurado`).
2. La conversación es una sesión que termina tras un tiempo de inactividad configurable.
3. La respuesta enviada no se duplica: se eliminó el catálogo `tipo_respuesta`, y quién escribió la respuesta lo indica la FK al empleado (`id_usuario`).
4. «Vencida» se calcula con la fecha de vencimiento.
5. La patente o matrícula es única y tiene un campo propio.
6. `cliente_telefono` no lleva baja lógica.
7. Se trabaja siempre con ids: teléfonos, moneda y estados pasaron a referencias por id.
8. El equipo asume que Seguros Castaño es la aseguradora (a confirmar con la agencia); `compania_aseguradora` se mantiene para el futuro.
9. Atención humana de lunes a viernes, con el mismo horario todos los días: de 9 a 18, según informó la agencia.
10. Solo pesos y dólares.
11. Puede haber clientes que sean empresas (CUIT y razón social).
12. Los conductores se guardan en `conductor`, vinculados a la póliza por `poliza_conductor`.
13. El estado del caso se deduce de sus fechas (se eliminó el catálogo `estado_caso`).

## Decisiones tomadas el 21/09/2026 (noche)

1. La inactividad no cierra una conversación que tenga un caso derivado sin cerrar: sigue abierta hasta que se cierre el caso.
2. Las fechas se guardan en UTC. La hora argentina se usa solo para mostrar y para comparar con el horario de atención.
3. Una baja de póliza aprobada cambia el estado a «dada de baja». `activo = false` queda solo para registros cargados por error.
4. El tipo de consulta va en un catálogo propio (`tipo_consulta`) con FK en `caso`, con los valores depurados de la planilla.

## Decisiones del equipo que conviene confirmar

1. **`bien_asegurado` es una sola tabla para todos los ramos.** Vehículos, inmuebles, embarcaciones y comercios comparten la misma estructura, con campos opcionales. Es la opción simple; si más adelante cada ramo necesita atributos propios, hay que partirla.
2. **En seguros de vida la póliza no tiene bien asegurado**: `id_bien` es nulo y la información va en `beneficiario`.
3. **`prospecto` es una tabla aparte de `cliente`**, porque un prospecto no tiene DNI validado y `cliente` exige un DNI o un CUIT único.
4. **El pedido de reembolso no genera solicitud de acción**: se registra como alerta de tipo «aviso al equipo».
5. **`cobertura.suma_asegurada` no fue relevada**, quedó como campo opcional.
6. **La auditoría es genérica** (`entidad` + `id_registro`): sirve para cualquier tabla sin crear una de auditoría por entidad.
7. **La regla de no cerrar un caso riesgoso sin revisión explícita (RF-SUP-04) no es un estado**: es una validación de negocio sobre el cierre.
8. **Renovación de póliza**: al no haber entidad de vigencia, una renovación se resuelve cambiando las fechas o creando una póliza nueva. No está relevado el ciclo de vida completo.
9. **Seguros Castaño es la aseguradora de todas las pólizas.** Es un supuesto del equipo: hay que confirmar con qué compañías opera la agencia.
