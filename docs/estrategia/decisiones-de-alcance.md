# Decisiones de alcance

Decisiones tomadas por el usuario el 2026-10-13 sobre cada punto del [informe original](./informe-original-burn-camera.md), a la luz de la [evaluación de factibilidad](./evaluacion-de-factibilidad.md).

| # | Punto del informe | Decisión | Dónde queda |
|---|---|---|---|
| D1 | React Native + Expo + App Clips + Instant Apps + monorepo Turborepo | **Descartado.** Solo web. El invitado entra escaneando un QR que abre el navegador. | — |
| D2 | Cloudflare R2 + Workers | **Fuera del MVP.** Se sigue con Supabase Storage. | [Fase 2](../fase-2-en-adelante/README.md) |
| D3 | Next.js en Vercel | **De acuerdo en no usar Next.js.** Se mantiene Vite + React + React Router; hosting en Vercel como hoy (`vercel.json`). | — |
| D4 | Restricción de Vercel Hobby a uso no comercial | **No preocupa en el MVP.** Se retoma al empezar a cobrar. | [Fase 2](../fase-2-en-adelante/README.md) |
| D5 | Límite de Realtime del free tier (200 conexiones) | **No preocupa.** El próximo evento planeado es de máximo ~80 personas. | — |
| D6 | Pagos (IAP, RevenueCat, Mercado Pago, Stripe) | **Fuera del MVP.** Aún no se cobra. | [Fase 2](../fase-2-en-adelante/README.md) |
| D7 | Photobooks (Gelato/Prodigi), kits de señalética física, libro de visitas con audio, videos cortos | **Fuera del MVP.** | [Fase 2](../fase-2-en-adelante/README.md) |
| D8 | Moderación por lotes horarios | **Aceptado.** Se construye sobre `photoTimeline.ts`. | Fase 1 |
| D9 | Proyección financiera | **Demasiado optimista**, de acuerdo con la evaluación. No se usa para decidir nada; se rehará con datos reales. | [Fase 2](../fase-2-en-adelante/README.md) |

## Alcance añadido por el usuario (no estaba en el informe tal cual)

- **A1. Marcos configurables por evento (tenant):** el organizador planea qué marcos tiene su evento y qué se pone encima de la foto. Los invitados no crean ni editan marcos.
- **A2. Stickers que se añaden a la foto**, también definidos por el organizador.
- **A3. Toggles de recursos:** tanto cada marco como cada sticker se puede activar/desactivar por evento.

Spec: [`../fase-1-mvp-multitenant/marcos-y-stickers.md`](../fase-1-mvp-multitenant/marcos-y-stickers.md).

## Supuestos derivados

- Un solo desarrollador, un solo cliente real al inicio (el propio usuario) → se prioriza que el evento siga funcionando sobre generalidad.
- La capa de datos del evento actual (Fase 0) se **migra** al nuevo esquema como el primer evento de la plataforma, sin perder invitados ni fotos.
- El modelo de acceso de invitados por token de enlace/QR se mantiene (no se migra a Supabase Auth anónima con claims).
