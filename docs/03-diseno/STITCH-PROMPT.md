# Prompt para Stitch

> Basado en `DESIGN.md` (v1, secciones 1-12) y en `DESEO-DISENO-USUARIO.md`. Un solo prompt global define la base de estilo — se pega una vez al configurar el proyecto/tema en Stitch. Cada pantalla lleva solo su propio prompt corto, asumiendo que el estilo global ya está aplicado; no hace falta repetirlo pantalla por pantalla.

**Modo en Stitch: Web, no App.** El proyecto es un sitio (Next.js/Vite en Vercel, `02-arquitectura-tecnica.md`), sin distribución como app nativa instalable. Esto aplica a las 7 pantallas, incluidas las de invitado en formato mobile — siguen siendo *mobile web* (se abren desde el link de WhatsApp en el navegador del celular), no una app instalada con chrome nativo (tab bar, splash screen, gestos de swipe-back).

## Prompt global (pegar una sola vez, es la base de estilo para todo el proyecto)

```
Diseña la interfaz de una invitación de cumpleaños web con estética de flyer de discoteca / poster de club nocturno de carrete — NO una invitación de cumpleaños tradicional, nada de globos, tortas, confeti de emoji ni paleta pastel infantil.

Fondo: oscuro y cálido, casi negro con un toque de violeta oscuro (familia de referencia: #0d0b12), nunca gris-azulado de dashboard corporativo. Todo pensado como si fuera de noche, sin versión de modo claro.

Paleta: colores neón saturados que compiten entre sí como luces cruzadas de club — magenta/rosa eléctrico intenso (ref. #ff2f92), verde-lima ácido (ref. #c8ff3d), cian-turquesa tipo láser (ref. #00e6d8), y naranja-rojo cálido para alertas (ref. #ff5a1f). Estos son puntos de partida, no valores exactos cerrados: podés explorar matiz/saturación dentro de esta misma familia. Prohibido usar degradado violeta-a-azul-índigo (el gradiente típico de producto de IA) y prohibido usar azul eléctrico corporativo tipo SaaS. En cualquier vista, nunca combines más de 2 de estos neones saturados a la vez sin fondo oscuro de por medio — si no, se ve caótico en vez de "luces de club".

Tipografía: una fuente display condensada, gruesa y con carácter, tipo cartel de club o rave (referencia de estilo: Anton, Bebas Neue, Druk) para títulos, nombres y números grandes de impacto — en mayúsculas o con tracking amplio. Para texto de cuerpo y UI, una grotesca con personalidad (referencia: Space Grotesk, General Sans, Neue Montreal), nunca Inter ni system-ui genérica. Para tokens/códigos, una monoespaciada tipo credencial de acceso (referencia: Space Mono, JetBrains Mono).

Textura y superficie: agrega grano/ruido sutil de fondo, bordes con textura (no todo limpio y liso), y resplandores de luz radial (glow) detrás de elementos clave simulando un foco de luz real — nunca fondos con degradado plano de relleno.

Prohibido explícitamente: glassmorphism decorativo sin razón, tarjetas con esquinas muy redondeadas flotando con sombra suave difusa, iconos de check en círculo verde para "confirmado" (los estados de color van dentro de la paleta de arriba, no como ícono genérico), layouts centrados con mucho espacio en blanco vacío estilo landing de startup, cualquier elemento que se vea como el default de una librería de componentes sin trabajar.

Voz y tono del copy (aplica a cualquier texto que generes en las pantallas): directo, cálido, con actitud de carrete, tuteo, frases cortas — nunca el tono neutro de un formulario corporativo. Ejemplos: "Estás en la lista, {nombre}." / "Quedaste dentro. Nos vemos ahí." / "Esta entrada no es válida. Revisá el link que te mandaron."

Dos formatos de pantalla conviven en este proyecto, cada prompt de pantalla específica indica cuál usar: las pantallas de invitado (invitación, RSVP, confirmación) se diseñan mobile-first, pensadas para abrirse desde WhatsApp en el celular. Las pantallas de admin se diseñan desktop-first — se componen como una consola física con módulos distribuidos (no como tarjetas sueltas flotando en un grid genérico de dashboard), porque las usa una sola persona organizando el evento, probablemente desde notebook.
```

## Pantallas específicas

Cada bloque de abajo asume que ya aplicaste el prompt global. Pegalo como continuación en la misma conversación de Stitch, o al final del prompt global si Stitch no mantiene contexto entre pantallas.

### 1. Invitación pública — estado inicial (mobile vertical)

```
Pantalla: la invitación personalizada que ve un invitado al abrir su link único, antes de responder. Se ve como una entrada/pulsera de acceso a un evento de club: formato de tarjeta alargada con un borde dentado/perforado en un extremo simulando el desprendible de un ticket real. El nombre del invitado aparece en la tipografía display, gigante, como si estuviera en la lista de la puerta — probá con un nombre largo (ej. "Maria Fernanda Contreras Espinoza") para verificar que el layout no se rompe. Debajo, un código corto en la fuente monoespaciada, como el código de la entrada. Muestra también los datos del evento (fecha, hora, lugar) en la tipografía funcional, de forma secundaria y menos protagónica que el nombre. No hay tema ni dresscode que mostrar — es un carrete de cumpleaños simple, sin temática. Un resplandor de luz magenta detrás de la tarjeta. Un botón/llamado a la acción claro para responder si va o no, con la misma actitud de "carrete", no un botón gris de formulario.
```

### 2. Invitación pública — formulario de respuesta / RSVP (mobile vertical)

```
Pantalla: formulario de respuesta dentro de la misma tarjeta de invitación. El control principal para decidir "voy / no voy" es un fader horizontal, como el crossfader de una mesa de mezcla de DJ, que se desliza entre un extremo marcado "VOY" (verde-lima ácido) y otro extremo marcado "NO VOY" (naranja-rojo cálido), con una zona intermedia neutra para "sin decidir" — mientras el fader esté en esa zona intermedia, el botón de enviar se ve deshabilitado/apagado, porque no se acepta un RSVP sin una posición explícita. El fondo de la tarjeta cambia de tono según qué extremo está activo. Debajo, un contador tipo stepper (+/-) para indicar cuántos acompañantes (+1) trae el invitado, respetando un máximo permitido — mostrá el stepper en su valor máximo permitido, no solo en 0. Números grandes en la tipografía display. Un campo de texto libre para dejar una nota, con estilo de post-it de backstage, no un textarea gris estándar — probá con una nota de varias líneas. Botón de enviar con la misma actitud de club.
```

### 3. Invitación pública — confirmación tras responder "voy" (mobile vertical)

```
Pantalla: momento de celebración inmediatamente después de confirmar asistencia. Debe sentirse como que se prenden las luces y arranca la música — no un simple mensaje de "gracias" con un check verde. Usa un flash/resplandor de luz en verde-lima ácido, partículas cayendo con forma de rectángulos finos de neón usando solo dos colores (verde-lima ácido y magenta, no los cuatro acentos a la vez) para no saturar la vista, y un mensaje breve en la tipografía display, grande, con tono de "estás dentro" / "nos vemos ahí". Mantén el fondo oscuro de base detrás de todo el efecto de luces.
```

### 4. Invitación pública — estado de error, token inválido (mobile vertical)

```
Pantalla: lo que ve alguien que abre un link roto o mal copiado (el token no corresponde a ningún invitado). No es una página de error 404 genérica de framework: se ve como si la entrada no fuera reconocida en la puerta de un club. Mensaje corto y directo tipo "esta entrada no es válida, revisá el link que te mandaron", en un tono cálido de la paleta de alerta (naranja-rojo), sin perder la estética de club del resto del proyecto — nada de ilustración de error genérica de librería de componentes.
```

### 5. Panel de admin — vista general (desktop)

```
Pantalla: panel de administración privado, compuesto como la mesa de control de un DJ o la lista de la puerta de un club — los módulos (contador de confirmados, lista de invitados) se distribuyen como piezas de una consola física, no como tarjetas blancas sueltas en un grid de dashboard SaaS. Arriba, un indicador tipo ecualizador/VU meter con barras verticales en verde-lima ácido que suben según la proporción de invitados confirmados sobre el total, con el número total de confirmados en tipografía display gigante al lado. Debajo, una tabla/lista de invitados con formato de lista de guardia de puerta: nombre en la fuente funcional o mono, un chip de color sólido indicando el estado (confirmado / pendiente / rechazado, cada uno con su color de la paleta, sin usar ícono de check verde), y la cantidad de acompañantes mostrada como "+N" en tipografía display pequeña. Filtros arriba de la lista con estilo de pestañas de carpeta/clipboard, no un select de formulario genérico. Diseñado para pantalla de escritorio, no mobile.
```

### 6. Panel de admin — estado vacío de la lista (desktop)

```
Pantalla: la misma vista general de admin, pero sin ningún invitado cargado todavía (recién se configuró el evento). En vez de una ilustración de estado vacío genérica, un mensaje directo tipo bitácora de puerta recién abierta: "todavía no hay nadie en la lista — agregá tu primer invitado", con un botón/acción prominente para crear el primer invitado, manteniendo la estética de consola del resto del panel.
```

### 7. Panel de admin — edición de un invitado (desktop)

```
Pantalla: vista o modal para editar un invitado desde el panel de admin. Campos: nombre, cupo máximo de acompañantes permitido (+1), y una nota privada del admin que el invitado nunca ve — mostrada como un chip discreto tipo ficha de backstage que se expande al tocarlo. Mantiene el mismo lenguaje visual oscuro, con textura y glow, evitando que se vea como un formulario de configuración gris estándar. Diseñado para pantalla de escritorio.
```

## Checklist al revisar lo que devuelva Stitch

Antes de aceptar cualquier pantalla como base para implementar, verificar contra `DESIGN.md` sección 3:

- [ ] ¿Aparece degradado violeta/índigo en algún fondo? → rechazar y regenerar.
- [ ] ¿Usa ícono de check verde en círculo para "confirmado"? → pedir alternativa (chip de color de la paleta, no ícono).
- [ ] ¿La tipografía es Inter/Roboto/system default sin personalidad? → pedir cambio de fuente explícito.
- [ ] ¿Se ve como un dashboard SaaS con tarjetas blancas/grises flotando? → rechazar, reforzar la metáfora de consola/club en el prompt.
- [ ] ¿Hay textura/grano/glow real que lo diferencie de un mockup genérico de IA? → si no, iterar el prompt pidiéndolo explícitamente.
- [ ] ¿Las pantallas de admin quedaron en formato mobile en vez de desktop, o viceversa con las de invitado? → pedir el viewport correcto explícitamente.
- [ ] ¿El copy generado suena a formulario neutro en vez de al tono directo/cálido de la sección de voz y tono? → pedir que reescriba el texto con esa actitud.
