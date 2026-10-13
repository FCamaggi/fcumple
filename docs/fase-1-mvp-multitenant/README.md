# Fase 1 — MVP multi-tenant (solo web)

**Objetivo:** que más de un evento viva en el mismo despliegue, aislado de los demás, y que el organizador de cada uno configure su propia experiencia de cámara (marcos y stickers). Se parte de la app de la [Fase 0](../fase-0-evento-unico/04-producto/estado-actual.md); nada se reescribe desde cero.

Contexto de decisiones: [`../estrategia/decisiones-de-alcance.md`](../estrategia/decisiones-de-alcance.md).

## Dentro del MVP

1. **Multi-tenant en la base:** tabla `events`, `event_id` en todo, RLS por organizador. Ver [`arquitectura-multitenant.md`](./arquitectura-multitenant.md).
2. **Migración del evento actual** (cumpleaños de Fabrizio) como el primer evento, sin perder datos.
3. **Rutas por evento** (`/e/:slug/...`) y panel del organizador para crear/gestionar eventos.
4. **Acceso de invitados solo web:** el QR/enlace abre el navegador (PWA ligera, sin app nativa ni App Clip).
5. **Marcos y stickers configurables por el organizador**, con toggles de activación. Ver [`marcos-y-stickers.md`](./marcos-y-stickers.md).
6. **Moderación por lotes horarios**, sobre `photoTimeline.ts`. Ver [`moderacion-por-lotes.md`](./moderacion-por-lotes.md).

## Fuera del MVP (ver [Fase 2](../fase-2-en-adelante/README.md))

Pagos y planes, Cloudflare R2, muro en vivo, descarga ZIP, marcos dinámicos con variables, libro de visitas, photobooks, kits de señalética, videos, app nativa, proyección financiera.

## Restricciones asumidas

- Eventos de hasta ~80 invitados: el free tier de Supabase alcanza (500 MB BD, 1 GB storage, 200 conexiones Realtime).
- Vercel Hobby y su cláusula de uso no comercial: se ignora mientras no haya cobro.
- Supabase free se pausa tras 7 días sin actividad → mantener un ping periódico (ver [`plan-de-trabajo.md`](./plan-de-trabajo.md), tarea de operaciones).

## Criterios de salida

- [ ] Dos eventos de prueba conviven sin que un organizador vea datos del otro (test de DB lo demuestra).
- [ ] El evento actual funciona igual que antes tras la migración (mismos tokens/enlaces de invitados válidos).
- [ ] Un organizador crea un evento, define marcos/stickers, activa/desactiva y los invitados lo ven reflejado en la cámara.
- [ ] `npm run typecheck`, `npm test`, `npm run test:db` y `npm run build` en verde.
- [ ] Un evento real de ~80 personas corrido de punta a punta.

## Documentos

| Documento | Contenido |
|---|---|
| [`arquitectura-multitenant.md`](./arquitectura-multitenant.md) | Modelo de datos, RLS, acceso por token, storage, rutas, migración del evento actual. |
| [`marcos-y-stickers.md`](./marcos-y-stickers.md) | Spec de marcos y stickers por evento, toggles de recursos, edición por el organizador, render en la cámara. |
| [`moderacion-por-lotes.md`](./moderacion-por-lotes.md) | Agrupación por bloques horarios en el panel de moderación. |
| [`plan-de-trabajo.md`](./plan-de-trabajo.md) | Etapas ordenadas, dependencias y riesgos. |
