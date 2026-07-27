#!/usr/bin/env python3
"""Slice a transparent 2×6 chess contact sheet into normalized square assets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


PIECES = ("k", "q", "r", "b", "n", "p")
COLORS = ("w", "b")


def piece_columns(alpha: Image.Image, expected: int = 6) -> list[tuple[int, int]]:
    """Find separated artwork runs using the alpha projection for one row."""
    width, height = alpha.size
    pixels = alpha.load()
    active = [
        sum(1 for y in range(height) if pixels[x, y] > 40) >= 4
        for x in range(width)
    ]
    runs: list[tuple[int, int]] = []
    start: int | None = None
    for x, is_active in enumerate(active + [False]):
        if is_active and start is None:
            start = x
        elif not is_active and start is not None:
            if x - start >= 20:
                runs.append((start, x))
            start = None
    if len(runs) != expected:
        raise RuntimeError(f"Expected {expected} pieces in row, detected {len(runs)}: {runs}")
    return runs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--padding", type=int, default=28)
    args = parser.parse_args()

    sheet = Image.open(args.sheet).convert("RGBA")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cell_height = sheet.height / 2

    for row, color in enumerate(COLORS):
        row_top = round(row * cell_height)
        row_bottom = round((row + 1) * cell_height)
        row_image = sheet.crop((0, row_top, sheet.width, row_bottom))
        columns = piece_columns(row_image.getchannel("A"))
        for column, piece in enumerate(PIECES):
            detected_left, detected_right = columns[column]
            left = max(0, detected_left - 8)
            right = min(sheet.width, detected_right + 8)
            cell = row_image.crop((left, 0, right, row_image.height))
            alpha_box = cell.getchannel("A").getbbox()
            if alpha_box is None:
                raise RuntimeError(f"No visible pixels in {color}-{piece}")

            artwork = cell.crop(alpha_box)
            max_edge = args.size - args.padding * 2
            scale = min(max_edge / artwork.width, max_edge / artwork.height)
            target = (
                max(1, round(artwork.width * scale)),
                max(1, round(artwork.height * scale)),
            )
            artwork = artwork.resize(target, Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", (args.size, args.size), (0, 0, 0, 0))
            offset = ((args.size - target[0]) // 2, (args.size - target[1]) // 2)
            canvas.alpha_composite(artwork, offset)
            canvas.save(args.output_dir / f"{color}-{piece}.png", optimize=True)


if __name__ == "__main__":
    main()
