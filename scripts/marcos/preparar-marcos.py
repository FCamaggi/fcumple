#!/usr/bin/env python3
"""Prepara los marcos listos de un evento a partir de su carpeta de marcos:
1. Convierte las imágenes PNG con transparencia de <dir>/ia/<image>.png a <dir>/listos/<image>.webp,
   reduciendo el lado largo a un máximo de 1600 px (LANCZOS) y optimizando en WebP (method=6)
   con calidad descendente hasta que cada archivo pese menos de 1 MiB.
2. Imprime una tabla resumen con dimensiones, peso y calidad.
3. Genera <dir>/cargar-marcos-listos.sql de forma idempotente a partir de <dir>/marcos-listos.spec.json.

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
                "name": f"{img_name}.webp",
                "pixels": f"{w}x{h}",
                "kb": len(chosen_data) / 1024.0,
                "bytes": len(chosen_data),
                "quality": chosen_quality,
            })

    return stats


def print_table(stats: list) -> None:
    """Prints name, pixels, KB, quality used and the total in MB."""
    print(f"\n{'Nombre':<22} | {'Píxeles':<11} | {'KB':>8} | {'Calidad':>8}")
    print("-" * 57)
    total_bytes = 0
    for s in stats:
        total_bytes += s["bytes"]
        q_str = f"q={s['quality']}"
        print(f"{s['name']:<22} | {s['pixels']:<11} | {s['kb']:>8.1f} | {q_str:>8}")
    print("-" * 57)
    total_mb = total_bytes / (1024.0 * 1024.0)
    print(f"Total: {len(stats)} archivos | {total_mb:.2f} MB\n")


def sql_quote(value: str) -> str:
    return value.replace("'", "''")


def build_sql(spec: dict) -> str:
    """Builds the idempotent SQL that replaces only the spec's own frames, matched by label."""
    event_slug = spec["event_slug"]
    frames = spec.get("frames", [])
    labels_sql = ", ".join(f"'{sql_quote(f['label'])}'" for f in frames)

    lines = [
        f"-- Carga de marcos listos para el evento «{event_slug}» (plantilla capas).",
        "--",
        "-- IMPORTANTE:",
        "-- 1. Antes de ejecutar este script en la base de datos, deben subirse las imágenes WebP",
        "--    a Supabase Storage ejecutando: node scripts/marcos/subir-marcos.mjs <dir-marcos>",
        "-- 2. Este script es IDEMPOTENTE: para cada marco del spec, elimina únicamente las filas",
        "--    con exactamente esa misma etiqueta (label) y vuelve a insertar la fila actualizada",
        "--    con sort_order consecutivo. Respeta cualquier otro marco que tenga el evento.",
        "--",
        "do $$",
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
            variants[ratio] = {"layers": [img_layer] + var_data.get("texts", [])}

        if not variants:
            raise ValueError(f"Error: El marco «{label}» no tiene variantes en el spec.")
        # Top-level layers mirror the 3:4 variant (the camera's default ratio); fall back to the first one.
        base = variants.get("3:4") or next(iter(variants.values()))
        params = {"layers": base["layers"], "variants": variants}
        json_str = json.dumps(params, ensure_ascii=False, separators=(",", ":"))

        lines.append(f"  -- Marco {idx + 1}: {label}")
        lines.append(f"  delete from public.event_frames where event_id = v_event and label = '{escaped_label}';")
        lines.append("  insert into public.event_frames (event_id, template, label, sort_order, params) values")
        lines.append(
            f"    (v_event, 'capas', '{escaped_label}', v_base_order + {idx}, "
            f"replace($json${json_str}$json$, '__EVENT__', v_event::text)::jsonb);"
        )
        lines.append("")

    # Optional default frame: always emitted commented out, the owner decides whether to run it.
    default_label = spec.get("default_frame_label") or (frames[0]["label"] if frames else None)
    if default_label:
        lines.extend([
            f"  -- Por si el cliente desea fijar «{default_label}» como marco predeterminado, descomentar la siguiente línea:",
            "  -- update public.events set default_frame_id = (select id from public.event_frames "
            f"where event_id = v_event and label = '{sql_quote(default_label)}' limit 1) where id = v_event;",
        ])
    lines.extend(["end $$;", ""])
    return "\n".join(lines)


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
    sql_path.write_text(build_sql(spec), encoding="utf-8")
    print(f"Archivo SQL generado correctamente: {sql_path.name}")


if __name__ == "__main__":
    main()
