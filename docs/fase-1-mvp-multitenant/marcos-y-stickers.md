# Marcos y stickers por evento (Fase 1)

## Principio

**Solo el organizador diseña la experiencia de cámara.** El invitado no crea, sube ni edita nada: elige entre lo que el organizador dejó activo. Esto simplifica moderación, almacenamiento y permisos.

Hoy (Fase 0) los marcos son 7 PNG fijos en `public/marcos/` listados en código (`cameraFrames.ts`: `FRAME_IDS`, `FRAME_LABELS`, `FRAME_IMAGE_SRC`) y el invitado los recorre con swipe. Fase 1 los pasa a datos por evento.

## Conceptos

- **Recurso:** un marco o un sticker. Pertenece a un evento.
- **Toggle de recurso:** cada recurso tiene `enabled`. Si está desactivado no aparece en la cámara del invitado, pero se conserva para reactivarlo.
- **Biblioteca base:** marcos incluidos en la plataforma (los 7 actuales) que el organizador puede activar/desactivar sin subir nada. Se "copian por referencia" al crear el evento (filas con `source = 'builtin'`).
- **Recursos propios:** PNG subidos por el organizador (`source = 'custom'`).

## Modelo de datos

```
event_frames
  id uuid pk
  event_id uuid not null references events on delete cascade
  source text check (source in ('builtin','custom'))
  builtin_key text            -- 'disposable', 'date-stamp'… cuando source='builtin'
  storage_path text           -- ruta en event-assets cuando source='custom'
  label text not null
  enabled boolean not null default true
  sort_order int not null default 0
  created_at

event_stickers
  id uuid pk
  event_id uuid not null references events on delete cascade
  source text check (source in ('builtin','custom'))
  builtin_key text
  storage_path text
  label text not null
  enabled boolean not null default true
  sort_order int not null default 0
  created_at
```

`enabled = false` oculta; no se borra. El borrado real solo para recursos `custom` y borra el objeto de Storage.

Además, en `events.settings`:

```
camera: {
  frames_enabled: boolean,     -- toggle global: apagarlo deja solo "Sin marco"
  stickers_enabled: boolean,   -- toggle global
  default_frame_id: uuid|null  -- marco preseleccionado
}
```

Es decir, **dos niveles de toggle**: global por categoría (marcos / stickers) e individual por recurso.

## Seguridad

- Escritura (insertar, editar, activar, borrar, subir archivos): solo el organizador dueño del evento (política RLS por `owner_id`).
- Lectura por el invitado: solo vía RPC `list_event_camera_assets(p_token)` que resuelve el evento desde el token y devuelve únicamente recursos con `enabled = true` y respeta los toggles globales. Devuelve URLs firmadas (el bucket es privado) o rutas públicas si se decide un bucket público de solo lectura para `event-assets`.
- Subidas: solo PNG/WebP con canal alfa, tamaño máximo (p. ej. 1,5 MB por recurso) y dimensiones esperadas; validación en cliente y en una política de storage / RPC. Tope de recursos custom por evento (p. ej. 20 marcos, 40 stickers) para controlar el uso del free tier.

## Panel del organizador (`/admin/e/:eventId/camara`)

1. **Pestaña Marcos:** lista con miniatura, nombre, interruptor (toggle) de activo, reordenar (arrastrar o flechas), marco por defecto, subir marco propio, borrar (solo custom).
2. **Pestaña Stickers:** igual que marcos, con subida de stickers propios.
3. **Interruptores globales** "Mostrar marcos" y "Permitir stickers".
4. **Vista previa:** simulación de la cámara con los recursos activos sobre una imagen de ejemplo, para que el organizador vea el resultado antes del evento.
5. El panel reutiliza `FaderToggle` para los interruptores, por coherencia visual (ver `fase-0-evento-unico/03-diseno/DESIGN.md`).

## Cámara del invitado

**Marcos:** el carrusel por swipe de `CameraCapture` se alimenta de los marcos activos del evento, no de la constante `FRAME_IDS`. `getFrameIndexAfterSwipe` se conserva tal cual. Si `frames_enabled = false` o no hay marcos activos, solo existe "Sin marco".

**Stickers (nuevo):**

- Una bandeja con los stickers activos; el invitado toca uno y aparece sobre el visor.
- Gestos: arrastrar, pellizcar para escalar, girar con dos dedos. Se pueden poner varios, con un máximo (p. ej. 5) para evitar fotos ilegibles.
- Posición, escala y rotación se guardan en **coordenadas normalizadas** (0.0–1.0 respecto al ancho/alto), de modo que el resultado es independiente de la resolución.
- Al capturar, `usePhotoCapture` dibuja sobre el canvas: foto → stickers → marco (el marco queda siempre encima). Es la misma estrategia que ya usa `drawFrame` para el marco.
- La foto sube ya compuesta (igual que hoy con el marco); no se almacena la lista de stickers aplicados. Si más adelante se quiere "des-aplicar", se guardaría el original aparte (Fase 2).

**Rendimiento:** solo Canvas 2D (sin WebGL ni shaders). Los PNG de recursos se precargan con `useFrameImages` (extendido a stickers) antes de abrir la cámara.

## Compatibilidad con la Fase 0

- Los 7 marcos actuales pasan a ser la biblioteca `builtin`; el evento #1 queda con los 7 activos y comportamiento idéntico.
- Las rutas `/marcos/N.png` siguen sirviéndose desde `public/` para los `builtin`.
- Los tests de `cameraFrames`, `CameraCapture` y `useFrameImages` se adaptan para recibir la lista de recursos por parámetro en vez de la constante.

## Fuera de alcance (Fase 2)

Marcos dinámicos con variables (`{{event_title}}`, `{{guest_name}}`…), editor visual para componer marcos dentro de la app, packs de pago, logos de patrocinadores, QR secundarios.
