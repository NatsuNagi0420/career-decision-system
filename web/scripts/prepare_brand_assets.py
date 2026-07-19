from pathlib import Path

from PIL import Image


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = REPOSITORY_ROOT / "docs" / "品牌形象"
ASSET_ROOT = REPOSITORY_ROOT / "web" / "src" / "assets" / "brand"
PUBLIC_ROOT = REPOSITORY_ROOT / "web" / "public"

ASSISTANT_SOURCES = {
    "default": "BgSub_默认微笑.png",
    "listening": "BgSub_专注倾听.png",
    "thinking": "BgSub_认真思考.png",
    "explaining": "BgSub_温和讲解.png",
    "concerned": "BgSub_轻度担心.png",
    "warning": "BgSub_重要提醒.png",
    "encouraging": "BgSub_鼓励行动.png",
    "success": "BgSub_完成后的开心.png",
}


def load_rgba(filename: str) -> Image.Image:
    return Image.open(SOURCE_ROOT / filename).convert("RGBA")


def alpha_crop(image: Image.Image, padding_ratio: float = 0.025) -> Image.Image:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        return image
    left, top, right, bottom = bounds
    padding = round(max(right - left, bottom - top) * padding_ratio)
    return image.crop((
        max(0, left - padding),
        max(0, top - padding),
        min(image.width, right + padding),
        min(image.height, bottom + padding),
    ))


def resize_to_width(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def resize_to_height(image: Image.Image, height: int) -> Image.Image:
    width = round(image.width * height / image.height)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def save_webp(image: Image.Image, destination: Path, *, quality: int = 88, lossless: bool = False) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=quality, method=6, lossless=lossless, exact=True)


def main() -> None:
    assistant_root = ASSET_ROOT / "assistant"
    for state, filename in ASSISTANT_SOURCES.items():
        image = load_rgba(filename).resize((320, 320), Image.Resampling.LANCZOS)
        save_webp(image, assistant_root / f"suina-{state}.webp")

    avatar = load_rgba("BgSub_穗奈标准头像v1.0.png")
    save_webp(avatar.resize((384, 384), Image.Resampling.LANCZOS), ASSET_ROOT / "character" / "suina-avatar.webp", quality=90)

    standing = resize_to_height(alpha_crop(load_rgba("BgSub_穗奈立绘v1.0.png")), 1280)
    save_webp(standing, ASSET_ROOT / "character" / "suina-standing.webp", quality=88)

    wordmark = resize_to_width(alpha_crop(load_rgba("BgSub_品牌名字体.png")), 480)
    save_webp(wordmark, ASSET_ROOT / "logo" / "brand-wordmark.webp", lossless=True)

    lockup = resize_to_width(alpha_crop(load_rgba("BgSub_组合logo.png")), 960)
    save_webp(lockup, ASSET_ROOT / "logo" / "brand-lockup-suina.webp", quality=90)

    favicon = avatar.resize((192, 192), Image.Resampling.LANCZOS)
    favicon.save(PUBLIC_ROOT / "favicon.png", "PNG", optimize=True)
    avatar.resize((256, 256), Image.Resampling.LANCZOS).save(
        PUBLIC_ROOT / "favicon.ico",
        "ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
