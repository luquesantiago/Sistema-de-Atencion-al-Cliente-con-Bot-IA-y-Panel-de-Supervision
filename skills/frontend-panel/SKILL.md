# Skill: Frontend del panel

## Cuándo usarla

Usar al construir Dashboard, Bandeja de Atención, Trámites por Aprobar, Base de Clientes, login, modales, tablas, estados o componentes compartidos.

## Dirección visual

- Reproducir el lenguaje de los mockups: sidebar azul marino, superficies claras, bordes suaves, tarjetas sobrias y jerarquía tipográfica fuerte.
- Azul para acciones primarias y selección; verde para resuelto o aprobado; ámbar para pendiente; rojo para riesgo, rechazo o bloqueo.
- Interfaz en español y formato comprensible para Argentina.
- Priorizar escaneo: títulos, subtítulos, chips de estado, contadores y acciones próximas al dato.
- No agregar gradientes morados, estética genérica de landing ni decoración que compita con alertas y conversaciones.

## UX operativa

- Los estados se expresan con texto, icono y color; nunca solo con color.
- Las acciones críticas deben mostrar motivo, estado actual, autoridad requerida y confirmación antes de mutar.
- Una alerta retenida debe explicar qué se detectó y por qué no se envió.
- La bandeja debe permitir distinguir prioridad, cliente, último mensaje, responsable y tiempo de espera.
- Tablas, listas y paneles deben conservar dimensiones estables para evitar saltos al cargar datos.
- Diseñar estados de carga, vacío, error, sin permisos y éxito desde el inicio.

## Accesibilidad y responsive

- Usar HTML semántico, foco visible, labels reales y navegación por teclado.
- No depender del hover para acciones importantes.
- Mantener contraste suficiente y mensajes de error asociados al campo.
- En pantallas pequeñas, reordenar sin ocultar la información necesaria para decidir.
- Usar iconos consistentes y tooltips solo para iconos no evidentes.

## Verificación

Ejecutar `npm run lint` y `npm run build` desde `frontend/`. Probar manualmente al menos un flujo permitido y uno retenido o derivado cuando el cambio afecte reglas de negocio.