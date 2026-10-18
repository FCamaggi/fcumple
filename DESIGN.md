---
name: Cámara de cumpleaños
description: Entrada de evento y rollo de cámara desechable, con una piel de color que cambia en cada rama de cumpleaños.
colors:
  ink-950: "oklch(16% 0.015 298)"
  ink-900: "oklch(19% 0.023 301)"
  smoke-700: "oklch(33% 0.033 305)"
  paper-100: "oklch(95% 0.016 314)"
  hotpink-500: "oklch(67% 0.247 358)"
  acid-400: "oklch(93% 0.215 125)"
  laser-500: "oklch(83% 0.145 187)"
  flame-500: "oklch(68% 0.211 38)"
typography:
  display:
    fontFamily: "Anton, Impact, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: "2rem"
    letterSpacing: "0.025em"
  body:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Space Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "1rem"
    letterSpacing: "0.05em"
rounded:
  none: "0px"
  default: "0.25rem"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.acid-400}"
    textColor: "{colors.ink-950}"
    typography: "{typography.display}"
    rounded: "{rounded.none}"
    height: "44px"
  button-toggle-off:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.paper-100}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "36px"
  input-field:
    backgroundColor: "{colors.ink-950}"
    textColor: "{colors.paper-100}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  card-form:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.paper-100}"
    rounded: "{rounded.none}"
    padding: "24px"
---

# Design System: Cámara de cumpleaños

## Overview

**Creative North Star: "La entrada y el rollo"**

El sistema se apoya en dos objetos: la **entrada** de un evento y el **rollo** de una cámara desechable. Cada invitado recibe un boleto que lo identifica y un cupo limitado de disparos que se descuenta con cada foto. La interfaz tiene que dejar claro, sin explicarlo, que esto es para una fiesta concreta, con fecha y lugar, y que cada foto cuenta.

El tono es nocturno y directo: fondo oscuro, texto corto en mayúsculas, etiquetas de máquina y formas rectas. Es adulto, de fiesta, sin infantilismo. No depende del neón. Los colores de acento de hoy pertenecen a la **piel** del cumpleaños anterior; lo que se mantiene entre eventos es la estructura (boleto, rollo, etiquetas, formas, ritmo).

**Key Characteristics:**
- Un boleto de evento y un contador de rollo como piezas con identidad propia.
- Tres voces tipográficas con roles fijos: titular, texto y etiqueta de máquina.
- Esquinas rectas, bordes finos y fondos por capas de tono en vez de sombras negras.
- Un único acento fuerte por pantalla; el resto, contraste de tinta y papel.
- Solo modo oscuro.

## Colors

Una base de tinta casi negra con un violeta apenas perceptible, papel claro para el texto y cuatro acentos de la piel actual.

### Primary
- **Ácido** (`acid-400`, oklch(93% 0.215 125)): la acción principal. Botón primario, botón de modo activo y el número de disparos que quedan.

### Secondary
- **Rosa fuerte** (`hotpink-500`, oklch(67% 0.247 358)): selección de texto y énfasis puntual.
- **Láser** (`laser-500`, oklch(83% 0.145 187)): etiqueta con el nombre del evento sobre el título.

### Tertiary
- **Llama** (`flame-500`, oklch(68% 0.211 38)): estados de error y de rollo agotado.

### Neutral
- **Tinta profunda** (`ink-950`, oklch(16% 0.015 298)): fondo de página, campos de texto y texto sobre el acento primario.
- **Tinta de superficie** (`ink-900`, oklch(19% 0.023 301)): tarjetas y paneles sobre el fondo.
- **Humo** (`smoke-700`, oklch(33% 0.033 305)): bordes, perforaciones y orificios decorativos del rollo, casi siempre con transparencia.
- **Papel** (`paper-100`, oklch(95% 0.016 314)): texto principal; las etiquetas usan el mismo papel con 50 a 70 % de opacidad.

### Named Rules
**La Piel Es de la Rama.** Los cuatro acentos (Ácido, Rosa fuerte, Láser, Llama) son la piel del cumpleaños anterior, no la identidad del producto. Cada rama de cumpleaños define sus propios acentos; los neutros y los roles (acción principal, error, etiqueta de evento) se conservan.

**La Regla de Una Voz.** En una pantalla hay un solo acento fuerte para la acción principal. Los demás acentos nombran estados o etiquetas y nunca compiten con ella.

## Typography

**Display Font:** Anton (con Impact y sans-serif)
**Body Font:** Space Grotesk (con system-ui y sans-serif)
**Label/Mono Font:** Space Mono (con ui-monospace y monospace)

**Character:** Un titular condensado y de cartel contra un texto geométrico sobrio y una etiqueta de máquina de escribir. Se lee como sellos y boletos: poca palabra, mucha jerarquía.

### Hierarchy
- **Display** (Anton 400, 1.5rem, 2rem, tracking 0.025em, mayúsculas): título de pantalla ("Inscríbete", "Entra") y botones primarios.
- **Body** (Space Grotesk 400, 0.875rem, 1.25rem): texto de campos y párrafos cortos.
- **Label** (Space Mono 400, 11px, tracking 0.05 a 0.1em, mayúsculas): etiquetas de campo, nombre del evento, mensajes de estado. Las notas al pie bajan a 10px con menos opacidad.
- **Counter** (Space Mono 700, 1.5rem, cifras tabulares): solo el número de disparos restantes.

### Named Rules
**La Regla de Máquina.** Todo lo que parece dato de sistema (etiquetas, estados, cupos) va en Space Mono y en mayúsculas. Los titulares van en Anton. No se mezclan los roles.

## Layout

Móvil primero y de una sola columna. Los formularios y tarjetas ocupan hasta `max-w-sm` (24rem) y se centran. El espaciado sigue una escala de 8, 16 y 24 px: 8 entre etiqueta y campo, 16 entre grupos y 24 de relleno de tarjeta. Los objetivos táctiles miden al menos 44 px (`tap-target`; el botón primario mide 44 px y el selector de modo 36 px). Hay un velo de grano al 3 % de opacidad sobre el fondo de algunas pantallas de invitado (no sobre las fotos) y no es parte del sistema.

## Elevation & Depth

La profundidad es sobre todo tonal: Tinta de superficie sobre Tinta profunda, con un borde fino de Humo a 40 %. Las sombras negras suaves se usan en tarjetas (`shadow-2xl`) y hundidas en el contador (`shadow-inner`). En la piel actual, los botones primarios llevan un brillo de color (`shadow-glow-acid`); ese brillo pertenece a la piel y no es obligatorio.

### Shadow Vocabulary
- **Tarjeta** (`box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25)`): paneles y tarjetas sobre el fondo.
- **Hundido** (`box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05)`): el contador de rollo.
- **Brillo de acento** (`box-shadow: 0 0 24px -2px rgba(200, 255, 61, 0.45)`): botón primario en la piel actual.

### Named Rules
**La Regla del Foco en la Foto.** La interfaz nunca tapa ni procesa la foto: el rollo es un concepto de cupo, no un filtro. Sin grano, viraje ni efecto sobre las imágenes.

## Shapes

Esquinas rectas: botones, campos, tarjetas y contador no tienen radio. El único radio de 0.25rem es el valor por defecto de la escala. Los círculos aparecen solo como orificios decorativos del rollo y como muescas del boleto. Bordes de 1 px en Humo; el contador usa 2 px.

## Components

### Buttons
- **Shape:** rectos (0px), 44 px de alto en la acción principal.
- **Primary:** fondo Ácido, texto Tinta profunda, Anton en mayúsculas con tracking amplio; al pulsar se reduce al 98 %. Deshabilitado: opacidad 60 % y cursor bloqueado.
- **Selector de modo:** dos botones de 36 px en Space Mono. El activo es un Ácido lleno; el inactivo es solo un borde de Humo a 60 % con texto Papel.

### Inputs / Fields
- **Style:** fondo Tinta profunda, relleno 8 y 12 px, texto Papel en Space Grotesk 0.875rem, sin borde propio ni radio.
- **Focus:** el contorno del navegador está desactivado (`outline-none`); el foco visible queda pendiente de definir.
- **Error:** mensaje en Llama, Space Mono en mayúsculas, con `role="alert"`.

### Cards / Containers
- **Corner Style:** recto.
- **Background:** Tinta de superficie.
- **Border:** 1 px de Humo a 40 %.
- **Internal Padding:** 24 px.

### Boleto (WristbandCard)
La pieza que confirma que es un evento. Una tarjeta con una línea de perforación punteada en Humo y muescas semicirculares en los extremos (`perforation`, `notch-left`, `notch-right`). Debe leerse como entrada de un evento y no como pase de abordar.

### Contador de rollo (FilmRollCounter)
Una ventanita en Space Mono con el número de disparos restantes. Al sacar una foto, el dígito baja con un movimiento corto y lineal. Alrededor tiene tres orificios por lado, decorativos. El número va en Ácido y pasa a Llama con "Se acabó el rollo". Un único `aria-label` accesible reemplaza a los adornos.

## Do's and Don'ts

### Do:
- **Do** mantener un único acento fuerte por pantalla para la acción principal.
- **Do** poner datos de sistema (etiquetas, estados, cupos) en Space Mono y en mayúsculas.
- **Do** que el boleto muestre claramente que es la entrada a un evento: nombre, fecha y lugar de ese cumpleaños.
- **Do** respetar `prefers-reduced-motion`: el sistema ya reduce todas las animaciones a un instante.
- **Do** definir los acentos en cada rama de cumpleaños y conservar los neutros y los roles.

### Don't:
- **Don't** aplicar grano, viraje ni filtro a las fotos: el rollo es el cupo, no un efecto.
- **Don't** hacer que el boleto parezca un pase de abordar de avión.
- **Don't** tratar los acentos neón actuales como la identidad del producto.
- **Don't** usar esquinas redondeadas en botones, campos o tarjetas.
- **Don't** usar Anton para datos de sistema, ni Space Mono para titulares.
