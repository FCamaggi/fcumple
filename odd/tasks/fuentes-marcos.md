# Fuentes para los textos de los marcos

Objetivo: textos de marco más elegantes que las fuentes actuales, por tres caminos. Rama `feat/fuentes-marcos`, base 7434d09.
Entrega: `ask-on-risk`. Tests: Vitest (`npm test`) y la suite de base de datos (`npm run test:db`). Plazo práctico: el congelamiento de main del 2026-11-05.

## Specs

- S1. «las letras actuales son muy basicas, podriamos generar una fuente especifica para este evento, generarla con el LLM como imagen? quiero explorar este tipo de personalizacion, hacer 3 fuentes especificas para escribir en los marcos»
- S2. «sobre las fuentes hagamos los 3 caminos»:
  - A: fuente real generada por IA;
  - B: lettering como imagen;
  - C: fuentes libres elegantes en el catálogo.
- S3. Camino A: «se que hay formas de hacer las fuentes en una plantilla, podemos entregarle esa plantilla a gpt para que lo haga encima, quizas es mas facil de lo que esperamos». Hace falta una plantilla de celdas que GPT rellena, y un proceso que recorte, vectorice y arme un archivo de fuente usable en la cámara.
- S4. Camino B: prompts para que GPT escriba el nombre del evento en 3 estilos, como imágenes. Se procesan como los marcos y entran como capa de imagen.
- S5. Camino C: agregar al catálogo de capas tres fuentes libres (OFL) de estilo formal: Cinzel, Great Vibes y Cormorant Garamond. La base valida la lista de fuentes, así que hace falta una migración.

## Tasks

| ID | Specs | Ruta | Estado |
|---|---|---|---|
| T1 | S4 | inline (repo privado del cliente) | Hecho: 3 prompts L1-L3 en `raffaella/marcos/prompts-ia.md` (repo privado). Falta que el dueño los genere |
| T2 | S3 | delegada a agy (flash, worktree aislado `worker/agy-969213`), en paralelo con T3; superficie `scripts/fuentes/` | Hecho y revisado: el round trip pasa (OK). Corregido: márgenes laterales 0.08 → 0.03 con `--espaciado`, y requisitos en el README. Falta integrarlo a la rama (lo decide el dueño) |
| T3 | S5 | inline: migración (riesgo, ítems 1 y 5) | GREEN: typecheck; 1583 unit; 376 db; build. Verificador independiente: PASS en 6/6 checks, sin bloqueos. Sin commit: espera el OK del dueño |
| T4 | S3 | inline, después de T2 y T3: las fuentes generadas entran a la app con el mismo mecanismo de T3 | pendiente |

## Log

- L1 (2026-11-01): «los hice pero no les cambie el nombre, ademas hice la previsualizacion pero la deje en comuniacion, haz lo que falta tú, otra cosa que quiero explorar es las fuentes para los marcos, las letras actuales son muy basicas, podriamos generar una fuente especifica para este evento, generarla con el LLM como imagen? quiero explorar este tipo de personalizacion, hacer 3 fuentes especificas para escribir en los marcos»
- L2 (2026-11-01): «sobre las fuentes hagamos los 3 caminos, se que hay formas de hacer las fuentes en una plantilla, podemos entregarle esa plantilla a gpt para que lo haga encima, quizas es mas facil de lo que esperamos»
- L3: hallazgos.
  - La fuente «Titular» es `display`, o sea Impact del sistema.
  - Fuentes de capa: `src/lib/cameraAssets/text.ts`. El check de fuentes en la base se definió por última vez en `20261026100017_frame_layer_asset.sql`.
  - Herramientas disponibles: fontTools 4.46 y brotli. Faltan potrace y fontforge, así que se usará `potracer` en un venv fuera del repo.
- L4: T3. RED observado: 4 unit, y la paridad de la base sin la migración. GREEN: suites completas. `GuestPage > renders the guest name once found` falló una vez con la suite completa y pasó solo y en la segunda corrida: es intermitente y no tiene que ver con el cambio.
- L5: verificador independiente de T3: PASS. La función es idéntica salvo la lista de fuentes, hay paridad entre cliente y base, `setup-fase-1.sql` está sincronizado (sha256 estable) y las fuentes antiguas siguen siendo válidas. Tests: 335 unit (cameraAssets y studio) y 26 db.
- L6: T2 revisado. Las fuentes reconstruidas desde la plantilla rellenada con DejaVu Serif se ven correctas. El espaciado original era el doble de lo normal y se corrigió. Plantillas y prompts de estilo para el dueño en `raffaella/fuentes/` (repo privado, 587d5bc).
