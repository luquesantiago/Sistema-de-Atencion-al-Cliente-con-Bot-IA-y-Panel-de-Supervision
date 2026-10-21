# Sistema de Diseño y Reglas de UI — Seguros Castaño (CSS plano)

## 0. Directrices principales para la IA

- **Identidad visual:** confianza, calidez y profesionalismo; paleta castaño y crema con efectos Liquid Glass sutiles.
- **Evitar dashboards genéricos:** no usar por defecto fondos gris-azulados (`#F3F4F6`), azul estándar (`#3B82F6`) ni interfaces sin identidad.
- **Prioridad:** funcionalidad, legibilidad, accesibilidad y claridad de la información por encima de los efectos decorativos.
- **Consistencia:** reutilizar variables CSS y clases existentes. No crear estilos diferentes para componentes equivalentes.
- **Responsive obligatorio:** diseñar y comprobar las vistas para móvil, tablet y escritorio.
- Antes de crear o modificar una interfaz, respetar estas reglas y revisar los estilos y componentes ya existentes en el proyecto.
- Usar **CSS plano** (archivos `.css`, variables CSS y media queries). No instalar frameworks, preprocesadores ni dependencias solo por motivos visuales.

## 1. Tokens base (variables CSS)

Todos los valores de este documento se centralizan en `:root`. Los componentes deben usar `var(--token)` y no repetir valores hexadecimales.

```css
:root {
  /* Superficies */
  --color-bg: #F7F4EF;               /* Crema Avena */
  --color-surface: #FFFFFF;
  --color-sidebar: rgba(74, 53, 37, 0.92);
  --color-sidebar-text: #F7F4EF;

  /* Acción y acento */
  --color-primary: #7F5539;          /* Marrón Castaño Rico */
  --color-primary-hover: #65422B;
  --color-secondary: #B08968;        /* Caramelo / Latte */
  --color-accent-light: #EDE0D4;     /* Crema Almendra */
  --color-text: #2B1E16;             /* Café Profundo */
  --color-text-muted: #7D6B5D;       /* Taupe / Tierra Suave */

  /* Estados semánticos */
  --color-success-bg: #E6F4EA;
  --color-success-text: #00704A;
  --color-warning-bg: #FEF3C7;
  --color-warning-text: #92400E;
  --color-danger-bg: #FEE2E2;
  --color-danger-text: #B91C1C;

  /* Derivados de la paleta para superficies que la guía no nombra */
  --color-danger-hover: #8F1D17;
  --nav-overlay: rgba(247, 244, 239, 0.15);
  --nav-borde: rgba(247, 244, 239, 0.14);
  --nav-texto: rgba(247, 244, 239, 0.78);
  --velo-modal: rgba(43, 30, 22, 0.45);
  --sombra-modal: 0 12px 32px rgba(43, 30, 22, 0.22);

  /* Liquid Glass — ver sección 2 */
  --glass-fondo: linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.55) 100%);
  --glass-borde: rgba(255, 255, 255, 0.75);
  --glass-desenfoque: blur(16px) saturate(150%);
  --glass-sidebar: linear-gradient(180deg, rgba(92,66,46,0.9) 0%, rgba(74,53,37,0.93) 48%, rgba(56,38,26,0.96) 100%);

  /* Tipografía */
  --font-sans: "SoDo Sans", Inter, Manrope, "Helvetica Neue", Helvetica, Arial, sans-serif;

  /* Radios, sombras y layout */
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-soft: 0 2px 8px rgba(43, 30, 22, 0.08);
  --sidebar-width: 18rem;            /* 288px */
}
```

## 2. Identidad visual y Liquid Glass

La estética debe ser cálida, sobria y profesional. Liquid Glass es un recurso de apoyo, no un efecto que deba aplicarse a todos los elementos. El cristal se apoya en tres piezas: una **superficie translúcida** con desenfoque, un **reflejo especular** en el borde superior y un **fondo ambiental** cálido que le da algo que refractar.

```css
/* Superficie de cristal clara: tarjetas de indicadores, panel destacado
   y control de búsqueda. Usa los tokens de la sección 1. */
.glass {
  background: var(--glass-fondo);
  -webkit-backdrop-filter: var(--glass-desenfoque);
  backdrop-filter: var(--glass-desenfoque);
  border: 1px solid var(--glass-borde);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);   /* reflejo del borde superior */
}

/* Barra de navegación: vidrio castaño, más oscuro, con borde luminoso */
.sidebar {
  background: var(--glass-sidebar);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  backdrop-filter: blur(22px) saturate(150%);
  border-right: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset -1px 0 0 rgba(255, 255, 255, 0.07),
    0 10px 30px rgba(43, 30, 22, 0.3);
}

/* Fondo ambiental: capa fija que cubre la ventana y no agrega alto a la página */
.ambient-layer {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: clip;
  pointer-events: none;
}

.ambient-orb {
  position: absolute;
  border-radius: 50%;
}

.ambient-orb--uno {
  top: -8rem; right: 2rem; width: 30rem; height: 30rem;
  background: radial-gradient(circle at 30% 30%, var(--color-secondary), transparent 70%);
  filter: blur(110px);
  opacity: 0.4;
}

.ambient-orb--dos {
  bottom: -8rem; left: 2rem; width: 26rem; height: 26rem;
  background: radial-gradient(circle at 60% 40%, var(--color-primary), transparent 70%);
  filter: blur(120px);
  opacity: 0.3;
}
```

- **Reflejo especular:** todo cristal lleva una luz blanca que cae desde el borde superior (`inset 0 1px 0`) y se desvanece; es lo que da el aspecto de vidrio. No acumular más de un brillo por componente.
- **Degradado y desenfoque:** usar `backdrop-filter` de forma moderada y solo cuando el contenido de fondo no afecte la lectura.
- **Fondo ambiental:** dos orbes de luz cálida difuminados (caramelo y castaño) dentro de una capa fija, para que las superficies de cristal tengan algo que refractar. No deben distraer ni reducir el contraste.
- **Dónde se usa el cristal:** en superficies de apoyo —la barra de navegación, las tarjetas de indicadores, el panel destacado y la búsqueda de la cartera—.
- **Dónde NO:** tablas, ficha del cliente, modales y formularios usan fondos sólidos o casi opacos para asegurar la lectura clara de los datos. Los botones y los campos son sólidos: el vidrio no se aplica a los controles de acción.
- Evitar acumular transparencias, sombras intensas, brillos y desenfoques en un mismo componente.

## 3. Paleta de colores

### Superficies y navegación

| Uso | Token | Valor |
|---|---|---|
| Fondo principal | `--color-bg` | `#F7F4EF` |
| Superficie de tarjetas | `--color-surface` | `#FFFFFF` |
| Sidebar | `--color-sidebar` | `rgba(74, 53, 37, 0.92)` |
| Texto sobre sidebar | `--color-sidebar-text` | `#F7F4EF` |

### Colores de acción y acento

| Uso | Token | Valor |
|---|---|---|
| Primary | `--color-primary` | `#7F5539` |
| Primary hover | `--color-primary-hover` | `#65422B` |
| Secondary | `--color-secondary` | `#B08968` |
| Accent light | `--color-accent-light` | `#EDE0D4` |
| Texto principal | `--color-text` | `#2B1E16` |
| Texto secundario | `--color-text-muted` | `#7D6B5D` |

### Derivados y superficies de cristal

| Uso | Token | Valor |
|---|---|---|
| Fondo de cristal claro | `--glass-fondo` | degradado blanco 82% → 55% |
| Borde de cristal claro | `--glass-borde` | `rgba(255, 255, 255, 0.75)` |
| Desenfoque de cristal | `--glass-desenfoque` | `blur(16px) saturate(150%)` |
| Fondo del sidebar | `--glass-sidebar` | degradado castaño |
| Texto sobre sidebar (secundario) | `--nav-texto` | `rgba(247, 244, 239, 0.78)` |
| Hover/activo sobre sidebar | `--nav-overlay` | `rgba(247, 244, 239, 0.15)` |
| Borde sobre sidebar | `--nav-borde` | `rgba(247, 244, 239, 0.14)` |
| Velo de modal y de menú | `--velo-modal` | `rgba(43, 30, 22, 0.45)` |
| Sombra de modal | `--sombra-modal` | `0 12px 32px rgba(43, 30, 22, 0.22)` |
| Peligro (hover) | `--color-danger-hover` | `#8F1D17` |

### Estados semánticos

```css
.badge { display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.25rem 0.625rem; border-radius: 999px;
  font-size: 0.875rem; font-weight: 500; }
.badge--success { background: var(--color-success-bg); color: var(--color-success-text); }
.badge--warning { background: var(--color-warning-bg); color: var(--color-warning-text); }
.badge--danger  { background: var(--color-danger-bg);  color: var(--color-danger-text); }
```

- Vigente / aprobado / éxito → `badge--success`.
- Por renovar / advertencia → `badge--warning`.
- Vencido / error / acción destructiva → `badge--danger`.
- Los estados deben incluir texto explícito y, cuando ayude, un icono. **Nunca comunicar información únicamente mediante el color.**
- Verificar el contraste de texto y controles sobre cada superficie; ajustar tonos si no cumplen los requisitos de accesibilidad.

## 4. Tipografía — inspirada en la web de Starbucks

Starbucks utiliza las familias corporativas SoDo Sans, Lander y Pike. SoDo Sans es una tipografía propietaria y no debe suponerse disponible en el proyecto. Utilizarla únicamente si los archivos y la licencia necesarios están disponibles. No descargar ni copiar archivos de fuentes propietarias sin autorización.

- **Preferida, si está licenciada y disponible:** `SoDo Sans`.
- **Fallback:** `"Helvetica Neue", Helvetica, Arial, sans-serif`.
- **Alternativa práctica:** `Inter` o `Manrope`, según las fuentes ya instaladas en el proyecto.
- No importar fuentes nuevas sin revisar primero la configuración existente.
- Usar la familia sans-serif principal en toda la interfaz. No usar fuentes manuscritas o decorativas en pantallas administrativas.
- La serif `Lander` se reserva para momentos editoriales de Starbucks; no es necesaria en este sistema administrativo.

```css
body {
  font-family: var(--font-sans);
  font-size: 1rem;          /* 16px */
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-bg);
  letter-spacing: -0.01em;  /* solo si la fuente mantiene buena legibilidad */
}

h1 { font-size: clamp(1.5rem, 1.2rem + 1.2vw, 1.875rem); /* 24–30px */
     font-weight: 600; line-height: 1.3; }
h2 { font-size: clamp(1.125rem, 1rem + 0.5vw, 1.5rem);   /* 18–24px */
     font-weight: 600; line-height: 1.35; }

.text-secondary { font-size: 0.875rem; font-weight: 400; color: var(--color-text-muted); } /* 14px */
.label          { font-size: 0.875rem; font-weight: 500; }
.text-aux       { font-size: 0.75rem; color: var(--color-text-muted); }  /* mínimo 12px */
```

- Construir la jerarquía principalmente con tamaño, peso y color; no usar demasiados estilos distintos.

## 5. Componentes y comportamiento

### Botones

```css
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
  min-height: 35px; padding: 0.4rem 1rem;
  border-radius: var(--radius-md); border: 1px solid transparent;
  font: inherit; font-weight: 500; cursor: pointer;
  transition: background-color 0.2s, box-shadow 0.2s; }

.btn--primary { background: var(--color-primary); color: #FFF; }
.btn--primary:hover { background: var(--color-primary-hover); }

.btn--secondary { background: var(--color-surface); color: var(--color-text);
  border-color: var(--color-accent-light); }

.btn--danger { background: var(--color-danger-bg); color: var(--color-danger-text); }

.btn:focus-visible { outline: 3px solid var(--color-secondary); outline-offset: 2px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn[aria-busy="true"] { pointer-events: none; }  /* evita dobles envíos */
```

- Usar radios coherentes, sin exigir forma de píldora en todos los botones.
- Mostrar estados de carga.
- Etiquetas claras y área de interacción cómoda (mínimo 44px) en móvil.

### Tarjetas y paneles

Dos variantes según el contenido:

```css
/* Panel de datos: sólido, casi opaco, para máxima legibilidad */
.card { background: var(--color-surface); border: 1px solid var(--color-accent-light);
  border-radius: var(--radius-lg); padding: 1.25rem; box-shadow: var(--shadow-soft); }

/* Tarjeta de indicadores / panel destacado: superficie de cristal (sección 2) */
.card--glass {
  background: var(--glass-fondo);
  -webkit-backdrop-filter: var(--glass-desenfoque);
  backdrop-filter: var(--glass-desenfoque);
  border: 1px solid var(--glass-borde);
  border-radius: var(--radius-lg); padding: 1.25rem; box-shadow: var(--shadow-soft);
}
```

- Espaciado interno uniforme y sombras suaves.
- Mantener una jerarquía clara entre título, dato principal y descripción.
- El cristal es solo para tarjetas de indicadores y paneles destacados; los paneles de datos van sólidos.

### Formularios

```css
.field { display: flex; flex-direction: column; gap: 0.375rem; }
.field label { font-size: 0.875rem; font-weight: 500; }
.input { padding: 0.625rem 0.75rem; background: var(--color-surface);
  border: 1px solid var(--color-secondary); border-radius: var(--radius-md); font: inherit; }
.input:focus-visible { outline: 3px solid var(--color-secondary); outline-offset: 1px; }
.input[aria-invalid="true"] { border-color: var(--color-danger-text); }
.input:disabled { background: var(--color-accent-light); cursor: not-allowed; }
.field-error { font-size: 0.875rem; color: var(--color-danger-text); }
```

- Cada campo debe tener una etiqueta visible.
- Mostrar errores cerca del campo, con texto que explique cómo corregirlos.
- No depender únicamente del color para indicar errores o validaciones.

### Tablas y datos

Los listados de cartera usan **una fila por tarjeta**: cada fila es una superficie independiente con su borde y esquinas redondeadas, separada de la siguiente. El encabezado es una etiqueta tenue en versalitas, sin fondo.

```css
.table-wrap { overflow-x: auto; }   /* evita desbordar la página en móvil */

.table {
  width: 100%;
  border-collapse: separate;        /* permite separar las filas entre sí */
  border-spacing: 0 10px;
}
.table thead th { text-align: left; color: var(--color-text-muted);
  font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; padding-bottom: 0; }
.table tbody td { padding: 0.85rem 1rem; background: var(--color-surface);
  border-top: 1px solid var(--color-accent-light);
  border-bottom: 1px solid var(--color-accent-light); }
.table tbody td:first-child { border-left: 1px solid var(--color-accent-light);
  border-radius: var(--radius-md) 0 0 var(--radius-md); }
.table tbody td:last-child { border-right: 1px solid var(--color-accent-light);
  border-radius: 0 var(--radius-md) var(--radius-md) 0; }

.table tbody tr:hover td { background: var(--color-bg); border-color: var(--color-secondary); }
.table tbody tr[aria-current] td { background: var(--color-accent-light); border-color: var(--color-secondary); }
.table tbody tr[aria-current] td:first-child { box-shadow: inset 3px 0 0 var(--color-primary); }
```

- Encabezados distinguibles y filas fáciles de seguir.
- **Sin cristal en tablas:** usar fondos sólidos o casi opacos para asegurar la lectura clara de los datos.
- Filtrar y paginar con conteo visible ("Mostrando X de Y").
- Incluir estados de carga, vacío y error.
- Mantener visibles las acciones importantes sin saturar cada fila.

### Navegación

La barra lateral es una superficie de **cristal castaño** (sección 2). Los ítems al pasar el mouse o estar activos se vuelven pastillas de vidrio crema, y el acento caramelo marca la sección activa.

```css
.sidebar {
  background: var(--glass-sidebar);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  backdrop-filter: blur(22px) saturate(150%);
  border-right: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--color-sidebar-text);
}

/* Ítem activo: pastilla de vidrio + barra caramelo (nunca solo color) */
.nav-link[aria-current="page"] {
  background: linear-gradient(180deg, rgba(247,244,239,0.26), rgba(247,244,239,0.13));
  border-left: 3px solid var(--color-secondary);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.32), 0 3px 10px rgba(20,12,8,0.28);
  font-weight: 600;
}
.nav-link:focus-visible { outline: 3px solid var(--color-secondary); outline-offset: 2px; }

/* Móvil: barra superior con botón de menú y panel contraíble */
.topbar {
  position: sticky; top: 0; z-index: 30;
  background: var(--glass-sidebar);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  backdrop-filter: blur(18px) saturate(150%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.16);
}
.topbar-menu-button { display: grid; place-items: center; width: 42px; height: 42px; }

.sidebar {
  position: fixed; inset: 0 auto 0 0; width: min(82vw, var(--sidebar-width));
  z-index: 60; transform: translateX(-100%); transition: transform 0.25s;
}
.sidebar.is-open { transform: translateX(0); }
.sidebar-backdrop { position: fixed; inset: 0; z-index: 50; background: var(--velo-modal); }

/* Escritorio: sidebar fijo al alto de la ventana, igual en todas las vistas */
@media (min-width: 1024px) {
  .sidebar { width: var(--sidebar-width); transform: none; }
  .main { margin-left: var(--sidebar-width); }
  .topbar, .topbar-menu-button, .sidebar-backdrop { display: none; }
}
```

- Indicar claramente la sección activa con `aria-current="page"`.
- El sidebar incluye la marca y la caja del usuario, con **Cerrar sesión** (con confirmación) dentro del panel contraíble en móvil.
- Cerrar el menú móvil: al navegar o cerrar sesión, con el velo, con el botón de cerrar y con `Escape`.
- En escritorio el sidebar queda **fijo al alto de la ventana** para verse igual en todas las vistas, en vez de estirarse con el contenido.
- Controles fáciles de usar con teclado y tacto.

### Marca

El nombre "Seguros Castaño" se acompaña de una insignia cuadrada con degradado caramelo→castaño y un escudo, el nombre en crema en negrita y un subrayado caramelo que se desvanece. El subtítulo va en versalitas espaciadas.

```css
.marca { display: flex; align-items: center; gap: 10px; }
.marca__insignia { display: grid; place-items: center; width: 40px; height: 40px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--color-secondary), var(--color-primary));
  color: var(--color-sidebar-text); }
.marca__nombre { font-size: 1.15rem; font-weight: 700; color: var(--color-sidebar-text); }
.marca__rol { font-size: 0.72rem; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.12em; color: var(--nav-texto); }
```

## 6. Responsive

Breakpoints (mobile-first, con `min-width`):

- Tablet: `768px`
- Escritorio: `1024px`

```css
.kpi-grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }

@media (min-width: 768px)  { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } }
```

- Diseñar primero para pantallas pequeñas y ampliar progresivamente.
- Revisar tablas, formularios, modales, menús, botones y títulos en anchos pequeños.
- No resolver el responsive simplemente reduciendo tamaños: adaptar distribución, orden y comportamiento cuando sea necesario.

## 7. Accesibilidad y calidad

- Mantener contraste suficiente entre texto, fondo, bordes y controles.
- Garantizar navegación mediante teclado y un indicador de foco visible.
- Usar elementos HTML semánticos y etiquetas accesibles para controles e iconos.
- Respetar `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- No sacrificar accesibilidad, rendimiento ni comprensión por lograr un efecto visual.
- Verificar los cambios en móvil y escritorio antes de dar una pantalla por terminada.

## 8. Reutilización

- Centralizar colores, tipografía, radios y sombras en las variables de `:root` (sección 1).
- Preferir `var(--token)` a repetir valores hexadecimales y estilos arbitrarios.
- Antes de crear una clase o componente nuevo, comprobar si ya existe uno equivalente.
- Si una regla visual entra en conflicto con un requisito funcional, preservar la funcionalidad y resolver el diseño de forma coherente con esta guía.