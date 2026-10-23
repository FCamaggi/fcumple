# Inscripción configurable (Fase 1)

El organizador elige qué se le pide al invitado cuando se inscribe con el enlace del evento. Con todo apagado, la inscripción pide solo nombre, apellido y PIN, como antes ([`acceso-de-invitados.md`](./acceso-de-invitados.md)).

## Qué se puede configurar

Pestaña **Inscripción** del panel (`/panel/e/:eventId`). Todo es opcional.

| Opción | Qué hace | Límites |
|---|---|---|
| Texto de bienvenida | Se muestra arriba del formulario de inscripción. | Hasta 400 caracteres. |
| Acompañantes (+1) | El invitado indica cuántos trae y escribe el nombre de cada uno. Es una **solicitud**: el organizador la aprueba desde Invitados y solo los aprobados cuentan en el aforo. | Máximo de 1 a 5; nombre hasta 80 caracteres. |
| Comentario | Una pregunta de texto libre, con su texto editable y obligatoria u opcional. | Pregunta hasta 120 caracteres; respuesta hasta 280. |
| Preguntas propias | De 0 a 3 preguntas de respuesta corta, cada una con su texto y obligatoria u opcional. | Pregunta hasta 80 caracteres; respuesta hasta 140. |

Los largos se cuentan en caracteres Unicode (un emoji cuenta uno), igual en el navegador y en la base. Un texto con solo espacios (incluidos el espacio de no separación y el BOM) cuenta como vacío en los dos lados.

El RSVP ya no se ofrece en Ajustes: no tiene pantalla para el invitado y, si se activaba, el aforo pasaba a contar solo a los «confirmados» (nadie puede confirmar) y quedaba en cero.

En **Ajustes** del panel también se edita la **fecha y hora** del evento (`events.starts_at`, en la hora del dispositivo de quien la escribe; solo se reenvía si se toca) y las **fotos por invitado** (`events.default_photo_quota`, de 0 a 100). El cupo nuevo se aplica a quienes se inscriban desde ese momento, y a los invitados que el organizador cargue a mano; no cambia el de quienes ya están inscritos.

La cuenta del organizador tiene su pantalla en `/panel/cuenta` (enlace «Tu cuenta» en la lista de eventos): cambia la contraseña comprobando la actual y cierra las demás sesiones. Sirve cuando la cuenta se entrega con una contraseña provisoria.

### Datos personales

> **Regla dura del proyecto:** ninguna columna guarda RUT, correo, teléfono ni PIN en claro, y un test lo verifica.

Las respuestas son texto libre dentro de `guest_answers` (un `jsonb`, no una columna con ese nombre), así que la base no puede reconocer un RUT escrito en una respuesta. Lo que sí hace, como red y no como garantía:

- La pregunta del comentario y las preguntas propias **no pueden pedir** RUT, correo, teléfono ni claves: se rechaza una etiqueta que contenga como palabra completa `rut`, `run`, `dni`, `cedula`, `pasaporte`, `correo`, `email`, `mail`, `telefono`, `celular`, `fono`, `whatsapp`, `pin`, `clave`, `contrasena` o `password` (sin tildes y sin distinguir mayúsculas; «Pintura» no es «pin»). La misma regla vive en TypeScript y en SQL (`_enroll_asks_personal_data`) y un test de paridad las compara.
- El formulario del invitado avisa «No escribas aquí RUT, correo, teléfono ni claves».
- Un organizador que quiera disfrazar la pregunta («Doc. de identidad») no queda detenido por un filtro de palabras. Es una limitación conocida: la garantía dura sería quitar las preguntas libres.

## Modelo de datos

Migración `20261023100012_enrollment_config.sql`. La regla de validación **vive en TypeScript** ([`src/lib/enrollmentConfig.ts`](../../src/lib/enrollmentConfig.ts)) y la migración la replica en SQL; un test de la suite de base de datos ([`supabase/tests/enrollment.test.ts`](../../supabase/tests/enrollment.test.ts)) compara ambas con la misma tabla de casos, así que no pueden desalinearse.

- `events.enrollment_config jsonb` (por defecto `{}`), validada por `valid_enrollment_config` en una restricción `CHECK`. La presencia de una clave activa la opción:

  ```json
  {
    "welcome": "Texto de bienvenida",
    "plus_ones": { "max": 1 },
    "comment": { "label": "¿Alguna alergia?", "required": false },
    "questions": [{ "id": "q1", "label": "¿De qué te disfrazas?", "required": true }]
  }
  ```

  Las claves son cerradas: cualquier otra se rechaza. Los ids de las preguntas son `q1`, `q2` y `q3`. Al quitar una pregunta, las demás **conservan su id**, y el panel **no reutiliza** el id de una pregunta que ya tiene respuestas de invitados: así una respuesta vieja nunca aparece como respuesta a una pregunta nueva.
- `events.default_photo_quota int` (por defecto 5, de 0 a 100): fotos de cada invitado nuevo (`register_guest`) y de los que carga el organizador a mano.
- `guests.guest_answers jsonb` (por defecto `{}`, forma cerrada y de hasta 8 000 bytes) y `guests.plus_ones_requested int` (0 a 5). Los acompañantes son una **solicitud** (`plus_ones_requested`): la inscripción no toca `plus_ones_allowed` ni `plus_ones_confirmed`, que son los que leen el aforo y la puerta. Cuando el organizador aprueba (botón «Aprobar +N» en Invitados), el panel sube `plus_ones_allowed` (sin bajar un cupo mayor que ya tuviera) y confirma `plus_ones_confirmed`; «No aprobar» deja la solicitud en 0 (los nombres siguen en `guest_answers`).
- El organizador guarda la configuración con un `update` directo sobre `events` (la política `owner_all` ya se lo permite); la restricción `CHECK` es la que manda. No hay un RPC aparte.

```json
{ "plus_ones": ["Luis Pérez"], "comment": "Vegana", "q1": "Regina George" }
```

## `register_guest(slug, nombre, pin, p_answers)`

El cuarto parámetro es opcional: los llamados de tres argumentos siguen funcionando. Las respuestas se validan contra la configuración del evento y se normalizan (se recortan los espacios y lo vacío cuenta como «sin respuesta»).

Una respuesta inválida lanza el error `22023` con el mensaje `enrollment_invalid:<código>[:<campo>]` y **no** crea al invitado ni cuenta como intento fallido:

| Código | Cuándo |
|---|---|
| `answers`, `unknown_key` | Las respuestas no son un objeto o traen una clave que no existe. |
| `plus_ones_invalid`, `plus_ones_disabled`, `plus_ones_too_many`, `plus_one_name` | Los acompañantes no son una lista, no están activados, son más que el máximo o falta un nombre. |
| `comment_invalid`, `comment_disabled`, `comment_required`, `comment_too_long` | Problemas con el comentario. |
| `question_invalid:qN`, `question_unknown:qN`, `question_required:qN`, `question_too_long:qN` | Problemas con una pregunta propia. |

Las respuestas se guardan en los cuatro caminos de alta (abierto nuevo, abierto reclamado, invitado de la lista y solicitud pendiente).

`get_event_public` entrega además `enrollment_config`. `get_public_headcount` cuenta, cuando el evento **no** usa RSVP, a quienes ya se inscribieron (`claimed_at`) y no declinaron, con sus acompañantes **aprobados** (antes solo contaba `status = 'confirmed'`, que en la Fase 1 nadie puede fijar, y la línea de aforo nunca se mostraba); con RSVP activado sigue contando solo a los confirmados.

## Vista del invitado

`/e/:slug` (componente [`IdentifyForm`](../../src/components/IdentifyForm.tsx)): el nombre del evento es el título, con la fecha, el lugar y la bienvenida. Pide solo lo configurado; las mismas reglas del servidor se validan antes de enviar, con el error junto a cada campo, un único anuncio para lectores de pantalla y el foco en el primer campo inválido. Al iniciar sesión no se piden respuestas. Una solicitud pendiente (`list_requests`) se muestra como aviso de estado, no como error. Si el organizador cambia el formulario mientras el invitado lo llena y la base rechaza una respuesta a un campo que ya no existe, el mensaje sale en el aviso general.

## Respuestas en el panel y CSV

La pestaña **Invitados** marca «Solicita +N» (en rosa) junto a quien pidió acompañantes y tiene los botones «Aprobar +N» y «No aprobar»; ya aprobados se ven como `+N`. Además hay un desplegable «Ver respuestas» con los nombres, el comentario y las respuestas, usando las preguntas del organizador (también en las solicitudes pendientes, para decidir con ellas; la respuesta a una pregunta que ya se quitó no se esconde).

**Exportar CSV** (`enrollmentToCsv` en `src/lib/csv.ts`) tiene las columnas «Acompañantes solicitados» y «Acompañantes aprobados», una columna por cada pregunta configurada, y una columna extra solo si algún invitado respondió una pregunta que ya se quitó. **No incluye el token** del invitado (es su credencial de sesión) y neutraliza con una comilla simple las celdas que empiezan con `=`, `+`, `-`, `@`, tabulación o retorno, para que el texto escrito por un invitado no se evalúe como fórmula al abrirlo en Excel o Sheets. Lleva el BOM de UTF-8 para que Excel lea bien las tildes. (El exportador de la Fase 0, `guestsToCsv`, sí lleva `token` y `phone`, porque sirve para reimportar; neutraliza el nombre y la nota, no esas dos columnas.)

## Vista previa del enlace por evento

La web es una SPA estática, así que todas las rutas devuelven el mismo `index.html`. Para que el enlace de un evento se vea con su nombre, fecha y lugar en WhatsApp, Telegram o iMessage:

- [`api/event-meta.ts`](../../api/event-meta.ts) es una función de Vercel que lee `get_event_public` por REST (con la clave anon) y devuelve `index.html` con el `<title>` y las etiquetas `og:*` del evento. Es **autocontenida** (no importa nada de `src`) y **nunca lanza**: ante cualquier fallo (evento inexistente, Supabase caído, `index.html` ilegible) responde con la vista previa neutra.
- [`vercel.json`](../../vercel.json) manda a esa función **solo** las peticiones de rastreadores conocidos, por user-agent (WhatsApp, Facebook/iMessage, Twitter, Telegram, Slack, Discord, LinkedIn, Google, Bing, Apple, Skype, Signal). Los invitados siguen por el camino estático de siempre: si la función fallara, el enlace de inscripción no se ve afectado.
- `index.html` lleva ahora una vista previa **neutra**, sin imagen (la anterior era la de un cumpleaños de la Fase 0).
- **Imagen propia por evento:** si existe `public/og/<slug>.jpg` (1200×630, JPG, idealmente menos de 300 kB), la función la agrega a la vista previa con tarjeta grande. Se comprueba con un `HEAD` y exige `content-type` de imagen: Vercel responde 200 con `index.html` a cualquier ruta que no existe, así que `ok` no basta. Sin el archivo, la vista previa queda sin imagen. El archivo queda en el repositorio, que es público: que sea solo el arte de la fiesta.
- El origen (`og:url` y el host de donde se lee `index.html`) **no se toma de las cabeceras de la petición**: solo se acepta un host que Vercel declara del proyecto (`VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`); si no, se usa el canónico. Los reemplazos sobre `index.html` son funciones (con una cadena, un nombre de evento como «Fiesta $'» se expandiría con el resto del documento).
- La función lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (o `SUPABASE_URL` y `SUPABASE_ANON_KEY`) del entorno de Vercel. Las dos primeras ya existen porque el build las usa.
- La respuesta se cachea 60 segundos en el borde (`s-maxage=60`, con `Vary: User-Agent`); los rastreadores además guardan su propia copia, así que un cambio de nombre tarda en verse. Lleva `noindex, nofollow`.
- La fecha se escribe en la hora de Chile (`America/Santiago`): el servidor no conoce la zona del invitado.
- La vista previa muestra fecha y lugar a quien reciba el enlace. Es el mismo conjunto que ya entrega `get_event_public` a cualquiera que conozca el slug, pero ahora queda visible en el chat y en la copia del rastreador.
- Un cliente puede falsear el user-agent y pedir slugs distintos para saltarse la caché; cada petición cuesta una invocación y dos `fetch`. Si hiciera falta, se limita con una regla del WAF de Vercel.

Cómo probarla en un despliegue de vista previa de Vercel (rama distinta de `main`):

```bash
curl -s -A "WhatsApp/2.23" https://<despliegue>.vercel.app/e/<slug> | grep -E "<title>|og:"
```

## Orden de despliegue

1. **Migración** `20261023100012`. `deploy.yml` ejecuta `supabase db push` **antes** de publicar la web (`deploy-web` depende de `migrate-db`), así que al llegar a `main` la aplica sola. Si se prefiere controlarla, se aplica antes a mano en el SQL Editor y se registra en `supabase_migrations.schema_migrations`; el `db push` posterior es un no-op.
2. **Merge a `main`.**
3. **Vercel** publica la web.

La app nueva tolera una base sin la migración en lo que lee (la configuración llega vacía y no se piden respuestas), pero el panel mostraría mal el cupo de fotos. Con la migración aplicada y la web vieja, los llamados de tres argumentos a `register_guest` siguen funcionando.

La migración no es idempotente (`add column`, `add constraint` y `drop function` sin `if exists`): se aplica una vez, y por eso se registra en el historial. Es transaccional.

## No verificado

- La función `api/event-meta.ts` y la regla `has` de `vercel.json` se probaron con tests unitarios, no en el runtime de Vercel. Hay que probarlas en un despliegue de vista previa antes de confiar en ellas.
- El formulario se miró en Chromium y en WebKit (Playwright) con tamaño de teléfono, no en un iPhone ni en Safari reales.
- Una carrera que ya existía: dos reclamos simultáneos del mismo invitado sin PIN pasan los dos la comprobación y el último PIN gana. No la introduce esta función; se arreglaría con un `select … for update` sobre el invitado.
