# 青穗集 · 穗奈头像裁切：从原有立绘生成头像，不修改角色设计或原始素材。
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/source/runtime-originals-20261031/characters/suinai-full-body.png"
TARGET = ROOT / "src/static/assets/characters/suinai-avatar.png"
# 原始画布为 1536 × 2304，保留头发、眼镜、发夹和衣领。
HEAD_CROP = (414, 30, 1122, 738)


def prepare():
    with Image.open(SOURCE) as original:
        if original.size != (1536, 2304):
            raise ValueError("原始立绘尺寸已变化，需要先重新核对头像裁切范围。")
        avatar = original.convert("RGBA").crop(HEAD_CROP)
        avatar.thumbnail((256, 256), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (256, 256))
        canvas.alpha_composite(avatar, ((256-avatar.width)//2, (256-avatar.height)//2))
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        canvas.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(TARGET, optimize=True)
    print(f"Suinai avatar: {TARGET.stat().st_size} bytes")


if __name__ == "__main__":
    prepare()
