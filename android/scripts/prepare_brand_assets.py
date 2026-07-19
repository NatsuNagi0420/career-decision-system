"""Build Android-ready brand derivatives from the approved transparent sources.

The source PNG files remain the visual masters in ``docs/品牌形象``.  Android
ships compact WebP derivatives in ``drawable-nodpi`` so Compose can size them
explicitly without density scaling or decoding multi-megapixel originals.
"""

from pathlib import Path

from PIL import Image


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = REPOSITORY_ROOT / "docs" / "品牌形象"
ASSET_ROOT = (
    REPOSITORY_ROOT
    / "android"
    / "app"
    / "src"
    / "main"
    / "res"
    / "drawable-nodpi"
)

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


def alpha_crop(
    image: Image.Image,
    padding_ratio: float = 0.025,
    alpha_threshold: int = 2,
) -> Image.Image:
    alpha = image.getchannel("A")
    visible_alpha = alpha.point(
        lambda value: 255 if value >= alpha_threshold else 0
    )
    bounds = visible_alpha.getbbox()
    if bounds is None:
        return image
    left, top, right, bottom = bounds
    padding = round(max(right - left, bottom - top) * padding_ratio)
    return image.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(image.width, right + padding),
            min(image.height, bottom + padding),
        )
    )


def resize_to_width(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def save_webp(
    image: Image.Image,
    destination: Path,
    *,
    quality: int = 88,
    lossless: bool = False,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(
        destination,
        "WEBP",
        quality=quality,
        method=6,
        lossless=lossless,
        exact=True,
    )


def main() -> None:
    for state, filename in ASSISTANT_SOURCES.items():
        image = load_rgba(filename).resize((320, 320), Image.Resampling.LANCZOS)
        save_webp(image, ASSET_ROOT / f"suina_assistant_{state}.webp")

    avatar = load_rgba("BgSub_穗奈标准头像v1.0.png")
    save_webp(
        avatar.resize((384, 384), Image.Resampling.LANCZOS),
        ASSET_ROOT / "suina_avatar.webp",
        quality=90,
    )
    monochrome_avatar = Image.new("RGBA", avatar.size, (255, 255, 255, 0))
    monochrome_avatar.putalpha(avatar.getchannel("A"))
    save_webp(
        monochrome_avatar.resize((384, 384), Image.Resampling.LANCZOS),
        ASSET_ROOT / "suina_avatar_monochrome.webp",
        lossless=True,
    )

    wordmark = resize_to_width(
        alpha_crop(load_rgba("BgSub_品牌名字体.png")),
        480,
    )
    save_webp(wordmark, ASSET_ROOT / "brand_wordmark.webp", lossless=True)

    lockup = resize_to_width(
        alpha_crop(load_rgba("BgSub_组合logo.png")),
        960,
    )
    save_webp(
        lockup,
        ASSET_ROOT / "brand_lockup_suina.webp",
        quality=90,
    )


if __name__ == "__main__":
    main()
