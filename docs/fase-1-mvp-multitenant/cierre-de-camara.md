# Hora límite de la cámara y exportación de fotos

Dos cosas que la organizadora necesita al terminar la fiesta.

## Hora límite de la cámara (`events.camera_closes_at`)

- `null` (por defecto) = sin límite, como siempre.
- Pasada la hora, la **base** rechaza las fotos nuevas; la interfaz solo lo refleja:
  - `submit_photo` responde `55000` y no gasta cupo. El cliente muestra «La cámara de este evento ya cerró».
  - La política de subida a Storage (`guest_folder_exists`) también lo exige, para no dejar archivos huérfanos.
  - Un reintento de una foto **ya registrada** sigue devolviendo su fila (no se pierde una foto cuya respuesta se extravió).
- `get_event_public` entrega `camera_closes_at`. En `GuestHub` la cámara desaparece y se abre un aviso «Cámara // cerrada»; si la hora llega con la página abierta, la cámara abierta se cierra sola.
- Panel → **Ajustes**: campo «La cámara se cierra a las» (vacío = sin límite) y el botón **Cerrar la cámara ahora**, que guarda la hora actual de inmediato. Para reabrir: borrar la hora o ponerla en el futuro.
- Migración: `20261028100020_camera_closes_at.sql`. Test: `supabase/tests/camera-closes-at.test.ts`.

Límite conocido: la hora se compara con el reloj del servidor; una foto que el invitado ya estaba subiendo justo en el segundo del cierre puede fallar con «No pudimos subir la foto».

## Exportar las fotos (pestaña Fotos)

El botón **Exportar fotos** baja los originales (`photos.storage_path`, no la copia `-display`) con la sesión de la organizadora y arma un `.zip` en el navegador (`fflate`), con una carpeta por invitado. Por defecto solo las aprobadas. Código: `src/lib/photoExport.ts`, `src/components/ExportPhotos.tsx`.
