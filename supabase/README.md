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
| `20260912090000_create_posts.sql` | Tabla `posts` (avisos/anuncios) + RLS. |
| `20260912100001_add_photo_quota_and_reveal.sql` | Columna `photo_quota` en `guests`, columna `photos_revealed_at` en `event_config`. |
| `20260912100002_create_photos.sql` | Tabla `photos` (metadata de moderación) + RLS. |
| `20260912100003_storage_party_photos.sql` | Bucket `party-photos` + políticas RLS de `storage.objects`. |
| `20260912100004_rpc_submit_photo.sql` | Función pública de registro de metadata de foto por token, valida cupo. |
| `20260912100005_rpc_get_photo_quota.sql` | Función pública de lectura de cupo/usado por token. |

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

## Galería de fotos (`photos` + Storage)

Ver decisiones de producto en `docs/BACKLOG.md` (Etapa 2) y
`docs/DESEO-DISENO-USUARIO.md` §9. Contrato para el frontend:

### Bucket y convención de paths

- Bucket: `party-photos`, privado (`public = false`), creado por la
  migración `20260912100003_storage_party_photos.sql` vía
  `insert into storage.buckets (...)`. Se confirmó que este `insert` corre
  sin problema en una migración (probado en el Postgres de test), así que
  **no hace falta crear el bucket a mano en el dashboard**.
- Path esperado de cada objeto: `{token}/{uuid}.jpg` — el primer segmento
  del path (`(storage.foldername(name))[1]`) tiene que ser exactamente el
  token del invitado. El frontend sube primero el archivo a ese path en
  Storage, y después llama a `submit_photo` con el mismo path para
  registrar la metadata.

### `submit_photo(p_token text, p_storage_path text)`

Devuelve la fila insertada:

```ts
{
  id: string;              // uuid
  guest_id: string;        // uuid
  storage_path: string;
  status: 'pending';       // siempre 'pending' al insertar
  created_at: string;      // timestamptz ISO
}
```

- Tira excepción si `p_token` no matchea ningún invitado (`errcode P0002`).
- Tira excepción si `p_storage_path` no empieza exactamente con `{token}/`
  (`errcode 22023`) — evita que alguien registre metadata apuntando al
  archivo de otro invitado.
- Tira excepción si el invitado ya alcanzó `photo_quota` (`errcode 22023`).
  Cuenta **todas** las fotos del invitado sin importar `status` (pending +
  approved + rejected), para que reintentar después de un rechazo no evada
  el cupo.
- Esta función solo registra la metadata; no valida ni escribe el archivo
  en Storage — eso ya tiene que haber pasado (la policy de `storage.objects`
  para `anon` INSERT es la que valida que el path pertenezca a un invitado
  real, ver más abajo).

### `get_photo_quota(p_token text)`

Devuelve 0 o 1 fila:

```ts
{
  quota: number; // guests.photo_quota del invitado
  used: number;  // count(*) de public.photos de ese guest_id, cualquier status
}
```

Un token inexistente devuelve 0 filas, mismo criterio que `get_guest_by_token`.

### Revelado del rollo

`event_config.photos_revealed_at` (`timestamptz`, `null` por defecto = sin
revelar). No hay RPC pública para setearlo ni para volverlo a `null` —
el admin lo hace directo por SQL/dashboard como `authenticated`
(`update public.event_config set photos_revealed_at = now() where id = true`).
Mientras sea `null`, nadie (ni siquiera quien subió la foto) puede leer
ningún objeto del bucket, sin importar su `status`.

### Políticas de `storage.objects` para `party-photos`

- `anon` **INSERT**: solo si el primer segmento del path matchea el token
  de algún invitado real. No valida cupo (ver comentario en la migración
  sobre por qué eso queda enteramente en `submit_photo`, para evitar una
  condición de carrera entre el chequeo y el insert real del archivo).
- `anon` **SELECT**: solo para objetos con una fila `approved` en `photos`
  y `event_config.photos_revealed_at` no nulo.
- `anon`: sin política de UPDATE ni DELETE — no puede modificar ni borrar
  nada, ni siquiera lo que subió.
- `authenticated`: acceso completo (SELECT/UPDATE/DELETE, y de hecho
  cualquier operación) sobre objetos de `party-photos`, para moderar y
  limpiar.

**Limitación encontrada al probar contra Postgres real** (documentada,
no es una decisión de producto): una policy de RLS sobre `storage.objects`
corre con los privilegios del rol que hace la consulta (`anon`), no como
dueño de la tabla. Como `guests` y `photos` tienen `revoke all ... from
anon` a propósito, un `exists (select 1 from public.guests ...)` puesto
directo dentro de la policy fallaba con `permission denied for table
guests` apenas `anon` intentaba insertar — antes de que la propia RLS de
`guests` entrara siquiera a jugar. La migración resuelve esto con dos
funciones puente `security definer` (`public.token_matches_guest`,
`public.storage_path_is_revealed`), el mismo patrón que ya usan
`submit_rsvp`/`get_guest_by_token`: corren con los privilegios del dueño
de la función, devuelven un booleano y no exponen ninguna tabla nueva a
`anon`. Sigue siendo 100% RLS de Postgres, sin URLs firmadas ni backend
nuevo — es la misma pieza de diseño, solo que expresada a través de una
función en vez de un `exists()` inline para que compile con los `revoke`
existentes.

Otra observación de las mismas pruebas: a diferencia de `guests`/`posts`
(que además de RLS usan `revoke`/`grant` a nivel de tabla para bloquear a
`anon`), `storage.objects` en Supabase real ya viene con privilegios de
tabla amplios para `anon`/`authenticated` de fábrica — el control de acceso
ahí es 100% vía RLS, nunca vía `GRANT`/`REVOKE`. Por eso un `UPDATE`/`DELETE`
de `anon` sin política que lo permita no tira una excepción: sencillamente
afecta 0 filas (RLS lo filtra en silencio). El test
`supabase/tests/photos.test.ts` verifica explícitamente ese comportamiento
(0 filas afectadas, no una excepción) en vez de asumir que iba a tirar
error como en `guests`/`posts`.

Esto se probó completo contra el schema `storage` real: el harness de test
en Docker (`postgres:16-alpine` puro) no trae ese schema de fábrica, así
que `supabase/tests/apply-migrations.ts` agrega `createStorageSchema()`,
un stand-in mínimo pero fiel de `storage.buckets`/`storage.objects`/
`storage.foldername()` (mismo espíritu que `createSupabaseRoles()` para
`anon`/`authenticated`/`service_role`) — scaffolding solo de test, nunca
parte de las migraciones versionadas.

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
