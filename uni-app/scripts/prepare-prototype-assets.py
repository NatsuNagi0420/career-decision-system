# 青穗集 · 原型素材处理：保留原图，裁掉透明留白并输出小程序尺寸的 PNG。
from pathlib import Path
from PIL import Image
import json
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/prototypes/qingsuizhi-20261031/assets"
TARGET = ROOT / "src/static/assets/prototype"

def optimize(source, target, size):
    with Image.open(source) as original:
        image = original.convert("RGBA")
        box = image.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox()
        if box:
            image = image.crop(box)
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (size, size))
        canvas.alpha_composite(image, ((size-image.width)//2, (size-image.height)//2))
        canvas.quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(target, optimize=True)

if __name__ == "__main__":
    TARGET.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for source in SOURCE.glob("*.png"):
        # 原型角色仅作归档，运行时沿用 characters/ 中的穗奈。
        if source.stem == "suinai-avatar":
            continue
        size = 240 if source.stem in ("plant", "books") else 96
        optimize(source, TARGET/source.name, size)
        manifest[source.name] = {"size": size, "bytes": (TARGET/source.name).stat().st_size}
    (ROOT/"assets/prototypes/qingsuizhi-20261031/runtime-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Prototype assets:", sum(item["bytes"] for item in manifest.values()), "bytes")
