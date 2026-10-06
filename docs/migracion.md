# Migración de la planilla histórica

Reglas para importar a la base los datos históricos de la agencia (Parcial 1). Salen de la limpieza de la planilla del 28/09/2026. La planilla original no se modifica: la limpieza se hizo en un Excel aparte, `Caso8_seguros_bot_datos_limpios.xlsx`, con las hojas Leeme, Clientes, Pólizas, Consultas, Log_Resoluciones, Cambios (cada corrección con su valor original, el nuevo y la regla) y Pendientes. Las reglas también están en la hoja Leeme.

## Dónde está el Excel

- No se sube al repo. Está en la carpeta del proyecto en Drive.
- Para cargarlo, se copia a `backend/planilla/`, una carpeta que Git ignora. Tiene que estar ahí porque el contenedor del backend solo ve `./backend`: un archivo en otra carpeta (por ejemplo, el Escritorio de Windows) no lo encuentra. Después de cargar se puede borrar de ahí: los datos quedan en la base.
- El script está en `backend/scripts/migrar-planilla.ts` y se corre sobre una base vacía, recién migrada:

  ```bash
  cp <carpeta de Drive>/Caso8_seguros_bot_datos_limpios.xlsx backend/planilla/
  docker compose exec backend npm run migrar-planilla
  ```

  Para leer otro archivo: `npm run migrar-planilla -- <ruta dentro de backend/>`. Valida toda la planilla antes de escribir y carga todo en una transacción: si algo falla, la base queda como estaba. Si la base ya tiene clientes o los usuarios `roberto` o `graciela`, no escribe nada. Al terminar informa cuántos registros cargó por tabla y qué filas salteó.
- Los datos quedan en el volumen de Docker de la base: `docker compose stop`, `restart` y `down` (sin `-v`) no los borran. `docker compose down -v` sí: después hay que volver a correr el script.
- Quien no tenga el Excel no tiene los datos migrados. La demo corre en una máquina que lo tenga.

## Qué lee el script

- Las hojas Clientes, Pólizas y Consultas. Respeta la columna «migrar»: las filas con «No» se saltean y quedan en la hoja Pendientes para cargarlas a mano desde el panel (E16).
- Se saltean CASO-007 (no tiene teléfono, que la base exige, y cierra antes de abrir), CASO-009 (cierra antes de abrir), POL-00126 y POL-00131 (el VW Gol AB789CD con dos titulares) y POL-00128 (fechas sin día).
- Los clientes se migran aunque todas sus pólizas queden pendientes (Ana Fernández, Luisa Martínez).
- Log_Resoluciones no se migra como tabla: de cada registro se usan solo el empleado, que pasa a ser el responsable del caso, y la póliza, que pasa a ser la póliza del caso. La acción tomada, las observaciones, el escalado, los minutos y la fecha quedan solo en el Excel.

## Reglas de carga

- **Duplicados:** el duplicado exacto (POL-00123 y pol-00123) quedó en una sola fila, con «García Juan Carlos». Falta que la agencia lo confirme.
- **Teléfonos:** todos con el formato 54 + 9 + área + número (por ejemplo, 5491155551001).
- **Pólizas «vencida»:** se cargan como «activa». Vencida no es un estado: se calcula con la fecha de vencimiento.
- **Primas sin símbolo** (POL-00124, 00125, 00128 y 00133): se tomaron como pesos. Falta que la agencia lo confirme.
- **Beneficiarios sin nombre y cuotas sueltas:** los beneficiarios sin nombre («esposa e hijos», «hija mayor») y las cuotas 3 y 4 de POL-00128 quedan en observaciones (POL-00128 igual se saltea por las fechas sin día).
- **Horas:** la planilla está en hora argentina y el script las pasa a UTC. Los casos sin hora (CASO-010 y CASO-011) abren a las 00:00. La resolución nunca trae hora: el cierre va a las 23:59 de ese día (columna «hora_resolucion»). La marca de hora desconocida queda solo en el Excel: no hay columnas nuevas en la base.
- **Respuestas del bot:** no se corrigen. Son la evidencia de los fallos.

## Casos, alertas y conversaciones

- **Casos:** se cargan derivados y tomados a la hora de apertura, sin motivo de derivación (la planilla no lo tiene). En la planilla todos pasaron por una persona, así que cuentan en las métricas como atendidos por una persona. Los siete abiertos (CASO-002, 003, 005, 006, 008, 010 y 012) quedan «en atención» con su responsable y no se cierran solos.
- **Responsable:** el `funcionario_asignado` de Consultas; si falta, el empleado del log (CASO-002, 005 y 012: Roberto; CASO-003, 006 y 010: Graciela). CASO-008 tiene dos empleados en el log y queda Roberto, el asignado en Consultas.
- **Tipo de consulta:** «siniestro_urgente» se carga como siniestro. PROMPT_INJECTION no es un tipo de consulta: el caso queda sin tipo y con la alerta «Intento de manipulación del asistente».
- **Alertas** (CASO-003, 005, 006, 010 y 012): se cargan atendidas por el responsable del caso, a la hora de la toma. ALERTA_ACCION pasa a «Pedido de acción crítica», salvo CASO-006, que pasa a «Pedido de reembolso (aviso al equipo)».
- **Póliza del caso** (`caso.id_poliza`, opcional): CASO-001, 011 y 012 → POL-00123; CASO-006 → POL-00124. Quedan vacíos hasta que responda la agencia CASO-002 (además, POL-00128 no se migra), CASO-004 y CASO-008, porque el log los vincula a pólizas que no coinciden con la consulta.
- **Conversaciones:** una por caso. Empieza a la hora de apertura; si el caso está cerrado, termina a la hora de cierre, y si sigue abierto, queda abierta. Si el caso tiene póliza, la conversación queda a nombre del titular de esa póliza y su número se vincula a ese cliente: CASO-001, 011 y 012 → Juan García (5491155551001 y 5491155551009); CASO-006 → María del Carmen López (5491155551005). Si no tiene póliza, la conversación queda sin cliente y el número sin vincular, como una conversación en la que nadie dio el DNI. CASO-003 usa el mismo número que CASO-001 y 011 pero no tiene póliza: su conversación queda sin cliente, aunque el número quede vinculado a García. Riesgo aceptado: en CASO-012 no escribió el titular (el log dice «Consultó al titular»).

## Usuarios

- **De prueba:** `admin` (rol administrador, «Admin Prueba») y `operador` (rol operador, «Operador Prueba»), con contraseña 1234. Van en una migración SQL, así existen en todas las bases aunque no se haya corrido la migración de la planilla: el panel del Parcial 1 atribuye todo a `operador`. El repo es público: antes de producción se borran o se les cambia la contraseña.
- **Históricos:** el script de la planilla crea a Roberto Castaño (administrador, usuario `roberto`) y a Graciela Castaño (operador, usuario `graciela`) activos, con contraseña `seguros1234` (decisión del equipo, 06/10/2026). Son los responsables de los casos migrados y quienes atendieron sus alertas. El repo es público: antes de producción se les cambia la contraseña. El apellido de Graciela es un supuesto (en la carta es hija de Roberto).
- Diego no se carga ahora porque no figura en la planilla.
- El algoritmo de hash es bcrypt, con prefijo `$2b$` y coste 10: literal en la migración `20260929204929_caso_poliza_cambio_telefono_usuarios_prueba` para los usuarios de prueba, y generado con `bcryptjs` por el script de la planilla para los históricos. El login del Parcial 2 usa el mismo.

## A tener en cuenta

- Los tiempos de los casos migrados no son reales (la toma es a la hora de apertura y el cierre a las 23:59). Si se muestran métricas de abril de 2024, hay que aclararlo.
- Toda la cartera migrada está vencida por fecha: la cartera activa da 0 y, con estos datos, la respuesta de vencimiento va a ser que la póliza venció.
- Pendientes de la agencia: las inconsistencias entre Consultas y Log_Resoluciones (CASO-002 y CASO-008 vinculados a pólizas de otro ramo; LOG-011 dice que el vencimiento real de POL-00125 es 28/02/2024 y la póliza vence el 20/06/2024), las primas sin símbolo y los apellidos de Graciela y Diego.
