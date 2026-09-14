# Sistema de envío de invitaciones por WhatsApp

> Nuevo (2026-09-13), decidido con el usuario: se agrega un asistente de envío semi-manual por WhatsApp usando links `wa.me` con el mensaje precargado. No es envío automático/masivo — cada mensaje lo despacha el admin a mano, uno por invitado. Se descartó explícitamente una integración con WhatsApp Business API (Twilio o similar) por requerir cuenta de negocio, verificación y costo por mensaje — desproporcionado para un evento de una sola vez.
>
> Actualizado (2026-09-13), tras probarlo con el usuario: el mensaje ahora usa solo el primer nombre del invitado (más corto y directo), los emoji se escriben en el código como escapes `\u{...}` explícitos (blindaje contra mojibake al editar el archivo desde otro entorno/encoding), y se agregó un campo opcional `guests.phone` para armar un link directo a la conversación de ese contacto en vez de dejar que el admin lo elija a mano cada vez.

## Cómo funciona

1. En `/admin`, junto a cada invitado (en la vista de tabla completa, no en modo puerta), aparece un botón **"Enviar invitación"**.
2. Al tocarlo, se arma un mensaje de texto con el primer nombre del invitado, los datos reales del evento (`event_config`: nombre, fecha, hora, lugar) y el link personal `https://.../i/{token}`.
3. El botón abre WhatsApp con el mensaje ya escrito en el campo de texto:
   - Si el invitado tiene un teléfono cargado (`guests.phone`, opcional, se edita en la ficha del admin), abre `https://wa.me/{numero}?text={mensaje codificado}` — directo a la conversación de ese contacto.
   - Si no tiene teléfono cargado, abre `https://wa.me/?text={mensaje codificado}` — **sin destinatario fijado**: el admin elige a quién enviárselo desde su propia lista de contactos y aprieta enviar.
4. El teléfono es opcional y lo carga el admin a mano (no se importa de ningún otro lado); si no se carga, el flujo sigue funcionando exactamente igual que antes (selector manual de contacto).

## Por qué este diseño y no otro

- **Sin backend nuevo, sin costo, sin cuenta de negocio.** `wa.me` es un link público de WhatsApp, no una API que haya que contratar ni autenticar.
- **El admin sigue siendo dueño del envío real.** Nada se manda solo — sigue habiendo un clic humano por invitado dentro de WhatsApp, incluso con el link directo.
- **El teléfono es opcional y sensible.** `guests.phone` es nullable, sin constraint de formato, y solo se muestra en la ficha de edición del admin (nunca en la tabla ni en ninguna vista guest-facing) — es un dato personal más para proteger, así que se pidió explícitamente al usuario antes de agregarlo, y solo se usa para construir el link, nunca se expone a otras pantallas.

## Plantilla del mensaje

```
¡Hola {primer nombre}! Estás invitado/a a mi cumpleaños.

Fecha: {fecha en formato "viernes 9 de octubre de 2026"}
Hora: {hora, ej. "22:00 hrs"}
Lugar: {lugar, ej. "Pasaje Argentina 2299, Independencia"}

Confirma tu asistencia acá (y avísame si vienes con alguien más):
{link personal}

¡Espero verte ahí!
```

El texto exacto vive en el código (no en este documento) para que siempre use los datos reales de `event_config` en vez de un valor pegado a mano que se puede desactualizar.

**Sin emoji, a propósito.** Un primer intento usaba 🎉📅🕙📍, con y sin escapes `\u{...}` en el código fuente — probado en WhatsApp Desktop real, llegaban como "�" (mojibake) en ambos casos, así que el problema no era el encoding del archivo fuente como se sospechó al principio. En vez de seguir adivinando dónde exactamente se rompen (¿`wa.me`? ¿el cliente de escritorio en Windows? ¿una fuente sin esos glifos instalada?), se sacaron del mensaje: etiquetas de texto simples ("Fecha:", "Hora:", "Lugar:") no dependen de ningún encoding ni de qué fuente tenga instalada quien lo reciba.

El nombre se recorta al primer nombre: se separa por el primer espacio tras recortar espacios sobrantes; si el invitado no tiene apellido cargado (sin espacio), se usa el nombre completo tal cual.

## El preview del link (la imagen, sin adjuntar nada a mano)

WhatsApp (y la mayoría de apps) arman el preview de un link leyendo las meta tags `og:image`/`og:title`/`og:description` de la página, sin ejecutar JavaScript. Como esta app es un SPA sin SSR, `index.html` es el mismo archivo para cualquier ruta (`/`, `/i/{token}`, `/evento`) — así que **la imagen aparece como preview en cualquier link que se comparta**, sin tener que adjuntarla a mano en cada envío.

- `index.html` tiene `og:image` apuntando a `https://fcumple-ten.vercel.app/og-image.jpg` (1200×630, el tamaño estándar de Open Graph, ~110KB).
- **Corrección real (2026-09-14):** el primer intento usaba el flyer con todo el texto incrustado, en su formato original 4:5 (~1122×1402, ~2.8MB). Probado en producción: WhatsApp nunca mostró el preview, solo título+descripción. Causa más probable: el tamaño/proporción — 2.8MB y una imagen más alta que ancha están lejos de lo que Open Graph recomienda (1200×630, idealmente bajo unos cientos de KB), y varios clientes fallan en silencio en vez de avisar el motivo. Se corrigió generando `og-image.jpg` desde `assets/avisos-fuente/invitacion-cover.png` (ya 16:9, sin texto incrustado), recortado/comprimido a 1200×630 JPEG. Si se regenera la imagen fuente, hay que repetir ese recorte/compresión — no copiar el PNG pesado tal cual a `public/`.
- El preview de WhatsApp se cachea agresivamente por link — si cambia la imagen después de que alguien ya vio el preview viejo, esa persona puede seguir viendo la versión anterior.

## Qué NO hace este sistema (alcance explícito)

- No manda mensajes automáticamente ni en lote — sigue habiendo un clic humano por invitado, dentro de WhatsApp.
- No hace seguimiento de si el mensaje se leyó o se envió realmente — eso es responsabilidad del admin, igual que hoy copiando y pegando el link a mano.
- No valida ni normaliza el formato del teléfono al guardarlo — solo se limpian caracteres no numéricos (espacios, guiones, paréntesis, el "+" inicial) al construir el link `wa.me`.
- No reemplaza la [guía de configuración de CI/CD](../06-operaciones/SETUP.md) ni ningún otro flujo existente — es una utilidad nueva, aditiva, dentro de `/admin`.
