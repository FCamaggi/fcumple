# Acceso de invitados (Fase 1)

## Qué cambia respecto a la Fase 0

En la Fase 0 cada invitado tenía **su propio enlace** `/i/:token`, que el organizador debía mandar uno por uno (`SendInviteButton`, `wa.me` con el teléfono de cada uno). No escala y es incómodo.

En la Fase 1 hay **un solo enlace y un solo QR por evento**: `https://…/e/{slug}`. Se manda el mismo mensaje a todos (grupo de WhatsApp, impreso, proyectado). Cada invitado se identifica al entrar.

> La Fase 0 solo tuvo un evento y ya pasó: **no se conserva compatibilidad con `/i/:token` ni se migran datos**.

## Principio: no guardamos el RUT

**La plataforma no almacena RUT en ninguna tabla, log ni ruta.** El invitado queda registrado únicamente por su **nombre y apellido** (mínimo dos palabras, lo exige la base con una restricción). Un test de la suite de base de datos falla si alguna columna del esquema público parece guardar un RUT.

Hay dos formas de identificarse; el organizador elige cuál usa su evento (`events.identifier`):

| `identifier` | Qué escribe el invitado | Quién resuelve el nombre | Estado |
|---|---|---|---|
| `name` (por defecto) | Su nombre y apellido | La base: `identify_guest(slug, nombre)` | **Implementado** (Etapa 1) |
| `rut_lookup` | Su RUT | Un servicio externo de identidad, desde una función serverless | **Contrato listo; falta elegir proveedor** |

### Identificación por nombre (`name`)

1. El invitado abre `/e/:slug` y escribe su nombre y apellido.
2. La base normaliza lo escrito (minúsculas, sin tildes, sin signos ni partículas como "de", "la") y busca en la lista del evento a quien contenga esas palabras: "Juan Pérez" encuentra a "Juan Carlos Pérez González", y el orden da igual.
3. Resultados posibles (`outcome`):
   - `ok` → devuelve el token del invitado, que el cliente guarda en `localStorage`.
   - `ambiguous` → varias personas coinciden; se le pide escribir más palabras (p. ej. el segundo apellido).
   - `not_found` → no está en la lista.
   - `pending_approval` → modo con solicitudes: quedó pendiente de aprobación.
4. Si el navegador pierde el almacenamiento, vuelve a escribir su nombre y recupera la sesión.

Implementado en el frontend como `/e/:slug` (`EventEntryPage` + `IdentifyForm`).

Dos invitados con las mismas palabras en un mismo evento no pueden convivir (índice único); el organizador los diferencia al cargar la lista.

### Identificación por RUT con un servicio externo (`rut_lookup`)

El RUT solo **transita** por memoria de una función serverless; nunca se persiste:

```
navegador ──RUT──▶ POST /api/identify (Vercel, sin logs del cuerpo)
                     1. valida formato y dígito verificador (módulo 11)
                     2. consulta al proveedor de identidad → nombre legal
                     3. llama identify_guest_verified(event_id, nombre) con la service_role
                        (la base compara el nombre contra la lista; NO recibe el RUT)
                     4. responde { outcome, token } y descarta el RUT
```

- `identify_guest_verified` solo la puede ejecutar `service_role`; `anon` y `authenticated` reciben error de permisos (cubierto por tests).
- En este camino la coincidencia es la **inversa**: las palabras del invitado de la lista deben estar contenidas en el nombre legal ("Juan Pérez" ⊂ "JUAN CARLOS PÉREZ GONZÁLEZ").
- Los eventos con `identifier = 'rut_lookup'` rechazan `identify_guest` (el camino por nombre queda cerrado).

#### Proveedor

- **No existe una API pública y gratuita del Estado** que entregue el nombre a partir de un RUT.
- El raspador `rutificador_nombrerutfirma` y el formulario web de nombrerutyfirma.com fueron evaluados (ver [`../estrategia/evaluacion-rutificador-nombrerutyfirma.md`](../estrategia/evaluacion-rutificador-nombrerutyfirma.md)): el raspador está abandonado y sin licencia; el formulario **funciona desde una IP residencial** (prueba del usuario con Postman, sin cookies) pero no está probado desde Vercel, no hay contrato ni términos de uso accesibles y envía el RUT de cada invitado a un tercero. **No se recomienda para un producto de pago.**
- Lo que sí es viable con respaldo es un proveedor de verificación **con contrato** (por ejemplo Verifik o Didit; Didit publica ~US$0,20 por consulta, unos US$16 por evento de 80 personas; falta confirmar que resuelvan nombre solo con el RUT).
- `POST /api/identify` está implementada y probada con un proveedor de prueba, pero **no hay ningún proveedor registrado** (`src/server/providers.ts` está vacío): sin `IDENTITY_PROVIDER` responde `501`. Mientras tanto el único modo activo es `name`.
- Para agregar uno: implementar `IdentityProvider.resolveName(rut)` (devuelve solo el nombre), registrarlo en `PROVIDERS` y definir en Vercel `IDENTITY_PROVIDER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (variables de servidor, sin prefijo `VITE_`; la clave de servicio nunca llega al navegador).
- Cada consulta consume presupuesto (10 por IP y 60 por evento cada 10 minutos, `register_verified_lookup`) **antes** de llamar al proveedor, para que un abuso no genere costo.

## Modos de acceso (por evento)

`events.access_mode`:

| Modo | Cómo funciona |
|---|---|
| `list` (por defecto) | Solo entra quien está en la lista que cargó el organizador. |
| `list_requests` | Igual, pero quien no está puede dejar una solicitud (nombre y apellido) que el organizador aprueba o rechaza. Tope de 50 pendientes. |
| `open` | Cualquiera con el enlace entra escribiendo nombre y apellido; se reutiliza al invitado solo con coincidencia exacta de palabras. |

El organizador puede agregar, editar o quitar invitados a mano o por CSV (`ImportGuestsModal`; la columna de teléfono deja de ser relevante).

## Seguridad y límites

- **El nombre identifica, no autentica.** Quien conozca el nombre de otro invitado podría hacerse pasar por él. Para una app de fotos de una fiesta el riesgo es bajo (lo peor: fotos atribuidas a otro). El organizador ve `claimed_at` y `last_seen_at` y puede regenerar el token de alguien.
- **Freno de intentos:** 10 fallos por IP y 60 por evento cada 10 minutos (la IP sale de `x-forwarded-for` en `request.headers`); luego la RPC responde con el código `53400`. Un acierto no consume intentos. Es un freno de mejor esfuerzo, no un WAF.
- El enlace del evento no es adivinable (el `slug` lleva un sufijo aleatorio).
- Los tokens **nunca** viajan en rutas de Storage. (En la Fase 0 sí: `list_revealed_photos()` era público y devolvía rutas que empezaban con el token del fotógrafo; ver [`arquitectura-multitenant.md`](./arquitectura-multitenant.md).)

## Check-in y puerta

- El organizador busca por nombre en la lista y marca la llegada. `check_in_guest` **solo lo puede ejecutar el dueño del evento** (en la Fase 0 cualquiera con un token podía marcarse a sí mismo).
- El invitado identificado puede mostrar **su QR personal** (codifica su token); el escáner existente funciona sin cambios.
- Ajuste por evento `camera_unlock`: `on_identify` (por defecto) o `on_checkin`. Con `on_checkin`, `submit_photo` rechaza fotos hasta que el organizador marque la llegada.

## RSVP

Opcional por evento (`rsvp_enabled`, apagado por defecto). Si está apagado, `submit_rsvp` responde con error de permisos.

## Datos personales

- Lo único personal que se guarda del invitado es su **nombre**, que el organizador ya conoce por su propia lista.
- Si se usa `rut_lookup`, el proveedor externo y la función serverless **tratan** el RUT aunque no lo almacenen: hay que revisar el contrato del proveedor, evitar cualquier log o analítica con el cuerpo de la petición y dejar un aviso en pantalla.
- La Ley 21.719 de protección de datos personales fija su entrada en vigencia el 1 de diciembre de 2026, pero hay un proyecto del Ejecutivo para postergarla al 1 de diciembre de 2027 (estado no confirmado al 2026-10-15). Verificar antes de abrir la plataforma a terceros.

## Qué pasa con las piezas de la Fase 0

| Pieza | Destino |
|---|---|
| `SendInviteButton` + `guests.phone` | Se retiran del MVP. Los reemplaza `ShareEventLink`: copiar enlace, descargar QR y un único mensaje de WhatsApp genérico. |
| `WristbandCard` | Se reduce a "mi QR" para la puerta, mostrado tras identificarse. |
| `/i/:token` | Desaparece; lo reemplaza `/e/:slug`. |
| `get_guest_by_token`, `submit_rsvp`, `submit_photo`, `get_photo_quota` | Se mantienen (reciben el token que entrega la identificación). |
| `check_in_guest` | Solo organizador dueño. |
| `list_revealed_photos()` | Ahora `list_revealed_photos(p_token)`: solo invitados identificados, solo su evento. |

## Fuera de alcance (Fase 2)

Proveedor de RUT en producción, correo o código por SMS como segundo factor, sesiones por dispositivo con revocación individual, inicio de sesión con Google/Apple, aviso de privacidad y términos completos.
