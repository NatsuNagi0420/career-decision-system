# 青穗集 · 穗奈中模像素素材构建脚本：从现有立绘生成可在 Pixelorama 中继续修整的 96×128 PNG 帧。
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "assets" / "web" / "brand" / "desktop"
OUTPUT_DIR = ROOT / "assets" / "web" / "brand" / "pixel-v04"
LOG_DIR = ROOT / "logs" / "suinai-face-20261018" / "pixel-v04-candidates"
SIZE = (96, 128)
NATIVE_SIZE = (192, 256)
FRAME_COUNT = 4
PALETTE_SIZE = 28

SOURCES = {
    "journal": "suinai-smile.webp",
    "listen": "suinai-listen.webp",
    "write": "suinai-think.webp",
    "review": "suinai-encourage.webp",
}


def load_base(path: Path) -> Image.Image:
    """把高完成度立绘缩到构图网格，并清掉透明边缘的半透明噪点。"""
    image = Image.open(path).convert("RGBA").resize(SIZE, Image.Resampling.BOX)
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 72 else 0)
    return Image.merge("RGBA", (*image.convert("RGB").split(), alpha))


def frame_variant(base: Image.Image, index: int, state: str) -> Image.Image:
    """只做极轻的呼吸／点头变化，保持脸部结构和肩颈比例稳定。"""
    if index == 0 or index == 3:
        return base.copy()

    # 以最近邻放大一个原生像素，再裁回原尺寸，避免重新引入平滑边缘。
    extra = 1 if index == 1 else 2
    stretched = base.resize((SIZE[0], SIZE[1] + extra), Image.Resampling.NEAREST)
    if state == "listen":
        # 倾听状态的动势比待机多半格，头部位置不跟着整张图漂移。
        top = 1 if index == 2 else 0
    else:
        top = 0 if index == 1 else 1
    return stretched.crop((0, top, SIZE[0], top + SIZE[1]))


def build_palette(images: Iterable[Image.Image]) -> Image.Image:
    """从四种状态的可见像素建立共享色板，避免不同状态换色。"""
    pixels: list[tuple[int, int, int]] = []
    for image in images:
        rgb = image.convert("RGB")
        alpha = image.getchannel("A")
        pixels.extend(pixel for pixel, opacity in zip(rgb.get_flattened_data(), alpha.get_flattened_data()) if opacity > 0)
    seed = Image.new("RGB", (max(1, len(pixels)), 1))
    seed.putdata(pixels or [(0, 0, 0)])
    return seed.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def apply_palette(image: Image.Image, palette: Image.Image) -> Image.Image:
    """量化 RGB，同时保留已经硬化的透明轮廓。"""
    rgb = image.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
    alpha = image.getchannel("A")
    return Image.merge("RGBA", (*rgb.split(), alpha))


def save_preview(images: dict[str, list[Image.Image]]) -> None:
    """输出放大对比图，便于在浏览器接入前检查脸、下巴和肩颈。"""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    cell = (192, 256)
    canvas = Image.new("RGBA", (cell[0] * FRAME_COUNT, cell[1] * len(images)), (243, 240, 247, 255))
    for row, (state, frames) in enumerate(images.items()):
        for column, frame in enumerate(frames):
            preview = frame.resize(cell, Image.Resampling.NEAREST)
            canvas.alpha_composite(preview, (column * cell[0], row * cell[1]))
    canvas.convert("RGB").save(LOG_DIR / "pixel-v04-sheet.png")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bases = {state: load_base(SOURCE_DIR / filename) for state, filename in SOURCES.items()}
    variants = {
        state: [frame_variant(base, index, state) for index in range(FRAME_COUNT)]
        for state, base in bases.items()
    }
    palette = build_palette(frame for frames in variants.values() for frame in frames)
    for state, frames in variants.items():
        target = OUTPUT_DIR / state
        target.mkdir(parents=True, exist_ok=True)
        for index, frame in enumerate(frames):
            apply_palette(frame, palette).resize(NATIVE_SIZE, Image.Resampling.NEAREST).save(target / f"frame-{index:02d}.png")

    manifest = {
        "version": "0.4",
        "logical_size": {"width": SIZE[0], "height": SIZE[1]},
        "native_size": {"width": NATIVE_SIZE[0], "height": NATIVE_SIZE[1]},
        "display_scale": 2,
        "frame_count": FRAME_COUNT,
        "palette_size": PALETTE_SIZE,
        "source_note": "Derived from existing Suinai desktop illustrations; keep editable and hand-polish in Pixelorama before making it the default.",
        "states": {
            state: {"source": filename, "frames": [f"{state}/frame-{i:02d}.png" for i in range(FRAME_COUNT)]}
            for state, filename in SOURCES.items()
        },
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    save_preview({state: [apply_palette(frame, palette) for frame in frames] for state, frames in variants.items()})
    print(f"generated {len(variants) * FRAME_COUNT} frames in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()

