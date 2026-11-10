#!/usr/bin/env python3
"""Prepara los marcos listos de un evento a partir de su carpeta de marcos:
1. Convierte las imágenes PNG con transparencia de <dir>/ia/<image>.png a <dir>/listos/<image>.webp,
   reduciendo el lado largo a un máximo de 1600 px (LANCZOS) y optimizando en WebP (method=6)
   con calidad descendente hasta que cada archivo pese menos de 1 MiB.
2. Detecta la ventana de la foto de cada imagen (el hueco transparente, misma regla que `detectWindow` en
   src/lib/cameraAssets/capture.ts) para la escala del capturador.
3. Imprime una tabla resumen con dimensiones, peso, calidad y ventana.
4. Genera <dir>/cargar-marcos-listos.sql de forma idempotente a partir de <dir>/marcos-listos.spec.json.
   Las imágenes con ventana llevan `capture` con la escala de la variante (`scale` en el spec, 1,1 por defecto).

Uso:
    python3 scripts/marcos/preparar-marcos.py <dir-marcos>
"""

import io
import json
import sys
from pathlib import Path

from PIL import Image

MAX_BYTES = 1048576  # 1 MiB (1024 * 1024 bytes)
MAX_LONG_SIDE = 1600
DEFAULT_CAPTURE_SCALE = 1.1
WINDOW_SAMPLE_SIDE = 256  # la ventana se busca en una copia chica: es una fracción y no necesita detalle
MIN_WINDOW_AREA = 0.05
SPEC_NAME = "marcos-listos.spec.json"
SQL_NAME = "cargar-marcos-listos.sql"
USAGE = (
    "Uso: python3 scripts/marcos/preparar-marcos.py <dir-marcos>\n"
    f"  <dir-marcos> es la carpeta del cliente con {SPEC_NAME} e ia/*.png.\n"
    f"  Escribe listos/*.webp y {SQL_NAME} dentro de esa misma carpeta."
)


def unique_images(spec: dict) -> list:
    """Unique variant image names, in order of appearance in the spec."""
    seen = set()
    names = []
    for frame in spec.get("frames", []):
        for var_data in frame.get("variants", {}).values():
            name = var_data.get("image")
            if name and name not in seen:
                seen.add(name)
                names.append(name)
    return names


def detect_window(im: Image.Image):
    """Ventana de la foto: el hueco transparente (alfa < 128) más grande que no toque el borde y ocupe al menos
    el 5 %, como rectángulo envolvente normalizado. None si no hay (PNG transparente de borde a borde, opaco).
    Misma regla que `detectWindow` en src/lib/cameraAssets/capture.ts."""
    small = im.copy()
    small.thumbnail((WINDOW_SAMPLE_SIDE, WINDOW_SAMPLE_SIDE), Image.Resampling.BILINEAR)
    width, height = small.size
    alpha = small.getchannel("A").tobytes()
    n = width * height
    seen = bytearray(n)
    best = None
    for start in range(n):
        if seen[start] or alpha[start] >= 128:
            continue
        stack = [start]
        seen[start] = 1
        area, touches = 0, False
        x0, y0, x1, y1 = width, height, -1, -1
        while stack:
            p = stack.pop()
            y, x = divmod(p, width)
            area += 1
            if x == 0 or y == 0 or x == width - 1 or y == height - 1:
                touches = True
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
            for q, ok in ((p - 1, x > 0), (p + 1, x < width - 1), (p - width, y > 0), (p + width, y < height - 1)):
                if ok and not seen[q] and alpha[q] < 128:
                    seen[q] = 1
                    stack.append(q)
        if not touches and area >= n * MIN_WINDOW_AREA and (best is None or area > best[0]):
            best = (area, x0, y0, x1, y1)
    if best is None:
        return None
    _, x0, y0, x1, y1 = best
    return {
        "x": round(x0 / width, 4),
        "y": round(y0 / height, 4),
        "w": round((x1 - x0 + 1) / width, 4),
        "h": round((y1 - y0 + 1) / height, 4),
    }


def process_images(spec: dict, ia_dir: Path, listos_dir: Path) -> list:
    """Converts each variant to optimized WebP (< 1 MiB) and returns stats."""
    listos_dir.mkdir(parents=True, exist_ok=True)
    stats = []

    for img_name in unique_images(spec):
        src_png = ia_dir / f"{img_name}.png"
        out_webp = listos_dir / f"{img_name}.webp"

        if not src_png.is_file():
            raise FileNotFoundError(f"No se encontró la imagen original requerida: {src_png}")

        with Image.open(src_png) as im:
            # Keep transparency by forcing RGBA
            if im.mode != "RGBA":
                im = im.convert("RGBA")

            # Downscale with LANCZOS only above MAX_LONG_SIDE, never upscale
            w, h = im.size
            long_side = max(w, h)
            if long_side > MAX_LONG_SIDE:
                scale = MAX_LONG_SIDE / long_side
                im = im.resize((round(w * scale), round(h * scale)), Image.Resampling.LANCZOS)
                w, h = im.size

            # WebP with method=6 and descending quality (85, 80, ... 40)
            chosen_data = None
            chosen_quality = None
            for q in range(85, 39, -5):
                buf = io.BytesIO()
                im.save(buf, format="WEBP", method=6, quality=q)
                if buf.tell() < MAX_BYTES:
                    chosen_data = buf.getvalue()
                    chosen_quality = q
                    break

            if chosen_data is None:
                raise RuntimeError(
                    f"Error: La imagen '{src_png.name}' no pudo reducirse a menos de 1 MiB "
                    f"({MAX_BYTES} bytes) incluso con calidad 40."
                )

            out_webp.write_bytes(chosen_data)
            stats.append({
                "image": img_name,
                "window": detect_window(im),
                "name": f"{img_name}.webp",
                "pixels": f"{w}x{h}",
                "kb": len(chosen_data) / 1024.0,
                "bytes": len(chosen_data),
                "quality": chosen_quality,
            })

    return stats


def print_table(stats: list) -> None:
    """Prints name, pixels, KB, quality used and the total in MB."""
    print(f"\n{'Nombre':<22} | {'Píxeles':<11} | {'KB':>8} | {'Calidad':>8} | Ventana")
    print("-" * 72)
    total_bytes = 0
    for s in stats:
        total_bytes += s["bytes"]
        q_str = f"q={s['quality']}"
        win = s.get("window")
        win_str = f"{win['w'] * win['h'] * 100:.0f} %" if win else "sin ventana"
        print(f"{s['name']:<22} | {s['pixels']:<11} | {s['kb']:>8.1f} | {q_str:>8} | {win_str}")
    print("-" * 72)
    total_mb = total_bytes / (1024.0 * 1024.0)
    print(f"Total: {len(stats)} archivos | {total_mb:.2f} MB\n")


def sql_quote(value: str) -> str:
    return value.replace("'", "''")


def comment_text(value: str) -> str:
    """Keeps spec text inside a single `--` comment line."""
    return " ".join(str(value).splitlines())


def body_tag(body: str) -> str:
    """Returns a dollar-quote tag that does not occur in the block body."""
    tag, n = "$marcos$", 0
    while tag in body:
        n += 1
        tag = f"$marcos{n}$"
    return tag


def build_sql(spec: dict, windows: dict | None = None) -> str:
    """Builds the idempotent SQL that replaces only the spec's own frames, matched by label.
    `windows` maps image name → detected window (or None); images with a window get `capture`."""
    windows = windows or {}
    event_slug = spec["event_slug"]
    frames = spec.get("frames", [])
    labels_sql = ", ".join(f"'{sql_quote(f['label'])}'" for f in frames)

    header = [
        f"-- Carga de marcos listos para el evento «{comment_text(event_slug)}» (plantilla capas).",
        "--",
        "-- IMPORTANTE:",
        "-- 1. Antes de ejecutar este script en la base de datos, deben subirse las imágenes WebP",
        "--    a Supabase Storage ejecutando: node scripts/marcos/subir-marcos.mjs <dir-marcos>",
        "-- 2. Este script es IDEMPOTENTE: para cada marco del spec, elimina únicamente las filas",
        "--    con exactamente esa misma etiqueta (label) y vuelve a insertar la fila actualizada",
        "--    con sort_order consecutivo. Respeta cualquier otro marco que tenga el evento.",
        "--",
    ]
    lines = [
        "declare",
        "  v_event uuid;",
        "  v_base_order integer;",
        "begin",
        "  select id into v_event",
        "  from public.events",
        f"  where slug = '{sql_quote(event_slug)}';",
        "",
        "  if v_event is null then",
        f"    raise exception 'No existe el evento con slug «%» en public.events.', '{sql_quote(event_slug)}';",
        "  end if;",
        "",
        "  -- Base de sort_order calculada sobre las filas que NO se borraron",
        "  select coalesce(max(sort_order), -1) + 1 into v_base_order",
        "  from public.event_frames",
        "  where event_id = v_event",
        f"    and label not in ({labels_sql});",
        "",
    ]

    for idx, frame in enumerate(frames):
        label = frame["label"]
        escaped_label = sql_quote(label)

        variants = {}
        for ratio, var_data in frame.get("variants", {}).items():
            img_layer = {
                "type": "image",
                "src": f"__EVENT__/frames/{var_data['image']}.webp",
                "full": True,
            }
            window = windows.get(var_data["image"])
            if window:
                img_layer["capture"] = {**window, "scale": var_data.get("scale", DEFAULT_CAPTURE_SCALE)}
            variants[ratio] = {"layers": [img_layer] + var_data.get("texts", [])}

        if not variants:
            raise ValueError(f"Error: El marco «{label}» no tiene variantes en el spec.")
        # Top-level layers mirror the 3:4 variant (the camera's default ratio); fall back to the first one.
        base = variants.get("3:4") or next(iter(variants.values()))
        params = {"layers": base["layers"], "variants": variants}
        json_str = json.dumps(params, ensure_ascii=False, separators=(",", ":"))

        lines.append(f"  -- Marco {idx + 1}: {comment_text(label)}")
        lines.append(f"  delete from public.event_frames where event_id = v_event and label = '{escaped_label}';")
        lines.append("  insert into public.event_frames (event_id, template, label, sort_order, params) values")
        lines.append(
            f"    (v_event, 'capas', '{escaped_label}', v_base_order + {idx}, "
            f"replace('{sql_quote(json_str)}', '__EVENT__', v_event::text)::jsonb);"
        )
        lines.append("")

    # Optional default frame: always emitted commented out, the owner decides whether to run it.
    default_label = spec.get("default_frame_label") or (frames[0]["label"] if frames else None)
    if default_label:
        lines.extend([
            f"  -- Por si el cliente desea fijar «{comment_text(default_label)}» como marco predeterminado, descomentar la siguiente línea:",
            "  -- update public.events set default_frame_id = (select id from public.event_frames "
            f"where event_id = v_event and label = '{sql_quote(default_label)}' limit 1) where id = v_event;",
        ])
    body = "\n".join(lines)
    tag = body_tag(body)
    return "\n".join(header + [f"do {tag}", body, f"end {tag};", ""])


def main() -> None:
    args = [a for a in sys.argv[1:]]
    if len(args) != 1 or args[0] in ("-h", "--help"):
        print(USAGE, file=sys.stderr)
        sys.exit(0 if args and args[0] in ("-h", "--help") else 2)

    base_dir = Path(args[0]).resolve()
    if not base_dir.is_dir():
        print(f"Error: No existe la carpeta de marcos {base_dir}", file=sys.stderr)
        sys.exit(1)

    spec_path = base_dir / SPEC_NAME
    if not spec_path.is_file():
        print(f"Error: No se encontró el archivo spec en {spec_path}", file=sys.stderr)
        sys.exit(1)

    with open(spec_path, "r", encoding="utf-8") as f:
        spec = json.load(f)

    print("Procesando y optimizando imágenes WebP...")
    stats = process_images(spec, base_dir / "ia", base_dir / "listos")
    print_table(stats)

    print("Generando script SQL...")
    sql_path = base_dir / SQL_NAME
    windows = {s["image"]: s["window"] for s in stats}
    sql_path.write_text(build_sql(spec, windows), encoding="utf-8")
    print(f"Archivo SQL generado correctamente: {sql_path.name}")


if __name__ == "__main__":
    main()
