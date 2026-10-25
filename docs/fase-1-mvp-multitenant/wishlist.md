# Lista de Deseos / Regalos del Evento (Wishlist)

Fecha: 2026-10-25. **Fase 1 (Multi-tenant)**.

## 1. Propósito y Requisitos
El organizador puede configurar una lista de regalos o deseos sugeridos para la fiesta:
* Pega el enlace de una tienda o producto externo (Amazon, Paris, MercadoLibre, etc.).
* El sistema extrae automáticamente la imagen y el título del enlace mediante sus etiquetas OpenGraph / Twitter Cards.
* Puede añadir precio estimado y notas (ej: «Color rosado», «Talla M»).
* Puede activar o desactivar la visibilidad en la cartelera del evento (`/e/:slug`).
* **Regla de cartelera:** dado que es información accesoria, **no debe saturar el espacio** de la cartelera de fotos. Por defecto se muestra como un chip discreto de una línea que no interfiere con el rollo de fotos. Al tocarlo, abre un diálogo/modal accesible con los regalos y sus enlaces.

## 2. Arquitectura Técnica

### Base de Datos (`supabase/migrations/20261025100017_event_wishlist.sql`)
* Columna `events.wishlist jsonb not null default '{"enabled": false, "display_mode": "chip", "items": []}'::jsonb`.
* Función de validación SQL `public.valid_event_wishlist(wishlist jsonb)`:
  - Estructura jsonb con `enabled`, `display_mode` (`chip`, `card`, `banner`), `title` (hasta 60 caracteres) e `items` (máximo 30).
  - Cada ítem valida `id`, `url` (http/https hasta 1000 caracteres), `title` (hasta 120 caracteres), `image_url` (opcional), `price` (opcional hasta 30 caracteres) y `notes` (opcional hasta 200 caracteres).
* `get_event_public(p_slug)` entrega `wishlist` para el consumo del invitado.

### Extracción de OpenGraph (`api/link-preview.ts`)
* Función Serverless en Vercel (`/api/link-preview?url=...`).
* Resuelve problemas de CORS del navegador al consultar sitios externos.
* **Protección contra SSRF**: rechaza conexiones a `localhost`, IPs privadas (`10.x`, `192.168.x`, `172.16-31.x`, `127.x`) y direcciones de metadatos de nube (`169.254.x`).
* Timeout estricto de 3.5 segundos. Parsea `og:image`, `og:title`, `twitter:image`, `twitter:title` y `<title>`. Si la URL es directamente un archivo de imagen, la detecta automáticamente.

### Panel del Organizador (`src/components/WishlistTab.tsx`)
* Nueva pestaña «Regalos» en el panel `/panel/e/:id`.
* Interruptor de visibilidad y selector de formato (Discreto / Tarjeta compacta).
* Formulario con botón «Cargar preview» para autocompletar imagen y título.
* Lista de regalos con vista previa, enlace externo y botón para eliminar.

### Cartelera del Invitado (`src/components/WishlistSection.tsx`)
* Montado en `GuestHubView.tsx` sobre la cartelera.
* Si la wishlist está deshabilitada o vacía, ocupa **0 píxeles** (no se renderiza).
* En modo chip: botón sutil de una sola línea (`🎁 Lista de regalos (N ítems) →`).
* Al hacer clic, abre un modal accesible (`role="dialog"`, áreas seguras `inset-safe`, tecla Escape, foco accesible).

## 3. Pruebas y Verificación
* `api/link-preview.test.ts`: seguridad SSRF, parseo OpenGraph, detección de imágenes y función serverless (11 tests).
* `src/lib/wishlist.test.ts`: normalización de jsonb y extracción de previews (5 tests).
* `src/components/WishlistSection.test.tsx`: renderizado discreto y modal interactivo (4 tests).
* `src/components/WishlistTab.test.tsx`: agregado manual, extracción automática, eliminación y guardado (5 tests).
* `src/pages/OrganizerPages.test.tsx`: navegación y pestaña «Regalos» (35 tests).
* `supabase/tests/wishlist.test.ts`: validación SQL y RPC `get_event_public`.
