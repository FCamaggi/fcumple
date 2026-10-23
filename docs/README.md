# Documentación de fcumple

La documentación se organiza por **fase del producto**. Cada fase tiene su carpeta; dentro, los documentos se agrupan por intención.

| Carpeta | Qué contiene | Estado |
|---|---|---|
| [`estrategia/`](./estrategia/) | El informe original de la plataforma "Burn Camera" y la evaluación de factibilidad con las decisiones de alcance que se tomaron sobre él. | Referencia |
| [`fase-0-evento-unico/`](./fase-0-evento-unico/) | La app de un solo evento (cumpleaños) y un solo admin que se construyó primero. Antes eran las carpetas `01-vision` … `08-QA`. | **Histórico** (ya no es el esquema vigente) |
| [`fase-1-mvp-multitenant/`](./fase-1-mvp-multitenant/) | MVP de plataforma: varios eventos aislados, solo web (QR → navegador), marcos y stickers configurados por el organizador. | **En producción** (el esquema vigente) |
| [`fase-2-en-adelante/`](./fase-2-en-adelante/) | Backlog ordenado de lo que quedó fuera del MVP: pagos, planes, R2, muro en vivo, photobooks, app nativa, etc. | Backlog |

## Por dónde empezar

- ¿Qué hace la app hoy? → [`fase-0-evento-unico/04-producto/estado-actual.md`](./fase-0-evento-unico/04-producto/estado-actual.md)
- ¿Qué existe hoy y qué no? → [`fase-1-mvp-multitenant/estado-del-producto.md`](./fase-1-mvp-multitenant/estado-del-producto.md)
- ¿Qué se va a construir ahora? → [`fase-1-mvp-multitenant/README.md`](./fase-1-mvp-multitenant/README.md)
- ¿Por qué se descartó X? → [`estrategia/decisiones-de-alcance.md`](./estrategia/decisiones-de-alcance.md)
- ¿Qué viene después? → [`fase-2-en-adelante/README.md`](./fase-2-en-adelante/README.md)

## Regla de mantenimiento

- Los documentos de `fase-0-evento-unico/` describen una app ya construida. `DESEO-DISENO-USUARIO.md` nunca se reescribe (solo addendums). Los documentos "fundacional" o "históricos" solo se corrigen si una decisión posterior los contradice explícitamente.
- Los cambios de la Fase 1 se documentan en su propia carpeta, no en el `BACKLOG.md` de la Fase 0 (que queda como registro cerrado de lo hecho hasta el evento único).
- Cuando algo de la Fase 2 se decide construir, se **mueve** a la Fase 1 (o a una fase nueva) con su propio spec, y se deja una línea en el backlog de Fase 2 apuntando al nuevo lugar.
- Antes de asumir el estado de la app a partir de un documento viejo, confirma contra `estado-actual.md` o el código real.
- Las rutas `docs/0N-…` que aparecían en comentarios del código y en `supabase/README.md` se actualizaron a `docs/fase-0-evento-unico/0N-…`.
