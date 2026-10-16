# Sistema de Diseño y Reglas de UI — Seguros Castaño

## 0. Directrices principales para la IA

- **Identidad visual:** confianza, calidez y profesionalismo; paleta castaño y crema con efectos Liquid Glass sutiles.
- **Evitar dashboards genéricos:** no usar por defecto fondos gris-azulados (`#F3F4F6`), azul estándar (`#3B82F6`) ni interfaces sin identidad.
- **Prioridad:** funcionalidad, legibilidad, accesibilidad y claridad de la información por encima de los efectos decorativos.
- **Consistencia:** reutilizar tokens y componentes existentes. No crear estilos diferentes para componentes equivalentes.
- **Responsive obligatorio:** diseñar y comprobar las vistas para móvil, tablet y escritorio.
- Antes de crear o modificar una interfaz, respetar estas reglas y revisar los estilos y componentes ya existentes en el proyecto.
- No instalar dependencias ni cambiar la arquitectura solo por motivos visuales. Comprobar primero si las herramientas actuales alcanzan.

## 1. Identidad visual y Liquid Glass

La estética debe ser cálida, sobria y profesional. Liquid Glass es un recurso de apoyo, no un efecto que deba aplicarse a todos los elementos.

- **Degradado de cristal opcional:** `linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.48) 100%)`.
- **Desenfoque:** usar `backdrop-blur` de forma moderada y solo cuando el contenido de fondo no afecte la lectura.
- **Bordes:** `border border-white/70` en superficies de cristal cuando haya contraste suficiente.
- **Fondo ambiental:** orbes de luz cálida difuminados (`blur-[120px]`) con opacidad baja; no deben distraer ni reducir el contraste.
- **Tarjetas y paneles de datos:** priorizar superficies claras, casi opacas, con bordes sutiles y sombras suaves.
- **Tablas y formularios:** usar fondos sólidos o casi opacos para asegurar una lectura clara.
- Evitar acumular transparencias, sombras intensas, brillos y desenfoques en un mismo componente.

## 2. Paleta de colores

### Superficies y navegación

- **Fondo principal:** `#F7F4EF` — Crema Avena.
- **Superficie de tarjetas:** `#FFFFFF` o crema muy clara; cristal solo cuando sea apropiado.
- **Sidebar:** `rgba(74, 53, 37, 0.92)` — marrón castaño oscuro, con transparencia moderada.
- **Texto sobre sidebar:** `#F7F4EF`.

### Colores de acción y acento

- **Primary:** `#7F5539` — Marrón Castaño Rico.
- **Primary hover:** `#65422B`.
- **Secondary:** `#B08968` — Caramelo / Latte.
- **Accent light:** `#EDE0D4` — Crema Almendra.
- **Texto principal:** `#2B1E16` — Café Profundo.
- **Texto secundario:** `#7D6B5D` — Taupe / Tierra Suave.

### Estados semánticos

- **Vigente / aprobado / éxito:** fondo `#E6F4EA`, texto `#00704A`.
- **Por renovar / advertencia:** fondo `#FEF3C7`, texto `#92400E`.
- **Vencido / error / acción destructiva:** fondo `#FEE2E2`, texto `#B91C1C`.
- Los estados deben incluir texto explícito y, cuando ayude, un icono. **Nunca comunicar información únicamente mediante el color.**
- Verificar el contraste de texto y controles sobre cada superficie; ajustar tonos si no cumplen los requisitos de accesibilidad.

## 3. Tipografía — inspirada en la web de Starbucks

Starbucks utiliza las familias corporativas SoDo Sans, Lander y Pike. SoDo Sans es una tipografía propietaria y no debe suponerse disponible en el proyecto. Utilizarla únicamente si los archivos y la licencia necesarios están disponibles. No descargar ni copiar archivos de fuentes propietarias sin autorización.

### Familia principal

- **Preferida, si está licenciada y disponible:** `SoDo Sans`.
- **Fallback:** `"Helvetica Neue", Helvetica, Arial, sans-serif`.
- **Alternativa práctica si SoDo Sans no está disponible:** `Inter` o `Manrope`, según las fuentes ya instaladas en el proyecto.
- No importar fuentes nuevas ni agregar dependencias sin revisar primero la configuración existente.
- Para Seguros Castaño, utilizar la familia sans-serif principal en toda la interfaz. No usar fuentes manuscritas o decorativas en pantallas administrativas.
- La serif `Lander` de Starbucks se reserva para momentos editoriales de su marca; no es necesaria en este sistema administrativo.

### Escala tipográfica orientativa

- **Título principal de página:** `24–30px`, peso `600`, altura de línea aproximada `1.25–1.4`.
- **Título de sección:** `18–24px`, peso `500–600`.
- **Texto general:** `16px`, peso `400`, altura de línea `1.5`.
- **Texto secundario y etiquetas:** `14px`, peso `400–500`.
- **Texto auxiliar:** no bajar de `12px`; usarlo solo para información complementaria.
- Usar un espaciado entre letras ligeramente compacto, por ejemplo `-0.01em`, solo si la fuente elegida mantiene buena legibilidad.
- Construir la jerarquía principalmente con tamaño, peso y color; no usar demasiados estilos distintos.

## 4. Componentes y comportamiento

### Botones

- **Primario:** fondo `#7F5539`, texto claro y estados hover/focus/disabled visibles.
- **Secundario:** superficie clara, texto oscuro y borde discreto.
- **Destructivo:** estilo semántico rojo; reservarlo para acciones de riesgo.
- Usar radios redondeados coherentes, sin exigir forma de píldora en todos los botones.
- Mostrar estados de carga y evitar dobles envíos cuando corresponda.
- Los botones deben tener etiquetas claras y un área de interacción cómoda, especialmente en móvil.

### Tarjetas y paneles

- Radios de borde consistentes, aproximadamente `12–16px`.
- Espaciado interno uniforme.
- Sombras suaves y discretas; evitar elevaciones pesadas.
- Mantener una jerarquía clara entre título, dato principal y descripción.

### Formularios

- Cada campo debe tener una etiqueta visible.
- Diferenciar estados normal, focus, error y disabled.
- Mostrar errores cerca del campo y explicar cómo corregirlos.
- No depender únicamente del color para indicar errores o validaciones.

### Tablas y datos

- Encabezados distinguibles y filas fáciles de seguir.
- Mantener buen contraste y evitar fondos de cristal que dificulten leer los datos.
- Incluir estados de carga, vacío y error.
- Evitar desbordamientos horizontales en móvil; elegir una tabla desplazable o una presentación adaptada según el contenido.
- Mantener visibles las acciones importantes sin saturar cada fila.

### Navegación

- En escritorio (`lg:`), el sidebar puede usar un ancho fijo de `w-72`.
- En móvil, convertirlo en un menú contraíble o panel accesible desde una barra superior.
- Indicar claramente la sección activa y mantener controles de navegación fáciles de usar con teclado y tacto.

## 5. Responsive

- Diseñar primero para pantallas pequeñas y ampliar progresivamente a tablet y escritorio.
- Usar los breakpoints del sistema de estilos existente (por ejemplo `md:` y `lg:` en Tailwind).
- Grillas de indicadores: `grid-cols-1`, luego `md:grid-cols-2` y `lg:grid-cols-3` cuando el contenido lo permita.
- Revisar tablas, formularios, modales, menús, botones y títulos en anchos pequeños.
- No resolver el responsive simplemente reduciendo tamaños: adaptar distribución, orden y comportamiento cuando sea necesario.

## 6. Accesibilidad y calidad

- Mantener contraste suficiente entre texto, fondo, bordes y controles.
- Garantizar navegación mediante teclado y un indicador de foco visible.
- Usar elementos HTML semánticos y etiquetas accesibles para controles e iconos.
- Respetar `prefers-reduced-motion` y evitar animaciones innecesarias.
- No sacrificar accesibilidad, rendimiento ni comprensión por lograr un efecto visual.
- Verificar los cambios en móvil y escritorio antes de dar una pantalla por terminada.

## 7. Tokens y reutilización

- Centralizar colores, tipografía, radios y sombras en las variables o configuración de estilos que ya utilice el proyecto.
- Preferir tokens reutilizables a repetir valores hexadecimales y estilos arbitrarios por toda la aplicación.
- Antes de crear un componente nuevo, comprobar si ya existe uno equivalente.
- Si una regla visual entra en conflicto con un requisito funcional, preservar la funcionalidad y resolver el diseño de forma coherente con esta guía.
