# Puesta en marcha de la Fase 1

Cómo levantar la plataforma en un proyecto Supabase **nuevo** y probarla de punta a punta **sin tocar la Fase 0 (producción)**, y cómo hacer el corte cuando esté lista.

> Mientras no se haga el corte, **no hagas merge a `main`**: `deploy.yml` desplegaría a producción rutas (`/e/:slug`, `/panel`) que no tienen su base de datos.

## 1. Crear el proyecto Supabase

1. Crea un proyecto nuevo (el plan gratuito permite dos). Anota la **URL**, la clave **anon** y la cadena de conexión de la base (`DATABASE_URL`).
2. En *Authentication → Providers → Email*: activa el registro (`Enable sign ups`), exige contraseña de **8 caracteres o más** y deja activada la **confirmación de correo** (evita cuentas con correos ajenos). Equivale a `supabase/fase-1/config.toml`.
3. En *Authentication → URL Configuration*: pon como *Site URL* la dirección donde vas a probar (la URL del preview de Vercel) y agrégala a *Redirect URLs*, para que el enlace de confirmación vuelva a la app.

## 2. Aplicar las migraciones

`supabase db push` solo lee `supabase/migrations/` (la Fase 0). Para la primera aplicación usa `psql` con las migraciones de la Fase 1, en orden:

```bash
export DATABASE_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres'
for f in supabase/fase-1/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done
```

Las migraciones crean tablas, RPC, políticas y los buckets `party-photos` y `post-images`. No hay datos que migrar.

## 3. Probar en un preview de Vercel (sin tocar producción)

1. En el proyecto de Vercel agrega las variables **solo para el entorno *Preview***: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` del proyecto **nuevo**. Producción sigue apuntando al proyecto viejo.
2. Haz push de la rama: Vercel genera una URL de preview. Esa URL usa el proyecto nuevo.
3. Usa esa URL como *Site URL* en el paso 1.3.

## 4. Prueba de punta a punta (checklist)

Con dos teléfonos (idealmente un iPhone y un Android) y un computador:

1. **Organizador**: en `/panel` crea una cuenta, confirma el correo, inicia sesión y crea un evento. *Ajustes*: déjalo abierto y con la cámara "al entrar".
2. **Enlace**: en la pestaña *Enlace* copia el enlace y descarga el QR.
3. **Invitados**: abre el enlace en cada teléfono, **Inscribirme** con nombre, apellido y PIN. Cierra el navegador, vuelve a abrir el enlace: debe entrar directo. Prueba **Ya me inscribí** desde otro navegador.
4. **Equivocarse**: intenta un PIN malo 5 veces y comprueba el bloqueo de 10 minutos; luego usa *Restablecer acceso* desde el panel y vuelve a inscribirte.
5. **Cámara**: saca fotos desde ambos teléfonos (verifica que **sube**; el canvas con imágenes de otro origen puede fallar en Safari iOS).
6. **Puerta**: cambia el evento a "al marcar la llegada", comprueba que la cámara queda bloqueada, muestra el código en el teléfono, escanéalo desde el panel (*Puerta → Abrir escáner*) y comprueba que se desbloquea con "Ya me escanearon".
7. **Fotos**: en *Fotos* modera, **revela el rollo** y comprueba que los teléfonos ven las fotos.
8. **Aislamiento**: crea una segunda cuenta de organizador y comprueba que no ve nada del primero.

Si algo falla, revisa *Logs → Postgres* en Supabase: los errores de permisos (`42501`) y de límites (`53400`) son intencionales y están descritos en [`acceso-de-invitados.md`](./acceso-de-invitados.md).

## 5. Keep-alive del plan gratuito

El workflow `.github/workflows/keepalive.yml` hace un ping de lectura cada 3 días para que Supabase no pause el proyecto. Se activa agregando los secrets `SUPABASE_URL` y `SUPABASE_ANON_KEY` del proyecto nuevo en GitHub (*Settings → Secrets and variables → Actions*); sin ellos termina sin hacer nada.

## 6. El corte (cuando la prueba pase)

1. En una rama de corte:
   ```bash
   git mv supabase/migrations supabase/legacy-fase-0-migrations
   git mv supabase/tests supabase/legacy-fase-0-tests
   git mv supabase/fase-1/migrations supabase/migrations
   git mv supabase/fase-1/tests supabase/tests
   git mv supabase/fase-1/config.toml supabase/config.toml
   ```
   y ajusta `supabase/vitest.config.ts` / `package.json` (`test:db`) a las rutas nuevas.
2. Cambia los secrets de GitHub (`SUPABASE_PROJECT_ID`, `SUPABASE_PASSWORD`, `SUPABASE_ACCESS_TOKEN`) y las variables de **producción** de Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) al proyecto nuevo. Como las migraciones ya se aplicaron con `psql`, registra el historial con `supabase migration repair --status applied <versiones>` antes del primer `db push`.
3. Quita de `App.tsx` las rutas de la Fase 0 (`/i/:token`, `/evento`, `/como-llegar`, `/admin`) y decide qué hace `/` (hoy redirige a `/i/invalido`).
4. Pausa o archiva el proyecto Supabase viejo (`pg_dump` antes, si quieres conservar algo).
5. Merge a `main`.
