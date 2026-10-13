# Acceso de invitados (Fase 1)

## Qué cambia respecto a la Fase 0

En la Fase 0 cada invitado tenía **su propio enlace** `/i/:token`, que el organizador debía mandar uno por uno (`SendInviteButton`, `wa.me` con el teléfono de cada uno). No escala y es incómodo.

En la Fase 1 hay **un solo enlace y un solo QR por evento**: `https://…/e/{slug}`. Se manda el mismo mensaje a todos (grupo de WhatsApp, impreso, proyectado). Cada invitado se identifica al entrar, con su **RUT**.

> La Fase 0 solo tuvo un evento y ya pasó, así que **no se conserva compatibilidad con los enlaces `/i/:token` antiguos** y no hay migración de datos (ver [`arquitectura-multitenant.md`](./arquitectura-multitenant.md)).

## Flujo

1. El organizador crea el evento. La app le entrega el enlace y un QR descargable/imprimible. El `slug` lleva un sufijo aleatorio (`cumple-fabri-k3x9`) para que no sea adivinable.
2. El invitado abre el enlace y ve "¿Quién eres?": escribe su RUT (con formato automático y validación del dígito verificador en el cliente).
3. El cliente llama a la RPC `identify_guest(p_slug, p_rut)`.
4. Si hay coincidencia, la RPC devuelve el **token del invitado**, que el cliente guarda en `localStorage`. A partir de ahí el resto de las RPC siguen funcionando igual que en la Fase 0 (`p_token`), solo que el token ya no lo manda el organizador: lo entrega `identify_guest`.
5. Si el navegador pierde el almacenamiento (Safari limpia datos de sitios sin uso), el invitado vuelve a ingresar su RUT y recupera su sesión. No hay nada que recordar.

## Modos de acceso (por evento)

El organizador elige uno en los ajustes del evento (`events.settings.access.mode`):

| Modo | Cómo funciona | Para qué sirve |
|---|---|---|
| **Lista cerrada** (recomendado) | El organizador carga la lista (nombre + RUT). Solo quien está en la lista entra. | Cumpleaños, bodas, eventos con invitados conocidos. |
| **Lista + solicitudes** | Igual, pero quien no está en la lista puede enviar nombre + RUT como solicitud; el organizador la aprueba o rechaza. | Cuando se cuelan invitados de último minuto. |
| **Abierto** | Cualquiera con el enlace entra escribiendo su nombre. El RUT es opcional. | Eventos masivos o informales. |

En cualquier modo el organizador puede agregar, editar o quitar invitados a mano o por CSV (ya existe `ImportGuestsModal`; se le agrega la columna `rut`).

## RUT: qué es y qué no es

El RUT sirve para **identificar**, no para **autenticar**: es un dato semipúblico, así que quien conozca el RUT de otro podría hacerse pasar por esa persona. Para una app de fotos de una fiesta el riesgo es bajo (lo peor: fotos atribuidas a otro invitado), y se acota así:

- El organizador ve en la lista cuándo se identificó cada invitado (`claimed_at`, `last_seen_at`) y puede **regenerar el token** de alguien, lo que cierra su sesión.
- El enlace del evento no es adivinable y solo `identify_guest` acepta RUT.
- **Límite de intentos** por evento y por IP (la IP llega a Postgres en `request.headers` de PostgREST) para frenar que alguien pruebe RUTs hasta descubrir quiénes están en la lista. Es un freno de mejor esfuerzo, no un WAF.
- Mensaje de error genérico en modo cerrado ("No te encontramos en la lista").

## Datos personales

- Se pide el RUT **solo** si el evento usa un modo con RUT, y la pantalla de ingreso dice para qué se usa.
- Se normaliza a `12345678-5` (sin puntos, `K` mayúscula) y se valida con módulo 11. Es único por evento (`unique (event_id, rut)`).
- Solo el organizador dueño del evento puede leerlo (RLS). **Nunca** se devuelve a otros invitados, ni va en URLs, QR, rutas de Storage o logs.
- Se borra junto con el evento / al terminar la retención.
- La nueva ley chilena de protección de datos personales (Ley 21.719) entra en vigencia a fines de 2026 (verificar la fecha exacta): conviene tener un aviso de privacidad corto antes de abrir la plataforma a terceros (Fase 2).

## Check-in y puerta

- La lista de invitados del organizador (`DoorList`) busca por nombre o RUT y marca la llegada con un toque.
- El invitado ya identificado puede mostrar **su QR personal** en pantalla (codifica su token, igual que la pulsera de la Fase 0); el escáner existente (`QrScanner`, `useQrCheckIn`, `check_in_guest`) funciona sin cambios.
- Ajuste por evento `camera_unlock`: `on_identify` (por defecto: la cámara se habilita al identificarse) o `on_checkin` (como en la Fase 0: solo después de que el organizador marca la llegada).

## RSVP

La confirmación de asistencia con acompañantes de la Fase 0 pasa a ser **opcional por evento** (`rsvp_enabled`). Si está activa, el invitado la ve después de identificarse.

## Qué pasa con las piezas de la Fase 0

| Pieza | Destino |
|---|---|
| `SendInviteButton` + `guests.phone` | Se retiran del MVP. Los reemplaza `ShareEventLink`: copiar enlace, descargar QR y un único mensaje de WhatsApp genérico para pegar en el grupo. |
| `WristbandCard` (pulsera con enlace personal) | Se reduce a "mi QR" para la puerta, mostrado tras identificarse. |
| `/i/:token` | Desaparece; lo reemplaza `/e/:slug`. |
| `get_guest_by_token`, `submit_rsvp`, `submit_photo`, `get_photo_quota`, `check_in_guest` | Se mantienen (reciben el token que entrega `identify_guest`). |
| `ImportGuestsModal` / `csv.ts` | Se mantienen; columna `rut` nueva, `phone` deja de ser relevante. |

## Fuera de alcance (Fase 2)

Correo electrónico o código por SMS como identificador/segundo factor, tabla de sesiones por dispositivo con revocación individual, inicio de sesión con Google/Apple, avisos de privacidad y términos completos.
