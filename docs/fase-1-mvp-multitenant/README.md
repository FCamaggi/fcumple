# Fase 1 — MVP multi-tenant (solo web)

**Objetivo:** que más de un evento viva en el mismo despliegue, aislado de los demás, y que el organizador de cada uno configure su propia experiencia de cámara (marcos y stickers). Se parte de la app de la [Fase 0](../fase-0-evento-unico/04-producto/estado-actual.md); nada se reescribe desde cero.

Contexto de decisiones: [`../estrategia/decisiones-de-alcance.md`](../estrategia/decisiones-de-alcance.md).

## Dentro del MVP

1. **Multi-tenant en la base:** tabla `events`, `event_id` en todo, RLS por organizador. Ver [`arquitectura-multitenant.md`](./arquitectura-multitenant.md).
2. **Esquema nuevo en el mismo proyecto Supabase**, que se poda antes (la Fase 0 ya no se usa; el evento ya ocurrió y no se migra).
3. **Rutas por evento** (`/e/:slug/...`) y panel del organizador para crear/gestionar eventos.
4. **Acceso de invitados solo web con un único enlace/QR por evento**: cada persona se inscribe con nombre y apellido y un PIN que elige (o inicia sesión con los mismos datos). Sin lista previa, RUT, correo ni teléfono. Ver [`acceso-de-invitados.md`](./acceso-de-invitados.md).
5. **Marcos genéricos (colores y textos editables) y stickers (emojis e imágenes subidas)**, definidos por el organizador, con toggles por recurso y globales. Ver [`marcos-y-stickers.md`](./marcos-y-stickers.md).
6. **Moderación por lotes horarios**, sobre `photoTimeline.ts`. Ver [`moderacion-por-lotes.md`](./moderacion-por-lotes.md).

## Fuera del MVP (ver [Fase 2](../fase-2-en-adelante/README.md))

Pagos y planes, Cloudflare R2, muro en vivo, descarga ZIP, marcos dinámicos con variables, libro de visitas, photobooks, kits de señalética, videos, app nativa, proyección financiera.

## Restricciones asumidas

- Eventos de hasta ~80 invitados: el free tier de Supabase alcanza (500 MB BD, 1 GB storage, 200 conexiones Realtime).
- Vercel Hobby y su cláusula de uso no comercial: se ignora mientras no haya cobro.
- Supabase free se pausa tras 7 días sin actividad → mantener un ping periódico (ver [`plan-de-trabajo.md`](./plan-de-trabajo.md), tarea de operaciones).

## Criterios de salida

- [ ] Dos eventos de prueba conviven sin que un organizador vea datos del otro (test de DB lo demuestra).
- [ ] Un invitado entra con el enlace único del evento, se inscribe con nombre, apellido y PIN y llega a la cámara sin que el organizador le envíe nada individual.
- [ ] Un organizador crea un evento, edita colores y textos de un marco, agrega emojis e imágenes como stickers, activa/desactiva y los invitados lo ven reflejado en la cámara (probado en iPhone y Android reales).
- [ ] `npm run typecheck`, `npm test`, `npm run test:db` y `npm run build` en verde.
- [ ] Un evento real de ~80 personas corrido de punta a punta.

## Documentos

| Documento | Contenido |
|---|---|
| [`arquitectura-multitenant.md`](./arquitectura-multitenant.md) | Modelo de datos, RLS, storage, rutas, poda y despliegue. |
| [`acceso-de-invitados.md`](./acceso-de-invitados.md) | Enlace único por evento, inscripción y inicio de sesión con PIN, modos de acceso, seguridad, check-in. |
| [`marcos-y-stickers.md`](./marcos-y-stickers.md) | Marcos paramétricos, stickers emoji/imagen, toggles, editor del organizador, render en la cámara. |
| [`moderacion-por-lotes.md`](./moderacion-por-lotes.md) | Agrupación por bloques horarios en el panel de moderación. |
| [`puesta-en-marcha.md`](./puesta-en-marcha.md) | Podar la Fase 0 del proyecto Supabase actual, aplicar la Fase 1, probar en un preview, checklist de punta a punta y merge. |
| [`plan-de-trabajo.md`](./plan-de-trabajo.md) | Etapas ordenadas, dependencias y riesgos. |
