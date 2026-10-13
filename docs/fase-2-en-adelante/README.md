# Fase 2 en adelante — Backlog

Todo lo que se evaluó en el [informe original](../estrategia/informe-original-burn-camera.md) y quedó fuera de la [Fase 1](../fase-1-mvp-multitenant/README.md). Los ítems son candidatos, **no compromisos**; el orden es una sugerencia y se ajusta con datos reales de uso.

Cuando un ítem se decida construir: se escribe su spec en una carpeta de fase nueva y aquí queda una línea que apunta a ella.

## Fase 2 — Operar la plataforma como producto

| # | Ítem | Notas |
|---|---|---|
| 2.1 | **Planes y límites** (invitados, fotos, retención, marca de agua) | Requiere decidir precios con datos; el informe proponía Free / $19 / $49 / $99. |
| 2.2 | **Pagos web** | Mercado Pago primero (Chile); Stripe después. Sin IAP ni RevenueCat al ser solo web. |
| 2.3 | **Hosting comercial** | Vercel Hobby no permite uso comercial: pasar a Pro, o a Cloudflare Pages. Supabase Pro (sin pausa, backups diarios) antes del primer evento de pago. |
| 2.4 | **Organizaciones con varios miembros** | Tabla `organizations`; hoy el tenant es el organizador. |
| 2.5 | **Términos, privacidad y reporte de abusos** | Necesario antes de abrir a terceros. Ley chilena de datos personales; GDPR si hay usuarios europeos. |
| 2.6 | **Descarga de la galería en ZIP** | Sobre la Web Share API ya existente para fotos individuales. |
| 2.7 | **Identificación reforzada** | Correo o código por SMS como segundo factor, sesiones por dispositivo con revocación individual, aviso de privacidad completo (Ley 21.719). Ver [`acceso-de-invitados.md`](../fase-1-mvp-multitenant/acceso-de-invitados.md). |

## Fase 3 — Experiencia en vivo y marcos avanzados

| # | Ítem | Notas |
|---|---|---|
| 3.1 | **Muro en vivo** (`/e/:slug/live`) | Supabase Realtime; modos cuadrícula/foto destacada; QR flotante. Revisar el tope de 200 conexiones. |
| 3.2 | **Variables por invitado en marcos** | `{{guest_name}}` y similares; hoy los textos de los marcos son fijos por evento. Extiende [`marcos-y-stickers.md`](../fase-1-mvp-multitenant/marcos-y-stickers.md). |
| 3.3 | **Marcos PNG propios y editor libre** | Subir un marco ya diseñado, logos de patrocinadores, QR secundarios, composición libre de capas. |
| 3.4 | **Packs de la plataforma** | Plantillas, paletas y stickers temáticos (bodas, cumpleaños, corporativo). |
| 3.5 | **Guardar original sin stickers** | Para poder re-componer o des-aplicar después. |
| 3.5b | **Emojis consistentes entre dispositivos** | Conjunto abierto empaquetado (Noto, Twemoji o Fluent) si la mezcla de estilos nativos molesta. Los emojis de Apple no son redistribuibles. |
| 3.6 | **Moderación delegada** | Rol "moderador" invitado por el organizador; gestos de swipe tipo tarjeta; VIP. |
| 3.7 | **Captura offline** | Cola en IndexedDB con Service Worker y sincronización en segundo plano. |

## Fase 4 — Almacenamiento y escala

| # | Ítem | Notas |
|---|---|---|
| 4.1 | **Cloudflare R2 + Workers** (URLs prefirmadas) | Cuando el egress de Supabase sea un problema. $0 de egress, $0,015/GB. |
| 4.2 | **Pruebas de carga** a 500 conexiones | Sólo si aparecen eventos grandes. |
| 4.3 | **Reglas de retención** automáticas | Borrado de galerías vencidas. |

## Fase 5 — Extensiones de monetización y contenido

| # | Ítem | Notas |
|---|---|---|
| 5.1 | **Libro de visitas** con nota de texto/voz (hasta 15 s) | Asociado a cada foto. |
| 5.2 | **Videos cortos** | Peso y almacenamiento obligan a revisar límites. |
| 5.3 | **Photobooks** por API (Gelato o Prodigi) | Gelato por cobertura LatAm; Prodigi por precios claros y `/Quotes`. Requiere logística y soporte. |
| 5.4 | **Señalética QR** en PDF vectorial 300 DPI | Descarga gratuita primero; kit físico después. |

## Descartado (sin plan de retomarlo)

- App nativa React Native/Expo, iOS App Clips, Google Play Instant, monorepo Turborepo.
- Next.js.
- IAP y RevenueCat (sólo relevantes con app nativa).

Si algún día vuelve a considerarse una app nativa, los riesgos están descritos en [`../estrategia/evaluacion-de-factibilidad.md`](../estrategia/evaluacion-de-factibilidad.md).

## Rehacer las finanzas

La proyección del informe (conversiones de 2% a 5%, margen de ~89%) se considera demasiado optimista. Antes de fijar precios:

1. Medir el costo real por evento (storage, egress, soporte) con 2–3 eventos.
2. Incluir impuestos (IVA), comisiones de pasarela y tiempo de soporte.
3. Construir 3 escenarios (pesimista/base/optimista) con conversiones de 0,5%, 1% y 2%.
