#!/usr/bin/env python3
"""Unittest round-trip suite for font generation from AI template sheets."""

import os
import shutil
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

# Ensure scripts/fuentes is on python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from plantilla import (
    BASELINE_RATIO,
    CELL_HEIGHT,
    CHARSET,
    SHEET_HEIGHT,
    SHEET_WIDTH,
    TOTAL_SHEETS,
    generate_templates,
)

REFERENCE_TTF_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"


class TestFuentesRoundTrip(unittest.TestCase):
    """End-to-end integration test for the AI font generation pipeline."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.mkdtemp(prefix="test_fuentes_")
        self.template_dir = os.path.join(self.temp_dir, "plantillas")
        self.filled_dir = os.path.join(self.temp_dir, "rellenas")
        self.out_dir = os.path.join(self.temp_dir, "salida_fuentes")
        os.makedirs(self.filled_dir, exist_ok=True)
        os.makedirs(self.out_dir, exist_ok=True)

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_round_trip_font_generation(self) -> None:
        """Test full pipeline: template -> fill & scale & noise -> armar-fuente -> verify."""
        self.assertTrue(
            os.path.exists(REFERENCE_TTF_PATH),
            f"La fuente de referencia no existe: {REFERENCE_TTF_PATH}",
        )

        # 1. Generate templates
        layout = generate_templates(self.template_dir)
        for s in range(1, TOTAL_SHEETS + 1):
            tmpl_file = os.path.join(self.template_dir, f"plantilla-{s}.png")
            self.assertTrue(os.path.exists(tmpl_file), f"Falta plantilla: {tmpl_file}")
        json_file = os.path.join(self.template_dir, "plantilla.json")
        self.assertTrue(os.path.exists(json_file), f"Falta json: {json_file}")

        # 2. Fill sheets by rendering each character from DejaVuSerif.ttf on the baseline guide
        # Also copy plantilla.json to filled_dir for convenience
        shutil.copy(json_file, os.path.join(self.filled_dir, "plantilla.json"))

        ttf_font = ImageFont.truetype(REFERENCE_TTF_PATH, 110)

        for sheet_idx in range(1, TOTAL_SHEETS + 1):
            tmpl_path = os.path.join(self.template_dir, f"plantilla-{sheet_idx}.png")
            with Image.open(tmpl_path) as tmpl_img:
                img_rgb = tmpl_img.convert("RGB")

            draw = ImageDraw.Draw(img_rgb)
            sheet_meta = layout["sheets"][sheet_idx - 1]

            for cell_data in sheet_meta["cells"]:
                char = cell_data["char"]
                if not char:
                    continue

                x0, y0, x1, y1 = cell_data["box"]
                cx = (x0 + x1) // 2
                y_base = y0 + int(round(CELL_HEIGHT * BASELINE_RATIO))

                # Render glyph centered on the baseline guide
                draw.text((cx, y_base), char, fill=(0, 0, 0), font=ttf_font, anchor="ms")

            # Simulate GPT: scale to 1600x1066 and add slight noise
            simulated_gpt = img_rgb.resize((1600, 1066), Image.Resampling.LANCZOS)
            arr = np.array(simulated_gpt, dtype=np.int16)
            noise = np.random.normal(0, 2.0, arr.shape).astype(np.int16)
            arr_noisy = np.clip(arr + noise, 0, 255).astype(np.uint8)

            filled_out_path = os.path.join(self.filled_dir, f"relleno-{sheet_idx}.png")
            Image.fromarray(arr_noisy).save(filled_out_path, format="PNG")
            self.assertTrue(os.path.exists(filled_out_path))

        # 3. Execute armar-fuente.py via CLI
        armar_script = os.path.join(CURRENT_DIR, "armar-fuente.py")
        family_name = "Raffa Test Serif"
        slug_id = "raffa-test-serif"

        cmd = [
            sys.executable,
            armar_script,
            self.filled_dir,
            self.out_dir,
            "--familia",
            family_name,
            "--id",
            slug_id,
        ]

        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )

        sys.stdout.write(result.stdout)
        if result.stderr:
            sys.stderr.write(result.stderr)

        self.assertEqual(
            result.returncode,
            0,
            f"armar-fuente.py falló con código {result.returncode}: {result.stderr}",
        )

        otf_path = os.path.join(self.out_dir, f"{slug_id}.otf")
        woff2_path = os.path.join(self.out_dir, f"{slug_id}.woff2")

        self.assertTrue(os.path.exists(otf_path), f"No se generó OTF: {otf_path}")
        self.assertTrue(os.path.exists(woff2_path), f"No se generó WOFF2: {woff2_path}")
        self.assertGreater(os.path.getsize(otf_path), 1000)
        self.assertGreater(os.path.getsize(woff2_path), 500)

        # 4. Assert font loads with fontTools
        font = TTFont(otf_path)
        self.assertIn("CFF ", font)
        self.assertIn("cmap", font)
        self.assertIn("hmtx", font)

        # 5. Assert cmap entries exist for EVERY charset char
        cmap = font.getBestCmap()
        self.assertIsNotNone(cmap, "La fuente no tiene tabla cmap utilizable.")
        for ch in CHARSET:
            self.assertIn(
                ord(ch),
                cmap,
                f"El caracter '{ch}' (U+{ord(ch):04X}) no está presente en la tabla cmap.",
            )

        # 6. Assert each glyph has non-empty contours and positive advance width
        glyph_set = font.getGlyphSet()
        hmtx = font["hmtx"]

        for ch in CHARSET:
            glyph_name = cmap[ord(ch)]
            adv_width, lsb = hmtx[glyph_name]
            self.assertGreater(
                adv_width,
                0,
                f"El glifo '{glyph_name}' para el caracter '{ch}' tiene un ancho de avance <= 0 ({adv_width}).",
            )

            pen = RecordingPen()
            glyph_set[glyph_name].draw(pen)
            self.assertGreater(
                len(pen.value),
                0,
                f"El glifo '{glyph_name}' para el caracter '{ch}' tiene contornos vacíos.",
            )

        # Also check space glyph exists and has positive advance width
        self.assertIn(ord(" "), cmap)
        space_name = cmap[ord(" ")]
        self.assertGreater(hmtx[space_name][0], 0)

        # 7. Assert rendering "Raffa" with PIL ImageFont from the OTF produces ink
        pil_font = ImageFont.truetype(otf_path, 60)
        test_img = Image.new("L", (350, 120), 255)
        test_draw = ImageDraw.Draw(test_img)
        test_draw.text((20, 20), "Raffa", fill=0, font=pil_font)

        ink_pixels = int((np.array(test_img) < 128).sum())
        print(f"\n[Verificación PIL] Píxeles de tinta renderizados para 'Raffa': {ink_pixels}")
        self.assertGreater(
            ink_pixels,
            100,
            "Renderizar el texto 'Raffa' con la fuente OTF generada no produjo tinta.",
        )


if __name__ == "__main__":
    unittest.main()
