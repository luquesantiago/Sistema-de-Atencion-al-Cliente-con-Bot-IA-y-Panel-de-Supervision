---
name: frontend-panel
description: Guía visual y de UX del panel de supervisión (Dashboard, Bandeja de Atención, Trámites por Aprobar, Base de Clientes). Cubre colores, estados, accesibilidad y responsive. Usar al construir o modificar pantallas, componentes, tablas, modales o el login del frontend.
---

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

## Parcial 1

Pantallas que necesita el flujo (ver «Parcial 1: alcance y flujo» en AGENTS.md):

- Bandeja de Atención con los casos derivados: tomar el caso, ver la conversación completa, contestarle al cliente (el mensaje sale por WhatsApp) y cerrarlo.
- Trámites por Aprobar con los pedidos de cambio de teléfono: el número nuevo, los números actuales del cliente para elegir cuáles se desvinculan (puede no elegir ninguno), el fundamento (obligatorio: lo exige la base) y los botones de aprobar y rechazar.
- Sin pantalla de ingreso: el backend atribuye todo al usuario `operador`.

El mock (`Propuesta-Comercial-y-Tecnica.pdf`) no está en el repo. Si se toman ideas de él, no copiar lo que choca con lo acordado: «Cambio de Contrato» (en el DER es «modificación de póliza»), «Pendiente de firma» (el estado es «pendiente»), aprobar o rechazar sin fundamento, la bandeja sin responsable ni tiempo de espera, mensajes que prometen tiempos («a la brevedad»), el semáforo de 3 colores (el DER tiene 4 niveles de riesgo) y datos inventados en las fichas.

## Verificación

Ejecutar `npm run lint` y `npm run build` desde `frontend/`. Probar manualmente al menos un flujo permitido y uno retenido o derivado cuando el cambio afecte reglas de negocio.