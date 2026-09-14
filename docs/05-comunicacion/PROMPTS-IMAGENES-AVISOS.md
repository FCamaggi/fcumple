# Prompts de imagen para los avisos de la cartelera

> Versión 2 (2026-09-13) — reescrita a pedido del usuario para producir avisos reales con los datos del evento (fecha, hora, lugar), sin ninguna mención a tema/dresscode (el evento no tiene temática, es un carrete de cumpleaños simple). La v1 de estos prompts pedía explícitamente "sin texto legible"; esta versión cambia ese criterio porque ahora el aviso debe llevar la info real del evento escrita encima.

## Dato importante sobre texto en imágenes generadas por IA

Los generadores de imagen (Midjourney, DALL·E, Stable Diffusion, Nano Banana, etc.) **no son confiables para escribir texto legible correcto** — suelen deformar letras, acentos y números, sobre todo en español y con fechas/horas exactas. Por eso este documento separa dos caminos, no uno solo:

1. **Camino recomendado — fondo generado + texto real superpuesto.** Se genera con IA solo el *fondo/ilustración* (sin pedirle texto), y el texto real (fecha, hora, lugar, título) se agrega después con una herramienta de diseño que renderiza tipografía de verdad, prolija y sin errores — Canva, Figma, o un poster HTML/CSS armado a medida con la paleta exacta de `../03-diseno/DESIGN.md`. **Esta es la vía que ya usé para producir el aviso "Guía rápida" real — ver la sección 3 de este documento.**
2. **Camino directo — pedirle el texto al generador.** Más rápido si el modelo que uses soporta bien texto en español (algunos modelos 2026 lo hacen razonablemente, ej. Nano Banana/Imagen de Google, o Ideogram). Se incluye un prompt para este camino en la sección 2, con la advertencia de revisar cada carácter antes de publicar.

## Datos reales del evento (para pegar en cualquier prompt o diseño)

| Campo                         | Valor                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| Evento                        | Cumpleaños Fabrizio                                                   |
| Fecha                         | Viernes 9 de octubre de 2026                                           |
| Hora                          | 22:00 hrs                                                              |
| Lugar                         | Pasaje Argentina 2299, Independencia                                   |
| Corte de confirmación (RSVP) | Hasta el 1 de octubre de 2026, 23:59 hrs                               |
| Tema / dresscode              | No aplica — no hay temática, es un carrete sin código de vestimenta |

Paleta de referencia (`../03-diseno/DESIGN.md` sección 4):

| Token           | Hex         | Uso                  |
| --------------- | ----------- | -------------------- |
| `ink-950`     | `#0d0b12` | Fondo, negro cálido |
| `hotpink-500` | `#ff2f92` | Acento primario      |
| `acid-400`    | `#c8ff3d` | Confirmación/éxito |
| `laser-500`   | `#00e6d8` | Info/neutro          |
| `flame-500`   | `#ff5a1f` | Alerta/urgencia      |

Restricción dura (`DESIGN.md` sección 3): nada de degradado violeta-azul-índigo genérico de IA, nada de glassmorphism, nada de ilustración "flat corporate". Tiene que sentirse flyer de club real, no landing de startup.

---

## 1. Prompts de fondo (sin texto) — para superponer texto real después

> **Corrección (2026-09-13, ronda 2):** la v2 de estos prompts pedía formato **4:5** — un error mío: el componente real que muestra la portada de cada post (`AnnouncementFeed.tsx`) la recorta a **16:9** (`aspect-video object-cover`), así que una imagen 4:5 llega recortada y pierde composición arriba/abajo. Corregido acá a 16:9. Además, el usuario marcó que `invitacion-cover.png` (solo un glow abstracto, sin ningún elemento reconocible) "no tiene nada" — se agrega iconografía concreta.
>
> **Corrección (2026-09-13, ronda 3):** la ronda 2 metió una pulsera/wristband física como ícono — error mío, contradice lo que el usuario aclaró desde el primer pedido y que ya documenta `../04-producto/estado-actual.md`: **no hay pulseras ni objetos físicos de ningún tipo, todo el acceso es 100% web** (link personal + QR mostrado desde el celular). Reemplazado acá por un teléfono con el QR/link brillando en la pantalla — el mismo objeto real que existe en el flujo (`DoorQrOverlay`), no un accesorio inventado.

### 1.1 Aviso "Guía rápida" (qué se puede hacer en la app)

```
A moody nightclub flyer background, landscape 16:9, dark warm-black backdrop (#0d0b12), cut by three crossing neon light beams in hot pink (#ff2f92), acid lime-green (#c8ff3d), and cyan-turquoise (#00e6d8) — like stage lights cutting through haze/smoke. Grainy film texture overlay, high contrast, no soft gradients. Three clear supporting icons arranged across the frame, evenly spaced left to right, each lit by one of the neon beams: on the left, a smartphone screen glowing with an abstract checkmark shape (confirming attendance, no readable UI); in the center, a smartphone screen showing a glowing QR code; on the right, a vintage disposable film camera. Everything digital/handheld — no physical wristbands, no printed tickets, no ID cards, no lanyards of any kind. Calm dark negative space in the upper third, reserved for a headline to be added later in a design tool. No people, no faces. No text of any kind — this is a pure background/hero graphic, text gets added afterward in Figma/Canva. Style: gritty rave poster illustration, not flat vector, not 3D render, not glassmorphism, not a SaaS dashboard mockup.
```

### 1.2 Aviso "Invitación" (el flyer principal del cumpleaños)

```
A nightclub-style birthday flyer background, landscape 16:9, dark warm-black backdrop (#0d0b12), one dominant hot-pink (#ff2f92) neon glow radiating from the upper-left corner, thin acid-green (#c8ff3d) accent line along the bottom edge, subtle film grain, high contrast, no soft gradients. Clear focal object in the lower-right third: a smartphone held at a slight angle, its screen glowing with an abstract ticket/QR-shaped light (no readable text or UI) — this is the visual anchor, it should read immediately as "your invitation lives on your phone," not a physical object. No wristbands, no printed tickets, no ID cards, no lanyards — the whole event is web-based, access is only ever a link and a QR on a screen. Calm dark negative space across the upper two-thirds, reserved for a large headline and a date/address line to be added later in a design tool. Composition feels like the flyer photo that circulates on WhatsApp before a real party: a little chaotic energy at the edges, not a clean corporate poster. No text of any kind rendered by you — leave it fully blank for real typeset text to be added afterward. No people, no faces.
```

## 2. Prompt con texto directo (camino 2 — revisar cada carácter antes de usar)

Solo si tu generador soporta bien texto en español. Reemplazá `{...}` por los datos reales de la tabla de arriba.

```
A nightclub-style birthday flyer poster, dark warm-black background (#0d0b12), crossing neon beams in hot pink (#ff2f92), acid lime-green (#c8ff3d) and cyan (#00e6d8), film grain, high contrast, no soft gradients, no glassmorphism. Bold condensed display typography (style like Anton or Druk), all caps, tight tracking. Render this exact text, spelled correctly, nothing else: headline "CUMPLEAÑOS FABRIZIO", below it in a smaller mono/condensed line "VIERNES 9 DE OCTUBRE · 22:00 HRS", below that "PASAJE ARGENTINA 2299, INDEPENDENCIA", and at the bottom in a small accent line "CONFIRMA ANTES DEL 1 DE OCTUBRE". No people, no faces. Portrait 4:5. Gritty rave poster style, not a corporate event template.
```

**Antes de publicar cualquier imagen de este camino**: ampliá y revisá letra por letra el título, la fecha, la hora y la dirección — es común que el modelo cambie una letra, duplique un número o rompa un acento.

## 3. Estado de las imágenes (2026-09-13, ronda 3 — final)

3 imágenes finales en `assets/avisos-fuente/` en la raíz del repo — **no en `public/`**, a propósito: todo lo que hay en `public/` se copia tal cual al build de producción y quedaría servido públicamente en una URL adivinable sin necesidad; estas son material fuente para subir a mano desde `PostsPanel`, no assets del sitio. Preview visual armado con estas imágenes finales (mismo componente/paleta que el real): pedile el link al asistente si lo perdiste, o volvé a generarlo — no vive en el repo, es un artifact aparte.

| Archivo | Formato | Estado |
|---|---|---|
| `flyer-invitacion-standalone.png` | 1122×1402 (4:5) | ✅ Listo. Texto correcto letra por letra, sin dresscode, sin objetos físicos. No se usa como portada de post (la tarjeta recorta a 16:9) — es para mandar directo por WhatsApp como imagen adjunta o imprimir. |
| `invitacion-cover.png` | 1672×941 (16:9) | ✅ Listo. Celular con el QR/ticket brillando en pantalla como ancla visual — sin pulseras ni objetos físicos, sin texto (lo pone la app). Portada del post "Invitación". |
| `guia-rapida-cover.png` | 1672×941 (16:9) | ✅ Listo. Tres celulares/objetos (check de confirmación, QR, cámara descartable) — sin pulseras, sin texto. Portada del post "Guía rápida". |

Las tres pasaron revisión de texto (sin errores), paleta (dentro de la familia magenta/ácido/láser sobre negro), y del criterio "sin objetos físicos de acceso" (nada de pulseras/DNI/credenciales — todo el acceso es vía celular, como el resto del proyecto).

### Copy lista para pegar en `PostsPanel` (admin → Avisos)

> Corregida (2026-09-13, ronda 3): tono chileno, no rioplatense (nada de "vos"/"podés"/"confirmá"). Se sacó la línea "sin temática ni dresscode, vengan como quieran" y se agregó una nota sobre extras (más acompañantes, comida, estacionamiento, alojamiento).

**Post "Invitación"** (portada: `invitacion-cover.png`)
- Título: `Cumpleaños Fabrizio`
- Subtítulo: `Carrete en casa — viernes 9 de octubre`
- Cuerpo:
  > Estás invitado a mi cumpleaños.
  >
  > 📅 Viernes 9 de octubre, 22:00 hrs
  > 📍 Pasaje Argentina 2299, Independencia
  >
  > Trae tu copete — lo típico ya lo tengo yo, así que ya sabes 😉
  >
  > Confirma tu asistencia desde el link que te llegó, antes del 1 de octubre. Si necesitas más cupo de acompañantes, tienes alguna restricción de comida, o te hace falta estacionamiento o alojamiento, escríbeme directo si es algo que tengo que resolver, o déjalo anotado en tu confirmación si es solo un aviso. Cualquier novedad la vas a encontrar acá, en la cartelera.

**Post "Guía rápida: qué puedes hacer acá"** (portada: `guia-rapida-cover.png`)
- Subtítulo: `Todo lo que necesitas saber antes de venir`
- Cuerpo:
  > Confirma tu asistencia desde tu link personal (y avísame si vienes con alguien más).
  >
  > El día del carrete, muestra tu QR en la puerta — te van a reconocer y ahí se desbloquea la cámara.
  >
  > Saca fotos con tu rollo digital: tienes un cupo limitado, como una cámara descartable real. Se revelan todas juntas después del evento.
  >
  > Cualquier aviso nuevo va a aparecer acá arriba, en la cartelera.

No subí nada a Supabase — las imágenes y esta copy quedan listas para que las cargues tú desde `/admin` cuando quieras, o para que me pidas hacerlo si prefieres que lo haga yo.

## Notas de uso

- Formato recomendado de export: JPG, WEBP o PNG, lado más largo ≤1600px (mismo límite que ya usa `CameraCapture.tsx` para las fotos de invitados, ver `../02-arquitectura/02-arquitectura-tecnica.md` §8.3) — no hace falta subir algo pesado.
- Las imágenes se suben desde el panel de avisos del admin (`PostsPanel`, Etapa 6 de `../04-producto/BACKLOG.md`).
- Si cambia algún dato del evento (fecha, hora, lugar), actualizá primero la tabla de esta sección y después cualquier imagen ya generada — no al revés.
