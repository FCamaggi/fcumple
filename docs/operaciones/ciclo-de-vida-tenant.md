# Ciclo de vida de un cliente (tenant)

Pasos para llevar un evento de un cliente desde el primer contacto hasta el cierre con respaldo. Se escribió a partir del primer cliente real y vale para todos los siguientes.

Cada paso dice **quién** lo hace: el **dueño** (a mano, en el panel o en el SQL Editor de Supabase) o el **repo** (un cambio de código que pasa por PR a `main`).

## Antes de empezar: dónde vive cada cosa

| Qué | Dónde | Por qué |
|---|---|---|
| App, scripts genéricos y este runbook | Este repositorio (`fcumple`) | Es **público**. |
| Material del cliente: brief exportado, invitación, marcos, notas, respaldos | Repositorio privado de clientes (`fcumple-clientes`), una carpeta por cliente con el esquema de `_plantilla/` | Tiene datos personales. |
| Datos del evento en la base (marcos, stickers, configuración) | Supabase, cargados con SQL generado que el dueño pega en el SQL Editor | Una migración se publicaría en el repo público y correría en cada despliegue. |

Reglas de privacidad:

- Nada de la carpeta del cliente se agrega a este repositorio, ni con `git add -f`.
- Los nombres, teléfonos o direcciones del cliente y sus invitados no van en issues, PR, commits ni prompts a servicios externos.
- Los fixtures y textos de ejemplo del código usan datos ficticios.

## 1. Brief

1. **Repo:** crea `src/briefs/<slug-brief>.ts` (ver [`briefs-de-cliente.md`](../fase-1-mvp-multitenant/briefs-de-cliente.md)). Tiene que llegar a `main` para que el cliente lo vea en `/brief/<slug-brief>`.
2. **Cliente:** responde el formulario.
3. **Dueño:** exporta las respuestas desde el Table Editor (`client_briefs`, CSV) a `<cliente>/brief/` y escribe el resumen con lo que se puede hacer y lo que falta confirmar.
4. **Dueño:** anota en `<cliente>/README.md` las decisiones: máximo de invitados, fotos por invitado, fecha, textos y tipografías.

## 2. Evento

1. **Dueño:** en `/panel` crea la cuenta de organizador (si no existe) y el evento.
2. **Dueño:** busca el slug real y anótalo en la ficha. **No es el slug del brief.**
   ```sql
   select id, slug, name from public.events order by created_at desc;
   ```
3. **Dueño:** en *Ajustes* e *Inscripción* configura nombre, subtítulo, fecha, `default_photo_quota`, qué se le pide al invitado y cuándo se habilita la cámara ([`inscripcion-configurable.md`](../fase-1-mvp-multitenant/inscripcion-configurable.md), [`activacion-camara-y-cartelera.md`](../fase-1-mvp-multitenant/activacion-camara-y-cartelera.md)).
4. **Repo (opcional):** imagen de vista previa del enlace en `public/og/<slug-evento>.jpg` (1200×630). Se comprueba en producción:
   ```bash
   curl -A "WhatsApp/2.23" https://fcumple-ten.vercel.app/e/<slug-evento>
   ```
5. **Dueño:** calcula la capacidad (invitados × fotos × peso de una foto) contra el plan gratuito de Supabase: 1 GB de Storage y 5 GB de salida al mes.

## 3. Marcos y stickers

Procedimiento completo en [`scripts/marcos/README.md`](../../scripts/marcos/README.md). En resumen:

1. **Dueño:** genera las imágenes con IA, una por proporción. Antes de usarlas para un cliente, revisa la licencia de la herramienta ([`prueba-recursos-ia.md`](../fase-1-mvp-multitenant/prueba-recursos-ia.md)).
2. **Dueño o Claude:** escribe `<cliente>/marcos/marcos-listos.spec.json` y corre:
   ```bash
   python3 scripts/marcos/quitar-fondo-negro.py <entrada> <salida>   # si el fondo es negro
   python3 scripts/marcos/preparar-marcos.py <cliente>/marcos
   node scripts/marcos/subir-marcos.mjs <cliente>/marcos --dry-run
   node scripts/marcos/subir-marcos.mjs <cliente>/marcos              # con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
   ```
3. **Dueño:** pega `<cliente>/marcos/cargar-marcos-listos.sql` en el SQL Editor. Es idempotente y reemplaza solo los marcos con sus etiquetas.

Orden obligatorio: si los marcos necesitan un cambio del motor, la migración tiene que estar desplegada **antes** de pegar el SQL, y las imágenes tienen que estar subidas **antes** de pegarlo.

## 4. Pruebas en teléfonos

1. **Dueño:** sigue [`guion-prueba-telefono.md`](../fase-1-mvp-multitenant/guion-prueba-telefono.md) con un evento de prueba en producción. El criterio de paso: los pasos 1 a 11 pasan en un Android y en un iPhone.
2. **Congelamiento**, unas 48 h antes de la fiesta:
   - No se fusiona nada a `main`, porque lo que llega a `main` se despliega.
   - No se reinician inscripciones.
   - No se cambian cupos en masa.

## 5. Día de la fiesta

- [ ] Evento abierto y cámara en el modo acordado ("al entrar" o "al marcar la llegada").
- [ ] QR del evento impreso o a mano. Si la cámara se habilita en la puerta: escáner abierto en *Puerta*.
- [ ] Moderar en *Fotos* y publicar las aprobadas («Publicar N aprobada(s)») cuando corresponda.
- [ ] Si algo falla, el plan de contingencia del guion de pruebas. Errores `42501` (permisos) y `53400` (límites) son intencionales: ver [`acceso-de-invitados.md`](../fase-1-mvp-multitenant/acceso-de-invitados.md).

## 6. Cierre y respaldo

1. **Dueño:** entrega las fotos al cliente. Desde el panel del evento se descargan las originales en un `.zip` con una carpeta por invitado (`ExportPhotos`). Deja la pestaña abierta hasta que termine, y cuenta esa descarga contra los 5 GB de salida al mes.
2. **Dueño:** respalda el evento completo con [`scripts/tenant/export.mjs`](../../scripts/tenant/README.md), dentro de la carpeta del cliente:
   ```bash
   node scripts/tenant/export.mjs <slug-evento> --brief-slug <slug-brief> --out <clientes>/<cliente>/respaldos/<AAAA-MM-DD>
   ```
   `--brief-slug` hace falta porque el slug del brief no es el del evento; sin él, el brief no entra al respaldo. Exporta la fila del evento, sus tablas, el brief y todos los archivos de Storage bajo `{event_id}/`. Nunca exporta los hash de PIN, y redacta los tokens de invitado y el código de activación.
3. **Dueño:** verifica el manifiesto (conteos y sha256). Guarda `storage/` fuera del repositorio de clientes, por ejemplo en Drive. Haz commit de `data.json` y `manifest.json`.
4. **Repo (opcional):** retira `public/og/<slug-evento>.jpg` y `src/briefs/<slug-brief>.ts`.
5. **Dueño:** marca el cierre en la ficha del cliente.

Borrar el evento de la base no forma parte de este runbook todavía. Al borrar la fila de `events` se borran sus tablas en cascada, pero **los archivos de Storage no**: hay que borrarlos por prefijo en los tres buckets (`party-photos`, `post-images`, `event-assets`), como hace `supabase/seed-demo-cleanup.sql`.
