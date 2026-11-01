# Pipeline de Generación de Fuentes Tipográficas con IA

Este módulo permite convertir un alfabeto dibujado por un modelo de imagen de IA (por ejemplo, ChatGPT / DALL-E) en fuentes tipográficas reales utilizables en la web y en la cámara de fotos de la aplicación (`.otf` y `.woff2`).

---

## 1. ¿Cómo funciona?

1. **Plantilla**: Se generan 3 hojas apaisadas (1536x1024) con una cuadrícula de 8 columnas por 4 filas (96 celdas en total). Cada celda contiene la letra de referencia en la esquina superior izquierda y líneas guía claras para altura de mayúsculas (*cap height*), altura x (*x-height*) y línea de base (*baseline*).
2. **Dibujo con IA**: El propietario entrega cada plantilla al modelo de imagen con un prompt guiado para dibujar cada carácter en tinta negra sobre las guías en un estilo específico.
3. **Extracción y vectorización**: El script `armar-fuente.py` procesa las imágenes resultantes (`relleno-1.png`..`relleno-3.png`), detecta las celdas mediante perfiles de proyección horizontal y vertical, elimina las guías y etiquetas grises, vectoriza los trazos con curvas Bézier suaves (`potrace`), normaliza las coordenadas a 1000 unidades tipográficas por em y genera la fuente OpenType (CFF) y su versión comprimida WOFF2.

---

## 2. Repertorio de caracteres (88 caracteres)

El repertorio cubre el español completo, números y los signos de puntuación más comunes:
- **Mayúsculas**: A-Z, Á, É, Í, Ó, Ú, Ñ, Ü (33 caracteres)
- **Minúsculas**: a-z, á, é, í, ó, ú, ñ, ü (33 caracteres)
- **Números**: 0-9 (10 caracteres)
- **Puntuación y símbolos**: `.`, `,`, `·`, `-`, `!`, `?`, `'`, `&`, `:`, `/`, `(`, `)` (12 caracteres)
- **Espacio**: Generado automáticamente con métricas estándar.

---

## 3. Guía paso a paso para el propietario

### Paso 1: Generar las plantillas vacías

Ejecuta `plantilla.py` especificando el directorio de destino:

```bash
python scripts/fuentes/plantilla.py /ruta/a/plantillas
```

Esto creará:
- `plantilla-1.png` (Mayúsculas A-Z y Á, É, Í, Ó, Ú, Ñ)
- `plantilla-2.png` (Ü, minúsculas a-z y á, é, í, ó, ú)
- `plantilla-3.png` (ñ, ü, números 0-9 y signos de puntuación)
- `plantilla.json` (geometría de celdas, proporciones y repertorio)

---

### Paso 2: Dibujar con ChatGPT / Modelo de imagen

Sube cada imagen de plantilla (`plantilla-1.png`, `plantilla-2.png`, `plantilla-3.png`) a ChatGPT (o la herramienta de generación de imágenes que prefieras) y utiliza el siguiente prompt:

#### Prompt listo para copiar y pegar:

> **Instrucciones para la IA:**
> "Adjunto una plantilla de cuadrícula con celdas y guías tipográficas. En cada celda hay una letra o símbolo de referencia en color gris claro en la esquina superior izquierda.
> 
> Por favor, dibuja exactamente un glifo por celda correspondiente a su carácter de referencia, siguiendo estas reglas estrictas:
> 1. **Estilo visual:** [DESCRIBE AQUÍ EL ESTILO, ej.: Letras caligráficas elegantes estilo gala formal, serif refinado con contraste de trazos gruesos y finos, trazos limpios y seguros].
> 2. **Tinta:** Dibuja únicamente en color negro puro o grafito oscuro sobre las guías.
> 3. **Alineación:** Usa la línea guía inferior como línea de base (baseline) y respeta la línea de altura de mayúsculas (cap-height) y altura x. Deja que los descendentes (como p, q, g, j, y) bajen por debajo de la línea de base.
> 4. **Estructura:** No borres los bordes de la cuadrícula. Mantén el fondo completamente blanco y no agregues textos, decoraciones adicionales, sombras externas ni ilustraciones fuera de las celdas.
> 5. **Completitud:** Dibuja todos los caracteres requeridos en la hoja sin omitir celdas asignadas.
> 
> Devuelve la imagen completa con la cuadrícula completa en alta definición."

Guarda los resultados como:
- `relleno-1.png`
- `relleno-2.png`
- `relleno-3.png`

---

### Paso 3: Armar la fuente tipográfica

Ejecuta `armar-fuente.py` indicando la carpeta con las hojas rellenas, la carpeta de salida y el nombre de la familia:

```bash
python scripts/fuentes/armar-fuente.py /ruta/a/hojas_rellenas /ruta/a/fuentes_salida --familia "Gala Romana" [--id gala-romana]
```

El script imprimirá en pantalla una tabla de resumen con el estado de cada celda y los archivos generados.

`--espaciado` fija el margen a cada lado de una letra como fracción de la altura de las mayúsculas (por defecto `0.03`, entre 0 y 0.5). Súbelo para una fuente más aireada, por ejemplo en mayúsculas grabadas, o bájalo para una caligrafía que debe enlazar.

`--metricas` elige cómo se mide el ancho de cada letra:
- `caja` (por defecto) usa el contorno completo. Sirve para letras rectas.
- `cuerpo` usa solo la franja entre la línea de base y la altura de las minúsculas. Así los rasgos y las colas de una caligrafía inclinada se montan sobre la letra vecina, como en una fuente cursiva real.

Valores que funcionaron con hojas reales de Gemini:

| Estilo | `--espaciado` | `--metricas` |
|---|---|---|
| Caligrafía inclinada | 0.04 | cuerpo |
| Romana con versalitas | 0.05 | caja |
| Art déco alta y angosta | 0.03 | caja |

Limpieza automática de cada celda:
- se descartan las astillas finas y largas del borde, porque el modelo redibuja la cuadrícula un poco corrida;
- se descartan las piezas sueltas que tocan el borde y quedan enteras sobre la línea de mayúsculas o bajo la línea de base, que son colas o cabezas de las letras de la fila vecina; en las letras con tilde, diéresis o punto se conserva lo de arriba;
- el «·» siempre se reconstruye a partir del punto, subido a media altura de las minúsculas, porque los modelos dibujan «;» o un punto bajo.

**Requisitos:** Python 3 con Pillow, numpy, scipy, fontTools, brotli (para WOFF2) y `potracer`, la versión en Python puro de potrace. Conviene instalarlos en un entorno virtual fuera del repositorio: `python3 -m venv <dir> && <dir>/bin/pip install pillow numpy scipy fonttools brotli potracer`.

---

### Paso 4: Dónde van los resultados

Los archivos de salida se guardarán en el directorio indicado:
- `<id>.otf`: Fuente OpenType con contornos PostScript (CFF) para diseño e instalación.
- `<id>.woff2`: Fuente web optimizada y comprimida para la aplicación de cámara.

Para que la cámara pueda usar la fuente generada:
1. Copia `<id>.woff2` a `public/fonts/`.
2. Agrega el id a `WEB_FONTS` y `CATALOG_FONTS`, con su `FONT_LABELS`, su `FONT_STACKS` (la familia primero) y su `WEB_FONT_FACES` (con `loadFontFile`), en `src/lib/cameraAssets/text.ts`.
3. Agrega una migración que amplíe la lista de fuentes de `valid_frame_layer`, regenera `supabase/setup-fase-1.sql` (`npm run build:setup-sql`) y suma la migración a la lista de `supabase/tests/prune.test.ts`.
4. Usa un nombre de familia neutro: este repositorio es público y la fuente no debe llevar el nombre de un cliente.

---

## 4. Pruebas automatizadas

El archivo `prueba_fuentes.py` incluye una prueba de integración unitaria (`unittest`) de ida y vuelta que:
1. Genera las plantillas vacías.
2. Rellena las plantillas utilizando una fuente TrueType instalada en el sistema (`DejaVuSerif.ttf`), simulando el comportamiento del LLM (reescala a 1600x1066 y añade ruido).
3. Ejecuta `armar-fuente.py`.
4. Valida que el archivo OTF cargue con `fontTools`, contenga entradas en el `cmap` para todos los caracteres del repertorio, que los glifos tengan contornos vectoriales no vacíos y anchos de avance positivos, y que renderizar la palabra `"Fiesta"` con PIL produzca tinta en pantalla.

Para ejecutar la prueba:

```bash
python scripts/fuentes/prueba_fuentes.py
```

---

## 5. Limitaciones conocidas

1. **Distorsión geométrica extrema en modelos de imagen**: Si el modelo de imagen produce una perspectiva inclinada o alabeada de la hoja, la proyección ortogonal puede sufrir desplazamientos en celdas periféricas (aunque el algoritmo busca los bordes locales dentro de un radio de tolerancia y cuenta con fallback nominal).
2. **Consistencia de peso entre hojas**: Dado que las hojas se procesan en llamadas independientes a la IA, el grosor del trazo (*stroke weight*) puede variar ligeramente entre la Hoja 1 y la Hoja 3. Se recomienda recordar el estilo en el prompt para mantener coherencia.
3. **Kerning**: El pipeline calcula espaciado proporcional automático con márgenes laterales (*side bearings*) simétricos basados en la altura del glifo. No genera pares de ajuste manual (*kerning pairs* como AV, To), lo cual es habitual en fuentes generativas de visualización y caligrafía.
4. **Hinting**: Los glifos generados son curvas Bézier directas sin instrucciones manuales de hinting para baja resolución en pantalla (adecuados para títulos y textos en resolución fotográfica de marco).
