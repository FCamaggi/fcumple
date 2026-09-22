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
| `20260912100009_rpc_get_public_headcount.sql` | Función pública de conteo total de confirmados, sin token, para la página `/evento`. |
| `20260913090000_dev_guest_support.sql` | Columna `is_dev` en `guests`, invitado DEV fijo (`token = 'dev-preview'`), exclusión de `is_dev` en `get_public_headcount()`, RPC `dev_reset_guest()`. |
| `20260913100000_posts_images.sql` | Columnas `subtitle` y `cover_image_path` en `posts`, tabla `post_images` (galería) + RLS. |
| `20260913100001_storage_post_images.sql` | Bucket `post-images` + políticas RLS de `storage.objects`. |
| `20260914100000_rpc_list_revealed_photos_created_at.sql` | Suma `created_at` al retorno de `list_revealed_photos()`. |
| `20260922100000_guests_auto_approve_photos.sql` | Columna `auto_approve_photos` en `guests`, `submit_photo` inserta con `status` según esa columna. |
| `20260922100001_photos_display_storage_path.sql` | Columna `display_storage_path` en `photos`, `submit_photo` acepta un 3er parámetro opcional, `list_revealed_photos` y `storage_path_is_revealed` lo exponen/reconocen. |

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

### `get_public_headcount()`

Devuelve un único entero, sin parámetros y sin token — pensada para la
página pública `/evento` (sin login), que muestra algo como "38 en la
lista" pero nunca un nombre ni ningún otro dato personal:

```ts
number // total de invitados confirmados, sumando sus +1 confirmados
```

Cuenta cada invitado con `status = 'confirmed'` como 1 (él mismo) más su
`plus_ones_confirmed` (mismo cálculo que `realHeadcount` en
`src/pages/AdminPage.tsx`). Invitados `pending` o `declined` no suman nada.
No expone ninguna columna de `guests` — ni id, ni nombre, ni token —, solo
el número total. También es `security definer` con `search_path` fijado a
`public` y `grant execute` para `anon` y `authenticated`.

### Invitado DEV (`is_dev`, token fijo `dev-preview`)

Para poder navegar `/i/dev-preview` y probar todo el flujo de invitado
(RSVP, cupo de fotos, check-in, pantallas de error) sin los límites
normales, y sin contaminar los números reales del evento, la migración
`20260913090000_dev_guest_support.sql` agrega:

- Columna `guests.is_dev boolean not null default false`.
- Un invitado fijo con `token = 'dev-preview'`, `full_name = 'DEV Preview'`,
  `plus_ones_allowed = 10`, `photo_quota = 999`, `is_dev = true`, insertado
  de forma idempotente (`on conflict (token) do update set is_dev = true`,
  para no pisar otros campos si el usuario los editó a mano después del
  seed inicial).
- `get_public_headcount()` ahora excluye explícitamente `is_dev = true` de
  la suma — el invitado DEV puede quedar `confirmed` con `plus_ones`
  durante una sesión de pruebas sin que eso mueva el número público de
  `/evento` ni los tallies del admin.

### `dev_reset_guest(p_token text)`

Devuelve 0 o 1 fila, misma forma que `check_in_guest`:

```ts
{
  id: string;
  full_name: string;
  status: 'pending' | 'confirmed' | 'declined';
  plus_ones_allowed: number;
  plus_ones_confirmed: number;
  guest_note: string | null;
  responded_at: string | null;
  checked_in_at: string | null;
}
```

- Solo actúa (borra las fotos del invitado y resetea
  `status = 'pending'`, `plus_ones_confirmed = 0`, `guest_note = null`,
  `responded_at = null`, `checked_in_at = null`) si `p_token` matchea un
  invitado con `is_dev = true`. Sobre cualquier otro token —inexistente o
  de un invitado real— no hace ningún cambio, aunque sí devuelve la fila
  (mismo criterio de "no distinguir token inválido" que `get_guest_by_token`).
- Es seguro exponerla a `anon`: el `where is_dev = true` interno es la
  única puerta de escritura. Un invitado real nunca tiene `is_dev = true`
  (nada más en el sistema lo setea), así que aunque alguien adivine el
  nombre de la función y el token de un invitado real, el `update`/`delete`
  internos afectan 0 filas. Solo puede tocar al invitado DEV semilla de
  esta misma migración.
- `security definer` con `search_path` fijado a `public`, `grant execute`
  para `anon` y `authenticated`, mismo patrón que el resto de las RPC
  públicas.

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

### `submit_photo(p_token text, p_storage_path text, p_display_storage_path text default null)`

Devuelve la fila insertada:

```ts
{
  id: string;                          // uuid
  guest_id: string;                    // uuid
  storage_path: string;
  display_storage_path: string | null; // null si no se pasó p_display_storage_path
  status: 'approved' | 'pending';      // según guests.auto_approve_photos del invitado
  created_at: string;                  // timestamptz ISO
}
```

- Tira excepción si `p_token` no matchea ningún invitado (`errcode P0002`).
- Tira excepción si `p_storage_path` no empieza exactamente con `{token}/`
  (`errcode 22023`) — evita que alguien registre metadata apuntando al
  archivo de otro invitado.
- Si se pasa `p_display_storage_path` (no null), se valida con el mismo
  chequeo de prefijo `{token}/` (mismo `errcode 22023`). Si es `null` (el
  default), se salta la validación por completo — pensado para fotos sin
  versión de display, o subidas desde un frontend viejo que todavía no
  manda este parámetro.
- Tira excepción si el invitado ya alcanzó `photo_quota` (`errcode 22023`).
  Cuenta **todas** las fotos del invitado sin importar `status` (pending +
  approved + rejected), para que reintentar después de un rechazo no evada
  el cupo. El cálculo del cupo es independiente de `auto_approve_photos` —
  una foto auto-aprobada cuenta contra el cupo exactamente igual que una
  pendiente.
- El `status` de la fila insertada ya no es siempre `'pending'`: es
  `'approved'` si `guests.auto_approve_photos` del invitado es `true` (el
  default de esa columna), o `'pending'` si es `false` — ver sección
  "Auto-aprobación de fotos por invitado" más abajo. Cualquiera sea el
  resultado, sigue siendo la misma fila de `photos`, así que el resto del
  contrato (cupo, moderación de `pending`/`rejected` vía `moderatePhoto`,
  etc.) no cambia.
- Esta función solo registra la metadata; no valida ni escribe el archivo
  en Storage — eso ya tiene que haber pasado (la policy de `storage.objects`
  para `anon` INSERT es la que valida que el path pertenezca a un invitado
  real, ver más abajo). Lo mismo aplica al archivo de
  `display_storage_path`: es un segundo objeto en el mismo bucket, bajo el
  mismo `{token}/...`, cubierto por la misma policy de INSERT (no hace
  falta una policy nueva, ver más abajo).

### Auto-aprobación de fotos por invitado (`guests.auto_approve_photos`)

Columna nueva en `guests`, `boolean not null default true`. Por default,
las fotos de cualquier invitado se auto-aprueban al subirlas (`submit_photo`
inserta con `status = 'approved'` directamente) y nunca pasan por la cola de
moderación. El admin puede marcar puntualmente a un invitado en particular
(alguien de quien no se fía para postear algo apropiado) con
`auto_approve_photos = false`, y de ahí en adelante sus fotos vuelven a caer
en `status = 'pending'` y necesitan `moderatePhoto` como antes. El default
es "auto-aprobado" a propósito — el admin marca las excepciones, nunca al
revés.

No hace falta ninguna policy de RLS nueva para editar esta columna: `guests`
ya le da a `authenticated` UPDATE completo vía la policy
`authenticated_full_access` (`for all ... using (true) with check (true)`,
más el `grant ... update ... to authenticated` de
`20260911120004_create_guests.sql`) — es simplemente una columna más en una
tabla que el admin ya puede escribir sin restricción.

### `get_photo_quota(p_token text)`

Devuelve 0 o 1 fila:

```ts
{
  quota: number; // guests.photo_quota del invitado
  used: number;  // count(*) de public.photos de ese guest_id, cualquier status
}
```

Un token inexistente devuelve 0 filas, mismo criterio que `get_guest_by_token`.

### `list_revealed_photos()`

Sin parámetros, sin token — cualquiera puede llamarla, incluso sin sesión.
Devuelve una fila por cada foto `approved` una vez que el rollo está
revelado (0 filas si `event_config.photos_revealed_at` sigue en `null`,
sin importar cuántas fotos estén `approved`):

```ts
{
  storage_path: string;
  display_storage_path: string | null; // null si esa foto no tiene versión de display
  created_at: string;                  // timestamptz ISO
}[]
```

Nunca expone `guest_id` ni `status` — solo lo necesario para construir la
URL firmada de cada imagen (la de display para el grid/lightbox, la
original para la descarga) y agrupar por hora en la cartelera. Igual que
`get_guest_by_token`/`submit_photo`, es `security definer` con
`search_path` fijado a `public` y `grant execute` para `anon` y
`authenticated`.

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
  y `event_config.photos_revealed_at` no nulo. Desde
  `20260922100001_photos_display_storage_path.sql`, esto vale tanto para
  `storage_path` como para `display_storage_path` de esa fila — son dos
  objetos distintos del mismo bucket para la misma foto, y ambos quedan
  legibles (o ambos bloqueados) bajo exactamente las mismas condiciones.
  `public.storage_path_is_revealed(p_path)` chequea
  `(p.storage_path = p_path or p.display_storage_path = p_path)` en vez de
  comparar solo contra `storage_path`. No hizo falta ninguna policy nueva
  de INSERT para el segundo archivo: la policy `guest_insert_own_folder`
  ya permite cualquier nombre de archivo bajo `{token}/...`, sin importar
  cuántos objetos suba el invitado por foto.
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

## Posts con imagen/galería (`posts.subtitle`/`cover_image_path` + `post_images` + Storage)

Extiende `posts` (avisos) para que el admin pueda darles subtítulo, una
imagen destacada y una galería opcional. Mismo modelo de acceso que el
resto de `posts` — lectura directa para `anon`/`authenticated` de avisos
publicados, sin RPC de por medio.

### Columnas nuevas en `posts`

- `subtitle text` (nullable): subtítulo opcional del aviso.
- `cover_image_path text` (nullable): path en el bucket `post-images` de
  la imagen destacada, o `null` si el aviso no tiene una. Un aviso puede no
  tener ni subtítulo ni imagen — ambas columnas son opcionales a propósito.

Se leen con el mismo `select * from public.posts` que ya usa el frontend
(están cubiertas por la policy `public_read_published` existente, no hizo
falta una policy nueva en `posts`).

### `post_images`

Galería de fotos adicionales por aviso, ordenadas por `position`:

```ts
{
  id: string;          // uuid
  post_id: string;     // uuid, references posts(id) on delete cascade
  storage_path: string;
  position: number;
  created_at: string;  // timestamptz ISO
}
```

- `anon`/`authenticated` (lector no-admin) solo ven filas cuyo `post_id`
  apunta a un aviso publicado (`published_at is not null and published_at
  <= now()`) — un borrador nunca expone sus imágenes, mismo criterio que
  `posts.public_read_published` pero alcanzado vía `exists(...)` porque el
  flag vive en la fila padre, no en `post_images` misma.
- `authenticated` (admin) tiene CRUD completo sin restricción, para armar
  y reordenar la galería de un borrador antes de publicarlo.
- Borrar el `post` borra en cascada sus `post_images` (`on delete cascade`).

### Bucket `post-images` y sus políticas de `storage.objects`

- Bucket `post-images`, privado (`public = false`), creado por
  `20260913100001_storage_post_images.sql`.
- A diferencia de `party-photos` (el invitado sube, el admin modera con
  cupo), acá solo el admin escribe: **`anon` no tiene ninguna policy de
  INSERT/UPDATE/DELETE** en este bucket — todo el flujo de subida vive en
  `PostsPanel`, autenticado.
- `anon` **SELECT**: solo si el `name` (path del objeto) corresponde a una
  fila de `post_images` o al `cover_image_path` de algún post ya
  publicado. Se resuelve con una única función puente `security definer`,
  `public.post_image_path_is_public(p_path text)` — mismo motivo que
  `storage_path_is_revealed` en la migración de `party-photos`: una policy
  de `storage.objects` corre con los privilegios del rol que consulta
  (`anon`), no como dueño de la tabla, y `posts`/`post_images` no le dan a
  `anon` más que `SELECT` — así que un `exists(...)` inline directo sobre
  esas tablas fallaría o, peor, requeriría abrir grants adicionales. La
  función evalúa ambos casos (galería o portada) con un solo `OR`.
- `authenticated`: acceso completo sobre objetos de `post-images`, para
  subir, reemplazar y borrar tanto la portada como la galería,
  independientemente de si el post está publicado o sigue en borrador.

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
