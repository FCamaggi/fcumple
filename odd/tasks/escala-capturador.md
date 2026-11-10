# Escala del capturador por variante de marco

Objetivo: en los marcos de imagen con ventana, la foto se ajusta a la ventana × una escala configurable (en lugar de llenar el lienzo), con salida a resolución completa de la foto. Rama `feat/escala-capturador` (worktree `fcumple-wt/escala-capturador`). Entrega: ask-on-risk. Tests: `npm test` (Vitest) y `npm run test:db`.

## Specs

- **S1 — Escala del capturador.** Usuario: «para cada marco hay que hacer configurable la escala del capturador, es decir que el marco no vaya directamente sobre la foto o captura sino alrededor de ella, asi no tenemos tantos problemas con el bajo % de area, no quiero que sea algo 1 a 1, es decir, el cuadro verde que sea toda el area de captura, por eso configurable». Confirmado («EFECTIVAMENE»): el número dice qué tamaño tiene la captura respecto de la ventana; 1,0 = la foto completa calza justo en la ventana; mayor que 1 = la foto sobresale bajo el marco. Por marco y por variante.
- **S2 — Resolución completa.** Usuario: «vamos con B». La imagen final crece para que la foto conserve su resolución; el marco se agranda a su alrededor.
- **S3 — Visor con toggle.** Usuario: «Quiero ambas, con un toggle para cambiar entre ambas, pero el default B». B (por defecto): cámara en vivo a pantalla completa con una guía de dónde cae el marco; el marco completo aparece en la vista previa de la foto tomada. A: el visor muestra el marco completo con la cámara en vivo dentro de la ventana (lo que se ve es lo que sale).
- **S4 — Deslizador en el estudio.** Usuario: «B». El organizador ajusta la escala por variante en el estudio del panel con vista previa en vivo.
- **S5 — Decisiones por defecto** (usuario: «si, dale»):
  1. La ventana se detecta sola: rectángulo transparente del marco, calculado al subirlo y guardado por variante.
  2. Escala por defecto 1,10 para los marcos nuevos con ventana.
  3. Los marcos sin ventana (capas, los de Francisca, PNG transparentes) siguen igual que hoy: la foto llena el lienzo.
  4. El deslizador va de 1,0 al valor en que la foto llena el lienzo.

## Tasks

Modelo: la capa imagen `full: true` lleva `capture: {x, y, w, h, scale}` (ventana normalizada al lienzo + escala). Geometría pura en `src/lib/cameraAssets/capture.ts`.

| ID | Specs | Qué | Ruta | Estado |
|---|---|---|---|---|
| T1 | S1, S5.1-S5.3 | `capture` en la capa imagen: validación cliente + migración `20261110100024_frame_capture.sql` (paridad en `frame-layers.test.ts`), geometría (`photoBox`, `maxCaptureScale`, `outputSize`, `detectWindow`). Risk item 1 (migración): commit propio | inline | GREEN (unit 267/267, DB 24/24); commit pendiente de confirmación |
| T2 | S5.1, S5.2, S4 | Estudio: detectar la ventana al subir una imagen full (LayerEditor), escala por defecto 1,10; deslizador de escala por variante (1,0 → máximo) con vista previa con foto de muestra | delegado a agy argon en worktree aparte (paralelo a T3) | GREEN; corregido por Claude: sin código de prueba en producción (detección jsdom), guarda de montaje, la detección corre al activar «Cubrir toda la foto» y no en cualquier subida |
| T3 | S1, S2, S3 | Cámara: foto en la caja de la ventana con salida a resolución completa (`handleShoot`); visor A/B con toggle (B por defecto: cámara a pantalla completa + guía); stickers mapeados al lienzo | inline | GREEN (ComposerStage 19, composer 35) |
| T4 | S5.1 | Scripts: `preparar-marcos.py` calcula `capture` desde el alfa (misma regla que `detectWindow`); README | inline | GREEN (prueba manual: mismo rect que el caso TS; PNG transparente → sin ventana) |
| T5 | todos | Docs `marcos-y-stickers.md`, `pantalla-de-camara.md` | inline | hecho |

## Log

- **L1** (2026-11-10) Pedido original: «dejalos asi, vamos a idear otro sistema para compensar el %, para cada marco hay que hacer configurable la escala del capturador, es decir que el marco no vaya directamente sobre la foto o captura sino alrededor de ella, asi no tenemos tantos problemas con el bajo % de area, no quiero que sea algo 1 a 1, es decir, el cuadro verde que sea toda el area de captura, por eso configurable, no directamente el area, se entiende? hazme preguntas para que me quede claro que se entiende»
- **L2** Respuestas: escala confirmada («EFECTIVAMENE»); resolución «vamos con B, vamos a migrar de supabase a usar un computador propio que va a etsar activo el dia del evento, asi no tenemos problemas de tamaño ni nada» (la migración queda fuera de este alcance); visor «Quiero ambas, con un toggle para cambiar entre ambas, pero el default B»; configuración «B»; defaults «si, dale».
- **L3** (2026-11-10) Verificación: typecheck OK, unit 126 archivos / 1653 tests, DB 16 archivos / 390 tests (se sumó 20261110100024 a la lista fija de `prune.test.ts`), build OK. Commits pendientes de confirmación del usuario: (1) T1 migración + geometría, (2) cámara + estudio + script + docs.
