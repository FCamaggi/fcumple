# Invitación de Cumpleaños Web — Diseño Visual

> Este documento define la identidad visual del proyecto. Complementa a `01-vision-y-requisitos.md` (qué hace la app) y `02-arquitectura-tecnica.md` (cómo está construida) con el "cómo se ve y cómo se siente". La intención original que motiva este documento está en [`DESEO-DISENO-USUARIO.md`](./DESEO-DISENO-USUARIO.md) — si hay duda sobre una decisión de estilo, ese documento es la fuente de verdad sobre qué se pidió.

## 1. Concepto

**"El club entero, no solo la entrada."**

La referencia no es Canva ni una invitación de Evite. Es la previa de una noche de carrete: el flyer que circula por WhatsApp anunciando la fiesta, la entrada con código que escaneás en la puerta, la luz de neón cortando la oscuridad antes de entrar. La invitación y el RSVP son la puerta de entrada, no el límite del proyecto: la app está pensada para crecer como el **hub completo** desde el que se organiza el cumpleaños, con secciones de blog/noticias y galería de fotos en v2 (ver `01-vision-y-requisitos.md` sección 8 y `02-arquitectura-tecnica.md` sección 8). Este documento cubre en detalle la dirección visual para v1 (invitación, RSVP, admin básico) y deja anotada, sin cerrarla del todo, la dirección para las superficies de v2 — para que no haya que reinventar el lenguaje visual cuando se construyan.

Metáfora rectora por superficie:

| Superficie | Metáfora visual |
|---|---|
| Invitación (`/i/{token}`) | El **flyer/entrada** que te llega a la puerta — personalizada con tu nombre, como una pulsera de acceso con tu código. |
| Formulario de RSVP | La **consola de sonido**: faders, switches, VU meters — no un `<form>` de Google Forms. |
| Confirmación de asistencia | El momento en que **entran las luces y arranca el track** — celebración real, no un ✓ verde. |
| Panel de admin | La **lista de la puerta / mesa de DJ**: no son piezas sueltas sobre un dashboard blanco — la vista completa se compone como una consola física, con los distintos paneles (`HeadcountMeter`, `DoorList`) distribuidos como módulos de una mesa de control, no como cards flotantes independientes en un grid genérico. |
| Blog/noticias (v2) | La **cartelera del club / el aviso que se escucha por el parlante** — novedades que se leen o escuchan antes de entrar, no un feed de blog corporativo. |
| Galería/momentos (v2) | El **rollo de cámara descartable que circula en la mesa** — cupo limitado por invitado, la gracia está en la escasez, no en el scroll infinito. |

## 2. Principios de diseño (cómo se decide)

1. **Movimiento con intención, no decoración.** Toda animación comunica algo (estado cambia, algo se confirma, algo entra en foco). Nada de motion gratuito ni "porque se ve bonito".
2. **Contraste duro, no degradados suaves.** Colores planos y saturados que chocan entre sí, como luz de neón sobre oscuridad. Los degradados solo se usan para simular luz real (glow, spotlight), nunca como relleno de fondo genérico.
3. **Textura, no superficie pulida.** Grano, ruido, bordes imperfectos. Cero "todo limpio y flotando con sombra suave" — eso es lo primero que delata una interfaz genérica.
4. **Tipografía con actitud.** Un display condensado/gigante para momentos de impacto, nunca la misma fuente para todo. La tipografía es parte de la escenografía, no un detalle neutro.
5. **Componentes con nombre propio.** Cada componente visible de este documento tiene un nombre de dominio (Wristband Card, Fader Toggle, Door List) y una razón de ser distinta a "Button" o "Card" genéricos.
6. **Mobile-first solo donde corresponde.** La invitación y el RSVP se diseñan primero para pantalla vertical, porque la mayoría de invitados abren el link desde WhatsApp en el celular (RNF2). El panel de admin es distinto: RNF2 no lo exige mobile-first, y en la práctica un solo admin gestionando el evento probablemente lo abre desde notebook/desktop la mayor parte del tiempo. El admin se diseña para escritorio como formato principal, con una versión mobile funcional pero no la prioridad de layout.
7. **Gate de anti-genérico.** Antes de aceptar cualquier pantalla (propia o generada en Stitch), se pasa por la lista de la sección 3. Si algo de esa lista aparece, se rechaza o se reemplaza, sin excepción.

## 3. Lista negra — qué se prohíbe explícitamente

Directo del brief del usuario ([`DESEO-DISENO-USUARIO.md`](./DESEO-DISENO-USUARIO.md), sección 4):

- ❌ Degradado violeta → azul → índigo (el "gradiente de IA" default).
- ❌ Modo oscuro genérico con acento azul eléctrico "SaaS".
- ❌ Glassmorphism sin razón narrativa (blur + transparencia solo porque sí).
- ❌ Tarjetas con esquinas muy redondeadas (`radius` grande) + sombra suave flotante.
- ❌ Iconografía de check-en-círculo verde para "confirmado".
- ❌ `Inter`, `system-ui`, o cualquier fuente default sin intención tipográfica.
- ❌ Layout centrado con mucho espacio en blanco vacío, estilo landing de startup.
- ❌ Microinteracciones de template (fade-in genérico, hover que solo cambia opacidad).

Si un mockup de Stitch cae en cualquiera de estos puntos, se edita el prompt y se regenera — no se "arregla" por encima.

## 4. Paleta de color

Nada de violeta/índigo. La paleta se construye desde luz de club real: negro cálido de fondo (no negro puro ni gris-azulado de UI), y tres colores de neón que compiten entre sí como luces cruzadas, más un acento eléctrico único para "energía/celebración".

Los valores hex de abajo son la familia de referencia, no un lock definitivo: sirven para que Stitch y quien implemente arranquen del mismo lugar, pero pueden ajustarse en matiz/saturación durante la exploración de mockups sin romper el sistema, siempre dentro de la misma familia (magenta/ácido/láser/llama sobre negro cálido) y sin acercarse a la lista negra de la sección 3.

| Token | Valor | Uso |
|---|---|---|
| `--ink-950` | `#0d0b12` | Fondo base. Negro cálido con un pelo de violeta oscuro de sombra de club, NO azul-gris de UI. |
| `--ink-900` | `#16121d` | Fondo de superficies elevadas (tarjetas, paneles). |
| `--smoke-700` | `#3a3244` | Bordes, separadores, texto secundario sobre fondo oscuro. |
| `--hotpink-500` | `#ff2f92` | Color primario de marca. Botones principales, foco, "estás dentro". |
| `--acid-400` | `#c8ff3d` | Acento de alto impacto — confirmaciones, éxito, "vas". |
| `--laser-500` | `#00e6d8` | Segundo acento — estados neutros/informativos, links, "pendiente". Cian-turquesa, no azul corporativo. |
| `--flame-500` | `#ff5a1f` | Alertas y "no asiste"/urgencia (RSVP deadline cerca). Naranja-rojo cálido, no rojo semáforo plano. |
| `--paper-100` | `#f3ecf7` | Texto principal sobre fondo oscuro. Blanco tibio, no `#fff` puro. |

Reglas de uso:

- Fondo siempre oscuro (`ink-950`/`ink-900`). Es de noche, no hay versión "modo claro" — este proyecto no necesita uno (ver sección 11).
- Nunca combinar más de 2 neones saturados en la misma vista sin un fondo oscuro de por medio que los separe — si no, se ve caótico en vez de "luces de club".
- Los degradados están permitidos únicamente como **glow radial** (simulando foco de luz) detrás de un elemento, nunca como fondo plano de sección. Ej.: un resplandor radial de `hotpink-500` que se disuelve a transparente, a baja opacidad, para dar sensación de luz real.
- **Por qué `acid-400` para "confirmado/éxito" no es el mismo antipatrón que prohíbe la sección 3:** lo que se prohíbe explícitamente es el *ícono* de check-en-círculo verde (una forma y un componente específicos, universales en cualquier producto de IA/SaaS). Usar un tono de verde-lima ácido, no semáforo, como uno de los cuatro acentos de la paleta — coherente con el resto del sistema de luces de club — es una decisión de color dentro de un lenguaje visual propio, no un ícono genérico reciclado. Aun así, ningún estado depende solo de este color: ver la regla "no depender solo del color" en la sección de accesibilidad.

## 5. Tipografía

Dos familias, roles claramente separados — nunca una sola fuente para todo:

- **Display (impacto):** una condensada gruesa, tipo cartel de club — pensada en variables como `--font-display`. Referencias de carácter (no exactamente estas, pero de ese estilo): *Anton*, *Bebas Neue*, *Druk*. Uso: nombre del invitado en la invitación, títulos de sección, número de headcount gigante en el panel. Siempre en mayúsculas o con tracking amplio para que se sienta "poster", no "título de blog".
- **Funcional (UI/lectura):** una grotesca neutra pero con algo de personalidad — no `Inter`/`system-ui` a secas. Referencias: *Space Grotesk*, *General Sans*, *Neue Montreal*. Uso: cuerpo de texto, formularios, tabla de admin, notas.
- **Mono (datos/técnico):** una monoespaciada para tokens, timestamps, código de invitado — refuerza la idea de "credencial de acceso". Referencia: *Space Mono*, *JetBrains Mono*. Uso: el token visible en la Wristband Card, timestamps en el panel de admin.

Reglas:

- El nombre del invitado en `/i/{token}` se muestra en Display, grande, como si fuera el nombre en la lista de la puerta.
- Nunca mezclar Display y Funcional en la misma línea de texto corrida.
- Jerarquía por tamaño y peso, no por color — el color se reserva para estado (ver sección 4).

## 6. Lenguaje de movimiento

El motion es el 50% de esta identidad — sin él, la paleta y la tipografía no alcanzan para diferenciarse. Con Framer Motion (React) o equivalente, según lo que decida `02-arquitectura-tecnica.md` para el frontend.

### 6.1 Principios de motion

- **Beat, no ease genérico.** Las transiciones usan curvas con un poco de overshoot/snap (`spring` con `bounce` bajo, o `cubic-bezier` con rebote sutil), no `ease-in-out` plano. Debe sentirse como que algo "cae en el beat", no como un fade corporativo.
- **Entrada = las luces se prenden.** Cualquier pantalla nueva no aparece con un fade simple: aparece como si se encendiera un foco (glow que crece + blur-to-focus + leve escala desde 0.96 a 1).
- **Feedback físico, no solo visual.** Botones y toggles responden con un micro-desplazamiento/achicamiento de escala al tocarlos, como un fader o switch real reaccionando a la presión, no solo cambio de color. (La implementación exacta —clases, librería de motion— se decide en el código, no acá.)
- **Ruido/grain con vida.** Una textura de grano sutil (SVG o canvas) sobre el fondo, con una animación de opacidad casi imperceptible (film grain), para que nada se sienta "renderizado limpio".

### 6.2 Momentos clave a animar (con propósito específico)

| Momento | Qué pasa |
|---|---|
| Carga de `/i/{token}` | Pantalla arranca casi negra → glow de color entra desde el centro → el nombre del invitado se revela con un efecto tipo "flicker de neón encendiéndose" (2-3 parpadeos rápidos y se estabiliza). Comunica "se están prendiendo las luces para vos". |
| Mover el `FaderToggle` (asiste / no asiste) | El fader se desliza físicamente de un extremo a otro; el fondo entero de la tarjeta cambia de tono (acid/laser vs flame) con un cross-fade rápido de color, no instantáneo. |
| Ajustar +1 (stepper) | Cada incremento tiene un pequeño "punch" de escala en el número, como un contador de asistentes en la puerta. |
| Enviar RSVP confirmando asistencia | Micro-secuencia de celebración: destello de luz (flash de opacidad breve en `acid-400`), partículas tipo "confetti de club" (rectángulos finos de neón cayendo con rotación, no emoji 🎉) — usando únicamente `acid-400` y `hotpink-500` para no romper la regla de máximo 2 neones saturados por vista (sección 4) — y el texto de confirmación entra con el mismo efecto flicker de neón de la carga inicial. |
| Enviar RSVP rechazando | Tono distinto y contenido: sin celebración, mensaje breve y cálido, transición más lenta y suave en `flame-500` apagado — reconoce sin castigar. |
| Panel de admin: cambia un número (headcount) | El número no salta, cuenta (`count-up`) hasta el nuevo valor, como un contador de ticket en la entrada. |
| Panel de admin: fila cambia de estado | La fila entera flashea brevemente en el color de su nuevo estado antes de asentarse, como una luz de aviso en una consola. |

### 6.3 Performance en mobile

Restricciones de diseño (el cómo técnico se resuelve en implementación, no acá):

- Animaciones de partículas/confetti: cantidad acotada (decenas, no cientos) y solo animando posición/rotación/opacidad — nunca sombras ni filtros pesados en loop.
- Grain/textura: una sola capa de fondo, sin recalcularse en cada frame.
- Reducir movimiento automáticamente si el sistema tiene `prefers-reduced-motion: reduce` (ver sección 11).

## 7. Catálogo de componentes (con nombre propio)

Cada componente tiene una razón de ser distinta a su equivalente genérico. Nombrarlos así también evita que, al pedirle a un LLM o a Stitch que genere UI, se caiga en el default de "Card" o "Button".

### 7.1 `WristbandCard` — la tarjeta de invitación

Reemplaza a la típica "invitation card" centrada con sombra suave. Se ve como una **pulsera/entrada de acceso**: formato alargado, un borde perforado o dentado en un extremo (simulando el desprendible de una entrada real), el nombre del invitado en Display grande, el token en `--font-mono` chico como si fuera el código de barras/QR de acceso. Fondo `ink-900` con glow de `hotpink-500` detrás.

### 7.2 `FaderToggle` — el switch de asistencia

Reemplaza al par de botones "Sí / No" o a un toggle switch genérico. Es un **fader horizontal** (como el crossfader de una mesa de DJ): se arrastra o se toca de un extremo a otro entre "VOY" (`acid-400`) y "NO VOY" (`flame-500`), con una zona intermedia mínima para "sin decidir" en `smoke-700`. El fondo de toda la tarjeta reacciona al color del extremo activo.

Comportamiento al enviar (RF11): el botón de enviar del formulario queda deshabilitado mientras el fader esté en la zona intermedia de "sin decidir" — no se acepta un RSVP sin una posición explícita a un lado u otro. El invitado no puede quedar en estado `pending` por accidente al tocar enviar sin haber movido el fader; tiene que moverlo primero, y ahí recién se habilita el envío.

### 7.3 `HeadcountMeter` — el contador de gente confirmada

Reemplaza al típico stat card con número y label chico. Se ve como un **VU meter/ecualizador**: barras verticales que suben en `acid-400` según proporción de confirmados sobre el total, con el número grande en Display al lado. El pulso de las barras (loop muy sutil de altura) da sensación de "sonando en vivo".

### 7.4 `DoorList` — la tabla de invitados del admin

Reemplaza al `<table>` de admin genérico. Formato de **lista de guardia de puerta**: fila con nombre en mono/funcional, estado como un chip de color sólido (no ícono de check), y +1 mostrado como "+N" en Display chico, como si fuera la anotación a mano de quien maneja la puerta. Filtros arriba como si fueran pestañas de una carpeta de clipboard, no un `<select>` de formulario.

### 7.5 `NoteChip` — nota privada del admin

Chip pequeño, discreto, en `smoke-700`/`ink-900`, con un ícono propio simple (no el típico ícono de "sticky note" de librería de iconos) que se expande al tocar/hover para mostrar el texto completo, como una ficha de backstage.

### 7.6 `SignalToast` — confirmaciones y errores del sistema

Reemplaza al toast genérico esquina-superior-derecha con ícono de check. Aparece como una **señal de neón que se prende abajo del centro** (donde miraría alguien en su teléfono), con el mismo lenguaje flicker de la sección 6.2, en el color correspondiente al tipo de mensaje (`acid-400` éxito, `flame-500` error, `laser-500` info).

### 7.7 `RsvpDeadlineStrip` — cuenta atrás para responder

Franja fina, tipo "última llamada de bar", con el tiempo restante hasta el `rsvp_deadline` en `--font-mono`, con un leve pulso cuando quedan menos de 48 horas — no una barra de progreso gris estándar.

### 7.8 `AnnouncementTicker` — blog/noticias (v2)

Reemplaza al feed de blog tradicional (lista vertical de tarjetas con fecha e imagen destacada). Se ve como una **marquesina/letrero de neón con texto corrido**, tipo el aviso que pasa por la pantalla de un bar o el letrero sobre la barra: los títulos de las novedades más recientes circulan como ticker, y al tocar uno se expande a la nota completa con el mismo lenguaje flicker de neón de la sección 6.2. Prioriza que un invitado entienda "hay algo nuevo" de un vistazo, sin tener que entrar a una sección de blog separada.

### 7.9 `FilmRollCounter` — cupo de fotos en la galería (v2)

Contador del cupo de fotos que le queda a un invitado en el modo cámara in-app. Se ve como el **contador mecánico de una cámara descartable real**: un pequeño dial/ventana con el número de disparos restantes en `--font-mono`, que retrocede uno a uno con un "click" visual (no una barra de progreso ni un simple "3/10" en texto plano). Refuerza la idea de que el rollo es limitado y cada foto cuenta, a diferencia de una cámara de celular infinita.

### 7.10 `BackstagePass` — navegación del admin extendido (v2)

A medida que el panel de admin suma secciones (logística, presupuesto, etc.), su navegación deja de ser una sola vista y necesita un selector de secciones. Se ve como una **credencial de backstage/staff**: pestañas o chips con nombre de "área" (Puerta, Logística, Presupuesto...) en vez de un sidebar de dashboard genérico, manteniendo la estética de bastidores de club coherente con `DoorList` y `HeadcountMeter`.

## 8. Estados de sistema: error, carga y vacío

Estos estados van a existir en producción — no son "camino feliz" y no pueden quedar sin dirección solo porque no aparecen en el flujo principal.

- **Token inválido o expirado** (`/i/{token}` no matchea ningún invitado, ej. un typo al copiar el link): no se resuelve con una página de error 404 genérica de framework. Se muestra como si la entrada no fuera reconocida en la puerta — mensaje corto con la misma actitud del resto del proyecto (ej. "esta entrada no es válida, revisa el link"), usando `SignalToast` en `flame-500`.
- **Carga** (fetch en curso a Supabase): en `/i/{token}` no hace falta un spinner separado — el mismo efecto de "se están prendiendo las luces" de la sección 6.2 funciona también como estado de carga en sí mismo. En el panel de admin, un shimmer/pulso sutil sobre las filas del `DoorList` mientras carga, no un spinner genérico centrado en la pantalla.
- **`DoorList` vacío** (todavía no se cargó ningún invitado): mensaje directo tipo bitácora de puerta recién abierta (ej. "todavía no hay nadie en la lista — agregá tu primer invitado"), no una ilustración de estado vacío genérica de librería de componentes.

## 9. Brief para Stitch

El prompt completo para Stitch (global + uno por pantalla, con viewport, contenido de prueba y checklist de revisión) vive en [`STITCH-PROMPT.md`](./STITCH-PROMPT.md), no acá — para no mantener dos copias del mismo prompt que puedan desalinearse entre sí. Ese documento se actualiza cada vez que cambie algo de este `DESIGN.md` que afecte a Stitch (paleta, componentes, viewport por superficie, voz y tono, estados de sistema).

Resumen de lo que cubre: modo **Web** en Stitch (es un sitio, no una app nativa — ver decisión y razones más abajo), estética de flyer de club/discoteca con la paleta y tipografía de las secciones 4 y 5, viewport mobile vertical para invitación/RSVP/confirmación/error, viewport desktop para el panel de admin, y un checklist final contra la lista negra de la sección 3.

## 10. Voz y tono (copy)

El tono es el corazón del pedido original ([`DESEO-DISENO-USUARIO.md`](./DESEO-DISENO-USUARIO.md)): directo, cálido, con actitud de carrete — nunca corporativo ni de formulario. Ejemplos concretos para no dejarlo solo como adjetivo abstracto:

| Momento | Copy de referencia |
|---|---|
| Saludo en la invitación | "Estás en la lista, {nombre}." |
| Confirmación al responder "voy" | "Quedaste dentro. Nos vemos ahí." |
| Respuesta al responder "no voy" | "Que penal, te vamos a extrañar. Gracias por avisar." |
| Cerca del RSVP deadline | "Quedan {N} horas para confirmar tu entrada." |
| Token inválido | "Esta entrada no es válida. Revisá el link que te mandaron." |
| `DoorList` vacío (admin) | "Todavía no hay nadie en la lista. Agregá tu primer invitado." |

Reglas: frases cortas, tuteo, cero signo de exclamación forzado en cada línea (se usa donde realmente aporta energía, no como default), y nunca el tono neutro de "Gracias por tu respuesta" que podría estar en cualquier formulario.

## 11. Accesibilidad y casos borde

- **Contraste:** con fondo `ink-950`/`ink-900`, todo texto de lectura usa `paper-100` o `smoke-700` claro — verificar ratio AA (4.5:1) contra el fondo real, no contra el neón (los neones son para acentos y estado, no para texto largo).
- **`prefers-reduced-motion`:** cuando está activo, se elimina el flicker, el confetti y los loops de pulso. La transición de estado no colapsa a un fade genérico (eso repetiría exactamente el antipatrón que prohíbe la sección 3) — colapsa a un **corte duro de color sin animación** (el nuevo color/estado aparece directo, sin easing ni opacidad intermedia), coherente con el principio 2 ("contraste duro, no degradados suaves") en vez de con el motion que se está desactivando.
- **No depender solo del color:** cada estado (confirmado/pendiente/rechazado) lleva también texto o forma distinta (el `FaderToggle` tiene posición física, el chip de `DoorList` tiene texto), para daltonismo.
- **Sin modo claro:** este proyecto es deliberadamente solo-oscuro por concepto (es de noche). Se documenta como decisión de diseño, no como omisión — no hay backlog de "agregar light mode" para v1.
- **Tap targets:** el `FaderToggle` y los steppers deben tener área táctil real ≥44px aunque el elemento visual sea más fino, priorizando el uso desde el celular (RNF2).

## 12. Qué queda fuera de este documento

- Tokens de espaciado/grid detallados y sistema de componentes en código (Tailwind config, CSS variables completas) — se define al implementar, una vez que el mockup de Stitch valide la dirección visual acá descrita.
- Sonido/haptics (vibración al confirmar, sonido de club) — no está en el alcance v1 de `01-vision-y-requisitos.md`, pero queda anotado como idea coherente con esta identidad si se quiere explorar después.
- Especificación visual completa y prompts de Stitch para las pantallas de v2 (blog, galería con cámara in-app, admin extendido) — este documento ya fija su metáfora (sección 1) y sus componentes de referencia (`AnnouncementTicker`, `FilmRollCounter`, `BackstagePass`, sección 7.8-7.10), pero el detalle de layout y los prompts específicos se producen cuando se planifique v2 en detalle, no ahora.
