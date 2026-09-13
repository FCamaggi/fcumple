# Documentación de fcumple

Carpetas organizadas por **intención**, no por fecha. Si no sabés por dónde empezar: [`04-producto/estado-actual.md`](./04-producto/estado-actual.md) resume qué existe hoy en la app en 2 minutos de lectura.

| Carpeta | Qué contiene |
|---|---|
| [`01-vision/`](./01-vision/) | Por qué existe el proyecto y qué se pidió. `DESEO-DISENO-USUARIO.md` es el brief de intención del usuario (documento vivo, solo se le agregan addendums, nunca se reescribe). `01-vision-y-requisitos.md` es el documento fundacional de v1 (histórico, con una corrección sobre tema/dresscode). |
| [`02-arquitectura/`](./02-arquitectura/) | Cómo está construida técnicamente (stack, modelo de datos, seguridad). Documento fundacional de v1. |
| [`03-diseno/`](./03-diseno/) | Identidad visual: paleta, tipografía, catálogo de componentes (`DESIGN.md`) y los prompts usados en Stitch (`STITCH-PROMPT.md`). |
| [`04-producto/`](./04-producto/) | Estado actual (`estado-actual.md`), backlog vivo por etapas (`BACKLOG.md`), y el plan de desarrollo original (`03-plan-desarrollo.md`, histórico). |
| [`05-comunicacion/`](./05-comunicacion/) | Todo lo orientado a comunicarse con los invitados: prompts de imagen para avisos (`PROMPTS-IMAGENES-AVISOS.md`) y el sistema de envío de invitaciones por WhatsApp (`sistema-de-mensajes.md`). |
| [`06-operaciones/`](./06-operaciones/) | Runbooks operativos: configuración de CI/CD y secrets (`SETUP.md`). |

## Regla de mantenimiento

- `DESEO-DISENO-USUARIO.md` nunca se reescribe: cualquier ampliación de alcance se agrega como addendum nuevo al final.
- Los documentos marcados como "fundacional" o "histórico" no se actualizan para reflejar cada cambio de implementación — eso vive en `04-producto/BACKLOG.md` y `04-producto/estado-actual.md`. Solo se corrigen cuando una decisión posterior los contradice explícitamente (para no dejar información falsa dando vueltas).
- Antes de asumir el estado de la app a partir de un documento viejo, confirmá contra `04-producto/estado-actual.md` o el código real.
