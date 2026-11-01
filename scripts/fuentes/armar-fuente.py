#!/usr/bin/env python3
"""Build OpenType (OTF) and WOFF2 fonts from AI-filled alphabet sheets."""

import argparse
import json
import os
import re
import sys
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image
import potrace
import scipy.ndimage as ndi
from fontTools import agl
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen

# Import layout constants as fallbacks
try:
    from plantilla import (
        BASELINE_RATIO,
        CAP_HEIGHT_RATIO,
        CELL_HEIGHT,
        CELL_WIDTH,
        CHARSET,
        COLS,
        MARGIN_X,
        MARGIN_Y,
        ROWS,
        SHEET_HEIGHT,
        SHEET_WIDTH,
        TOTAL_SHEETS,
        X_HEIGHT_RATIO,
    )
except ImportError:
    # Fallback to local import if script is executed from different working directory
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from plantilla import (
        BASELINE_RATIO,
        CAP_HEIGHT_RATIO,
        CELL_HEIGHT,
        CELL_WIDTH,
        CHARSET,
        COLS,
        MARGIN_X,
        MARGIN_Y,
        ROWS,
        SHEET_HEIGHT,
        SHEET_WIDTH,
        TOTAL_SHEETS,
        X_HEIGHT_RATIO,
    )


def slugify(text: str) -> str:
    """Generate a clean URL/filename slug from a string."""
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^\w\s-]", "", normalized).strip().lower()
    return re.sub(r"[-\s]+", "-", cleaned)


def make_ps_name(familia: str) -> str:
    """Generate a PostScript font name without spaces or non-ASCII characters."""
    normalized = unicodedata.normalize("NFKD", familia).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-zA-Z0-9]", "", normalized)
    if not base:
        base = "CustomFont"
    return f"{base}-Regular"


def load_layout_metadata(input_dir: str) -> Dict[str, Any]:
    """Load layout metadata from plantilla.json or construct from defaults."""
    possible_paths = [
        os.path.join(input_dir, "plantilla.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "plantilla.json"),
    ]
    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

    # Construct nominal layout
    char_idx = 0
    sheets_metadata = []
    for s in range(1, TOTAL_SHEETS + 1):
        sheet_cells = []
        for r in range(ROWS):
            for c in range(COLS):
                cell_idx = r * COLS + c
                x0 = MARGIN_X + c * CELL_WIDTH
                y0 = MARGIN_Y + r * CELL_HEIGHT
                x1 = x0 + CELL_WIDTH
                y1 = y0 + CELL_HEIGHT
                ch = CHARSET[char_idx] if char_idx < len(CHARSET) else None
                sheet_cells.append(
                    {
                        "cell_index": cell_idx,
                        "global_index": char_idx,
                        "row": r,
                        "col": c,
                        "box": [x0, y0, x1, y1],
                        "char": ch,
                    }
                )
                char_idx += 1
        sheets_metadata.append(
            {
                "sheet_num": s,
                "filename": f"plantilla-{s}.png",
                "cells": sheet_cells,
            }
        )

    return {
        "sheet_size": [SHEET_WIDTH, SHEET_HEIGHT],
        "margins": {
            "left": MARGIN_X,
            "top": MARGIN_Y,
            "right": MARGIN_X,
            "bottom": MARGIN_Y,
        },
        "rows": ROWS,
        "cols": COLS,
        "cell_size": [CELL_WIDTH, CELL_HEIGHT],
        "guide_ratios": {
            "cap_height": CAP_HEIGHT_RATIO,
            "x_height": X_HEIGHT_RATIO,
            "baseline": BASELINE_RATIO,
        },
        "charset": CHARSET,
        "sheets": sheets_metadata,
    }


def detect_grid_lines(
    arr: np.ndarray,
    nominal_x: List[int],
    nominal_y: List[int],
    search_radius: int = 15,
) -> Tuple[List[int], List[int]]:
    """Detect cell border positions using horizontal and vertical projection profiles.

    Falls back to nominal coordinates if projection peaks are indistinct.
    """
    height, width = arr.shape
    y_min, y_max = nominal_y[0], nominal_y[-1]
    x_min, x_max = nominal_x[0], nominal_x[-1]

    # Darkness projection profiles: dark pixels contribute most
    prof_x = (255.0 - arr[y_min : y_max + 1, :]).mean(axis=0)
    prof_y = (255.0 - arr[:, x_min : x_max + 1]).mean(axis=1)

    detected_x: List[int] = []
    for nx in nominal_x:
        w_start = max(0, nx - search_radius)
        w_end = min(width, nx + search_radius + 1)
        sub_prof = prof_x[w_start:w_end]
        if len(sub_prof) > 0 and (sub_prof.max() - sub_prof.min() > 10):
            detected_x.append(w_start + int(np.argmax(sub_prof)))
        else:
            detected_x.append(nx)

    detected_y: List[int] = []
    for ny in nominal_y:
        w_start = max(0, ny - search_radius)
        w_end = min(height, ny + search_radius + 1)
        sub_prof = prof_y[w_start:w_end]
        if len(sub_prof) > 0 and (sub_prof.max() - sub_prof.min() > 10):
            detected_y.append(w_start + int(np.argmax(sub_prof)))
        else:
            detected_y.append(ny)

    return detected_x, detected_y


# Each side bearing as a fraction of the cap height (0.03 -> 21 units). Set from --espaciado.
SIDE_BEARING_RATIO = 0.03


def extract_cell_glyph(
    cell_crop: np.ndarray,
    cap_ratio: float,
    baseline_ratio: float,
) -> Optional[Tuple[Any, int, int]]:
    """Crop, threshold, clean corner labels/guides, and vectorize a glyph with potrace.

    Returns:
        (t2_charstring, advance_width, lsb) or None if cell is empty.
    """
    ch_h, ch_w = cell_crop.shape
    if ch_h < 10 or ch_w < 10:
        return None

    # Threshold: ink is darker than guides (guides are ~215, corner labels ~200)
    ink_mask = cell_crop < 165

    if not np.any(ink_mask):
        return None

    # Connected component analysis to drop the corner label and tiny speckles
    labeled, num_features = ndi.label(ink_mask)
    if num_features == 0:
        return None

    cleaned_mask = np.zeros_like(ink_mask)
    for idx in range(1, num_features + 1):
        component = labeled == idx
        ys, xs = np.where(component)
        area = len(ys)

        # Drop tiny single-pixel noise
        if area < 4:
            continue

        max_y = ys.max()
        max_x = xs.max()

        # Drop small components situated strictly inside the top-left corner
        is_in_corner = (max_y < ch_h * 0.28) and (max_x < ch_w * 0.28)
        if is_in_corner and area < 300:
            continue

        cleaned_mask[component] = True

    # If nothing remains after cleaning, the cell is empty
    if cleaned_mask.sum() < 12:
        return None

    # Vectorize with potrace (foreground=0, background=255)
    bmp_arr = np.where(cleaned_mask, 0, 255).astype(np.uint8)
    bmp = potrace.Bitmap(bmp_arr, blacklevel=0.5)
    path = bmp.trace(turdsize=2, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY)

    if len(path.curves) == 0:
        return None

    # Font unit coordinates mapping:
    # unitsPerEm = 1000
    # baseline guide -> y = 0
    # cap-height guide -> y = 700
    y_baseline_px = ch_h * baseline_ratio
    y_cap_px = ch_h * cap_ratio
    dy_px = y_baseline_px - y_cap_px
    if dy_px <= 0:
        dy_px = 1.0
    scale = 700.0 / dy_px

    # Compute bounding box in X to set advance width and side bearings
    all_x: List[float] = []
    for curve in path:
        all_x.append(curve.start_point.x)
        for seg in curve:
            if seg.is_corner:
                all_x.append(seg.c.x)
                all_x.append(seg.end_point.x)
            else:
                all_x.append(seg.c1.x)
                all_x.append(seg.c2.x)
                all_x.append(seg.end_point.x)

    min_gx = min(all_x)
    max_gx = max(all_x)
    glyph_font_width = (max_gx - min_gx) * scale

    # Side bearings proportional to the cap height (700 units); see --espaciado
    side_bearing = round(700.0 * SIDE_BEARING_RATIO)
    lsb = side_bearing
    rsb = side_bearing
    advance_width = max(1, round(glyph_font_width + lsb + rsb))

    # Construct Type 2 CharString via T2CharStringPen
    pen = T2CharStringPen(advance_width, glyphSet=None)
    for curve in path:
        start_pt = (
            (curve.start_point.x - min_gx) * scale + lsb,
            (y_baseline_px - curve.start_point.y) * scale,
        )
        pen.moveTo(start_pt)
        for seg in curve:
            if seg.is_corner:
                c_pt = (
                    (seg.c.x - min_gx) * scale + lsb,
                    (y_baseline_px - seg.c.y) * scale,
                )
                end_pt = (
                    (seg.end_point.x - min_gx) * scale + lsb,
                    (y_baseline_px - seg.end_point.y) * scale,
                )
                pen.lineTo(c_pt)
                pen.lineTo(end_pt)
            else:
                c1_pt = (
                    (seg.c1.x - min_gx) * scale + lsb,
                    (y_baseline_px - seg.c1.y) * scale,
                )
                c2_pt = (
                    (seg.c2.x - min_gx) * scale + lsb,
                    (y_baseline_px - seg.c2.y) * scale,
                )
                end_pt = (
                    (seg.end_point.x - min_gx) * scale + lsb,
                    (y_baseline_px - seg.end_point.y) * scale,
                )
                pen.curveTo(c1_pt, c2_pt, end_pt)
        pen.closePath()

    return pen.getCharString(), advance_width, lsb


def build_font(
    glyphs_dict: Dict[str, Tuple[Any, int, int]],
    familia: str,
    slug_id: str,
    out_dir: str,
) -> Tuple[str, str]:
    """Assemble an OTF (CFF) and a WOFF2 font with FontBuilder."""
    os.makedirs(out_dir, exist_ok=True)
    ps_name = make_ps_name(familia)

    fb = FontBuilder(1000, isTTF=False)

    # Standard glyph definitions
    charstrings: Dict[str, Any] = {}
    metrics: Dict[str, Tuple[int, int]] = {}
    cmap: Dict[int, str] = {}
    glyph_order: List[str] = [".notdef", "space"]

    # 1. .notdef glyph (rectangular box)
    notdef_pen = T2CharStringPen(500, glyphSet=None)
    notdef_pen.moveTo((50, 0))
    notdef_pen.lineTo((450, 0))
    notdef_pen.lineTo((450, 700))
    notdef_pen.lineTo((50, 700))
    notdef_pen.closePath()
    charstrings[".notdef"] = notdef_pen.getCharString()
    metrics[".notdef"] = (500, 50)

    # 2. space glyph (empty contours, standard advance width)
    space_pen = T2CharStringPen(300, glyphSet=None)
    charstrings["space"] = space_pen.getCharString()
    metrics["space"] = (300, 0)
    cmap[ord(" ")] = "space"

    # 3. Add charset glyphs
    for char, (cs, adv_w, lsb) in glyphs_dict.items():
        glyph_name = agl.UV2AGL.get(ord(char), f"uni{ord(char):04X}")
        # Avoid collisions with reserved names
        if glyph_name in charstrings:
            glyph_name = f"uni{ord(char):04X}"

        glyph_order.append(glyph_name)
        charstrings[glyph_name] = cs
        metrics[glyph_name] = (adv_w, lsb)
        cmap[ord(char)] = glyph_name

    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupCFF(
        ps_name,
        {"FullName": familia, "FamilyName": familia, "Weight": "Regular"},
        charstrings,
        {},
    )
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=850, descent=-250)
    fb.setupNameTable(
        {
            "familyName": familia,
            "styleName": "Regular",
            "psName": ps_name,
            "uniqueFontIdentifier": f"1.000;{ps_name}",
            "fullName": familia,
        }
    )
    fb.setupOS2(
        sTypoAscender=850,
        sTypoDescender=-250,
        sTypoLineGap=100,
        usWinAscent=950,
        usWinDescent=250,
    )
    fb.setupPost()

    otf_path = os.path.join(out_dir, f"{slug_id}.otf")
    woff2_path = os.path.join(out_dir, f"{slug_id}.woff2")

    fb.save(otf_path)

    fb.font.flavor = "woff2"
    fb.save(woff2_path)

    return otf_path, woff2_path


def assemble_font_pipeline(
    input_dir: str,
    out_dir: str,
    familia: str,
    slug_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute the full font extraction and building pipeline."""
    if not slug_id:
        slug_id = slugify(familia)

    layout = load_layout_metadata(input_dir)
    guide_ratios = layout.get("guide_ratios", {})
    cap_ratio = guide_ratios.get("cap_height", CAP_HEIGHT_RATIO)
    baseline_ratio = guide_ratios.get("baseline", BASELINE_RATIO)

    nominal_x = [MARGIN_X + c * CELL_WIDTH for c in range(COLS + 1)]
    nominal_y = [MARGIN_Y + r * CELL_HEIGHT for r in range(ROWS + 1)]

    glyphs: Dict[str, Tuple[Any, int, int]] = {}
    sheet_stats: List[Dict[str, Any]] = []
    total_warnings = 0

    for sheet_idx in range(1, TOTAL_SHEETS + 1):
        sheet_filename = f"relleno-{sheet_idx}.png"
        sheet_path = os.path.join(input_dir, sheet_filename)
        if not os.path.exists(sheet_path):
            # Check alternative extensions or filenames if necessary
            sheet_filename = f"relleno-{sheet_idx}.jpg"
            sheet_path = os.path.join(input_dir, sheet_filename)

        if not os.path.exists(sheet_path):
            msg = f"ERROR: No se encontró la hoja requerida: relleno-{sheet_idx}.png en {input_dir}"
            print(msg, file=sys.stderr)
            raise FileNotFoundError(sheet_path)

        with Image.open(sheet_path) as img:
            # Rescale to template aspect
            img_rescaled = img.convert("L").resize(
                (SHEET_WIDTH, SHEET_HEIGHT), Image.Resampling.LANCZOS
            )
            arr = np.array(img_rescaled)

        # Detect grid borders from projection profiles
        detected_x, detected_y = detect_grid_lines(arr, nominal_x, nominal_y)

        # Get sheet metadata cells
        sheet_meta = layout["sheets"][sheet_idx - 1] if sheet_idx <= len(layout["sheets"]) else None
        cells = sheet_meta["cells"] if sheet_meta else []

        sheet_glyphs = 0
        sheet_empty = 0
        sheet_assigned = 0

        for cell in cells:
            char = cell.get("char")
            if not char:
                continue

            sheet_assigned += 1
            r = cell["row"]
            c = cell["col"]

            x0 = detected_x[c] + 2
            x1 = detected_x[c + 1] - 2
            y0 = detected_y[r] + 2
            y1 = detected_y[r + 1] - 2

            crop = arr[y0:y1, x0:x1]
            extracted = extract_cell_glyph(crop, cap_ratio, baseline_ratio)

            if extracted is None:
                sheet_empty += 1
                total_warnings += 1
                print(
                    f"ADVERTENCIA: Celda vacía para el caracter '{char}' "
                    f"(hoja {sheet_idx}, fila {r + 1}, columna {c + 1})",
                    file=sys.stderr,
                )
            else:
                glyphs[char] = extracted
                sheet_glyphs += 1

        sheet_stats.append(
            {
                "sheet": sheet_idx,
                "assigned": sheet_assigned,
                "detected": sheet_glyphs,
                "empty": sheet_empty,
            }
        )

    # Build the font files
    otf_path, woff2_path = build_font(glyphs, familia, slug_id, out_dir)

    otf_size = os.path.getsize(otf_path)
    woff2_size = os.path.getsize(woff2_path)

    # Print summary table in neutral Spanish
    print("\n" + "=" * 68)
    print(f" RESUMEN DE CONSTRUCCIÓN DE FUENTE: {familia}")
    print(f" Identificador (ID): {slug_id}")
    print("=" * 68)
    print(f"{'Hoja':<12} {'Celdas asignadas':<18} {'Glifos detectados':<18} {'Vacías':<10}")
    print("-" * 68)
    for stat in sheet_stats:
        print(
            f"Hoja {stat['sheet']:<7} {stat['assigned']:<18} {stat['detected']:<18} {stat['empty']:<10}"
        )
    print("-" * 68)
    print(f"Total caracteres en repertorio: {len(CHARSET)}")
    print(f"Total glifos construidos:       {len(glyphs)} (+ .notdef, espacio)")
    print(f"Total advertencias por vacío:   {total_warnings}")
    print("\nArchivos exportados exitosamente:")
    print(f"  - OTF:   {otf_path} ({otf_size:,} bytes)")
    print(f"  - WOFF2: {woff2_path} ({woff2_size:,} bytes)")
    print("=" * 68 + "\n")

    return {
        "familia": familia,
        "id": slug_id,
        "otf_path": otf_path,
        "woff2_path": woff2_path,
        "otf_size": otf_size,
        "woff2_size": woff2_size,
        "total_glyphs": len(glyphs),
        "sheet_stats": sheet_stats,
        "total_warnings": total_warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Arma una fuente OTF y WOFF2 a partir de hojas de cuadrícula dibujadas por IA."
    )
    parser.add_argument(
        "dir_with_filled_sheets",
        help="Directorio que contiene las hojas rellenas (relleno-1.png..relleno-3.png).",
    )
    parser.add_argument(
        "out_dir",
        help="Directorio de destino donde se guardarán los archivos <id>.otf y <id>.woff2.",
    )
    parser.add_argument(
        "--familia",
        required=True,
        help="Nombre de la familia tipográfica (p. ej. 'Raffa Gala').",
    )
    parser.add_argument(
        "--id",
        dest="slug_id",
        default=None,
        help="Identificador slug opcional para los archivos generados (p. ej. 'raffa-gala').",
    )

    parser.add_argument(
        "--espaciado",
        type=float,
        default=0.03,
        help="Margen a cada lado de una letra, como fracción de la altura de las mayúsculas (por defecto 0.03).",
    )

    args = parser.parse_args()
    global SIDE_BEARING_RATIO
    SIDE_BEARING_RATIO = args.espaciado

    try:
        assemble_font_pipeline(
            input_dir=args.dir_with_filled_sheets,
            out_dir=args.out_dir,
            familia=args.familia,
            slug_id=args.slug_id,
        )
    except Exception as exc:
        print(f"Error durante el procesamiento: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
