# Evaluación de factibilidad del informe "Burn Camera"

Fecha: 2026-10-13. Base: lectura del informe original y del repo (Vite + React 18 + Supabase, ~14k líneas de TS, 27 migraciones SQL).

**Veredicto:** el producto es factible; el plan de 16 semanas no, tal como está escrito (subestimado 2–3× para una persona). El camino viable es una **PWA multi-tenant primero**, dejando lo nativo para después.

## Lo que el código ya cubre

- Cámara y revelado "burn": `CameraCapture`, `usePhotoCapture`, `RevealedRoll`, RPC `submit_photo` / `list_revealed_photos`.
- Marcos PNG con carrusel: `cameraFrames`, `useFrameImages`, `public/marcos/`.
- Moderación y auto-aprobación por invitado: `PhotoModerationPanel`, `photoModerationQueue`, migración `guests_auto_approve_photos`.
- Invitados por token + QR + check-in: RPC por token, `DoorList`, `QrScanner`.
- Tests de componentes (vitest) y tests contra Postgres real (`supabase/tests`).

## Lo que exige rehacer para multi-tenant

- `event_config` es un **singleton** (PK booleana fija en `true`; `eventApi.ts` hace upsert sobre esa fila) → pasa a ser tabla `events`.
- `guests`, `photos`, `posts` **no tienen `event_id`**.
- Las políticas del admin son `authenticated using (true)`: con más de un organizador eso filtraría datos entre clientes → reescribir todas.
- Los invitados no tienen JWT; todo pasa por ~10 RPC `SECURITY DEFINER` que resuelven por token → cada una debe resolver el evento desde el token. Se mantiene este modelo en vez de migrar a Auth anónima con claims.
- Frontend sin contexto de evento (`routes.ts`, páginas con datos del evento fijos) → parametrizar por slug.
- Casi todos los tests de `supabase/tests` hay que reescribirlos.

Estimación: 3–5 semanas, no 1–2.

## Riesgos que el informe no menciona

- Cámara en iOS Safari / PWA: `getUserMedia`, permisos y almacenamiento offline tienen limitaciones.
- Al abrir la plataforma a terceros hacen falta política de contenido, reporte de abusos y términos.
- Privacidad de fotos de personas (posiblemente menores); ley chilena de datos personales y GDPR si hubiera usuarios europeos.
- Soporte en vivo: un evento fallando un sábado en la noche es el escenario crítico.

## Valoración de cada punto del informe

| Punto | Valoración |
|---|---|
| React Native + Expo + App Clips + Instant Apps + Turborepo | Reescritura completa del frontend; nada del DOM/Tailwind actual se reutiliza. Revisión de Apple, cuenta de pago, límite de 15 MB. Google Play Instant en retirada. |
| Cloudflare R2 + Workers | Opcional; Supabase Storage ya funciona. Vale la pena solo con volumen. |
| Next.js en Vercel | Innecesario; Vite ya despliega con `vercel.json`. |
| Vercel Hobby | Prohíbe uso comercial; relevante solo al cobrar. |
| Supabase Realtime free | Tope de 200 conexiones; suficiente para eventos chicos. |
| IAP + RevenueCat + Mercado Pago + Stripe | Cuatro integraciones; con PWA basta Mercado Pago (y Stripe después). |
| Photobooks, kits físicos, guestbook con audio, videos | Cada uno 1–3 semanas más logística y atención al cliente. |
| Moderación por lotes horarios | Barata: ya existe `photoTimeline.ts`. |
| Finanzas | Optimistas: conversiones freemium→pago de 2–5%, COGS sin soporte ni impuestos, margen del 89% que exige tracción sin marketing. Tratar como hipótesis. |
