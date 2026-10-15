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

## Ronda 2 (2026-10-13): acceso de invitados y contenido de marcos

| # | Tema | Decisión | Dónde queda |
|---|---|---|---|
| D10 | Enlaces `/i/:token` por invitado | **Se eliminan.** Hubo un solo evento y ya pasó; no se conserva compatibilidad ni se migran datos. | [`acceso-de-invitados.md`](../fase-1-mvp-multitenant/acceso-de-invitados.md) |
| D11 | Cómo se entrega el acceso | **Un solo enlace/QR por evento**, el mismo para todos. Mandar un link a cada invitado (con su teléfono) es incómodo. | idem |
| D12 | Identificación del invitado | Se pensó por RUT; ver D16, que lo reemplaza. | idem |
| D13 | Marcos actuales | **Se retiran.** Tienen texto incrustado y el contenido cambia por evento. | [`marcos-y-stickers.md`](../fase-1-mvp-multitenant/marcos-y-stickers.md) |
| D14 | Marcos nuevos | **Genéricos y paramétricos**: colores y textos editables por el organizador. | idem |
| D15 | Stickers | **Emojis** (estilo iPhone mediante la fuente del dispositivo) **e imágenes subidas** por el organizador. | idem |
| D16 | RUT | **No se guarda.** La búsqueda por RUT se haría con un servicio externo de identidad que devuelve el nombre; el invitado queda registrado solo por **nombre y apellido** (mínimo dos palabras). Mientras no haya proveedor, el MVP identifica por nombre y apellido. | [`acceso-de-invitados.md`](../fase-1-mvp-multitenant/acceso-de-invitados.md) |
| D17 | Despliegue | El esquema de la Fase 1 va a un **proyecto Supabase nuevo**; la Fase 0 no se toca. | [`arquitectura-multitenant.md`](../fase-1-mvp-multitenant/arquitectura-multitenant.md) |
| D18 | Raspador `rutificador_nombrerutfirma` | **Descartado** (sin licencia, raspa un sitio de terceros que hoy bloquea clientes automatizados, evade bloqueos con Tor, envía los RUT de los invitados a un tercero sin contrato). Ver [`evaluacion-rutificador-nombrerutyfirma.md`](./evaluacion-rutificador-nombrerutyfirma.md). | idem |

Nota sobre D15: los emojis de Apple no son redistribuibles, así que "estilo iPhone" se logra dibujando con la fuente nativa del dispositivo; en Android o PC se verán con el estilo de ese sistema. Un conjunto abierto consistente queda en la Fase 2.

## Supuestos derivados

- Un solo desarrollador, un solo cliente real al inicio (el propio usuario) → se prioriza que el evento siga funcionando sobre generalidad.
- **No se migra el evento de la Fase 0**: el esquema nuevo va a un proyecto Supabase nuevo y la Fase 0 no se toca.
- Dentro del sistema, el token del invitado se mantiene como secreto de sesión (así se reutilizan las RPC existentes), pero ya no se envía por invitado: lo entrega la identificación (por nombre y apellido; por RUT vía servicio externo sin guardarlo).
