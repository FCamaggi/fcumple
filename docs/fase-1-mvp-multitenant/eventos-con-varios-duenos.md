# Eventos con varios dueños

Un evento puede tener varias cuentas organizadoras con los mismos permisos sobre él (por ejemplo, un cumpleaños compartido o una fiesta organizada entre varias personas). Cada co-dueño se suma mediante un link de invitación de un solo uso generado desde el panel.

## Cómo invitar a otro dueño

1. Un dueño actual entra al evento en `/panel/e/:eventId` y abre la pestaña **Ajustes**.
2. En la sección **Dueños** ve la lista de cuentas con acceso al evento (por correo, con insignias **Tú** y **Creador**) y pulsa **Generar link de invitación**.
3. El panel muestra el enlace `${origen}/panel/unirse/<token>` en un campo de solo lectura con el botón **Copiar** y el aviso de vigencia.
4. La persona invitada abre ese enlace (`/panel/unirse/:token`):
   - Si no tiene sesión abierta, ve el inicio de sesión o registro de organizador en la misma dirección.
   - En cuanto entra o crea su cuenta, la página consume la invitación automáticamente (`accept_owner_invite`) y redirige con reemplazo de historial a `/panel/e/:eventId`.
   - Si la cuenta ya era dueña del evento, la RPC devuelve igualmente el `event_id` y redirige al panel sin error.

## Reglas y límites

- **Un solo uso:** cada link sirve para sumar a una única persona. Si hay varios co-organizadores, se genera un link distinto para cada uno.
- **Vigencia de 7 días:** el link vence a los 7 días de crearse. Si el token no existe, ya se usó o venció (`P0002` `'invite not found'`), `/panel/unirse/:token` muestra: «El link no es válido, ya se usó o venció. Pídele uno nuevo a quien te invitó.» y ofrece volver a `/panel`.
- **Máximo 5 invitaciones activas por evento:** no puede haber más de 5 links vigentes sin usar al mismo tiempo (`53400` `'invite limit reached'`).
- **Máximo 10 dueños por evento:** un evento admite hasta 10 cuentas dueñas en total (`53400` `'owner limit reached'`), validado tanto al generar como al aceptar una invitación.

## Derechos iguales y cuota del creador

- **Mismos permisos:** todos los dueños ven el evento en `/panel` y pueden gestionar invitados, puerta, moderación y publicación de fotos, avisos, cámara (marcos y stickers), QR de activación, regalos, inscripción, ajustes y generación de nuevas invitaciones.
- **Creador conservado en `events.owner_id`:** la columna `events.owner_id` sigue apuntando siempre a quien creó el evento. Ese campo se usa para contabilizar el tope de **10 eventos creados por cuenta** en `create_event`: aceptar la invitación a un evento creado por otra persona no consume cupo propio de creación de eventos.

## Superficie técnica (frontend y contrato RPC)

- **RPCs consumidas** (`src/lib/organizerApi.ts`):
  - `create_owner_invite(p_event_id uuid) → text`: devuelve el token URL-safe crudo.
  - `accept_owner_invite(p_token text) → uuid`: consume el token y devuelve el `event_id`.
  - `list_event_owners(p_event_id uuid) → table (user_id, email, is_creator, is_me, created_at)`: lista los dueños ordenados por `created_at`.
- **Interfaz:**
  - `src/components/EventOwnersSection.tsx` (integrada en `src/components/EventSettingsPanel.tsx`, pestaña **Ajustes**).
  - `src/pages/JoinEventPage.tsx` montada en `/panel/unirse/:token` (`src/App.tsx`), protegida con `RequireAuth` y `OrganizerLogin`.
