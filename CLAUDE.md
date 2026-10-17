# fcumple

Plataforma web de cámara y fotos para eventos. En la Fase 1 (multi-tenant, el esquema vigente) el invitado entra por el enlace o QR único de un evento (`/e/:slug`), se inscribe con nombre, apellido y PIN, y toma fotos con los marcos y stickers que configuró el organizador, que además modera desde `/panel`. La Fase 0 (un solo evento) quedó como histórico.

Antes de asumir el estado de la app a partir de un documento, confírmalo contra el código: `docs/README.md` lo exige y algunos documentos de la Fase 0 son registros cerrados.

## Stack

React 18, TypeScript, Vite 5, Tailwind 3, react-router 6 y framer-motion. Supabase (Postgres, Auth, Storage y RLS) a través de `@supabase/supabase-js`; no hay backend propio. Es una SPA estática en Vercel (`vercel.json` reescribe todo a `index.html`). Variables de entorno: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (no hay archivos `.env` en el repo).

## Comandos

Verificados el 2026-10-17 con Node 22.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Vite. |
| `npm run typecheck` | `tsc --noEmit`. Pasa, unos 30 s. |
| `npm test` | Vitest con jsdom: 72 archivos, 721 tests, cerca de 1 min. |
| `npm run test:coverage` | Lo que corre el CI. |
| `npm run build` | `tsc` y `vite build`. Pasa; avisa de chunks de más de 500 kB. |
| `npm run test:db` | 134 tests contra un Postgres real. Levanta Postgres 16 en Docker (puerto 55433). |
| `npm run build:setup-sql` | Regenera `supabase/setup-fase-1.sql` a partir de las migraciones. |

Sin Docker, `test:db` acepta un Postgres propio en `localhost:55433` (usuario `postgres`, clave `test`) con `FCUMPLE_TEST_PG_EXTERNAL=1`. Cada archivo de test reinicia el esquema `public`: nunca lo apuntes a una base con datos.

Línea base conocida: con Node 22 falla 1 test, `GuestPage > shows the real doors time from the event config…`. El texto esperado, formateado con `es-CL`, lleva un espacio de no separación (U+00A0) entre `p.` y `m.` que no coincide con el DOM. La causa probable es la diferencia de ICU entre Node 22 y el Node 20 del CI; no se verificó en Node 20. No es una regresión de tu cambio.

## Estructura

- `src/pages` (una página por ruta), `src/components` (`CameraCapture.tsx` es el más grande; `studio/` es el editor de marcos), `src/hooks`, `src/mocks`, `src/test`.
- `src/lib`: clientes de API y lógica pura, cada uno con su `.test.ts` al lado.
- `supabase/migrations`: el esquema de la Fase 1, numerado. `supabase/tests`: la suite de base de datos. `supabase/legacy-fase-0`: histórico, lo usa el test de poda. `seed-demo*.sql` y `setup-fase-1.sql` (este último es generado).
- `docs/`: una carpeta por fase. Empieza por `docs/README.md`; la guía de la Fase 1 está en `docs/fase-1-mvp-multitenant/`.

Rutas: `/e/:slug` (entrada del invitado), `/i/:token` (invitado por token individual), `/evento`, `/como-llegar`, `/admin`, `/panel`, `/panel/e/:eventId`.

## Convenciones

- Textos de interfaz, mensajes de error, documentación y commits en español. Los commits llevan prefijo convencional y alcance: `feat(fase-1): …`, `refactor(supabase): …`, `feat(db): …`.
- La lógica nueva lleva test junto a ella. Un cambio de esquema necesita su migración y un test de base de datos.
- Ninguna columna guarda RUT, correo, teléfono ni PIN en claro, y un test lo verifica. No lo rompas.
- Los cambios de la Fase 1 se documentan en `docs/fase-1-mvp-multitenant/`, no en el backlog cerrado de la Fase 0. `DESEO-DISENO-USUARIO.md` nunca se reescribe, solo se le añaden addendums.

## CI y despliegue

`ci.yml` corre en cada push de cualquier rama y en los PR a `main`: tipos, tests con cobertura, build y tests de base de datos. `deploy.yml` publica en producción (Vercel) cuando el CI pasa en `main`, así que lo que llega a `main` se despliega. Pregunta antes de empujar.

## Herramientas de este entorno

- **Grafo de código** (MCP `code-review-graph`, declarado en `.mcp.json`). Construcción completa en unos 7 s; escribe solo en `.code-review-graph/`, que se ignora a sí mismo. Es una foto: vuelve a construirla (`build_or_update_graph_tool`) antes de apoyarte en ella. Para trabajo sin commitear usa `detail_level="minimal"`; en la CLI usa `--base HEAD`, porque su valor por defecto es `HEAD~1` y en este repo produce cientos de KB. Los skills `graph-*` lo usan.
- **Diseño**: páginas públicas nuevas y expresivas con `design-taste-frontend`; crítica, auditoría y pulido de la UI de producto con `impeccable`; animación con `animate`, `review-animations` y `animation-performance`.
- **rtk** (uso explícito, no automático): resume la salida de comandos que suelen ser largos, como `rtk git status`, `rtk git log -n 15`, `rtk ls`, `rtk find` o `rtk vitest run` cuando todo pasa. `rtk git diff` de un rango amplio recorta y lo avisa; usa `--no-compact` para verlo entero. En tests que fallan no ahorra nada.
