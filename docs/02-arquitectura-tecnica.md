# Invitación de Cumpleaños Web — Arquitectura Técnica

## 1. Principios de arquitectura

- Free tier real, sin sorpresas de facturación.
- El invitado nunca hace login. Su identidad es el token en la URL.
- El admin sí necesita algo de protección, aunque sea mínima.
- Preferir simplicidad operativa sobre "impresionar con el stack". Es un proyecto que tenés que poder abandonar dos semanas y que siga funcionando solo.
- Diseñar para el peor momento real: el rato en que mandás 40 links por WhatsApp y varios los abren casi en simultáneo.
- Diseñar para crecer sin reescribir: v1 es invitación + RSVP + admin básico, pero la app está pensada como un hub que en v2 suma blog/noticias, más vistas de admin y galería de fotos (ver `01-vision-y-requisitos.md` sección 8). Las decisiones de v1 no deben cerrar esa puerta — ver sección 8 de este documento.

## 2. El problema del "despertar la API"

Mencionaste que al abrir el link se debería hacer un request altiro para "despertar" la API, dado que estamos en free tier. Es una preocupación válida, pero el mecanismo correcto depende de qué proveedor elijas, porque no todos los free tiers duermen de la misma forma:

| Proveedor | Qué pasa en free tier | Ping al abrir la página, ¿sirve? |
|---|---|---|
| Render (backend propio) | El servicio se duerme a los 15 min sin tráfico, cold start de 30 a 60 segundos en el próximo request | Sí, y es prácticamente obligatorio si vas por acá |
| Supabase | El proyecto entero se pausa después de 7 días *sin ninguna actividad*, hay que reactivarlo a mano desde el dashboard | No aplica igual, el riesgo es distinto (pausa semanal, no por visita) |
| Vercel (frontend, funciones serverless) | Las funciones serverless no "duermen" en el mismo sentido, tienen cold start de funciones (mucho más corto, cientos de ms) pero no un sleep de servidor completo | No es necesario |

Conclusión: si tu backend real vive en algo tipo Render/Railway (un server que duerme), el ping al cargar la página es una buena idea y lo documento como parte de la Opción B abajo. Si vas con una base de datos como Supabase que expone su propia API (Opción A), el problema es otro: hay que asegurarse de que el proyecto reciba actividad al menos una vez por semana para que no se pause, lo cual se resuelve con un cron externo, no con un ping al abrir la página del invitado.

## 3. Opciones de stack evaluadas

### Opción A — Sin backend propio (recomendada)

- **Frontend**: Next.js o Vite + React, desplegado en Vercel (free).
- **Backend + base de datos**: Supabase (Postgres free, con API REST y Realtime autogenerados, más Auth).
- **Sin servidor propio que mantener.** El cliente le habla directo a Supabase con Row Level Security (RLS) controlando qué puede ver y editar cada quien.

**Por qué la recomiendo:** elimina el problema del cold start de raíz en vez de parchearlo. La API de Supabase responde rápido siempre (no es un server que se duerme por inactividad de minutos), así que no hay riesgo de que el primer invitado que abre el link se encuentre con una carga de 40 segundos. El único cuidado real es que el proyecto no quede una semana entera sin ningún request (fácil de resolver, ver sección 6).

**Trade-off:** tenés que aprender/usar RLS de Postgres para la seguridad (nivel de fila), en vez de escribir tu propia lógica de autorización en un backend Express. Si ya conocés SQL, es más rápido de lo que parece.

### Opción B — Backend propio (la que tenías en mente con el ping)

- **Frontend**: Vercel o Netlify (static).
- **Backend**: Node.js + Express en Render free (o Railway).
- **Base de datos**: Neon (Postgres free, no expira) en vez del Postgres de Render (que expira a los 90 días).

**Mecánica del "wake up ping":**
1. El invitado abre `/i/{token}`.
2. Apenas carga el HTML, el frontend dispara en paralelo un `fetch` a `/api/health` sin esperar la respuesta (fire and forget), mientras muestra un loader.
3. En simultáneo, pide los datos reales del invitado. Si el server estaba dormido, esa segunda llamada es la que va a tardar los 30 a 60 segundos.
4. Mostrar un loader que explique la demora ("cargando tu invitación...") para que no parezca que la página está rota.

**Mitigación adicional:** un cron externo gratuito (por ejemplo cron-job.org) que le pegue a `/api/health` cada 10 minutos, pero solo durante la ventana de días en que estás activamente mandando invitaciones y esperando respuestas, no todo el año (evita gastar cuota gratis del cron para nada).

**Cuándo elegir esta opción en vez de la A:** si el objetivo secundario de "mostrar que sos developer" pesa más para vos, y querés portfolio con un backend propio en Express que puedas mostrar en una entrevista. Es una decisión válida, solo que trae el problema del cold start que vos mismo detectaste, y hay que manejarlo activamente.

### Opción C — Sin código de backend (fallback robusto)

- Google Sheets como base de datos, vía Google Apps Script como endpoint.
- Frontend estático consumiendo ese endpoint.
- El "panel de admin" es directamente la hoja de cálculo (ya tenés ahí todo: filtros, edición, exportar).

Prácticamente cero mantenimiento y sin riesgo de pausas ni cold starts, pero se aleja del objetivo de que la app sea una demostración de tu trabajo como developer, y el panel de admin queda menos pulido que una UI hecha a medida. La dejo documentada como red de seguridad si en algún momento el tiempo apremia y necesitás algo funcionando ya.

### Comparación rápida

| Criterio | A: Supabase + Vercel | B: Render + Express | C: Google Sheets |
|---|---|---|---|
| Evita cold start de raíz | Sí | No, hay que parchear | Sí |
| Riesgo de perder datos por expiración de DB free | Bajo (hay que evitar 7 días sin actividad) | Medio (si usás Postgres de Render, expira a 90 días; se resuelve usando Neon) | Ninguno |
| Muestra habilidad de backend/DB propio | Media (RLS y modelado de datos) | Alta (server propio) | Baja |
| Esfuerzo de mantenimiento | Bajo | Medio | Muy bajo |
| Panel de admin a medida | Sí | Sí | No (es la hoja directamente) |

**Recomendación final: Opción A**, dejando B documentada por si preferís el camino con backend propio a sabiendas del trade-off. Esta recomendación no cambia al considerar el crecimiento a hub (sección 8): agregar Storage y tablas nuevas es incremental sobre Supabase, no un motivo para migrar de stack.

## 4. Modelo de datos

### Tabla `guests` (invitados)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Nombre del invitado |
| `token` | text, unique | Identificador aleatorio no adivinable (ej: nanoid de 12 caracteres), es lo que va en la URL |
| `status` | enum | `pending` / `confirmed` / `declined` |
| `plus_ones_allowed` | int | Cupo máximo de acompañantes que el admin le asigna |
| `plus_ones_confirmed` | int | Cuántos acompañantes confirmó el invitado, dentro del máximo |
| `guest_note` | text, nullable | Nota o comentario que deja el invitado, visible para el admin |
| `admin_note` | text, nullable | Nota privada del admin, el invitado nunca la ve |
| `responded_at` | timestamp, nullable | Cuándo respondió por última vez |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### Tabla `event_config` (una sola fila)

| Campo | Tipo | Notas |
|---|---|---|
| `event_name` | text | |
| `event_date` | timestamp | |
| `location` | text | |
| `theme` | text | |
| `rsvp_deadline` | timestamp, nullable | |

## 5. Seguridad y control de acceso

- El `token` de cada invitado debe generarse con una librería de IDs aleatorios (nanoid o similar), nunca un ID secuencial. Un ID secuencial permitiría a un invitado adivinar el link de otro cambiando un número.
- Con Supabase (Opción A): usar Row Level Security para que un cliente que se identifica con un token solo pueda leer y actualizar la fila que le corresponde, y solo ciertos campos (no puede tocar `admin_note`, por ejemplo). Esto se implementa mejor con una función RPC de Postgres que valida el token y aplica el update, en vez de exponer la tabla completa a updates directos.
- El panel de admin, dado que hay un único usuario, no necesita un sistema de auth complejo. Alcanza con: Supabase Auth con tu único email, o una contraseña simple validada contra una variable de entorno con una cookie firmada protegiendo las rutas `/admin/*`.

## 6. Evitar que el proyecto se pause (Opción A)

Como el free tier de Supabase pausa el proyecto tras 7 días sin actividad de base de datos, conviene:

- Un cron gratuito (GitHub Actions programado, o cron-job.org) que haga una consulta trivial a la base cada pocos días.
- Alternativa más simple: mientras estés desarrollando activamente, esto no es un problema (vas a estar generando actividad todo el tiempo). Solo se vuelve relevante si dejás el proyecto quieto por más de una semana antes de mandar las invitaciones. Vale la pena programarlo igual, es barato y evita sorpresas justo antes del evento.

## 7. Flujo de la página del invitado (Opción A)

1. Invitado abre `/i/{token}`.
2. El frontend hace un único fetch a Supabase pidiendo la fila que matchea ese token (vía la función RPC segura).
3. Se renderiza la invitación con su nombre y los datos del evento.
4. Si ya había respondido antes, el formulario se precarga con su respuesta.
5. Al enviar el formulario, se llama a otra función RPC que actualiza solo su fila.
6. Pantalla de confirmación.

No hace falta ningún "ping de despertar" en este flujo porque no hay servidor que dormir, el paso 2 ya es la respuesta real, sin un request previo de calentamiento.

## 8. Extensibilidad para el hub (v2): blog, galería, admin extendido

> **Actualización**: avisos, galería (con revelado post-evento y moderación) y un check-in QR nuevo pasaron de "dirección de producto para v2" a construirse ya — ver `docs/BACKLOG.md` para el plan por etapas y `DESEO-DISENO-USUARIO.md` sección 9 para las decisiones de producto que lo definen. Las notas de modelado de esta sección siguen siendo válidas como punto de partida.


La decisión de arquitectura de v1 (Opción A: Supabase + Vercel) ya soporta este crecimiento sin cambio de stack — agregar secciones es agregar tablas y rutas nuevas, no reescribir lo que existe. Esto se documenta ahora para que las decisiones de modelado de v1 no cierren esa puerta (RNF7 en `01-vision-y-requisitos.md`).

### 8.1 Principio de estructura

- La app deja de pensarse como "una página de invitación + un panel admin sueltos" y pasa a pensarse como un **hub con layout común y secciones**: una navegación persistente (aunque sea mínima en v1) desde la que hoy se llega a invitación/RSVP, y en v2 también a blog y galería. El panel de admin, análogamente, pasa de una sola vista de estadísticas a un layout de secciones dentro de `/admin` a medida que se agregan más vistas.
- Las tablas nuevas de v2 no tocan `guests` ni `event_config`: se agregan como tablas independientes (`posts`, `photos`), relacionadas por foreign key cuando corresponde (ej. `photos.guest_id`), sin modificar el esquema existente ni sus políticas de RLS.

### 8.2 Blog/noticias — notas de modelo de datos

- Tabla `posts`: `id`, `title`, `body` (markdown o texto enriquecido), `published_at`, `created_at`.
- Lectura pública sin necesidad de token: es contenido general del evento, no personalizado por invitado, a diferencia de `guests`.
- Solo el admin escribe/publica, protegido igual que el resto de `/admin/*` (sección 5).

### 8.3 Galería/momentos con cupo de fotos — notas y riesgos abiertos

Es la sección con más decisiones técnicas pendientes. Se documentan como preguntas abiertas para cuando se planifique en detalle, no como spec cerrada:

- **Almacenamiento**: Supabase Storage (bucket) es la opción natural manteniendo la Opción A — evita sumar un proveedor nuevo solo para esto.
- **Cupo por invitado**: un campo `photo_quota` en `guests` (ej. default 10) y un conteo de fotos subidas por `guest_id`, validados en la misma función RPC de subida, con la misma lógica que ya valida el máximo de +1.
- **Aislamiento y permisos**: la subida se valida contra el token del invitado, igual que el RSVP — RLS + RPC, nunca exponer el bucket a escritura directa sin control.
- **Preguntas abiertas para la planificación de v2** (no se responden en este documento, se listan para no perderlas):
  - ¿Las fotos se ven en vivo por todos, o se "revelan" recién después del evento (efecto cámara descartable real)?
  - ¿Hay moderación del admin antes de publicar una foto?
  - ¿Qué pasa con el peso/costo de almacenamiento en el free tier de Supabase si son muchas fotos en alta resolución? (probablemente haga falta comprimir/redimensionar en el cliente antes de subir).

### 8.4 Vistas de admin extendidas

- Al ser contenido de uso exclusivo del admin (logística, presupuesto, etc., a definir al planificar v2), no requieren RLS complejo nuevo: viven detrás de la misma protección de `/admin/*` ya definida en la sección 5, como secciones adicionales del mismo panel.

Esto no cambia la recomendación de la sección 3 (Opción A) ni el plan de v1 en `03-plan-desarrollo.md`; se documenta para que el modelado de datos de la Fase 1 y el diseño de la Fase 4 dejen espacio a este crecimiento sin decisiones que haya que revertir después.
