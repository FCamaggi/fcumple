# CLI de Respaldo Local de Tenants (Eventos)

Esta herramienta permite realizar un respaldo local completo de los datos y archivos pertenecientes a un evento (tenant) específico en `fcumple`.

> [!WARNING]
> **Advertencia sobre Datos Personales:**  
> La salida generada por este comando contiene datos personales de los invitados (nombres completos, fotos, notas, respuestas de confirmación y asistencia).  
> El repositorio de `fcumple` es **público**. Los respaldos **NUNCA** deben guardarse, confirmarse ni subirse a este repositorio.  
> Todos los respaldos deben almacenarse exclusivamente en el repositorio privado de clientes (`docs/clientes` o el repositorio privado designado para clientes). La carpeta `respaldos/` está incluida en `.gitignore`.

---

## Qué exporta

Para el evento identificado por su `<slug>`:

1. **Datos del evento (`public.events`):** Fila del evento con todos sus metadatos y configuraciones (nombre, fechas, modo de acceso, tema, etc.). El campo `activation_code` se redacta automáticamente a `"[redactado]"`.
2. **Tablas relacionadas (`tables`):**
   - **`guests`:** Lista completa de invitados asignados al evento (`event_id`). El campo `token` se redacta automáticamente a `"[redactado]"`.
   - **`guest_credentials`:** Registros de control de acceso vinculados a los invitados del evento (`guest_id`, contador de intentos fallidos `failed_count` y bloqueo `locked_until`).
   - **`photos`:** Fotos asociadas al evento, incluyendo estados de moderación y rutas de almacenamiento.
   - **`posts`:** Publicaciones y comunicados del evento.
   - **`post_images`:** Imágenes adjuntas a las publicaciones del evento.
   - **`event_frames`:** Marcos paramétricos configurados para la cámara del evento.
   - **`event_stickers`:** Stickers (emojis e imágenes) configurados para el evento.
   - **`client_briefs`:** Respuestas de cuestionarios o briefs asociadas al slug del evento (`slug = event.slug`).
3. **Objetos de almacenamiento (`storageObjects`):** Metadatos de todos los archivos en los buckets `party-photos`, `post-images` y `event-assets` cuyo nombre comience con el prefijo del evento (`<event_id>/%`). Se listan por prefijo para incluir tanto archivos referenciados como archivos huérfanos.
4. **Archivos descargados (`storage/`):** Descarga de cada archivo listado en los buckets de Storage con su estructura de directorios intacta (a menos que se indique `--sin-archivos`).
5. **Manifiesto (`manifest.json`):** Resumen estructurado que incluye identificadores, fecha de exportación, formato de versión, conteos por tabla, `storage_objects` (objetos listados en Storage) y `files_downloaded` (los descargados: 0 con `--sin-archivos`), y la lista de archivos descargados junto con sus tamaños en bytes y sumas de verificación SHA-256.

---

## Qué NUNCA exporta y por qué

- **`guest_credentials.pin_hash`:** El hash bcrypt del PIN de 4 dígitos de los invitados. **Nunca se selecciona ni se exporta.** Un hash bcrypt de un secreto corto (4 dígitos numéricos) es trivialmente susceptible a ataques de fuerza bruta si el hash se filtra. Por principio de mínimo privilegio y seguridad estricta, los hashes nunca forman parte del respaldo.
- **`identify_attempts`:** Registro de intentos fallidos de autenticación (utilizado para control de tasa y rate-limiting en tiempo real). Son datos operacionales y efímeros con expiración automática, no información persistente del evento.
- **`events.activation_code`:** El código secreto del QR impreso de la fiesta utilizado para desbloquear la cámara de los invitados. Se redacta a `"[redactado]"`.
- **`guests.token`:** Credencial de acceso directo del invitado a la aplicación web. Se redacta a `"[redactado]"` para proteger los accesos.
- **Datos de otros eventos:** Ningún registro ni archivo perteneciente a otro `event_id` es incluido. Se garantiza un aislamiento estricto por tenant.

---

## Variables de Entorno

- **`DATABASE_URL` (Obligatoria):** Cadena de conexión estándar a PostgreSQL (ej. `postgresql://postgres:password@localhost:5432/postgres` o la cadena directa del pooler de Supabase).
- **`SUPABASE_URL` (Obligatoria si no se usa `--sin-archivos`):** URL base del proyecto Supabase (ej. `https://<ref>.supabase.co`).
- **`SUPABASE_SERVICE_ROLE_KEY` (Obligatoria si no se usa `--sin-archivos`):** Clave de servicio (`service_role`) para autenticar las descargas directas desde Supabase Storage.  
  *Nota de seguridad:* El script nunca imprime ni expone esta clave en la terminal ni en los registros.

---

## Uso

```bash
# Respaldo completo (base de datos + archivos de storage)
node scripts/tenant/export.mjs <slug>

# Especificar un directorio de destino personalizado
node scripts/tenant/export.mjs <slug> --out /ruta/hacia/respaldo

# Respaldar únicamente metadatos y base de datos (sin descargar archivos de Storage)
node scripts/tenant/export.mjs <slug> --sin-archivos
```

### Comportamiento del directorio de destino

- **Por defecto:** Se crea un directorio dentro de `respaldos/<slug>-<YYYYMMDD-HHMMSS>/` relativo al directorio actual de ejecución.
- **Validación de directorio:** Si el directorio de destino ya existe y contiene archivos, el script aborta inmediatamente con código de salida `1` para evitar sobreescrituras accidentales.
- **Permisos:** El respaldo contiene datos personales de los invitados, así que solo el dueño puede leerlo: las carpetas quedan con `0700` y los archivos con `0600`.

---

## Estructura de Salida

```
respaldos/<slug>-<YYYYMMDD-HHMMSS>/
├── data.json
├── manifest.json
└── storage/
    ├── party-photos/
    │   └── <event_id>/
    │       └── <guest_id>/
    │           └── foto.jpg
    ├── post-images/
    │   └── <event_id>/
    │       └── portada.jpg
    └── event-assets/
        └── <event_id>/
            └── stickers/
                └── sticker.webp
```

- **`data.json`:** Contiene los objetos `{ event, tables, storageObjects }` con formato JSON indentado.
- **`manifest.json`:** Contiene el resumen de la exportación:
  ```json
  {
    "format": "fcumple-tenant-export/v1",
    "slug": "mi-evento",
    "event_id": "00000000-0000-0000-0000-000000000000",
    "exported_at": "2026-10-31T20:00:00.000Z",
    "counts": {
      "guests": 10,
      "guest_credentials": 10,
      "photos": 25,
      "posts": 2,
      "post_images": 2,
      "event_frames": 3,
      "event_stickers": 4,
      "client_briefs": 1,
      "storage_objects": 27,
      "files_downloaded": 27
    },
    "files": [
      {
        "bucket": "party-photos",
        "name": "00000000-0000-0000-0000-000000000000/guest1/foto.jpg",
        "bytes": 204850,
        "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    ],
    "redacted": [
      "events.activation_code",
      "guests.token"
    ],
    "excluded": [
      "guest_credentials.pin_hash",
      "identify_attempts"
    ]
  }
  ```
