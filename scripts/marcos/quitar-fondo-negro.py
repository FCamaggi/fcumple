#!/usr/bin/env python3
"""Convierte un marco neón generado sobre FONDO NEGRO en un PNG con transparencia real.

Para brillos neón la luminosidad hace de opacidad: cuanto más oscuro el píxel, más transparente. Así el
halo del neón se funde con la foto en vez de dejar un borde negro. No sirve para piezas negras o muy
oscuras (también se volverían transparentes): esas se hacen como capas en el Estudio.

Uso:
    python3 scripts/marcos/quitar-fondo-negro.py entrada.png salida.png [--umbral 10] [--ancho 1080] [--lado 1600]

--umbral  valores por debajo (0-255) se vuelven del todo transparentes: limpia el ruido del negro.
--ancho   reduce el ancho a ese valor conservando la proporción.
--lado    reduce el lado MÁS LARGO a ese valor (la app guarda máximo 1600 px de lado).
"""
import argparse

import numpy as np
from PIL import Image


def remove_black_background(img: Image.Image, threshold: int) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    alpha = rgb.max(axis=2)  # the brightest channel drives opacity
    alpha = np.where(alpha < threshold, 0.0, alpha)
    safe = np.where(alpha > 0, alpha, 1.0)[..., None]
    color = np.clip(rgb / safe * 255.0, 0, 255)  # un-premultiply: color returns to full intensity
    out = np.dstack([color, alpha]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("entrada")
    p.add_argument("salida")
    p.add_argument("--umbral", type=int, default=10)
    p.add_argument("--ancho", type=int, default=0)
    p.add_argument("--lado", type=int, default=0, help="reduce el lado MÁS LARGO a este valor (la app guarda máx. 1600)")
    a = p.parse_args()

    img = Image.open(a.entrada)
    if a.ancho and img.width > a.ancho:
        img = img.resize((a.ancho, round(img.height * a.ancho / img.width)), Image.LANCZOS)
    if a.lado and max(img.size) > a.lado:
        k = a.lado / max(img.size)
        img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    out = remove_black_background(img, a.umbral)
    out.save(a.salida, optimize=True)
    transparent = float((np.asarray(out)[..., 3] == 0).mean()) * 100
    print(f"{a.salida}: {out.width}x{out.height}, {transparent:.0f}% transparente")


if __name__ == "__main__":
    main()
