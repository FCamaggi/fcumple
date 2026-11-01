# Formularios de opciones para el cliente

Antes de armar el evento de un cumpleaños hay que saber qué estilo quiere quien cumple. En vez de preguntarlo por mensajes sueltos, cada cliente recibe **un enlace con un formulario de opciones**: elige entre propuestas y, en cada pregunta, puede además escribir lo que quiera. La modalidad se va a repetir en cada cumpleaños, así que el motor es genérico y lo específico de cada cliente es un archivo de datos.

## Cómo funciona

- Ruta pública: `/brief/:slug` (por ejemplo `/brief/ejemplo`). No requiere cuenta.
- El motor está en `src/pages/ClientBriefPage.tsx`; carga su propio chunk, así que quien entra como invitado no lo descarga.
- Las preguntas de cada cliente están en `src/briefs/<slug>.ts` (un `export default` con la forma de `BriefDefinition`, en `src/briefs/types.ts`). El registro (`src/briefs/registry.ts`) los descubre solo: no hay que registrar nada.
- Cada pregunta tiene opciones (una o varias, según `selection`; `max` limita cuántas) y una nota libre. Las preguntas sin opciones son solo texto libre. Una opción con `exclusive` (por ejemplo "lo conversamos en privado") desmarca las demás.
- **Vistas previas:** cada opción se dibuja según el `visual` de su pregunta: `palette` (muestras de color), `font` (el nombre con la tipografía real), `ambiente` (escena mínima con la paleta), `frame` (marco de ejemplo), `emoji` (stickers) y `roll` (disparos como fotogramas).
- **Lo elegido antes se aplica después.** La paleta, la tipografía y los textos (una pregunta con `fields`: nombre y fecha) alimentan las vistas siguientes, así que el orden de las preguntas importa: primero paleta, letras y textos; después ambiente y marcos.
- Los marcos de ejemplo usan el **mismo renderizador de la cámara** (`FramePreview`, plantillas de `src/lib/cameraAssets/frames.ts`) y sus tipografías son las seis de sistema de la cámara, que dependen del dispositivo de quien las vea. La excepción es el marco `conejita`, una propuesta ilustrada "a medida": no existe como plantilla de la cámara (marcos PNG propios y editor libre están en la Fase 3 del backlog).
- El avance se guarda en el navegador de quien responde (`localStorage`, clave `brief-draft:<slug>`), y se puede volver a entrar y enviar de nuevo.
- Si el envío falla, **Copiar mis respuestas** deja el texto en el portapapeles para mandarlo por mensaje.

## Dónde llegan las respuestas

Tabla `public.client_briefs` (migración `20261018100010_client_briefs.sql`):

| Columna | Contenido |
|---|---|
| `slug` | Formulario al que corresponde (minúsculas, números y guiones; 3 a 60 caracteres). |
| `respondent` | Nombre de quien responde (opcional, hasta 80 caracteres). |
| `answers` | `jsonb` con `{ <id de pregunta>: { pregunta, elegidas: [...], nota } }`, legible tal cual. |
| `created_at` | Cuándo se envió. |

**Se leen en el Table Editor de Supabase** (rol de servicio). Desde la app nadie las lee: `anon` y `authenticated` no tienen ningún privilegio sobre la tabla, y la RLS está activada sin políticas. Un organizador no puede ver lo que respondió el cliente de otro.

La única vía de escritura es la función `submit_client_brief(slug, respondent, answers)`:

- Valida el slug, que las respuestas sean un objeto de hasta 20 kB y que el nombre no pase de 80 caracteres (error `22023`).
- Pone un tope de **200 respuestas por formulario y 2000 en total** (error `54000`), para que un enlace público no sirva para llenar la tabla.

Ninguna columna guarda RUT, correo, teléfono ni PIN. El texto libre de las respuestas es de quien responde; no se le pide ningún dato personal.

## Agregar un formulario para otro cumpleaños

1. Crea `src/briefs/<slug>.ts` con un `export default` de tipo `BriefDefinition`.
2. El enlace queda en `/brief/<slug>`.
3. Para que lo vea la clienta, el archivo tiene que estar en `main` (se despliega al hacer push).

El estilo visual de la página usa solo los neutros del sistema (papel sobre tinta) y no los acentos de ninguna rama.

## Pruebas

- `supabase/tests/client-briefs.test.ts`: validación, topes y que la tabla no sea accesible directamente.
- `src/lib/briefApi.test.ts` y `src/pages/ClientBriefPage.test.tsx`: envío, errores, opciones únicas y múltiples, copia y borrador.
