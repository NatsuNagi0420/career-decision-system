"""Cut the brand sheet into web-sized assets.

Source of truth is docs/品牌形象/BgSub_*.png (transparent background). The
non-prefixed files are the same art on white, so they are never used here.
"""

from pathlib import Path

from PIL import Image

SRC = Path("docs/品牌形象")
OUT = Path("web/public/brand")
ALPHA_FLOOR = 24

# 穗奈's face box inside every 1254x1254 expression sheet. All sheets share the
# same canvas, so one crop keeps the head in the same place across states.
FACE = (223, 50, 1123, 950)

EXPRESSIONS = {
    "smile": "默认微笑",
    "think": "认真思考",
    "happy": "完成后的开心",
    "listen": "专注倾听",
    "explain": "温和讲解",
    "worry": "轻度担心",
    "warn": "重要提醒",
    "encourage": "鼓励行动",
}


def save(img: Image.Image, name: str, quality: int = 92) -> str:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.webp"
    img.save(path, "WEBP", quality=quality, method=6)
    return f"{name}.webp {img.size[0]}x{img.size[1]} {path.stat().st_size // 1024}KB"


def load(name: str) -> Image.Image:
    return Image.open(SRC / f"BgSub_{name}.png").convert("RGBA")


def trimmed(img: Image.Image) -> Image.Image:
    mask = img.split()[3].point(lambda a: 255 if a > ALPHA_FLOOR else 0)
    box = mask.getbbox()
    return img.crop(box) if box else img


def face_crop(img: Image.Image, size: int) -> Image.Image:
    return img.crop(FACE).resize((size, size), Image.LANCZOS)


def main() -> None:
    report: list[str] = []

    # The combined logo is head + wordmark, but splitting it by column gaps is
    # fragile (the calligraphy has gaps wider than the one between the two parts).
    # Both halves already exist as standalone sheets, so use those.
    report.append(save(face_crop(load("穗奈标准头像v1.0"), 128), "logo-head"))
    wordmark = trimmed(load("品牌名字体"))
    report.append(save(wordmark.resize((wordmark.width * 56 // wordmark.height, 56), Image.LANCZOS), "wordmark"))

    for key, sheet in EXPRESSIONS.items():
        img = load(sheet)
        report.append(save(face_crop(img, 160), f"su-{key}"))

    standing = trimmed(load("穗奈正面图"))
    report.append(save(standing.resize((260, standing.height * 260 // standing.width), Image.LANCZOS), "su-standing"))

    print("\n".join(report))


if __name__ == "__main__":
    main()
