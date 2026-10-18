# Marcos y stickers por evento (Fase 1)

## Principio

**Solo el organizador diseña la experiencia de cámara.** El invitado no crea ni sube nada: elige entre lo que el organizador dejó activo.

## Qué cambia respecto a la Fase 0

Los 7 marcos actuales (`public/marcos/*.png`, listados en `cameraFrames.ts`) son imágenes con **texto incrustado** ("Cumple Fabrizio", fechas, etc.). El contenido de un evento cambia, así que **no sirven y se retiran**. Los PNG quedan archivados en `assets/marcos/` y salen de `public/` al terminar la Etapa 3.

En su lugar:

1. **Marcos genéricos paramétricos**: plantillas dibujadas por código, con colores y textos que el organizador edita.
2. **Stickers de dos tipos**: **emojis** e **imágenes subidas** por el organizador.
3. **Toggles** por recurso y globales.

## 1. Marcos paramétricos

Un marco = una **plantilla** + sus **parámetros**. Se dibuja con Canvas 2D mediante una función pura `renderFrame(ctx, width, height, template, params)`. La misma función pinta la vista previa en vivo, la vista previa del editor y la foto final, así que nunca se desalinean (el problema de "dos capas a mano" que la Etapa 12 de la Fase 0 ya había eliminado, ahora sin PNG).

Todas las medidas están normalizadas respecto al lado menor de la imagen, de modo que el marco se ve igual a cualquier resolución y orientación.

### Plantillas iniciales

| Plantilla | Descripción | Parámetros que usa |
|---|---|---|
| `border` | Borde sólido con esquinas redondeadas opcionales. | color principal, grosor, radio |
| `polaroid` | Borde ancho con pie para una leyenda. | color de fondo, color de texto, leyenda, tipografía |
| `film` | Franja de rollo con perforaciones y texto corto. | color principal, texto, tipografía |
| `viewfinder` | Esquinas de visor y marca tipo REC con fecha. | color principal, grosor, texto/fecha |
| `banner` | Banda superior o inferior con título y subtítulo. | color de banda, color de texto, título, subtítulo, posición, tipografía |
| `glow` | Degradé/destello de color en los bordes. | color principal, color secundario, intensidad |

Cada plantilla declara qué parámetros usa; el editor solo muestra esos controles.

### Parámetros

```ts
interface FrameParams {
  primaryColor?: string;    // #RRGGBB
  secondaryColor?: string;
  textColor?: string;
  title?: string;           // máx. 60 caracteres
  subtitle?: string;        // máx. 60 caracteres
  caption?: string;         // máx. 60 caracteres
  font?: FontKey;           // de una lista cerrada
  thickness?: number;       // 0–1, relativo
  radius?: number;          // 0–1, relativo
  position?: 'top' | 'bottom';
}
```

- **Textos libres**, escritos por el organizador. Al crear un marco se prerrellenan con el nombre y la fecha del evento, pero se editan.
- **Tipografías**: lista cerrada de ~6 (las de la app más 2–3 expresivas: manuscrita, máquina de escribir, display), autoalojadas. Antes de dibujar se espera `document.fonts.load(...)`; el texto se ajusta al ancho disponible (reduce tamaño y luego trunca con "…").
- **Colores**: selector con paletas sugeridas y color libre. El editor avisa si el texto queda con poco contraste sobre su fondo.
- **Validación** compartida entre el editor y la base (esquema en TypeScript + `check` de tamaño en el `jsonb`). Un marco nunca puede referirse a un recurso externo, así que no hay subida de archivos para marcos.

Fuera de alcance: variables por invitado (`{{guest_name}}`) (Fase 2). Los marcos propios en PNG y el editor libre los cubre en parte la plantilla `capas` (ver «Plantilla `capas`» al final).

## 2. Stickers

### Emojis

- El sticker es un carácter Unicode (o secuencia) guardado como texto. No hay archivos ni almacenamiento.
- El organizador los elige con un selector de emojis dentro del panel (por ejemplo `emoji-picker-element` o los datos de `emojibase`; verificar licencia al integrar).
- **Estilo iPhone:** los emojis de Apple **no se pueden redistribuir** (su licencia los limita a plataformas Apple), así que no se pueden empaquetar ni generar en el servidor. La alternativa es dibujarlos con la **fuente de emoji del dispositivo** (`font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`) en el canvas. Consecuencia:
  - Un invitado con iPhone ve y compone con emojis de Apple: el resultado es exactamente el estilo pedido.
  - Un invitado con Android o PC los ve y compone con el estilo de su dispositivo (Noto, Samsung…), así que dentro de una misma galería pueden mezclarse estilos.
- **Decisión de MVP:** se usa la fuente nativa. Si la mezcla molesta, la Fase 2 agrega un conjunto abierto empaquetado (Noto Emoji, Twemoji o Fluent Emoji, todos con licencias permisivas) para que todos los dispositivos se vean igual, aunque no sea el de Apple.

### Imágenes

- El organizador sube PNG, WebP o JPEG (idealmente con transparencia). **No se acepta SVG.**
- El cliente la procesa antes de subir: recorta al contenido visible, la reduce a un máximo de 512 px por lado, la convierte a WebP, elimina metadatos EXIF y rechaza archivos de más de ~300 KB después de procesar.
- Se guarda en el bucket `event-assets` bajo el prefijo `{event_id}/stickers/`.
- **CORS y canvas:** dibujar una imagen de otro origen "contamina" el canvas y rompe `toBlob`. Las imágenes se cargan con `crossOrigin="anonymous"` y el bucket debe responder con las cabeceras CORS adecuadas; hay que probarlo en Safari iOS real. (Los PNG de la Fase 0 eran del mismo origen, por eso esto no se había notado.)
- Tope por evento (p. ej. 40 stickers de imagen) para cuidar el 1 GB de Storage del free tier.

## 3. Toggles de recursos

Dos niveles:

- **Global** (columnas de `events`): `frames_enabled` y `stickers_enabled`. Apagar marcos deja solo "Sin marco"; apagar stickers oculta la bandeja.
- **Por recurso**: cada marco y cada sticker tiene `enabled`. Desactivado = no aparece en la cámara, pero se conserva para reactivarlo. El borrado real elimina también el objeto de Storage (si es imagen).

También: orden manual (`sort_order`) y marco por defecto (`events.default_frame_id`).

## Modelo de datos

```
event_frames
  id uuid pk
  event_id uuid not null references events on delete cascade
  template text not null           -- 'border' | 'polaroid' | 'film' | 'viewfinder' | 'banner' | 'glow'
  label text not null              -- nombre interno
  params jsonb not null            -- FrameParams
  enabled boolean not null default true
  sort_order int not null default 0
  created_at, updated_at

event_stickers
  id uuid pk
  event_id uuid not null references events on delete cascade
  kind text not null check (kind in ('emoji','image'))
  emoji text                       -- cuando kind='emoji'
  storage_path text                -- cuando kind='image'
  label text
  enabled boolean not null default true
  sort_order int not null default 0
  created_at
  check ((kind='emoji' and emoji is not null) or (kind='image' and storage_path is not null))
```

Al crear un evento se siembran 2–3 marcos de ejemplo (editables) y un puñado de emojis festivos, para que la cámara no quede vacía.

## Seguridad

- Escritura (crear, editar, activar, subir, borrar): solo el organizador dueño del evento (RLS por `owner_id`).
- Lectura del invitado: solo vía RPC `list_event_camera_assets(p_token)`; devuelve únicamente recursos con `enabled = true`, respeta los toggles globales y solo del evento del invitado. Las imágenes se sirven con URL firmada o con un bucket de solo lectura en un prefijo no listable (decidir en la implementación; si es público, nada sensible puede ir ahí).
- Validación de subidas en el cliente **y** en servidor (tipo MIME, tamaño, prefijo del evento) mediante política de Storage.

## Panel del organizador (`/admin/e/:eventId/camara`)

1. **Marcos:** lista con miniatura, interruptor de activo (`FaderToggle`), reordenar, marco por defecto, duplicar, borrar. "Nuevo marco" → elegir plantilla → editor.
2. **Editor de marco:** controles según la plantilla (colores, textos, tipografía, grosor) y **vista previa en vivo** sobre una foto de ejemplo, con el mismo `renderFrame` que usa la cámara.
3. **Stickers:** pestaña de emojis (selector + lista) y pestaña de imágenes (subir, procesar, lista); cada uno con su interruptor.
4. **Interruptores globales** "Mostrar marcos" y "Permitir stickers".
5. **Vista previa de la cámara completa** con todo lo activo.

## Cámara del invitado

- El carrusel por swipe de `CameraCapture` se alimenta de los marcos activos del evento (ya no de `FRAME_IDS`). `getFrameIndexAfterSwipe` se conserva. Sin marcos activos, solo "Sin marco".
- Bandeja de stickers activos. Al tocar uno aparece sobre el visor; se arrastra, se escala con pellizco y se rota con dos dedos (Pointer Events con `touch-action: none`). Máximo ~5 por foto.
- Posición, escala y rotación se guardan en coordenadas normalizadas (0–1).
- Al capturar, `usePhotoCapture` compone en este orden: **foto → stickers → marco** (el marco queda encima). La foto sube ya compuesta, como hoy; no se guardan los stickers aplicados.
- Solo Canvas 2D; sin WebGL ni shaders. Las imágenes de stickers y las fuentes se precargan antes de abrir la cámara (`useFrameImages` se extiende a stickers).

## Tests

- `renderFrame` por plantilla: prueba de humo con canvas simulado (que dibuje, que respete el ajuste de texto y los límites).
- Validación de `FrameParams`: textos largos, colores inválidos, plantilla desconocida.
- DB: un invitado nunca recibe recursos desactivados ni de otro evento; un organizador no puede escribir en recursos de otro.
- Componentes: panel (toggles, orden) y cámara (carrusel con datos del evento, composición de stickers).

## Fuera de alcance (Fase 2)

Variables por invitado, marcos PNG propios y editor libre de composición (la plantilla `capas` los cubre en parte),  conjunto de emojis abierto y consistente entre dispositivos, packs temáticos de la plataforma, guardar el original sin stickers.

## Estado de implementación (Etapa 3)

Implementado: migración `20261015100009_camera_assets` (tablas `event_frames` y `event_stickers`, límites de 20 marcos / 40 stickers por evento, validación SQL de parámetros espejo de `validateFrameParams`, interruptores globales `frames_enabled` / `stickers_enabled` y `default_frame_id` en `events`, bucket `event-assets`, RPC `list_event_camera_assets(token)` que solo entrega lo activo del evento del invitado); 6 plantillas (border, polaroid, film, viewfinder, banner, glow); editor con vista previa en la pestaña «Cámara» del organizador; bandeja de stickers con arrastre y pellizco en la cámara del invitado; orden de dibujo foto → stickers → marco. Pendiente: probar emojis y CORS del canvas en dispositivos reales.

## Plantilla `capas` (marcos por capas)

Una séptima plantilla para marcos libres, estilo Canva, sin una plantilla fija por cada diseño. Un marco `capas` es una lista de capas apiladas (la primera queda al fondo) que dibuja la misma `renderFrame`, así que vista previa, cámara y foto final siguen sin desalinearse.

Qué hay hoy (paso 1 y 2 del plan):

- **Código:** `src/lib/cameraAssets/layers.ts` (modelo, validación, saneado, dibujo y carga de imágenes) y `text.ts` (tipografías y texto de una línea, compartidos con las demás plantillas). Los tests están junto a ellos.
- **Capas:** `text`, `shape` (`rect`, `ellipse`, `line`, `path`), `image` y `emoji`. La posición (`x`, `y`) es una fracción del ancho y del alto del lienzo; tamaños, bordes y sombras son relativos al lado menor; la rotación va en grados; el ancla (`center`, `tl`, `tr`, `bl`, `br`) dice qué punto de la capa cae sobre la posición. Una imagen con `full: true` cubre todo el lienzo (marcos hechos en Canva, exportados con transparencia).
- **Límites:** 40 capas, textos de 60 caracteres, colores `#RRGGBB`, tipografías de la lista cerrada, trazos `path` de hasta 600 caracteres con solo `M`, `L`, `C`, `Z`, números y espacios (sin arcos ni notación científica). Con capas el JSON de `params` puede llegar a 16384 caracteres; el resto de las plantillas conserva 2048.
- **Migración `20261018100011_frame_layers`:** acepta la plantilla `capas`, replica la validación en SQL (`valid_frame_layer`, `valid_frame_layers`), restringe `layers` a esa plantilla, exige que las imágenes estén en `{event_id}/frames/` del propio evento y deja a los invitados leer la imagen de un marco activo (`event_asset_is_public`). La base mide `jsonb::text` en bytes, con espacios, por lo que su tope con capas es de 32768 para que el cliente rechace siempre antes.
- **Paridad cliente-base:** `supabase/tests/frame-layers.test.ts` corre la misma tabla de casos contra `validateLayers` y contra la base. Si una regla cambia en un lado y no en el otro, falla.
- **Imágenes:** `renderFrame` es síncrona. `prepareFrameAssets` descarga las imágenes antes (con `crossOrigin="anonymous"`) y `renderFrame` las recibe como último parámetro. Una imagen que falla se omite y el resto del marco se dibuja.

Pendiente: el editor visual (arrastrar, escalar, rotar y panel de propiedades), cablear `prepareFrameAssets` en `useCameraAssets` y `FramePreview`, subir imágenes a `frames/` desde el panel, probar el CORS del canvas en Safari iOS real, cachear el `Path2D` y el saneado por cuadro, y acotar el emoji a un solo grafema. Mientras no exista el editor, `CameraStudio` no ofrece `capas` en el selector de plantillas.
