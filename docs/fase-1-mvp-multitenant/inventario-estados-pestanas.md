# Inventario de estados de carga, vacío y error por pestaña (épica D, etapa 3)

Fecha: 2026-10-24. Rama `feat/estados-pestanas`. Verificado leyendo el código (las líneas son de esa rama), no probado en pantalla. Origen: [`backlog-diseno-y-marcos.md`](./backlog-diseno-y-marcos.md), épica D.

Leyenda: ✓ existe · ✗ no existe · — no aplica (la pestaña no carga datos propios).

| Pestaña | Carga | Vacío | Error | Reintentar | Evidencia y observaciones |
|---|---|---|---|---|---|
| Hoy | ✓ | ✓ | ✓ (`role="alert"`) | ✓ | `PartyDayTab.tsx:69` «Cargando fotos...», `:75-79` error con «Reintentar», `:85` y `:122` vacíos de fotos e invitados. Es el modelo. |
| Invitados | página | ✓ | solo las acciones | ✗ | `GuestListPanel.tsx:226` vacío; errores de acciones en `:200` (`role="alert"`). La carga la hace la página: ver «Página». |
| Avisos | ✓ | ✓ | ✓ sin `role` | ✗ | `PostsPanel.tsx:324` carga, `:325` vacío, `:238` error como `<p>` sin `role="alert"`. **Fallo:** si la lectura falla, `posts` queda en `[]` y `loading` en falso, así que se muestra a la vez el error y «Todavía no hay avisos. Crea el primero.». |
| Fotos | ✗ | ✗ | ✓ (`role="alert"`) | ✗ | `PhotosTab.tsx:29` solo muestra el error. Mientras carga no dice nada y con cero fotos solo dice «0 fotos · 0 por revisar…». La revisión interna sí tiene los tres (`PhotoModerationPanel.tsx:214, 227, 232`). |
| Activación | — | — | ✗ | — | `ActivationTab.tsx:25-30`: si falla generar el QR, `setQr(null)` y no se muestra nada ni se avisa. |
| Cámara | ✓ | ✓ (marcos y stickers) | ✓ (`role="alert"`) | ✗ | `studio/CameraStudio.tsx:134` carga, `:126` error de lectura sin salida, `:191` y `StickerManager.tsx:145` vacíos. |
| Vista previa | iframe | — | iframe | ✗ | `GuestPreviewPage` tiene carga, «no existe» y error propios (sin reintento), dentro del teléfono. |
| Enlace | — | — | ✗ | — | `ShareEventLink.tsx:25-30`: igual que Activación, el QR que falla desaparece en silencio. |
| Inscripción | — | — | ✓ al guardar | — | Formulario; el error de guardado se muestra. |
| Puerta | página | ✗ | solo el registro de llegada | ✗ | `DoorPanel.tsx:81` error de llegada; sin invitados aprobados no dice nada (solo avisa «no encontramos a nadie» al buscar, `:86`). |
| Ajustes | — | — | ✓ al guardar | — | Formulario. |
| Página | ✓ (`:124`) | ✓ «no existe» (`:132`) | ✓ (`:114`) | ✗ | `OrganizerEventPage.tsx`: si falla la carga del evento o de los invitados se reemplaza todo el panel por el error, sin salida. |

## Conclusión: dos PR
Sale de tamaño medio: seis puntos con carencias reales. Se divide así:

- **PR A (este):** un componente común `PanelState` (carga, vacío y error con «Reintentar», 44 px, texto de 12 px o más, `role` correcto). Lo estrena «Hoy» (sin cambiar su comportamiento), y se aplica a **Avisos** (corrige el fallo del vacío con error y agrega «Reintentar») y **Fotos** (carga, vacío y reintento).
- **PR B:** **Cámara** (reintento), **la página** (reintento al fallar la carga, sin tirar el panel), **Puerta** (vacío) y **QR** de Activación y Enlace (avisar cuando no se pudo generar).

Queda fuera, por no ser carga de datos: Inscripción y Ajustes (formularios) y la vista previa (tiene sus estados dentro del teléfono).
