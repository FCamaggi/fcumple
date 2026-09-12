# Supabase — capa de datos

Esta carpeta contiene el esquema de Postgres (migraciones versionadas), las
funciones RPC públicas y los tests que los ejercen contra un Postgres real.
No está enlazada a ningún proyecto Supabase hosted (`config.toml` deja
`project_id` en blanco a propósito) — el link real se hace en CI/deploy con
`SUPABASE_PROJECT_ID`.

## Migraciones

`supabase/migrations/*.sql`, en orden (`YYYYMMDDHHMMSS_descripcion.sql`, el
formato que espera `supabase db push`):

| Archivo | Contenido |
|---|---|
| `..._extensions.sql` | Habilita `pgcrypto` (uuids y bytes aleatorios). |
| `..._guest_token_function.sql` | `generate_guest_token()`. |
| `..._updated_at_trigger.sql` | Trigger genérico `set_updated_at()`. |
| `..._create_guests.sql` | Tabla `guests` + RLS (bloqueada por completo para `anon`/`authenticated` salvo las RPC). |
| `..._create_event_config.sql` | Tabla `event_config` (fila única) + RLS (lectura pública, escritura solo `authenticated`). |
| `..._rpc_get_guest_by_token.sql` | Función pública de lectura por token. |
| `..._rpc_submit_rsvp.sql` | Función pública de escritura del RSVP por token. |

Aplicarlas a un proyecto hosted real es un paso posterior (`supabase db
push`), fuera del alcance de este trabajo — acá solo se versionan y se
prueban localmente.

## Contrato para el frontend

### `get_guest_by_token(p_token text)`

Devuelve 0 o 1 filas con esta forma exacta (nunca incluye `admin_note`):

```ts
{
  id: string;              // uuid
  full_name: string;
  status: 'pending' | 'confirmed' | 'declined';
  plus_ones_allowed: number;
  plus_ones_confirmed: number;
  guest_note: string | null;
  responded_at: string | null; // timestamptz ISO
}
```

Un token inexistente o vacío devuelve simplemente 0 filas (no hay excepción,
no hay forma de distinguir "no existe" de "casi matchea").

### `submit_rsvp(p_token text, p_status text, p_plus_ones int, p_note text default null)`

- `p_status` debe ser `'confirmed'` o `'declined'`. Cualquier otro valor
  (incluido `'pending'`) tira una excepción — la función nunca deja
  `status = 'pending'` a través de este RPC, incluso si alguien lo intenta
  directamente sin pasar por el frontend (defensa en profundidad de RF11).
- `p_plus_ones` debe estar entre `0` y `plus_ones_allowed` del invitado; si
  no, tira una excepción.
- Un token que no matchea ningún invitado tira una excepción (no actualiza
  nada).
- Actualiza únicamente la fila de ese token, nunca otra, y setea
  `responded_at = now()`.
- Devuelve la fila actualizada con la misma forma que `get_guest_by_token`.

Ambas funciones son `security definer` con `search_path` fijado a `public`
explícitamente (para que un `search_path` manipulado no pueda secuestrar un
identificador sin calificar dentro del cuerpo de la función), y tienen
`grant execute` para `anon` y `authenticated`.

## Autenticación del admin

Un solo usuario admin vía Supabase Auth (email/password), como recomienda
`docs/02-arquitectura-tecnica.md` sección 5. No hay migración para esto
(Supabase Auth trae su propio schema `auth`); se crea una sola vez, fuera de
las migraciones:

**Opción 1 — Dashboard:** Authentication → Users → "Add user", con el email
del admin y una contraseña, marcando "Auto Confirm User".

**Opción 2 — CLI, contra el proyecto ya linkeado:**

```bash
supabase auth admin create-user \
  --email "tu-email@ejemplo.com" \
  --password "una-contraseña-segura" \
  --email-confirm
```

Con RLS, cualquier usuario que inicie sesión (rol `authenticated`) tiene
acceso completo a `guests` y `event_config` — como es un solo admin, no hace
falta un sistema de roles más fino (ver política `authenticated_full_access`
en la migración de `guests`).

## Tests (Postgres real en Docker)

Los tests no usan mocks: levantan un contenedor `postgres:16-alpine`
efímero, le crean los roles `anon`/`authenticated`/`service_role` (que en un
proyecto Supabase hosted ya existen de fábrica, acá los recreamos porque es
Postgres puro), aplican las migraciones tal cual están en
`supabase/migrations/`, y ejercitan las funciones RPC y las políticas de RLS
contra esa base real.

Requisitos: Docker disponible (`docker --version`). No hace falta el
Supabase CLI — probar RLS y RPC no lo necesita.

```bash
npm run test:db
```

Esto:
1. Levanta `postgres:16-alpine` en el puerto `55432` del host (contenedor
   `fcumple-test-pg`, `--rm` para que no deje residuos).
2. Espera a que acepte conexiones.
3. Corre `supabase/tests/rsvp.test.ts`, que en su `beforeAll` crea los roles
   y aplica todas las migraciones antes de correr cada caso.
4. Al terminar (pase o falle), borra el contenedor.

Si un run anterior murió a mitad de camino y dejó el contenedor corriendo,
el siguiente `npm run test:db` lo borra solo antes de arrancar uno nuevo
(ver `supabase/tests/globalSetup.ts`).

### Cómo se simulan `anon` / `authenticated` sin el Supabase CLI

PostgREST (lo que expone la API de Supabase) se conecta a Postgres *como*
el rol `anon` o `authenticated` según el JWT de la request. Acá no hay
PostgREST corriendo, así que el test se conecta como superusuario y usa
`SET ROLE anon` / `SET ROLE authenticated` antes de cada query relevante
(ver `asRole()` en `supabase/tests/apply-migrations.ts`), y `RESET ROLE`
después. Un superusuario puede cambiar a cualquier rol sin contraseña, así
que los roles se crean `NOLOGIN` — no hace falta que acepten conexiones
directas, solo que existan para que las políticas de RLS (`to anon`,
`to authenticated`) y los `grant`/`revoke` tengan a quién aplicarse.

Como ninguna de las dos funciones RPC depende de `auth.uid()` (identifican
al invitado por token, no por sesión), no hizo falta simular un JWT ni
`request.jwt.claims` — alcanza con el rol de Postgres.

## Decisiones de diseño no obvias

- **Generación del token**: `generate_guest_token()` usa
  `gen_random_bytes(9)` (72 bits de entropía) codificado en base64 y
  normalizado a un alfabeto URL-safe (`+/` → `-_`, sin `=` porque 9 bytes
  produce exactamente 12 caracteres base64 sin padding). Es el `default` de
  la columna `token`, así que insertar un invitado sin especificar token ya
  genera uno seguro. Nunca es secuencial ni derivado del `id`.
- **`event_config` como fila única**: en vez de un trigger que impida un
  segundo `insert`, la tabla usa `id boolean primary key default true` más
  `check (id)`. Cualquier fila debe tener `id = true`, y la primary key
  impide una segunda fila con ese mismo valor — no puede existir una
  segunda fila, sin lógica extra.
- **`guests` sin ninguna política para `anon`**: no es que la política se
  "olvidó", es la defensa principal — sin ninguna política que otorgue
  acceso, RLS deniega todo por default para ese rol, y además se le hizo
  `revoke all` explícito a nivel de tabla (belt-and-suspenders: aunque
  alguna migración futura agregara sin querer un `grant`, seguiría sin
  poder pasar RLS).
- **Errores de `submit_rsvp` con `errcode` explícito** (`22023` para
  parámetros inválidos, `P0002` para token inexistente): no es requisito
  del encargo, pero deja al frontend un código de error estable para
  distinguir "plus_ones inválido" de "token no existe" sin parsear el
  mensaje en texto libre.
