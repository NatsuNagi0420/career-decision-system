"""青穗集 · 角色资产只读盘点：核实原图与透明版，输出表情总览和清单，不生成新人物。"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "品牌形象"
EXPRESSIONS = {
    "smile": "默认微笑",
    "listen": "专注倾听",
    "think": "认真思考",
    "explain": "温和讲解",
    "warn": "重要提醒",
    "worry": "轻度担心",
    "happy": "完成后的开心",
    "encourage": "鼓励行动",
}
ROLE_REFERENCES = {
    "穗奈标准头像v1.0", "穗奈立绘v1.0", "穗奈正面图", "穗奈侧面图", "穗奈背面图",
}


def font(size: int) -> ImageFont.FreeTypeFont:
    """Prefer a local CJK font; never fetch fonts or dependencies over the network."""
    candidates = (
        Path("C:/Windows/Fonts/msyh.ttc"),
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    raise RuntimeError("未找到本地中文字体；请在 font() 中配置已有的中文字体路径。")


def inspect_sources() -> dict:
    """Treat an original/BgSub pair as one source design, not two artworks."""
    pngs = sorted(SOURCE.glob("*.png"))
    entries = []
    for source in sorted(SOURCE.glob("BgSub_*.png")):
        stem = source.stem.removeprefix("BgSub_")
        original = SOURCE / f"{stem}.png"
        category = (
            "expression" if stem in EXPRESSIONS.values()
            else "role_reference" if stem in ROLE_REFERENCES
            else "brand_mark"
        )
        with Image.open(source) as image:
            rgba = image.convert("RGBA")
            alpha = rgba.getchannel("A")
            entries.append({
                "name": stem,
                "category": category,
                "source": source.relative_to(ROOT).as_posix(),
                "original": original.relative_to(ROOT).as_posix() if original.exists() else None,
                "size": list(image.size),
                "mode": image.mode,
                "has_nonopaque_pixels": alpha.getextrema()[0] < 255,
                "alpha_bbox": alpha.getbbox(),
                "provenance": "existing repository asset; usage rights not independently verified",
            })
    for name in EXPRESSIONS.values():
        if not (SOURCE / f"BgSub_{name}.png").is_file():
            raise FileNotFoundError(f"缺少表情参考：{name}")
    counts = {
        "png_files": len(pngs),
        "source_design_pairs": len(entries),
        "expression_pairs": sum(entry["category"] == "expression" for entry in entries),
        "role_reference_pairs": sum(entry["category"] == "role_reference" for entry in entries),
        "brand_mark_pairs": sum(entry["category"] == "brand_mark" for entry in entries),
        "unpaired_bgsub": sum(entry["original"] is None for entry in entries),
    }
    desktop = sorted((ROOT / "assets/web/brand/desktop").glob("*.webp"))
    return {
        "mode": "local source inspection only; no network, model, or application API calls",
        "new_character_artworks_created": 0,
        "counts": counts,
        "desktop_derivatives": [path.relative_to(ROOT).as_posix() for path in desktop],
        "desktop_derivatives_note": "cropped/resized from existing sources, not new character designs",
        "entries": entries,
    }


def render_sheet(output: Path) -> None:
    """Label a contact sheet explicitly as existing assets; it is not a new design."""
    sheet = Image.new("RGB", (1440, 1060), "#eeebf6")
    draw = ImageDraw.Draw(sheet)
    draw.text((42, 24), "穗奈 / 现有表情素材盘点", font=font(32), fill="#423757")
    draw.text((44, 76), "已有 8 张表情参考 · 尚未新增动作立绘 · 原图与去背版不重复计数", font=font(19), fill="#6c607b")
    colors = ("#f8f5fc", "#e7e0f0")
    for index, (slug, name) in enumerate(EXPRESSIONS.items()):
        x = 40 + index % 4 * 350
        y = 126 + index // 4 * 438
        draw.rounded_rectangle((x, y, x + 326, y + 414), radius=6, fill=colors[0], outline="#b4a2c8", width=2)
        # Recomposition for inspection only, not an exported runtime character asset.
        with Image.open(SOURCE / f"BgSub_{name}.png") as source:
            rgba = source.convert("RGBA")
            bbox = rgba.getchannel("A").getbbox()
            if not bbox:
                raise ValueError(f"表情素材完全透明：{name}")
            image = ImageOps.contain(rgba.crop(bbox), (294, 322), Image.Resampling.LANCZOS)
            preview = Image.new("RGBA", image.size, colors[0])
            preview.alpha_composite(image)
            sheet.paste(preview.convert("RGB"), (x + (326 - image.width) // 2, y + 12 + 322 - image.height))
        draw.line((x + 16, y + 344, x + 310, y + 344), fill=colors[1], width=2)
        draw.text((x + 18, y + 357), name, font=font(22), fill="#423757")
        draw.text((x + 18, y + 390), f"EXISTING / {slug.upper()}", font=font(12), fill="#7c6d8a")
    draw.text((44, 1021), "下一步：先定稿「拿手账」主姿势，再扩展倾听、思考、对照、确认与归档动作。", font=font(18), fill="#5b4c6d")
    sheet.save(output)


def main() -> None:
    parser = argparse.ArgumentParser(description="只读盘点穗奈素材并输出清单与总览图")
    parser.add_argument("--out", type=Path, default=ROOT / "logs/brand-inventory")
    args = parser.parse_args()
    output = args.out.resolve()
    output.mkdir(parents=True, exist_ok=True)
    report = inspect_sources()
    render_sheet(output / "素材盘点.png")
    report_path = output / "inventory.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["counts"], ensure_ascii=False))
    print(f"Report: {report_path}")
    print(f"Contact sheet: {output / '素材盘点.png'}")


if __name__ == "__main__":
    main()
