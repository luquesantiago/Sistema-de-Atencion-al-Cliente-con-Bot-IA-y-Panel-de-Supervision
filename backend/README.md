# API del backend

## Trámites pendientes

Los endpoints de trámites están preparados para el panel (RF-ATE-05 y RF-CAR-05). En el Parcial 1 no hay autenticación: las decisiones se atribuyen al usuario de prueba `operador` en el backend; el cliente no puede enviar actor ni rol. La persistencia se mantiene detrás de `RequestManagementRepository`, con un adaptador Prisma que opera sobre las tablas actuales. Las decisiones guardan estado, actor, fecha y fundamento, de acuerdo con la trazabilidad de RF-SUP-06.

Todas las fechas se devuelven en UTC. Los listados aceptan `limit` (por defecto 25, máximo 100) y `offset` (por defecto 0).

### Listar altas de prospectos

`GET /api/tramites/prospectos?limit=25&offset=0`

Devuelve prospectos pendientes asociados a casos abiertos. Cada elemento contiene `id`, `caseId`, nombre y DNI declarados, teléfono de WhatsApp y fecha de registro.

### Decidir un alta de prospecto

`POST /api/tramites/prospectos/:id/decision`

Confirmar el alta requiere que el operador revise y envíe nombre y apellido separados:

```json
{
  "decision": "aprobar",
  "fundamento": "Identidad revisada",
  "nombre": "Laura",
  "apellido": "Díaz"
}
```

La aprobación crea el cliente con el DNI declarado, vincula el teléfono de la conversación solo a ese cliente, confirma el prospecto y cierra el caso a nombre de `operador`. Si el DNI ya existe, devuelve `409` y no crea un duplicado. Para rechazar, enviar `decision: "rechazar"` y un `fundamento`; el prospecto pasa a descartado y el caso se cierra.

### Listar cambios de teléfono

`GET /api/tramites/cambios-telefono?limit=25&offset=0`

Devuelve solicitudes pendientes con el número solicitado y los teléfonos actualmente vinculados al cliente. El identificador de cada teléfono de `currentPhones` es el que se envía para desvincularlo.

### Decidir un cambio de teléfono

`POST /api/tramites/cambios-telefono/:id/decision`

```json
{
  "decision": "aprobar",
  "fundamento": "DNI verificado",
  "telefonosADesvincular": [17]
}
```

La lista de teléfonos anteriores puede estar vacía. Se modifica únicamente el vínculo del cliente de la solicitud; un teléfono compartido sigue asociado a las demás personas. La aprobación o el rechazo registra usuario, fecha, fundamento y estado, actualiza el detalle de la solicitud, cierra el caso y avisa la decisión por WhatsApp. La respuesta incluye `notificationSent`; si el envío falla después de guardar la decisión, incluye además una advertencia explícita. Rechazar no modifica los vínculos y requiere `telefonosADesvincular: []` u omitir el campo.

Si el envío falla, se puede reintentar sin repetir la decisión:

`POST /api/tramites/cambios-telefono/:id/notificacion`

El endpoint solo envía avisos de solicitudes ya aprobadas o rechazadas.

### Errores

Los errores de entrada responden `400`, un trámite inexistente `404` y una transición inválida o trámite ya decidido `409`, con formato:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "La solicitud ya no está pendiente."
  }
}
```

La identidad fija de prueba debe reemplazarse por autenticación y autorización del backend al integrar el login del panel.
