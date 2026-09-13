# Prompts de imagen para los avisos de la cartelera

> Versión 2 (2026-09-13) — reescrita a pedido del usuario para producir avisos reales con los datos del evento (fecha, hora, lugar), sin ninguna mención a tema/dresscode (el evento no tiene temática, es un carrete de cumpleaños simple). La v1 de estos prompts pedía explícitamente "sin texto legible"; esta versión cambia ese criterio porque ahora el aviso debe llevar la info real del evento escrita encima.

## Dato importante sobre texto en imágenes generadas por IA

Los generadores de imagen (Midjourney, DALL·E, Stable Diffusion, Nano Banana, etc.) **no son confiables para escribir texto legible correcto** — suelen deformar letras, acentos y números, sobre todo en español y con fechas/horas exactas. Por eso este documento separa dos caminos, no uno solo:

1. **Camino recomendado — fondo generado + texto real superpuesto.** Se genera con IA solo el *fondo/ilustración* (sin pedirle texto), y el texto real (fecha, hora, lugar, título) se agrega después con una herramienta de diseño que renderiza tipografía de verdad, prolija y sin errores — Canva, Figma, o un poster HTML/CSS armado a medida con la paleta exacta de `../03-diseno/DESIGN.md`. **Esta es la vía que ya usé para producir el aviso "Guía rápida" real — ver la sección 3 de este documento.**
2. **Camino directo — pedirle el texto al generador.** Más rápido si el modelo que uses soporta bien texto en español (algunos modelos 2026 lo hacen razonablemente, ej. Nano Banana/Imagen de Google, o Ideogram). Se incluye un prompt para este camino en la sección 2, con la advertencia de revisar cada carácter antes de publicar.

## Datos reales del evento (para pegar en cualquier prompt o diseño)

| Campo | Valor |
|---|---|
| Evento | Cumpleaños Fabrizio |
| Fecha | Viernes 9 de octubre de 2026 |
| Hora | 22:00 hrs |
| Lugar | Pasaje Argentina 2299, Independencia |
| Corte de confirmación (RSVP) | Hasta el 1 de octubre de 2026, 23:59 hrs |
| Tema / dresscode | No aplica — no hay temática, es un carrete sin código de vestimenta |

Paleta de referencia (`../03-diseno/DESIGN.md` sección 4):

| Token | Hex | Uso |
| --- | --- | --- |
| `ink-950` | `#0d0b12` | Fondo, negro cálido |
| `hotpink-500` | `#ff2f92` | Acento primario |
| `acid-400` | `#c8ff3d` | Confirmación/éxito |
| `laser-500` | `#00e6d8` | Info/neutro |
| `flame-500` | `#ff5a1f` | Alerta/urgencia |

Restricción dura (`DESIGN.md` sección 3): nada de degradado violeta-azul-índigo genérico de IA, nada de glassmorphism, nada de ilustración "flat corporate". Tiene que sentirse flyer de club real, no landing de startup.

---

## 1. Prompts de fondo (sin texto) — para superponer texto real después

### 1.1 Aviso "Guía rápida" (qué se puede hacer en la app)

```
A moody nightclub flyer background, dark warm-black backdrop (#0d0b12), cut
by three crossing neon light beams in hot pink (#ff2f92), acid lime-green
(#c8ff3d), and cyan-turquoise (#00e6d8) — like stage lights cutting through
haze/smoke. Grainy film texture overlay, high contrast, no soft gradients.
Off-center composition leaving the upper-third and lower-third calm and dark
(negative space reserved for headline and body text to be added later in a
design tool). Small supporting icons floating at an angle: a stylized
wristband/access-pass ticket, a QR-code-shaped icon, a vintage
disposable-camera icon. Aspect ratio 4:5 (portrait, mobile-first). No people,
no faces. No text of any kind — this is a pure background/hero graphic, text
gets added afterward in Figma/Canva. Style: gritty rave poster illustration,
not flat vector, not 3D render, not glassmorphism, not a SaaS dashboard
mockup.
```

### 1.2 Aviso "Invitación" (el flyer principal del cumpleaños)

```
A single nightclub-style birthday flyer background, dark warm-black backdrop
(#0d0b12), one dominant hot-pink (#ff2f92) neon glow radiating from the
center-top, thin acid-green (#c8ff3d) accent line along one edge, subtle
film grain. Clear calm negative space in the vertical center and lower third
for a large headline, a date/time line, and an address line to be added
later in a design tool. Composition feels like the flyer photo that
circulates on WhatsApp before a real party: a little chaotic energy at the
edges, not a clean corporate poster. No text of any kind rendered by you —
leave it fully blank for real typeset text to be added afterward. No people,
no faces. Portrait 4:5.
```

## 2. Prompt con texto directo (camino 2 — revisar cada carácter antes de usar)

Solo si tu generador soporta bien texto en español. Reemplazá `{...}` por los datos reales de la tabla de arriba.

```
A nightclub-style birthday flyer poster, dark warm-black background
(#0d0b12), crossing neon beams in hot pink (#ff2f92), acid lime-green
(#c8ff3d) and cyan (#00e6d8), film grain, high contrast, no soft gradients,
no glassmorphism. Bold condensed display typography (style like Anton or
Druk), all caps, tight tracking. Render this exact text, spelled correctly,
nothing else: headline "CUMPLEAÑOS FABRIZIO", below it in a smaller mono/
condensed line "VIERNES 9 DE OCTUBRE · 22:00 HRS", below that "PASAJE
ARGENTINA 2299, INDEPENDENCIA", and at the bottom in a small accent line
"CONFIRMA ANTES DEL 1 DE OCTUBRE". No people, no faces. Portrait 4:5. Gritty
rave poster style, not a corporate event template.
```

**Antes de publicar cualquier imagen de este camino**: ampliá y revisá letra por letra el título, la fecha, la hora y la dirección — es común que el modelo cambie una letra, duplique un número o rompa un acento.

## 3. Siguiente paso: poster real con texto correcto

El camino recomendado de la sección "Dato importante" (fondo generado + texto real superpuesto) se puede resolver sin depender de Canva/Figma: pedime que te arme el poster como un artifact HTML/CSS con la paleta y tipografía exactas del proyecto y el texto ya interpolado desde esta tabla — sale exportable a PNG y sin riesgo de que un generador de IA deforme una letra o un número. Es la vía sugerida para el primer aviso ("Guía rápida") y para el flyer principal de invitación.

## Notas de uso

- Formato recomendado de export: JPG, WEBP o PNG, lado más largo ≤1600px (mismo límite que ya usa `CameraCapture.tsx` para las fotos de invitados, ver `../02-arquitectura/02-arquitectura-tecnica.md` §8.3) — no hace falta subir algo pesado.
- Las imágenes se suben desde el panel de avisos del admin (`PostsPanel`, Etapa 6 de `../04-producto/BACKLOG.md`).
- Si cambia algún dato del evento (fecha, hora, lugar), actualizá primero la tabla de esta sección y después cualquier imagen ya generada — no al revés.
