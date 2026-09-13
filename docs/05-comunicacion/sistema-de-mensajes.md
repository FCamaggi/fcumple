# Sistema de envío de invitaciones por WhatsApp

> Nuevo (2026-09-13), decidido con el usuario: se agrega un asistente de envío semi-manual por WhatsApp usando links `wa.me` con el mensaje precargado. No es envío automático/masivo — cada mensaje lo despacha el admin a mano, uno por invitado, eligiendo el contacto correcto en su WhatsApp. Se descartó explícitamente una integración con WhatsApp Business API (Twilio o similar) por requerir cuenta de negocio, verificación y costo por mensaje — desproporcionado para un evento de una sola vez.

## Cómo funciona

1. En `/admin`, junto a cada invitado (en la vista de tabla completa, no en modo puerta), aparece un botón **"Enviar invitación"**.
2. Al tocarlo, se arma un mensaje de texto con el nombre del invitado, los datos reales del evento (`event_config`: nombre, fecha, hora, lugar) y el link personal `https://.../i/{token}`.
3. El botón abre `https://wa.me/?text={mensaje codificado}` — esto abre WhatsApp (app o web) con el mensaje ya escrito en el campo de texto, **sin destinatario fijado**: el admin elige a quién enviárselo desde su propia lista de contactos y aprieta enviar.
4. No se guarda ni se transmite ningún número de teléfono — el proyecto no almacena teléfonos de invitados, así que este flujo no necesita pedirlos.

## Por qué este diseño y no otro

- **Sin backend nuevo, sin costo, sin cuenta de negocio.** `wa.me` es un link público de WhatsApp, no una API que haya que contratar ni autenticar.
- **El admin sigue siendo dueño del envío real.** Nada se manda solo — hay una decisión humana en el medio (elegir el contacto correcto), lo cual también evita mandarle el link equivocado a la persona equivocada por un error de datos.
- **No pide teléfono a nadie.** Si más adelante se quisiera un link que abra directo la conversación con un contacto específico (`https://wa.me/56912345678?text=...`), hace falta agregar un campo `phone` opcional a `guests` — no se hizo ahora porque no fue parte del pedido y agrega superficie de datos (un teléfono es un dato personal más para proteger) sin necesidad real: el admin igual tiene que elegir el contacto, ya lo tiene guardado en su teléfono.

## Plantilla del mensaje

```
¡Hola {nombre}! 🎉 Estás invitado/a a mi cumpleaños.

📅 {fecha en formato "viernes 9 de octubre de 2026"}
🕙 {hora, ej. "22:00 hrs"}
📍 {lugar, ej. "Pasaje Argentina 2299, Independencia"}

Confirma tu asistencia acá (y avísame si vienes con alguien más):
{link personal}

¡Espero verte ahí!
```

El texto exacto vive en el código (no en este documento) para que siempre use los datos reales de `event_config` en vez de un valor pegado a mano que se puede desactualizar.

## Qué NO hace este sistema (alcance explícito)

- No manda mensajes automáticamente ni en lote — sigue habiendo un clic humano por invitado, dentro de WhatsApp.
- No hace seguimiento de si el mensaje se leyó o se envió realmente — eso es responsabilidad del admin, igual que hoy copiando y pegando el link a mano.
- No agrega ningún campo de teléfono a la base de datos (ver nota de arriba).
- No reemplaza la [guía de configuración de CI/CD](../06-operaciones/SETUP.md) ni ningún otro flujo existente — es una utilidad nueva, aditiva, dentro de `/admin`.
