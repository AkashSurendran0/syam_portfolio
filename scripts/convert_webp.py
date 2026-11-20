#!/usr/bin/env python3
import sys
import os
from PIL import Image

def convert_to_webp(src_path, dest_path=None):
    if not os.path.exists(src_path):
        print(f"File not found: {src_path}", file=sys.stderr)
        sys.exit(1)

    if dest_path is None:
        base, _ = os.path.splitext(src_path)
        dest_path = base + ".webp"

    im = Image.open(src_path).convert("RGB")
    w, h = im.size
    if max(w, h) > 2560:
        ratio = 2560.0 / max(w, h)
        new_size = (int(w * ratio), int(h * ratio))
        im = im.resize(new_size, Image.Resampling.LANCZOS)

    im.save(dest_path, "WEBP", quality=92, method=6)
    print(dest_path)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: convert_webp.py <image_path> [dest_path]")
        sys.exit(1)
    src = sys.argv[1]
    dest = sys.argv[2] if len(sys.argv) > 2 else None
    convert_to_webp(src, dest)
