# Marcos listos de un evento

Scripts genéricos para cargar como marcos reales de un evento unas imágenes diseñadas fuera de la app (por ejemplo,
generadas con IA), con una variante por proporción (3:4, 4:3, 1:1, 9:16) y capas de texto encima. La cámara del
invitado ofrece cada marco según la proporción elegida; un marco sin variante para esa proporción se oculta.

Los datos de cada cliente (spec, imágenes, SQL generado) **no van en este repositorio**, que es público. Viven en la
carpeta del cliente dentro del repositorio privado de clientes, por ejemplo `<repo-clientes>/<cliente>/marcos/`. Los
scripts reciben esa carpeta como argumento y escriben ahí mismo.

## La carpeta de marcos

```text
<dir-marcos>/
  marcos-listos.spec.json     el diseño: fuente de verdad
  ia/<imagen>.png             originales con transparencia (los entrega quitar-fondo-negro.py)
  listos/<imagen>.webp        generados por preparar-marcos.py
  cargar-marcos-listos.sql    generado por preparar-marcos.py
```

## Formato del spec

Ejemplo ficticio con un solo marco y dos proporciones:

```json
{
  "event_slug": "fiesta-demo-x1y2",
  "default_frame_label": "A · Estrellas",
  "frames": [
    {
      "label": "A · Estrellas",
      "variants": {
        "3:4": {
          "image": "A-estrellas-3x4",
          "texts": [
            { "type": "text", "text": "FIESTA DEMO", "x": 0.5, "y": 0.9, "size": 0.05, "w": 0.6,
              "font": "anton", "weight": "bold", "color": "#ffffff",
              "strokeColor": "#3b82f6", "strokeWidth": 0.006,
              "shadow": { "color": "#3b82f6", "blur": 0.03, "x": 0, "y": 0 } }
          ]
        },
        "9:16": { "image": "A-estrellas-9x16", "texts": [] }
      }
    }
  ]
}
```

- `event_slug`: el slug del evento en `public.events`.
- `frames[].label`: la etiqueta del marco. Es la clave de idempotencia: el SQL reemplaza solo los marcos con estas
  etiquetas.
- `variants`: una entrada por proporción. `image` es el nombre del archivo sin extensión (`ia/<image>.png` →
  `listos/<image>.webp`); `texts` son capas de texto del Estudio, con coordenadas relativas (0 a 1). Las capas de
  nivel superior del marco copian la variante 3:4 (o la primera, si no hay 3:4).
- `default_frame_label` (opcional): la etiqueta que aparece en la línea comentada para fijar el marco
  predeterminado. Si falta, se usa el primer marco.

## Procedimiento (en este orden)

1. **Generar las imágenes** sobre fondo negro, una por proporción.
2. **Quitar el fondo negro** de cada una:
   `python3 scripts/marcos/quitar-fondo-negro.py bruto.png <dir-marcos>/ia/A-estrellas-3x4.png --lado 1600`.
   La luminosidad pasa a ser opacidad, así que sirve para brillos neón, no para piezas negras u oscuras (esas se hacen
   como capas en el Estudio).
3. **Preparar**: `python3 scripts/marcos/preparar-marcos.py <dir-marcos>`. Deja cada imagen en `listos/` (lado largo
   ≤ 1600 px y < 1 MiB, WebP con calidad descendente desde 85) y regenera `cargar-marcos-listos.sql`.
4. **Subir las imágenes** al Storage del evento. Primero en seco, sin red ni claves:
   `node scripts/marcos/subir-marcos.mjs <dir-marcos> --dry-run`. Luego la subida real:
   `SUPABASE_URL=https://<proyecto>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<clave> node scripts/marcos/subir-marcos.mjs <dir-marcos>`.
   Sube a `event-assets/<id del evento>/frames/<imagen>.webp` y sobrescribe si se repite. La clave de servicio es
   secreta: no la pegues en ningún archivo ni la empujes.
5. **Cargar los marcos**: la persona dueña del proyecto pega `cargar-marcos-listos.sql` en el editor SQL de Supabase y
   lo ejecuta. Es idempotente: borra y vuelve a crear solo los marcos con las etiquetas del spec y deja intactos los
   demás marcos del evento. Hazlo **después** del paso 4: sin las imágenes en Storage el invitado vería los marcos sin
   imagen.
6. **Marco predeterminado (opcional)**: al final del SQL hay un `update public.events set default_frame_id = …`
   comentado. No se ejecuta salvo que lo descomentes.

## Por qué el SQL no va en una migración

Las migraciones de `supabase/migrations` son el esquema común a todos los eventos y están en un repositorio público. Los
datos de un evento concreto (su slug, sus etiquetas, sus textos) se cargan por SQL en el editor de Supabase, nunca en
una migración.
