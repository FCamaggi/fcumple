# Estado del producto: lo que debe hacer la app frente a lo que hace

Verificado contra el código el 2026-10-23, después de desplegar la inscripción configurable y de construir (en la rama `feat/cartelera-tema`) la activación por QR, la cartelera, el estilo por evento y el subtítulo. **Se actualiza cada vez que cambia una capacidad**; es el lugar para confirmar «qué existe» antes de prometerlo. Si este documento y otro se contradicen, gana este (y se corrige el otro).

## Qué es
Una cámara desechable digital para eventos festivos e informales (cumpleaños, carretes), multi-tenant y solo web. Cada evento tiene su organizador, su enlace de inscripción, su QR de activación, su estilo y su cartelera. El tenant es el organizador; lo propio de un evento viaja como **datos** (estilo, inscripción, marcos, avisos), no como una rama de git.

## Capacidades

| Capacidad | Estado | Dónde |
|---|---|---|
| Inscripción con nombre, apellido y PIN | Existe | `IdentifyForm`, `register_guest` |
| Inscripción configurable (acompañantes como solicitud, comentario, preguntas, bienvenida) | Existe | [`inscripcion-configurable.md`](./inscripcion-configurable.md) |
| Aprobación de solicitudes y de acompañantes, CSV | Existe | pestaña Invitados |
| **Cámara activada con el QR de la fiesta** | **Existe** (rama `feat/cartelera-tema`) | [`activacion-camara-y-cartelera.md`](./activacion-camara-y-cartelera.md) |
| Cámara con marcos y stickers por evento, cupo por invitado | Existe | `CameraCapture`, pestaña Cámara |
| Moderación de fotos (una por una) | Existe | `PhotosTab`, `PhotoModerationPanel` |
| **Publicación de fotos por lotes** | **Existe** (rama `feat/cartelera-tema`) | `publish_photo_batch` |
| **Avisos de la dueña (crear, publicar, imágenes)** | **Existe** (rama `feat/cartelera-tema`; antes solo en el código muerto de `/admin`) | pestaña Avisos |
| **Cartelera del invitado: avisos + carrusel de fotos publicadas** | **Existe** (rama `feat/cartelera-tema`) | `GuestHub`, `PhotoCarousel` |
| **Estilo por evento** | **Existe** (rama `feat/cartelera-tema`) | `src/lib/theme.ts` |
| **Título + subtítulo del evento** | **Existe** (rama `feat/cartelera-tema`) | Ajustes |
| **Vista previa de lo que ve el invitado (pestaña «Vista previa», 7 estados) y del aviso al redactarlo** | **Existe** (épica C1 y C2) | [`vistas-previas.md`](./vistas-previas.md) |
| Vista previa de marcos, del estilo y de la tarjeta del enlace; flujo del QR simulado (C3–C6) | No existe | — |
| Vista previa del enlace por evento (WhatsApp) | Existe; imagen propia opcional en `public/og/<slug>.jpg` | `api/event-meta.ts` |
| Cambio de contraseña del organizador | Existe | `/panel/cuenta` |
| Moderación por lotes horarios | **No existe** (PRODUCT.md la daba por hecha; la publicación por lotes de arriba es otra cosa) | — |
| Muro en vivo (Realtime), likes por foto | No existe (Fase 3) | — |
| Descarga de fotos | Solo una por una | `PhotoLightbox` |
| RSVP | Ya no se ofrece en Ajustes (el invitado no tiene pantalla para confirmar) | — |

## Decisiones y su fecha (la más reciente gana)
- **2026-10-17/18 (marca y producto):** «el QR sirve para activar la cámara». Ambiguo: podía ser el QR de inscripción o el del invitado que escanea la organizadora.
- **2026-10-23:** se precisa. El QR de activación es **un QR por evento, impreso en la fiesta, que el invitado escanea con la cámara de su teléfono**. Inscribirse no habilita la cámara. Se acepta el riesgo de que alguien reenvíe la foto del QR.
- **2026-10-23:** las fotos no se publican solas: la dueña las revisa y **publica por lotes**, sin tareas programadas. Aprobar no publica.
- **2026-10-23:** el estilo es **por evento** (datos), no por rama. Cada evento elige su piel; la estructura es una sola.
- **2026-10-23:** los acompañantes que escribe el invitado son una **solicitud** que aprueba la organizadora.

## Lo que viene
**Hecho el 2026-10-24:** la revisión móvil (épica A del backlog), con sus arreglos y lo que falta probar en un teléfono real: [`informe-revision-movil.md`](./informe-revision-movil.md).

[`backlog-diseno-y-marcos.md`](./backlog-diseno-y-marcos.md): marcos nuevos (composición, no máscaras), vistas previas de lo que ve el invitado para la organizadora y panel pensado para el celular (épicas B, C y D).

## Cómo trabajamos (para que no vuelva el desorden)
- Un solo `main`. Las ramas viven pocos días, con PR, y se **borran al fusionar** (activar «Automatically delete head branches» en GitHub).
- Lo propio de un cliente va como datos en la base y su material personal fuera del repo (`docs/clientes/` está en `.gitignore`: el repo es público).
- Los directorios de trabajo extra (`git worktree`) se crean por tarea en `~/code/fcumple-wt/<tarea>` y se quitan al fusionar.
- Lo que llega a `main` se despliega (el Deploy aplica las migraciones y publica en Vercel): se verifica en producción, no solo en local.
