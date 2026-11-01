#!/usr/bin/env python3
"""Generate alphabet template sheets and layout metadata for AI font generation."""

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional

from PIL import Image, ImageDraw, ImageFont

# Canvas and grid specifications
SHEET_WIDTH = 1536
SHEET_HEIGHT = 1024
COLS = 8
ROWS = 4
CELLS_PER_SHEET = COLS * ROWS  # 32
TOTAL_SHEETS = 3

MARGIN_X = 48
MARGIN_Y = 48
CELL_WIDTH = 180
CELL_HEIGHT = 232

# Guide line ratios relative to cell height
CAP_HEIGHT_RATIO = 0.25
X_HEIGHT_RATIO = 0.48
BASELINE_RATIO = 0.70

# Visual styles
COLOR_BACKGROUND = (255, 255, 255)
COLOR_BORDER = (120, 120, 120)
COLOR_GUIDE = (215, 215, 215)
COLOR_LABEL = (200, 200, 200)

# Charset definition (88 characters total)
UPPER_ASCII: List[str] = [chr(c) for c in range(ord("A"), ord("Z") + 1)]
UPPER_ACCENTS: List[str] = ["Á", "É", "Í", "Ó", "Ú", "Ñ", "Ü"]
LOWER_ASCII: List[str] = [chr(c) for c in range(ord("a"), ord("z") + 1)]
LOWER_ACCENTS: List[str] = ["á", "é", "í", "ó", "ú", "ñ", "ü"]
DIGITS: List[str] = [chr(c) for c in range(ord("0"), ord("9") + 1)]
PUNCTUATION: List[str] = [
    ".",
    ",",
    "·",
    "-",
    "!",
    "?",
    "'",
    "&",
    ":",
    "/",
    "(",
    ")",
]

CHARSET: List[str] = (
    UPPER_ASCII + UPPER_ACCENTS + LOWER_ASCII + LOWER_ACCENTS + DIGITS + PUNCTUATION
)


def get_label_font() -> ImageFont.ImageFont:
    """Return a suitable small font for corner labels."""
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, 14)
            except Exception:
                pass
    return ImageFont.load_default(size=14)


def generate_templates(out_dir: str) -> Dict[str, Any]:
    """Generate 3 template PNG sheets and plantilla.json in out_dir."""
    os.makedirs(out_dir, exist_ok=True)
    label_font = get_label_font()

    sheets_metadata: List[Dict[str, Any]] = []
    char_idx = 0

    for sheet_num in range(1, TOTAL_SHEETS + 1):
        image = Image.new("RGB", (SHEET_WIDTH, SHEET_HEIGHT), COLOR_BACKGROUND)
        draw = ImageDraw.Draw(image)
        cells_data: List[Dict[str, Any]] = []

        for r in range(ROWS):
            for c in range(COLS):
                cell_index = r * COLS + c
                x0 = MARGIN_X + c * CELL_WIDTH
                y0 = MARGIN_Y + r * CELL_HEIGHT
                x1 = x0 + CELL_WIDTH
                y1 = y0 + CELL_HEIGHT

                # Draw outer cell borders
                draw.rectangle([x0, y0, x1, y1], outline=COLOR_BORDER, width=2)

                # Inner guide lines
                y_cap = y0 + int(round(CELL_HEIGHT * CAP_HEIGHT_RATIO))
                y_x = y0 + int(round(CELL_HEIGHT * X_HEIGHT_RATIO))
                y_base = y0 + int(round(CELL_HEIGHT * BASELINE_RATIO))

                draw.line([(x0 + 2, y_cap), (x1 - 2, y_cap)], fill=COLOR_GUIDE, width=1)
                draw.line([(x0 + 2, y_x), (x1 - 2, y_x)], fill=COLOR_GUIDE, width=1)
                draw.line([(x0 + 2, y_base), (x1 - 2, y_base)], fill=COLOR_GUIDE, width=1)

                target_char: Optional[str] = (
                    CHARSET[char_idx] if char_idx < len(CHARSET) else None
                )
                if target_char is not None:
                    # Target character printed small in light gray in top-left corner
                    draw.text(
                        (x0 + 8, y0 + 6),
                        target_char,
                        fill=COLOR_LABEL,
                        font=label_font,
                    )

                cells_data.append(
                    {
                        "cell_index": cell_index,
                        "global_index": char_idx,
                        "row": r,
                        "col": c,
                        "box": [x0, y0, x1, y1],
                        "char": target_char,
                    }
                )
                char_idx += 1

        filename = f"plantilla-{sheet_num}.png"
        filepath = os.path.join(out_dir, filename)
        image.save(filepath, format="PNG")

        sheets_metadata.append(
            {
                "sheet_num": sheet_num,
                "filename": filename,
                "cells": cells_data,
            }
        )

    layout: Dict[str, Any] = {
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

    json_path = os.path.join(out_dir, "plantilla.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(layout, f, indent=2, ensure_ascii=False)

    return layout


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Genera plantillas de cuadrícula para fuentes dibujadas con IA."
    )
    parser.add_argument(
        "out_dir",
        help="Directorio de destino donde se guardarán las plantillas y plantilla.json.",
    )
    args = parser.parse_args()

    layout = generate_templates(args.out_dir)
    print(f"Plantillas generadas exitosamente en: {args.out_dir}")
    print(
        f"  - Hojas: {len(layout['sheets'])} imágenes PNG ({SHEET_WIDTH}x{SHEET_HEIGHT})"
    )
    print(f"  - Caracteres en el repertorio: {len(CHARSET)}")
    print(f"  - Metadatos guardados en: {os.path.join(args.out_dir, 'plantilla.json')}")


if __name__ == "__main__":
    main()
