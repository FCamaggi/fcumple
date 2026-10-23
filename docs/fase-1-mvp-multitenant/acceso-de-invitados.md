# Acceso de invitados (Fase 1)

## Cómo funciona

Cada evento tiene **un solo enlace y un solo QR**: `https://…/e/{slug}`. Se manda el mismo mensaje a todos (grupo de WhatsApp, impreso, proyectado); no hay que anotar el teléfono o el correo de nadie ni personalizar nada.

Al abrirlo, la persona elige:

- **Inscribirme** (la primera vez): escribe su **nombre y apellido** y elige un **PIN de 4 a 6 números**, que repite para evitar errores de tipeo.
- **Ya me inscribí** (otro celular, o si el navegador olvidó la sesión): escribe nombre y PIN.

No hay lista previa obligatoria: el organizador ve quién entra a medida que se inscribe. El PIN es solo para volver a entrar; no necesita ser complejo.

> Historia: la Fase 0 enviaba un enlace personal `/i/:token` a cada invitado (incómodo: había que anotar y mandar cada uno). Se evaluó identificar por RUT con un servicio externo y se descartó (ver [`../estrategia/evaluacion-rutificador-nombrerutyfirma.md`](../estrategia/evaluacion-rutificador-nombrerutyfirma.md)). Se decidió la inscripción propia con PIN (D20).

## Qué se guarda de cada invitado

| Dato | Dónde | Quién lo ve |
|---|---|---|
| Nombre y apellido | `guests.full_name` (+ `name_tokens`, versión normalizada para buscar) | El organizador de ese evento |
| PIN | `guest_credentials.pin_hash`, **solo el hash bcrypt** | **Nadie**: la tabla no tiene ningún permiso para `anon` ni `authenticated`; solo las funciones internas la leen |
| Token de sesión | `guests.token`; en el dispositivo, `localStorage` | Solo el dispositivo (y la base) |

**No se pide ni se guarda** RUT, correo ni teléfono. Un test falla si alguna columna del esquema público parece guardar alguno de esos datos o un PIN en claro. El PIN nunca se guarda en el dispositivo: lo único que queda allí es el token y el nombre.

## Flujos y resultados

### `register_guest(slug, nombre, pin, respuestas)` — "Inscribirme"

| Modo del evento | Qué hace |
|---|---|
| `open` (por defecto) | Crea al invitado con ese nombre y PIN y entrega el token. |
| `list` | Solo si el organizador ya lo cargó en su lista; la persona elige su PIN la primera vez. |
| `list_requests` | Igual, y si no está en la lista queda una **solicitud pendiente** (máximo 50) que el organizador aprueba o rechaza. |

El cuarto parámetro es opcional y lleva las respuestas que el organizador configuró (acompañantes, comentario, preguntas propias): ver [`inscripcion-configurable.md`](./inscripcion-configurable.md).

Resultados (`outcome`): `ok`, `pending_approval`, `name_taken` (ya hay alguien inscrito con ese nombre: o es esa persona y debe iniciar sesión, o debe agregar su segundo apellido), `not_found` (modo lista), `ambiguous` (modo lista: varias coinciden).

### `login_guest(slug, nombre, pin)` — "Ya me inscribí"

Resultados: `ok`, `pending_approval` (solo con el PIN correcto), `invalid` (nombre inexistente **o** PIN equivocado: no se distinguen, para no revelar quién está inscrito), `ambiguous`, `locked`, `needs_registration` (el organizador lo cargó pero nunca eligió PIN).

### Nombres

Se comparan sin tildes, mayúsculas ni orden, y sin partículas ("de", "la"…): "perez maria" encuentra a "María José Pérez Soto". Para **iniciar sesión** basta con que lo escrito esté contenido en el nombre inscrito; para **inscribirse en modo abierto** la coincidencia es exacta ("Ana Soto" y "Ana Soto Pérez" son personas distintas). Dos personas no pueden tener las mismas palabras en un evento (índice único): la segunda debe agregar su segundo apellido.

## Seguridad

- **El PIN protege contra la suplantación.** Una vez inscrito, nadie más puede entrar como esa persona sin su PIN. (Sin PIN, bastaba conocer el nombre de otro invitado.) Si alguien se inscribe antes que el dueño real del nombre, el organizador puede **restablecer el acceso** y la persona se inscribe de nuevo.
- **Bloqueo por invitado:** 5 PIN equivocados seguidos bloquean el inicio de sesión de esa persona 10 minutos (4 dígitos = 10 000 combinaciones; a 5 intentos cada 10 minutos, adivinar tomaría semanas). Un acierto reinicia la cuenta. Contrapartida: alguien puede bloquear a otro 10 minutos equivocándose a propósito; el costo es bajo para una fiesta.
- **Freno de intentos por IP y por evento:** 30 fallos por IP y 200 por evento cada 10 minutos (la IP sale de `x-forwarded-for`). Solo cuentan los **fallos**: inscribirse o entrar bien no consume nada, porque decenas de invitados comparten el wifi de la fiesta (hay un test con 80 inscripciones desde la misma IP).
- **Tope de 500 invitados por evento** contra la creación masiva de invitados falsos.
- PIN con hash bcrypt (`pgcrypto`), 4 a 6 dígitos validados en la base.
- Límite honesto: un PIN corto no resiste a un atacante con acceso a la base, pero para eso están el hash, la tabla sin permisos y el bloqueo. No se usa para nada sensible: solo fotos de una fiesta.

## Restablecer acceso (olvidé mi PIN)

En el panel del organizador, **Restablecer acceso** sobre el invitado: cambia su token (cierra su sesión en cualquier dispositivo) y **borra su PIN**; la persona vuelve a "Inscribirme" con el mismo nombre y elige un PIN nuevo. Solo el dueño del evento puede hacerlo.

## Check-in y puerta

- El organizador busca por nombre en la pestaña **Puerta** y marca la llegada con un toque, o usa el **escáner**: el invitado muestra un código QR que contiene solo su token (`check_in_guest`, que **solo ejecuta el dueño del evento**).
- Ajuste por evento `camera_unlock`: `on_identify` (por defecto: la cámara se habilita al entrar) o `on_checkin` (solo después de que el organizador marque la llegada; `submit_photo` lo exige en la base).

## RSVP

Opcional por evento (`rsvp_enabled`, apagado por defecto). Sin RSVP, la inscripción es la confirmación: el aforo cuenta a quienes se inscribieron, con los acompañantes que indicaron.

## Compatibilidad de Supabase

`pgcrypto` (`crypt`, `gen_salt`, `gen_random_bytes`) vive en el esquema `extensions` en Supabase. Todas las funciones con `search_path` fijo lo incluyen (`public, extensions`), y la suite de pruebas replica esa instalación: antes de hacerlo, un `search_path = public` habría hecho fallar `create_event` y cualquier alta de invitado solo en producción.

## Fuera de alcance (Fase 2)

Verificación de identidad con un servicio externo por RUT (descartada por ahora), correo o código por SMS para recuperar el PIN sin el organizador, sesiones por dispositivo con revocación individual, aviso de privacidad y términos completos (Ley 21.719).
