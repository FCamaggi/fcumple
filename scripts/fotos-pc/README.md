# Worker de archivo de originales (PC del evento)

Copia cada foto original de Supabase Storage al disco del PC y después la borra de Storage, para que la cuota del plan gratis no limite la calidad. Es la T3 de `odd/tasks/fotos-originales-pc.md` (llega con el PR #80); el plan completo está en `docs/fase-1-mvp-multitenant/fotos-originales-pc-casa.md` (PR #78).

Corre **solo en el PC**, nunca en Vercel ni en el navegador: usa la clave de servicio de Supabase. Necesita Node 20.6 o más (por `--env-file`). Corre **una sola instancia** con un solo `FOTOS_DIR`: dos con carpetas distintas repartirían las fotos entre ellas.

## Uso rápido

1. Crea `.env.fotos` en la raíz del repo (git lo ignora) y deja que solo tú puedas leerlo (`chmod 600 .env.fotos` en Linux):
   ```bash
   SUPABASE_URL=https://<proyecto>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<clave de servicio>
   FOTOS_DIR=/ruta/a/fotos
   ```
2. Prueba con una sola vuelta, conservando todo en Storage:
   ```bash
   npm run fotos:archivar -- --una-vez --conservar-en-storage
   ```
   Ojo: las fotos de esa prueba quedan marcadas como archivadas y el worker ya no las borrará de Storage después; se borran a mano o se dejan como respaldo.
3. Revisa que los archivos estén en `FOTOS_DIR/<evento>/<invitado>/<archivo>.jpg` y se abran.
4. Déjalo corriendo sin opciones (una vuelta cada 15 segundos):
   ```bash
   npm run fotos:archivar
   ```

Requiere la migración `20261111100026_photo_originals_pc.sql` (columna `photos.original_archived_at`) aplicada en Supabase.

## Opciones y variables

| Nombre | Qué hace |
|---|---|
| `--una-vez` | Una sola vuelta y termina. |
| `--conservar-en-storage` | No borra el original de Storage después de archivarlo (doble respaldo; gasta cuota). |
| `FOTOS_INTERVALO_S` | Segundos entre vueltas. Por defecto 15. |
| `FOTOS_LOTE` | Fotos por vuelta, de 1 a 200. Por defecto 20. |

## Qué hace con cada foto

1. Comprueba que la ruta sea del evento y del invitado de la foto.
2. Descarga el original de Storage. Si ya hay un archivo distinto en esa ruta, no lo pisa.
3. Lo escribe en un archivo temporal, lo fuerza a disco, lo renombra y fuerza también la carpeta: nunca queda un archivo a medias.
4. Lo relee y verifica el hash y que sea un JPEG completo.
5. Recién ahí lo borra de Storage (salvo con `--conservar-en-storage`).
6. Marca la foto con `original_archived_at`.

| Situación | Qué pasa |
|---|---|
| El PC se apaga en cualquier paso | En la vuelta siguiente se retoma. Si ya se había borrado de Storage, reconoce el archivo válido en disco (o el temporal que dejó un corte de luz) y marca la foto. |
| El archivo descargado no es un JPEG completo | No se borra ni se marca; se reintenta en la vuelta completa siguiente. |
| La foto no está en Storage ni en disco (nunca terminó de subir) | No se marca; se reintenta en la vuelta completa siguiente. |
| Una ruta con otro formato, o que no es del evento e invitado de la fila | Se rechaza sin descargar, escribir ni borrar. |
| Ya hay otro archivo distinto con ese nombre | No se pisa ni se borra de Storage; queda con error para revisarlo a mano. |
| Borrar o marcar no afecta nada (clave sin permisos) | Se registra como error y no se da por archivada. |

Las fotos se recorren con un cursor por fecha: las que fallan no tapan a las nuevas, y se reintentan cuando la vuelta llega al final. Cada petición se corta a los 2 minutos. Los archivos se crean con permisos solo para el dueño.

## Dejarlo como servicio

Para que arranque con el equipo y se reinicie si se cae.

**Linux (systemd)**, en `/etc/systemd/system/fcumple-fotos.service`:

```ini
[Unit]
Description=fcumple: archivo de originales
After=network-online.target
Wants=network-online.target

[Service]
User=<tu usuario>
WorkingDirectory=/ruta/a/fcumple
ExecStart=/ruta/a/node --env-file=.env.fotos scripts/fotos-pc/archivar.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

En `ExecStart` va la ruta que da `command -v node` (con nvm no es `/usr/bin/node`). Luego `sudo systemctl enable --now fcumple-fotos` y `journalctl -u fcumple-fotos -f` para ver el registro.

**Windows:** una tarea del Programador de tareas que corra al iniciar el equipo, con el mismo comando y «Iniciar en» la carpeta del repo, configurada para reiniciarse si falla.

# Servidor de fotos (PC del evento)

Entrega los originales que archivó el worker a quien traiga un enlace firmado por `photo_original_url` (migración `20261111100026_photo_originals_pc.sql`). Es lo único del PC expuesto a internet: escucha solo en `127.0.0.1` y `cloudflared` lo publica en `https://fotos.<dominio>`. No escribe nada ni habla con Supabase.

## Uso rápido

1. Agrega a `.env.fotos` el secreto de firma, el mismo que cargaste en `private.photo_archive` de Supabase (32 caracteres o más; por ejemplo, `openssl rand -hex 32`):
   ```bash
   FOTOS_SIGNING_SECRET=<secreto>
   FOTOS_DIR=/ruta/a/fotos
   ```
2. Arráncalo:
   ```bash
   npm run fotos:servir
   ```
3. Comprueba `curl http://127.0.0.1:8787/health` y, con el túnel arriba, `https://fotos.<dominio>/health`. Las dos deben responder `{"ok":true}`.
4. Para probar una descarga, pide un enlace en el editor SQL de Supabase con `select public.photo_original_url('<ruta>');` (como dueño) y ábrelo en el navegador.

| Variable | Qué hace |
|---|---|
| `FOTOS_SIGNING_SECRET` | Secreto HMAC compartido con Supabase. Obligatoria. |
| `FOTOS_DIR` | La misma carpeta del worker. Obligatoria. |
| `FOTOS_PUERTO` | Puerto local. Por defecto 8787, el que usa `config.yml` de `cloudflared`. |

## Qué responde

| Petición | Respuesta |
|---|---|
| `GET /health` | 200 `{"ok":true}` si la carpeta se puede leer; 503 `{"ok":false}` si no (disco desmontado, carpeta borrada). |
| `GET /p/<ruta>?exp=…&sig=…` con firma válida y vigente | 200 con el archivo como descarga (`image/jpeg`). También acepta `HEAD`. |
| Firma inválida, vencida, sin `exp` o `sig`, o con alguno repetido | 403, sin mirar el disco: no revela qué fotos existen. |
| Ruta con otro formato (`..`, `%2f`, barras de más, mayúsculas en el UUID) o archivo que no está | 404. |
| Enlace simbólico que sale de la carpeta, o una carpeta en vez de un archivo | 404. |
| `POST`, `PUT`, `DELETE`, `PATCH` | 405. |

La firma es HMAC-SHA256 en hex de `"<ruta>\n<exp>"`, comparada en tiempo constante. Si el cliente corta la descarga o deja de leer por 30 segundos, se cierra la conexión y el archivo. Se aceptan enlaces que vencen hasta 2 horas en el futuro (Supabase firma por 1 hora; el margen cubre un reloj atrasado). El PC debe tener la hora sincronizada: con el reloj adelantado, los enlaces se ven vencidos antes de tiempo.

## Dejarlo como servicio

Igual que el worker, con otro archivo de unidad (`/etc/systemd/system/fcumple-fotos-servidor.service`) y `ExecStart=/ruta/a/node --env-file=.env.fotos scripts/fotos-pc/servir.mjs`. En Windows, otra tarea del Programador de tareas con ese comando.
