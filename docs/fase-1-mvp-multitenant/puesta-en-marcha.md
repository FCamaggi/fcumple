# Puesta en marcha de la Fase 1

Cómo dejar el **proyecto Supabase actual** listo para la Fase 1 (borrando lo de la Fase 0), probar la plataforma de punta a punta y hacer merge.

La Fase 0 ya no se usa, así que no hace falta un proyecto nuevo: se **poda** el actual. (Se había propuesto uno nuevo solo para proteger la producción mientras la Fase 0 estuviera en uso.)

> **Orden importante:** la poda y el `db push` (pasos 2 y 4) se hacen **antes** de hacer merge a `main`. Desde el momento de la poda, la app vieja (`/i/:token`, `/admin`, `/evento`) deja de funcionar; es lo esperado.

## 0. Antes de empezar

- **Respaldo** (no hay deshacer): *Dashboard → Database → Backups*, o `pg_dump "$DATABASE_URL" > fase0.sql`.
- Si quieres conservar las **fotos** del evento anterior, descárgalas desde *Storage → party-photos*.
- Ten a mano: el *project ref* de Supabase, la contraseña de la base y la [CLI de Supabase](https://supabase.com/docs/guides/cli).

## 1. Podar la Fase 0

1. Abre el *SQL Editor* de Supabase y ejecuta el contenido de [`supabase/legacy-fase-0/prune-fase-0.sql`](../../supabase/legacy-fase-0/prune-fase-0.sql) (o `psql "$DATABASE_URL" -f ...`). Corre en una transacción: si algo falla, no se aplica nada.
2. En *Storage*, **vacía** los buckets `party-photos` y `post-images` (Supabase no permite borrar archivos con SQL). Los buckets en sí se reutilizan.

Qué hace el script y por qué es seguro (un test lo reproduce contra una copia fiel de la Fase 0):

- Borra **todas** las políticas de `storage.objects`. Es el paso crítico: un simple `drop schema public cascade` deja viva la política `authenticated_full_access` de la Fase 0, que le daría a **cualquier organizador acceso a todas las fotos**. El test falla si ese paso se omite.
- Recrea `public` vacío con los privilegios por defecto de Supabase.
- Vacía el historial de migraciones para que `supabase db push` aplique la Fase 1 desde cero.
- **Conserva** los usuarios de Auth: la cuenta de admin de la Fase 0 sirve como primer organizador.

## 2. Configurar Auth

En el panel de Supabase:

1. *Authentication → Providers → Email*: activa el registro (`Enable sign ups`), contraseña mínima de **8** y deja activada la **confirmación de correo**. Equivale a [`supabase/config.toml`](../../supabase/config.toml).
2. *Authentication → URL Configuration*: *Site URL* = la URL donde vas a probar (la del preview de Vercel, o la de producción), y agrega esa URL a *Redirect URLs* para que el enlace de confirmación vuelva a la app.

## 3. Aplicar la Fase 1

Desde esta rama:

```bash
supabase link --project-ref <ref>
supabase db push --password "<password de la base>"
```

Aplica las 8 migraciones de `supabase/migrations/` (tablas, RPC, políticas y buckets) y las **registra** en el historial, de modo que el `db push` del deploy sea un no-op. No hay datos que migrar.

## 4. Probar en un preview de Vercel

1. Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` ya apuntan a este proyecto; si el entorno *Preview* tiene las suyas, verifica que sean las mismas.
2. Haz push de la rama: Vercel genera una URL de preview. Úsala como *Site URL* (paso 2.2).

## 5. Checklist de punta a punta

Con dos teléfonos (idealmente un iPhone y un Android) y un computador:

1. **Organizador**: en `/panel` crea una cuenta (o entra con la de admin de la Fase 0), confirma el correo y crea un evento. En *Ajustes* déjalo abierto y con la cámara "al entrar".
2. **Enlace**: en la pestaña *Enlace* copia el enlace y descarga el QR.
3. **Invitados**: abre el enlace en cada teléfono, **Inscribirme** con nombre, apellido y PIN. Cierra el navegador y vuelve a abrir el enlace: debe entrar directo. Prueba **Ya me inscribí** desde otro navegador.
4. **Equivocarse**: intenta un PIN malo 5 veces y comprueba el bloqueo de 10 minutos; luego usa *Restablecer acceso* desde el panel y vuelve a inscribirte.
5. **Cámara**: saca fotos desde ambos teléfonos y verifica que **suben** (el canvas con imágenes de otro origen puede fallar en Safari iOS).
6. **Puerta**: cambia el evento a "al marcar la llegada", comprueba que la cámara queda bloqueada, muestra el código en el teléfono, escanéalo desde el panel (*Puerta → Abrir escáner*) y comprueba que se desbloquea con "Ya me escanearon".
7. **Fotos**: en *Fotos* modera, **revela el rollo** y comprueba que los teléfonos ven las fotos.
8. **Aislamiento**: crea una segunda cuenta de organizador y comprueba que no ve nada del primero.

Si algo falla, revisa *Logs → Postgres*: los errores de permisos (`42501`) y de límites (`53400`) son intencionales y están descritos en [`acceso-de-invitados.md`](./acceso-de-invitados.md).

## 6. Keep-alive del plan gratuito

`.github/workflows/keepalive.yml` hace un ping de lectura cada 3 días para que Supabase no pause el proyecto. Se activa agregando en GitHub (*Settings → Secrets and variables → Actions*) los secrets `SUPABASE_URL` y `SUPABASE_ANON_KEY`; sin ellos termina sin hacer nada.

## 7. Merge a `main`

El repositorio ya está reorganizado para esto: `supabase/migrations/` y `supabase/tests/` son los de la Fase 1, y `supabase/legacy-fase-0/` conserva las migraciones viejas y el script de poda como registro. `deploy.yml` hace `supabase db push` (no-op, ya aplicado) y despliega la web.

Pendiente después del merge (código muerto de la Fase 0, que apunta a tablas que ya no existen): retirar `/i/:token`, `/evento`, `/como-llegar` y `/admin` de `App.tsx` y los componentes y librerías que solo ellos usan, **una vez portado** lo que falta del hub (cuenta regresiva, "cómo llegar" por evento, RSVP). Hasta entonces esas rutas existen pero no funcionan.
