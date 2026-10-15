# Setup: CI/CD (GitHub Actions)

Este proyecto usa dos workflows de GitHub Actions:

- **`.github/workflows/ci.yml`** — corre en cada `push` (cualquier rama) y en cada `pull_request` hacia `main`. Hace `npm ci`, `npm run typecheck`, `npm run test:coverage` (sube el reporte de cobertura como artifact) y `npm run build`. Si además existe un script `test:db` en `package.json`, corre un job `db-tests` aparte contra un Postgres efímero (`postgres:16-alpine`) levantado como `services:` del job. Si `test:db` todavía no existe, ese job se salta sin romper el CI.
- **`.github/workflows/deploy.yml`** — corre después de que `CI` termine en `main` con éxito (`workflow_run`), o a mano con `workflow_dispatch`. Tiene dos jobs: `migrate-db` (aplica migraciones de Supabase con `supabase db push`) y `deploy-web` (que espera a `migrate-db` y hace build + deploy a Vercel con `vercel build --prod` + `vercel deploy --prebuilt --prod`).

Para que estos workflows funcionen hay que crear los siguientes **GitHub Secrets** en `Settings → Secrets and variables → Actions` del repo (`FCamaggi/fcumple`):

| Secret | Valor | De dónde sale |
|---|---|---|
| `VERCEL_TOKEN` | (el mismo valor que ya tenés en tu `.env` local) | Se generó al hacer `vercel link` la primera vez; también se puede crear/regenerar en [vercel.com/account/tokens](https://vercel.com/account/tokens). |
| `VERCEL_ORG_ID` | `team_hus13YQckXpz2N78V3fWaTQk` | Leído de `.vercel/project.json` (ya generado localmente al linkear el proyecto). |
| `VERCEL_PROJECT_ID` | `prj_uzJUEeXKfr6JjUZqea7tLQvnP48b` | Leído de `.vercel/project.json`. |
| `SUPABASE_PROJECT_URL` | (el mismo valor que ya tenés en tu `.env` local) | Dashboard de Supabase → Project Settings → API → Project URL. Si el cliente de Supabase en `src/` termina consumiendo esta variable como `VITE_SUPABASE_URL` en build time (revisar cómo la nombra el wiring del frontend), duplicar el secret también como `VITE_SUPABASE_URL` o renombrar este. |
| `SUPABASE_PUBLISHABLE_KEY` | (el mismo valor que ya tenés en tu `.env` local) | Dashboard de Supabase → Project Settings → API → anon/public key. Mismo comentario: si el frontend la consume como `VITE_SUPABASE_ANON_KEY`, duplicar/renombrar según corresponda (en `.env.local` ya existe con ese nombre). |
| `SUPABASE_PROJECT_ID` | (el mismo valor que ya tenés en tu `.env` local) | Dashboard de Supabase → Project Settings → General → Reference ID. Se usa en `supabase link --project-ref`. |
| `SUPABASE_ACCESS_TOKEN` | **Nuevo, todavía no existe en `.env`** | Se genera en [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens). Es un token de cuenta (personal access token), necesario para que el CLI de Supabase se autentique en CI y pueda correr `supabase link` / `supabase db push`. **No confundir con `SUPABASE_SECRET_KEY`**, que es la service role key de la API (para llamadas server-side a la base de datos), no sirve para autenticar el CLI. |
| `SUPABASE_PASSWORD` | (el mismo valor que ya tenés en tu `.env` local) | Es la contraseña de la base de datos Postgres (la que se definió al crear el proyecto Supabase). `supabase db push` la necesita para conectarse directo a Postgres — `SUPABASE_ACCESS_TOKEN` solo autentica contra la Management API (`supabase link`), no alcanza para el push de migraciones. Se pasa como `supabase db push --password "${{ secrets.SUPABASE_PASSWORD }}"`. |

> `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` no son especialmente sensibles (identifican el proyecto, no dan acceso por sí solos), así que si preferís también podés cargarlos como **Actions "Variables"** en vez de "Secrets" — ambos workflows los referencian igual con `${{ secrets.NOMBRE }}` en este repo, así que si los movés a "Variables" hay que cambiar esas referencias a `${{ vars.NOMBRE }}` en `.github/workflows/deploy.yml`.

> Los valores exactos de `VERCEL_TOKEN`, `SUPABASE_PROJECT_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` y `SUPABASE_PASSWORD` están en tu `.env` local (no se listan acá porque ese archivo nunca se commitea).

## Nunca commitear `.env` / `.env.local`

Ambos archivos ya están en `.gitignore`. No los subas manualmente ni los pegues en ningún workflow — todos los valores sensibles deben quedar como `${{ secrets.X }}`.

## Checklist de primera vez

1. Crear los 8 secrets de la tabla de arriba en GitHub (Settings → Secrets and variables → Actions) — **como Repository secrets**, no como "Variables" ni agrupados bajo un Environment; el workflow los lee con `${{ secrets.NOMBRE_EXACTO }}` y cada uno necesita existir con ese nombre propio, no todos juntos bajo un único secret.
2. Hacer el primer `git push` a `main`.
3. Ir a la pestaña **Actions** del repo y verificar que:
   - `CI` corra en verde (typecheck, tests, build; `db-tests` puede aparecer como "skipped" hasta que exista el script `test:db`).
   - `Deploy` se dispare automáticamente después de que `CI` termine bien en `main`, y también corra en verde (`migrate-db` + `deploy-web`).
