# Fotos en calidad original servidas desde un PC propio

Plan del 2026-11-11. Estado: **propuesta, nada construido**. Objetivo: que los invitados descarguen sus fotos en calidad original. Un PC de la casa del dueño guarda y entrega los originales, y Supabase queda como entrada y respaldo. El primer evento que lo usa es el cumpleaños triple del 2026-11-28.

## Resumen

| Pregunta | Respuesta |
|---|---|
| ¿Quién recibe la foto al tomarla? | Supabase, como hoy. Así una caída del PC no pierde fotos. |
| ¿Dónde viven los originales? | En el disco del PC. Un proceso los descarga de Supabase y después los borra de ahí. |
| ¿Quién entrega la descarga? | El PC, a través de un Cloudflare Tunnel en `fotos.<dominio>`. |
| ¿Se abre algún puerto en la casa? | No. El PC solo hace conexiones de salida. |
| ¿Y si el PC está apagado? | La app ofrece la copia liviana de Supabase y avisa que el original vuelve cuando el PC esté en línea. |
| ¿Costo? | Cero. Dominio `.me` gratis por un año (GitHub Student Pack, Namecheap); Cloudflare y su túnel, plan gratis. |

## Lo que limita la calidad hoy

El almacenamiento **no** es lo único que limita. Verificado en el código:

- `src/lib/cameraStream.ts` pide el video a la cámara con ideal 2048×1536 (`LONG_SIDE = 2048`).
- `src/components/CameraCapture.tsx` dibuja la foto con el marco en un canvas y la guarda en JPEG con `MAX_DIMENSION = 2048` y `JPEG_QUALITY = 0.85`. La copia para la cartelera sale a 640 px con calidad 0.7.
- Los marcos del cumpleaños triple miden 1086×1448 en 3:4.

Por eso, para que haya un original mejor, también hay que cambiar la captura (tarea T1). Guardar en el PC por sí solo no sube la calidad.

El botón «Descargar» ya entrega el archivo guardado y no la copia de 640 px (`PhotoLightbox.tsx`, con una URL firmada de Storage). Los antecedentes, con los límites del plan gratis y las cifras de tráfico, están en [`notas-temporales-b-c-descarga.md`](./notas-temporales-b-c-descarga.md#2-descarga-de-fotos-de-más-calidad).

## Arquitectura

```text
Celular del invitado
  │ 1. sube el original + la copia de 640 px
  ▼
Supabase Storage (party-photos)  ◄── entrada y respaldo
  │ 2. el worker del PC descarga, verifica y borra el original
  ▼
PC de la casa: disco /fotos/<event_id>/<guest_id>/<archivo>.jpg
  │ 3. servidor mínimo en 127.0.0.1, solo lectura
  ▼
cloudflared (túnel de salida) ──► https://fotos.<dominio>
  ▲
  │ 4. el invitado descarga con un enlace firmado por Supabase
Celular del invitado
```

### Piezas

| Pieza | Qué hace | Dónde corre |
|---|---|---|
| Captura | Foto a mayor resolución y mejor JPEG; la copia de 640 px sigue igual. | Navegador |
| Columna nueva en `photos` | Registra si el original ya está en el PC (`original_archived_at`). | Supabase (migración) |
| RPC de enlace firmado | Devuelve `https://fotos.<dominio>/p/<ruta>?exp=…&sig=…` solo para fotos publicadas que el invitado puede ver. HMAC con `pgcrypto` y un secreto en una tabla privada. | Supabase |
| Worker de archivo | Consulta las fotos sin archivar, descarga el original, verifica el tamaño y el hash, lo guarda en disco, marca la fila y borra el original de Storage. Reintenta en cada vuelta. | PC |
| Servidor de fotos | `GET /p/<ruta>`: valida la firma y el vencimiento, evita salirse de la carpeta y entrega el archivo. `GET /health` para que la app sepa si está en línea. Escucha solo en `127.0.0.1`. | PC |
| cloudflared | Túnel con nombre hacia el servidor. Cloudflare pone el HTTPS y frena los abusos de tráfico. | PC |
| Descarga en la app | Usa el original del PC si `/health` responde; si no, la copia de Supabase. | Navegador |

### Seguridad

- El PC no expone la base de datos ni acepta escrituras desde internet. Su única superficie pública es la lectura de archivos con firma.
- La firma la emite Supabase, que ya sabe quién puede ver qué foto. El PC solo comprueba la firma y que no haya vencido.
- La clave de servicio de Supabase y el secreto de firma viven en un `.env` del PC, nunca en el repositorio, con permisos de solo dueño.
- El servidor escucha en `127.0.0.1`: sin el túnel no se puede llegar a él ni desde la red de la casa.

### Capacidad

- Unos 120 invitados × 8 fotos ≈ 960 fotos. A unos 4 a 6 MB por original, son cerca de 5 GB en el disco del PC.
- En Supabase solo quedan las copias de 640 px (unos 100 MB) y los originales que el worker todavía no descarga.
- Si el PC se cae durante la fiesta, los originales se acumulan en Supabase. Con 1 GB de cuota caben unos 200 antes del límite: hay que vigilar la caída.

## Qué hacer en el PC

Los pasos 1 a 5 se pueden hacer ya. Los pasos 6 y 7 esperan a que existan el worker y el servidor (T3 y T4).

1. **Preparar el equipo.** Que no se suspenda ni hiberne, con al menos 50 GB libres y una subida de internet de 20 Mbps o más. Instalar Git, Node 20 (la versión del CI) y, si se va a usar, Claude Code.
2. **Clonar el repositorio.**
   ```bash
   git clone https://github.com/FCamaggi/fcumple.git
   cd fcumple && npm ci
   ```
   El repositorio privado de clientes no hace falta para el servicio de fotos.
3. **Sacar el dominio.** En el [GitHub Student Developer Pack](https://education.github.com/pack), reclamar el `.me` de Namecheap.
4. **Pasar el dominio a Cloudflare.** Crear una cuenta gratis, agregar el dominio con el plan Free y poner en Namecheap los nameservers que entrega Cloudflare. Esperar a que figure como activo.
5. **Crear el túnel.** Instalar `cloudflared` y luego:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create fcumple-fotos
   cloudflared tunnel route dns fcumple-fotos fotos.<dominio>
   ```
   En `config.yml`, dirigir `fotos.<dominio>` a `http://127.0.0.1:8787` e instalarlo como servicio (`cloudflared service install`), para que arranque con el equipo.
6. **Configurar los secretos** en un `.env` fuera de git: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FOTOS_SIGNING_SECRET` y `FOTOS_DIR`.
7. **Dejar el worker y el servidor como servicios** que arrancan con el equipo (systemd en Linux, o un servicio de Windows), y comprobar `https://fotos.<dominio>/health`.

## Tareas

| ID | Qué | Riesgo | Depende de |
|---|---|---|---|
| T1 | Captura a mayor resolución y mejor JPEG. Probar en iPhone y Android cuánto entrega la cámara. | Medio: cambia la cámara de todos los eventos. | — |
| T2 | Migración: `original_archived_at` en `photos`, tabla privada con el secreto y RPC del enlace firmado. Test de base de datos. | Alto: toca permisos y datos guardados. | — |
| T3 | Worker de archivo en `scripts/fotos-pc/`, con tests de descarga, verificación y borrado seguro. | Alto: borra originales de Storage; solo después de verificar la copia. | T2 |
| T4 | Servidor de fotos y `/health`, con tests de firma, vencimiento y rutas que intentan salirse. | Alto: es lo único expuesto a internet. | T2 |
| T5 | Descarga en la app: original del PC con respaldo en Supabase; avisos si el PC no está. | Medio | T2, T4 |
| T6 | Guía de operación del día del evento y prueba de punta a punta con el PC real. | — | T1 a T5 |

## Decisiones abiertas

- **Resolución objetivo de la captura.** Hay que medir qué entrega cada teléfono: Safari de iOS ya tuvo sorpresas con las medidas del video (ver el registro de la cámara).
- **Marcos a mayor resolución.** Sobre una foto de 3000 px, un marco de 1448 px se ve más blando. Se puede escalar el marco o regenerarlo más grande.
- **Respaldo del disco del PC.** Si el disco falla, los originales se pierden. Conviene una segunda copia (otro disco o una exportación al cerrar el evento).

## Otros pedidos del mismo día

- **Intervalo del rollo revelado.** Hoy se agrupa en bandas fijas de 1 hora (`src/lib/photoTimeline.ts`). Es una agrupación de la vista, no de la publicación, que ya es manual. Plan: un intervalo configurable por evento (15, 30, 60 o 120 minutos). Cambio chico.
- **Álbum por cara.** Por explorar. Los rasgos faciales son datos biométricos, sensibles según la Ley 21.719, así que haría falta consentimiento explícito del invitado, una opción de salir y el borrado al cerrar el evento. Si se hace, el reconocimiento corre en el PC, sin mandar fotos a servicios externos.
