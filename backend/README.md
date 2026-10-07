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

## Cartera de clientes

Endpoints de solo lectura para la pantalla Base de Clientes del panel (RF-CAR-01, RF-CAR-02 y RF-CAR-03). La cartera se identifica por DNI; el teléfono no identifica y un número compartido puede devolver más de un cliente. No hay altas, bajas ni modificaciones por estos endpoints: la cartera se carga con la migración.

### Listar clientes

`GET /api/clientes?buscar=&limit=25&offset=0`

Devuelve `{ items, total, limit, offset }`, ordenados por apellido (o razón social) ascendente. `buscar` es opcional y busca por tramo en nombre, apellido y razón social; sus dígitos se comparan sin puntos ni espacios contra DNI, CUIT y teléfono, así un DNI escrito `30.111.222` se encuentra igual que `30111222`. Cada elemento de `items` contiene:

```json
{
  "id": "12",
  "dni": "30111222",
  "cuit": null,
  "razonSocial": null,
  "firstName": "Laura",
  "lastName": "Gómez",
  "phones": ["5491155551001"],
  "policies": [
    { "number": "POL-00123", "ramo": "auto", "status": "activa" }
  ]
}
```

Las empresas vienen con `cuit` y `razonSocial` y `dni` en `null`. `phones` y `policies` solo incluyen teléfonos y pólizas activos: cada póliza del listado trae tipo (`ramo`) y estado, que es lo que muestra la tabla del panel. Una búsqueda sin coincidencias devuelve `items: []` y `total: 0`, no un `404`.

### Detalle de un cliente

`GET /api/clientes/:id`

Devuelve el mismo encabezado, con `phones` como lista de `{ id, number }` (el `id` es el que se usa para desvincular teléfonos en los trámites) y `policies` como ficha de cada póliza, ordenadas por vencimiento: `number`, `ramo` (el tipo, que el panel muestra como «Cobertura»), `status`, `startDate` (inicio de la vigencia, `null` en las fixtures de prueba), `expirationDate` y `insuredItem`. `insuredItem` es el bien asegurado (`description`, `plate`, `address`, `brand`, `model`, `year`) o `null` en los ramos que no aseguran un bien, como vida. Un identificador no numérico responde `400` y uno inexistente `404`, con el mismo formato de error de arriba.
