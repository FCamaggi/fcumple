# Auditoría móvil automática

Recorre las pantallas de la app en tamaños de teléfono, saca capturas y mide lo que suele fallar en un celular: desbordes de la página, campos que hacen zoom en iPhone, botones difíciles de tocar y texto muy chico. Es la herramienta con la que se hizo la [revisión móvil](../../docs/fase-1-mvp-multitenant/informe-revision-movil.md). Sirve para repetirla antes de una fiesta o después de un cambio de diseño.

**No sustituye probar en un teléfono real.** Usa WebKit y Chromium de Playwright con un teléfono simulado: no es Safari de iOS, no tiene cámara real (Chromium usa una falsa; WebKit ninguna) y no tiene áreas seguras. Qué probar a mano está en la última sección del informe.

## Qué hace
- `mock.js` simula Supabase: responde a todo lo que la app pide a `127.0.0.1:54321` con datos inventados (evento «PUTI HALLOWEEN» con el estilo Rosa chicle, 12 invitados, 24 fotos que son dibujos, 3 avisos, 3 marcos y 6 stickers). **No habla con ninguna base real.**
- `audit.mjs` abre cada pantalla en cada perfil, la captura y la mide.

Perfiles: iPhone 13 (WebKit), Pixel 7 (Chromium), 360×640, iPhone 13 en horizontal y Pixel 7 en horizontal. Pantallas: 10 del invitado (inscripción, «ya me inscribí», evento que no existe, cámara bloqueada, cámara activa con cartelera, cartelera vacía, cupo agotado, QR de activación, cámara abierta, visor de foto) y 12 del panel (lista de eventos, las 9 pestañas, la moderación y el escáner).

## Cómo correrla
1. Levanta la app apuntando a una dirección falsa, sin claves reales (el simulador responde ahí):
   ```bash
   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=clave-falsa npx vite --host 127.0.0.1 --port 5173
   ```
2. Necesitas `playwright-core` y los navegadores. El script lo busca en `PLAYWRIGHT_CORE`, en el proyecto y en la instalación global de `playwright-cli` (`npm i -g @playwright/cli`, luego `playwright-cli install-browser webkit` y `playwright-cli install-browser chrome-for-testing`). No es dependencia del proyecto a propósito.
3. En otra terminal:
   ```bash
   node scripts/qa-movil/audit.mjs                 # todo: unos 5 minutos
   node scripts/qa-movil/audit.mjs s360 o03        # un perfil y una pantalla (filtros por texto del id)
   SHOTS=despues VSHOT=1 node scripts/qa-movil/audit.mjs pixel7-h g09
   ```

| Variable | Qué hace |
|---|---|
| `SHOTS` | Subcarpeta de salida dentro de `salida/` (por defecto `shots`). Úsala para comparar antes y después. |
| `VSHOT=1` | Captura solo la ventana visible en vez de la página entera (mejor para cámaras y capas a pantalla completa). |
| `QA_BASE` | Dirección de la app. Solo se aceptan `127.0.0.1` y `localhost`. |
| `PLAYWRIGHT_CORE` | Ruta de `playwright-core` si no se encuentra solo. |

El script **se niega a correr contra una web desplegada**: el simulador solo intercepta `127.0.0.1:54321`, y contra otra dirección las pantallas hablarían con la base real.

## Qué sale
En `scripts/qa-movil/salida/` (ignorada por git): las capturas en `<SHOTS>/<perfil>/<pantalla>.png` y un `results*.json` con las mediciones. En la terminal, una línea por pantalla: `ovf` (desborda la página), `campos<16` (campos de menos de 16 px), `tap<44` (elementos táctiles de menos de 44 px).

Cómo leer las mediciones de cada pantalla en el JSON:

| Campo | Significa |
|---|---|
| `hOverflow`, `overflowing` | La página es más ancha que el teléfono, y los elementos que se pasan. Se compara contra el ancho esperado del perfil porque Chromium móvil agranda el viewport si el contenido no cabe. |
| `smallFields` | Campos con letra de menos de 16 px: Safari de iPhone hace zoom al tocarlos. |
| `smallTap` | Botones, enlaces y casillas de menos de 44 px de ancho o de alto (en las casillas cuenta su etiqueta). |
| `smallText` | Cantidad de textos por tamaño de letra, solo los de menos de 12 px. |
| `fixedFull` | Capas fijas que cubren toda la pantalla. |
| `errors` | Errores de JavaScript que salieron en la consola. |

Un resultado sano es todo en cero. Lo que queda a propósito (por ejemplo los botones marcados `data-compact`) debería explicarse en el informe.

## Cómo ampliarla
- **Una pantalla nueva:** agrega un objeto a `scenes` en `audit.mjs` con `id`, `url` y, si hace falta, `guestSession` (el token decide el estado del invitado: `t-locked`, `t-active`, `t-full`; con prefijo `tv-` el evento queda vacío), `org: true` para entrar al panel y `act` para hacer clics antes de medir.
- **Más datos:** `mock.js` tiene las tablas y las funciones (`rpc`) que responde. Una función que la app use y no esté ahí devuelve `null`.
- **Otro perfil:** agrégalo a `profiles` (el nombre del dispositivo es uno de los de Playwright).

## Límites que ya se conocen
- Las fotos son dibujos SVG, no JPG reales: no mide el peso ni la decodificación.
- El simulador entra al panel con una sesión de organizador inventada guardada en `localStorage` (`sb-127-auth-token`); si cambia el cliente de Supabase, hay que ajustarlo.
- No mide el peso de la página, la velocidad ni la accesibilidad con lector de pantalla.
