---
version: 1
slug: "frontend-src-pages-login-tsx"
primary_target: "frontend/src/pages/Login.tsx"
related_targets: []
---

# Surface brief: Login (frontend/src/pages/Login.tsx)

Panel de ingreso del panel de supervisión de Seguros Castaño. Modo Operate: una sola acción, alta frecuencia de uso (operadores a diario, también móvil), Parcial 1 con credenciales de prueba visibles y auth real reservada al Parcial 2.

## Direction contract

THESIS: El ingreso como el único ítem que dueña el viewport: campo castaño a sangre con los orbes de la casa, el formulario anclado abajo-izquierda sobre el scrim, y el riel de glifos al borde derecho. Rechaza la tarjeta de cristal centrada flotando sobre crema.

OWN-WORLD: Suelo castaño profundo a sangre (#38261A→#2B1E16) con los orbes caramelo/castaño de la marca como atmósfera; glifos y tipografía crema (#F7F4EF) como única interfaz; wordmark display grande contra etiquetas tracked diminutas; controles estándar en lenguaje del feed: inputs con hairline crema translúcida, botón primario relleno crema con texto castaño, secundario outline. Paleta y tokens siguen siendo los de docs/design.md.

STORY: La operadora abre el panel a diario; la marca dueña la pantalla en el primer vistazo, el formulario se entiende sin instrucciones y se ingresa en segundos. En móvil la composición se mantiene: un solo ítem, viewport completo.

FIRST VIEWPORT: 1440x900. Fondo castaño a sangre + dos orbes difuminados. Abajo a la izquierda: wordmark «Seguros Castaño» en display (~96px, crema) con «PANEL DE ATENCIÓN» en versalitas tracked debajo; a la derecha del wordmark, el scrim carga el formulario (Usuario, Contraseña con toggle de ojo junto al campo —asociado al input por accesibilidad—, «Ingresar al Panel»); bajo el wordmark, la línea de autor (escudo + «Operadores y administración») y la ayuda con credenciales de prueba en texto tenue. Sin riel lateral: el usuario lo retiró por no tener utilidad (28/10/2026).

FORM: Superficie de feed vertical a pantalla completa (challenger del catálogo adoptado por el usuario en la ronda 2: pop-culture-shelf-vertical-video-feed-surface); la world solo aporta tipo, paleta, densidad y el movimiento de entrada seco; los controles siguen siendo los del platform. seed: a8445ede59eaf2ab.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Decisiones abiertas de la superficie

- Sin imagen fotográfica: la «media» del feed es el campo ambiental de la marca (orbes CSS), fiel al Liquid Glass de design.md.
- Los puntos de paginación del feed no se replican (serían contenido engañoso en un ingreso).
- Preparación Parcial 2: el bloque del formulario deja una ranura de estado de servidor (mensaje de error de auth) sin rehacer la composición.
