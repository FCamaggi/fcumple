# Fotos originales en el PC: puesta en marcha, prueba y día del evento

Guía del 2026-11-13 (T6 de `odd/tasks/fotos-originales-pc.md`). Sirve para dejar el PC de la casa entregando los originales y operarlo durante una fiesta; el primer evento que lo usa es el cumpleaños triple del 2026-11-28. El diseño y sus razones están en [`fotos-originales-pc-casa.md`](./fotos-originales-pc-casa.md); los detalles de cada programa, en [`scripts/fotos-pc/README.md`](../../scripts/fotos-pc/README.md).

## Camino rápido

| # | Paso | Listo cuando |
|---|---|---|
| 1 | Fusionar los PR en orden (ver «Orden de fusión»). | `main` desplegado con la migración `20261111100026_photo_originals_pc.sql`. |
| 2 | Preparar el PC, el dominio y el túnel: pasos 1 a 5 de «Qué hacer en el PC» del plan. | `cloudflared tunnel list` muestra `fcumple-fotos`. |
| 3 | Crear `.env.fotos` y cargar el mismo secreto en Supabase. | La fila de `private.photo_archive` existe. |
| 4 | Dejar como servicios el worker, el servidor y `cloudflared`. | `https://fotos.<dominio>/health` responde `{"ok":true}`. |
| 5 | Correr la prueba de punta a punta en un iPhone y un Android. | Todas las filas de la prueba en «sí». |

## 1. Orden de fusión

Antes de fusionar, revisa en el proyecto real que el esquema `private` no exista o esté vacío. La migración le quita los permisos a `anon` y `authenticated`, y afectaría a cualquier objeto que ya viviera ahí:

```sql
select n.nspname, c.relname
from pg_namespace n left join pg_class c on c.relnamespace = n.oid
where n.nspname = 'private';
```

Sin filas, o con una sola fila con `relname` vacío: sigue. Con objetos: detente y revisa.

| Orden | PR | Qué trae |
|---|---|---|
| 1 | #78 | Plan (solo documentación). |
| 2 | #80 | T2: migración, tabla privada y `photo_original_url`. El Deploy aplica la migración solo. |
| 3 | #81 | T3: worker de archivo. |
| 4 | #82 | T4: servidor de fotos. Está apilado sobre #81. |
| 5 | #83 | T5: descarga en la app. Está apilado sobre #80. |
| 6 | #79 | T1: captura a 12 MP. Va al final: sin el worker, los originales grandes llenan Storage. |

Al fusionar un PR, GitHub cambia a `main` la base de los que se apilaban sobre él solo si se borra la rama fusionada. Antes de fusionar #82 y #83, confirma que su base diga `main`.

## 2. Secreto y configuración

1. Genera el secreto una sola vez: `openssl rand -hex 32`.
2. En la raíz del repo del PC, crea `.env.fotos` y déjalo legible solo por ti (`chmod 600 .env.fotos`):
   ```bash
   SUPABASE_URL=https://<proyecto>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<clave de servicio>
   FOTOS_DIR=/ruta/a/fotos
   FOTOS_SIGNING_SECRET=<secreto>
   ```
3. En el editor SQL de Supabase, carga la dirección del túnel y el mismo secreto:
   ```sql
   insert into private.photo_archive (base_url, signing_secret)
   values ('https://fotos.<dominio>', '<secreto>')
   on conflict (id) do update
     set base_url = excluded.base_url, signing_secret = excluded.signing_secret;
   ```
   La dirección va sin barra final. La tabla acepta una sola fila.

Nunca subas `.env.fotos` al repositorio ni pegues el secreto o la clave de servicio en un chat.

## 3. Servicios

Los tres deben arrancar con el equipo y reiniciarse si se caen.

| Servicio | Comando | Unidad de systemd sugerida |
|---|---|---|
| Worker de archivo | `node --env-file=.env.fotos scripts/fotos-pc/archivar.mjs` | `fcumple-fotos.service` (ejemplo completo en el README de `scripts/fotos-pc`) |
| Servidor de fotos | `node --env-file=.env.fotos scripts/fotos-pc/servir.mjs` | `fcumple-fotos-servidor.service`, igual a la anterior con este `ExecStart` |
| Túnel | `cloudflared service install` | La crea `cloudflared` |

`~/.cloudflared/config.yml` del túnel:

```yaml
tunnel: fcumple-fotos
credentials-file: /home/<usuario>/.cloudflared/<id-del-tunel>.json
ingress:
  - hostname: fotos.<dominio>
    service: http://127.0.0.1:8787
  - service: http_status:404
```

La hora del PC debe estar sincronizada (`timedatectl` debe decir `System clock synchronized: yes`). Con el reloj adelantado, los enlaces se ven vencidos antes de tiempo.

En Windows, cada comando va en una tarea del Programador de tareas que corre al iniciar el equipo, con «Iniciar en» la carpeta del repo.

## 4. Prueba de punta a punta

Hazla con un evento de prueba, en un iPhone (Safari) y en un Android (Chrome). Anota el resultado de cada fila.

| # | Qué haces | Qué debe pasar |
|---|---|---|
| 1 | `curl http://127.0.0.1:8787/health` en el PC | `{"ok":true}` |
| 2 | Abres `https://fotos.<dominio>/health` desde el celular, con datos móviles | `{"ok":true}` |
| 3 | Tomas una foto como invitado | En unos 15 s, el registro del worker dice `archived <ruta>` y el archivo aparece en `FOTOS_DIR/<evento>/<invitado>/` |
| 4 | Miras el bucket `party-photos` en Supabase | El original ya no está; la copia `-display` sigue ahí |
| 5 | Abres la foto en el panel para moderar | Se ve, con la copia liviana |
| 6 | Apruebas, publicas y tocas «Descargar» como invitado | Baja desde `https://fotos.<dominio>/p/…`, con la resolución de la cámara (unos 12 MP con T1) |
| 7 | Detienes el servidor (`systemctl stop fcumple-fotos-servidor`) y vuelves a descargar | Baja la copia liviana con el aviso «El equipo con las fotos originales no responde…» |
| 8 | Lo vuelves a encender y descargas | Vuelve a bajar el original desde el PC |
| 9 | Cambias una letra de `sig=` en un enlace del paso 6 y lo abres | 403 |
| 10 | Detienes el worker, tomas 3 fotos y lo enciendes | Las 3 se archivan en la primera vuelta |
| 11 | En Safari del iPhone, con el PC lento o recién encendido | La descarga arranca aunque tarde unos segundos después del toque |

Si alguna fila falla, anota el paso y el registro del servicio (`journalctl -u <servicio> -n 50`) antes de tocar nada.

## 5. Día del evento

### Antes (la víspera y dos horas antes)

- [ ] Al menos 50 GB libres en el disco de `FOTOS_DIR`.
- [ ] Los tres servicios activos (`systemctl is-active fcumple-fotos fcumple-fotos-servidor cloudflared`).
- [ ] `https://fotos.<dominio>/health` responde `{"ok":true}` desde un celular con datos móviles.
- [ ] Hora sincronizada.
- [ ] Storage de Supabase con menos de 200 MB usados.
- [ ] Una foto de prueba se archiva y se descarga desde el PC.
- [ ] El PC no se suspende ni se actualiza solo durante la fiesta.

### Durante

Mira el registro del worker (`journalctl -u fcumple-fotos -f`) y el uso de Storage en el panel de Supabase.

| Situación | Qué se nota | Qué hacer |
|---|---|---|
| Se cae el PC o su internet | Las descargas bajan la copia liviana con aviso; los originales se acumulan en Storage | Recuperarlo antes de unos 200 originales pendientes, que es lo que cabe en 1 GB. Al volver, el worker los archiva solo |
| Se cae solo el túnel | `/health` local responde, pero el público no | `systemctl restart cloudflared` |
| Se llena el disco | El worker registra errores al escribir y no borra nada de Storage | Liberar espacio. No se pierde ninguna foto, porque el original queda en Storage |
| El worker registra `falló <ruta>` en una foto | Esa foto se reintenta en cada vuelta completa | Revisarla después de la fiesta |

### Después

1. Deja el servidor y el túnel encendidos mientras los invitados descarguen.
2. Copia `FOTOS_DIR` a otro disco: es la única copia de los originales.
3. La exportación a .zip del panel baja los originales desde Storage, así que contará como fallidas las fotos ya archivadas. Para el dueño del evento, los originales completos están en `FOTOS_DIR/<evento>/`.

## Volver atrás

Para dejar de usar el PC:

1. Detén el worker.
2. Borra la configuración: `delete from private.photo_archive;`.

La app vuelve a usar Storage. Las fotos que ya se archivaron solo tienen su copia liviana en Supabase: los invitados reciben esa copia con el aviso «No encontramos la foto original…». Los originales siguen en el disco del PC.

Para cambiar el secreto, actualiza a la vez la fila de Supabase y `.env.fotos`, y reinicia el servidor. Los enlaces ya emitidos dejan de funcionar; de todos modos vencen en una hora.

## Pendientes conocidos

- Si el PC responde pero falta un archivo en el disco, el 404 del servidor saca al invitado de la app.
- La moderación muestra la copia de 640 px; para ver detalles finos haría falta un zoom con el original.
- La exportación a .zip no incluye las fotos archivadas.
