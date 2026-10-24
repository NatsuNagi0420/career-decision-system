# 青穗集 · 穗奈 v0.5 分层模板生成器：创建透明画布和锚点指南，不绘制最终角色。
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "assets" / "web" / "brand" / "pixel-rig-v05"
MANIFEST_PATH = ASSET_DIR / "manifest.json"
SIZE = (256, 320)


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    layers = manifest["layers"]
    layer_dir = ASSET_DIR / "layers"
    layer_dir.mkdir(parents=True, exist_ok=True)
    for layer in layers:
        image = Image.new("RGBA", SIZE, (0, 0, 0, 0))
        image.save(ASSET_DIR / layer["file"])

    guide = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(guide)
    for x in range(0, SIZE[0] + 1, 32):
        draw.line((x, 0, x, SIZE[1]), fill=(118, 104, 153, 72), width=1)
    for y in range(0, SIZE[1] + 1, 32):
        draw.line((0, y, SIZE[0], y), fill=(118, 104, 153, 72), width=1)
    for name, point in manifest["anchors"].items():
        x, y = point
        draw.rectangle((x - 3, y - 3, x + 3, y + 3), outline=(196, 83, 116, 210), width=2)
        draw.line((x - 8, y, x + 8, y), fill=(196, 83, 116, 150), width=1)
        draw.line((x, y - 8, x, y + 8), fill=(196, 83, 116, 150), width=1)
    guide.save(ASSET_DIR / "anchors-guide.png")
    print(f"created {len(layers)} transparent layers and anchors-guide.png in {ASSET_DIR}")


if __name__ == "__main__":
    main()
