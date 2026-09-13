# Prompts de imagen para los avisos de la cartelera

> No genero imágenes yo mismo en este entorno — estos son prompts listos para pegar en un generador de imágenes (Midjourney, DALL·E, Stable Diffusion, etc.). Están escritos en inglés porque la mayoría de estos modelos responde mejor así, pero el resultado no debe llevar texto legible salvo que se indique lo contrario (dejale el texto real a los campos de título/subtítulo/cuerpo del post, no a la imagen).

Paleta de referencia (ver `docs/DESIGN.md` sección 4) — dale estos hex al prompt si el generador los acepta:

| Token           | Hex         | Uso                  |
| --------------- | ----------- | -------------------- |
| `ink-950`     | `#0d0b12` | Fondo, negro cálido |
| `hotpink-500` | `#ff2f92` | Acento primario      |
| `acid-400`    | `#c8ff3d` | Confirmación/éxito |
| `laser-500`   | `#00e6d8` | Info/neutro          |
| `flame-500`   | `#ff5a1f` | Alerta/urgencia      |

Restricción dura (DESIGN.md sección 3): nada de degradado violeta-azul-índigo genérico de IA, nada de glassmorphism, nada de ilustración "flat corporate". Tiene que sentirse flyer de club real, no landing de startup.

---

## 1. Post "Guía rápida" (el segundo post, el que se sube ahora)

Contenido del post (referencia, no es el prompt): explica qué se puede hacer en la app — confirmar asistencia, mostrar el QR en la puerta, sacar fotos con el rollo digital, revisar la cartelera para avisos.

### Prompt sugerido

```
A moody nightclub flyer poster, dark warm-black background (#0d0b12), cut
by three crossing neon light beams in hot pink (#ff2f92), acid lime-green
(#c8ff3d), and cyan-turquoise (#00e6d8) — like stage lights cutting through
haze/smoke. Grainy film texture overlay, high contrast, no soft gradients.
Central composition: a stylized wristband/access-pass ticket floating at an
angle, a small QR-code-shaped icon, and a vintage disposable-camera icon,
arranged like a numbered backstage instruction card (think: club flyer
crossed with an airplane safety card, NOT a corporate infographic). Bold
condensed display typography feel in the composition even if no readable
text is rendered. Aspect ratio 4:5 (portrait, mobile-first). No people, no
faces. No readable text anywhere in the image — leave all text out, this
image is a background/hero graphic that sits behind real typeset copy.
Style: gritty rave poster illustration, not flat vector, not 3D render, not
glassmorphism, not a SaaS dashboard mockup.
```

### Variante corta (si el modelo tiene límite de tokens)

```
Nightclub flyer poster, dark background #0d0b12, three crossing neon beams
(hot pink #ff2f92, acid green #c8ff3d, cyan #00e6d8), film grain, high
contrast. Floating wristband ticket + QR icon + disposable camera icon,
arranged like a backstage instruction card. No text, no people, no
gradients, no glassmorphism. Portrait 4:5. Gritty rave poster style.
```

---

## 2. Post "Invitación" (el primero, calco del mensaje que se manda por WhatsApp)

Este post lo escribe el usuario con su propio texto — el prompt de abajo es solo si también quiere una imagen de portada genérica para acompañarlo (no es obligatorio, el pedido original dice que este post es "calcado del mensaje + la imagen", así que puede que ya tenga su propia imagen).

### Prompt sugerido

```
A single nightclub invitation flyer, dark warm-black background (#0d0b12),
one dominant hot-pink (#ff2f92) neon glow radiating from behind a bold
condensed display headline shape (render as abstract glowing light, not as
literal readable letters), thin acid-green (#c8ff3d) accent line, subtle
film grain. Composition feels like the flyer photo that circulates on
WhatsApp before a real party: a little chaotic energy, not a clean
corporate poster. No readable text. No people, no faces. Portrait 4:5.
```

---

## Notas de uso

- Ambos prompts piden explícitamente **sin texto legible** — el texto real (título, subtítulo, cuerpo) lo pone el post en la app, no la imagen. Si el generador igual mete letras, está bien mientras no sea el foco central.
- Formato recomendado de export: JPG o WEBP, lado más largo ≤1600px (mismo límite que ya usa `CameraCapture.tsx` para las fotos de invitados, ver `docs/02-arquitectura-tecnica.md` §8.3) — no hace falta subir algo pesado.
- Cuando tengas las imágenes, se suben desde el panel de avisos del admin (`PostsPanel`) una vez que esa parte esté implementada (ver la Etapa 6 propuesta en `docs/BACKLOG.md`).
