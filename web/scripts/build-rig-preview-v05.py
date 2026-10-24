# 青穗集 · 穗奈 v0.5 绑定预览构建器：稳定模型稿叠加独立手臂与道具，输出干净版和锚点版。
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "web" / "brand" / "desktop" / "suinai-smile.webp"
OUT = ROOT / "assets" / "web" / "brand" / "pixel-rig-v05" / "preview"
LOG = ROOT / "logs" / "suinai-face-20261018" / "v05-rig-preview"
LOGICAL = (128, 160)
NATIVE = (256, 320)

INK = (61, 47, 57, 255)
INK_SOFT = (91, 63, 62, 255)
SLEEVE_DARK = (93, 112, 151, 255)
SLEEVE = (146, 171, 212, 255)
SLEEVE_LIGHT = (188, 211, 239, 255)
SKIN_DARK = (192, 123, 105, 255)
SKIN = (246, 203, 177, 255)
SKIN_LIGHT = (255, 229, 203, 255)
PAPER_DARK = (120, 83, 70, 255)
PAPER = (236, 220, 198, 255)
PAPER_LIGHT = (255, 244, 221, 255)
GOLD = (210, 160, 80, 255)
PEN = (82, 72, 104, 255)
ANCHOR = (214, 80, 120, 230)
BONE = (90, 78, 130, 170)


def harden_source() -> Image.Image:
    image = Image.open(SOURCE).convert("RGBA").resize(LOGICAL, Image.Resampling.BOX)
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 72 else 0)
    return Image.merge("RGBA", (*image.convert("RGB").split(), alpha))


def polygon(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], fill: tuple[int, int, int, int], width: int = 2) -> None:
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=INK, width=width, joint="curve")


def joint(draw: ImageDraw.ImageDraw, x: int, y: int, radius: int = 4) -> None:
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=SKIN, outline=INK, width=2)


def sleeve_segment(draw: ImageDraw.ImageDraw, start: tuple[int, int], elbow: tuple[int, int], wrist: tuple[int, int], thickness: int = 8) -> None:
    sx, sy = start
    ex, ey = elbow
    wx, wy = wrist
    polygon(draw, [(sx - thickness, sy - 2), (sx + thickness, sy + 2), (ex + thickness, ey + 5), (ex - thickness, ey - 5)], SLEEVE_DARK)
    polygon(draw, [(ex - thickness + 2, ey - 5), (ex + thickness - 2, ey + 5), (wx + 5, wy + 5), (wx - 5, wy - 5)], SLEEVE)
    draw.line((sx - 4, sy, ex - 4, ey, wx - 3, wy), fill=SLEEVE_LIGHT, width=2)
    joint(draw, ex, ey, 4)


def hand(draw: ImageDraw.ImageDraw, x: int, y: int, gesture: str) -> None:
    if gesture == "open":
        polygon(draw, [(x - 6, y + 5), (x - 7, y - 3), (x - 4, y - 10), (x - 1, y - 5), (x + 1, y - 12), (x + 4, y - 5), (x + 6, y - 9), (x + 8, y - 1), (x + 6, y + 7)], SKIN)
        draw.line((x - 3, y + 2, x + 4, y + 2), fill=SKIN_DARK, width=2)
    elif gesture == "chin":
        polygon(draw, [(x - 6, y + 5), (x - 8, y - 2), (x - 4, y - 8), (x + 5, y - 8), (x + 8, y - 1), (x + 5, y + 7)], SKIN)
        draw.rectangle((x - 4, y - 7, x + 3, y - 4), fill=SKIN_LIGHT)
    elif gesture == "grip":
        polygon(draw, [(x - 7, y + 5), (x - 8, y - 4), (x - 3, y - 9), (x + 5, y - 7), (x + 8, y), (x + 5, y + 7)], SKIN)
        draw.line((x - 3, y - 2, x + 5, y + 2), fill=SKIN_DARK, width=2)
    else:
        polygon(draw, [(x - 6, y + 5), (x - 8, y - 3), (x - 3, y - 8), (x + 5, y - 7), (x + 8, y), (x + 5, y + 7)], SKIN)


def journal(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    polygon(draw, [(x - 21, y - 11), (x, y - 15), (x + 21, y - 11), (x + 20, y + 12), (x, y + 16), (x - 20, y + 12)], PAPER_DARK)
    polygon(draw, [(x - 18, y - 9), (x - 1, y - 12), (x - 1, y + 12), (x - 17, y + 9)], PAPER_LIGHT, 1)
    polygon(draw, [(x + 1, y - 12), (x + 18, y - 9), (x + 17, y + 9), (x + 1, y + 12)], PAPER, 1)
    draw.line((x, y - 11, x, y + 12), fill=PAPER_DARK, width=2)
    draw.line((x - 14, y - 2, x - 5, y - 4), fill=PAPER_DARK, width=1)
    draw.line((x + 5, y - 4, x + 14, y - 2), fill=PAPER_DARK, width=1)


def notebook(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    polygon(draw, [(x - 22, y - 10), (x + 18, y - 14), (x + 22, y + 10), (x - 18, y + 14)], PAPER_DARK)
    polygon(draw, [(x - 18, y - 8), (x + 16, y - 11), (x + 18, y + 7), (x - 16, y + 10)], PAPER_LIGHT, 1)
    draw.line((x - 9, y - 6, x + 9, y - 8), fill=PAPER_DARK, width=1)
    draw.line((x - 7, y - 1, x + 11, y - 3), fill=PAPER_DARK, width=1)


def pen(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    draw.line((x - 9, y + 8, x + 9, y - 10), fill=PEN, width=3)
    draw.point((x + 10, y - 11), fill=GOLD)


def draw_pose(name: str) -> Image.Image:
    image = harden_source()
    draw = ImageDraw.Draw(image)
    if name == "idle":
        sleeve_segment(draw, (46, 91), (49, 108), (56, 119))
        sleeve_segment(draw, (82, 91), (79, 108), (72, 119))
        hand(draw, 56, 119, "grip")
        hand(draw, 72, 119, "grip")
        journal(draw, 64, 124)
    elif name == "listen":
        sleeve_segment(draw, (46, 91), (43, 108), (49, 122))
        sleeve_segment(draw, (82, 91), (88, 98), (80, 72))
        hand(draw, 49, 122, "grip")
        hand(draw, 80, 71, "chin")
    elif name == "think":
        sleeve_segment(draw, (46, 91), (45, 108), (54, 121))
        sleeve_segment(draw, (82, 91), (84, 104), (79, 111))
        hand(draw, 54, 121, "grip")
        hand(draw, 79, 111, "grip")
        notebook(draw, 64, 126)
        pen(draw, 78, 108)
    elif name == "encourage":
        sleeve_segment(draw, (46, 91), (43, 108), (51, 121))
        sleeve_segment(draw, (82, 91), (94, 99), (105, 97))
        hand(draw, 51, 121, "grip")
        hand(draw, 105, 97, "open")
        polygon(draw, [(92, 106), (100, 101), (112, 99), (114, 106), (103, 113)], PAPER)
        draw.line((98, 104, 110, 103), fill=PAPER_DARK, width=1)
    else:
        raise ValueError(name)
    return image.resize(NATIVE, Image.Resampling.NEAREST)


def add_panel(canvas: Image.Image, pose: Image.Image, index: int, label: str, rig: bool) -> None:
    x = index * NATIVE[0]
    canvas.alpha_composite(pose, (x, 38))
    draw = ImageDraw.Draw(canvas)
    draw.text((x + 12, 12), label, fill=INK)
    if rig:
        anchors = [(128, 90), (128, 140), (92, 188), (164, 188), (60, 264), (196, 264), (128, 244)]
        for ax, ay in anchors:
            px, py = x + ax, 38 + ay
            draw.rectangle((px - 4, py - 4, px + 4, py + 4), outline=ANCHOR, width=2)
            draw.line((px - 10, py, px + 10, py), fill=ANCHOR, width=1)
            draw.line((px, py - 10, px, py + 10), fill=ANCHOR, width=1)
        draw.line((x + 92, 38 + 188, x + 60, 38 + 264), fill=BONE, width=2)
        draw.line((x + 164, 38 + 188, x + 196, 38 + 264), fill=BONE, width=2)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    LOG.mkdir(parents=True, exist_ok=True)
    names = [("idle", "IDLE / 待机"), ("listen", "LISTEN / 倾听"), ("think", "THINK / 思考"), ("encourage", "ENCOURAGE / 鼓励")]
    clean = Image.new("RGBA", (NATIVE[0] * len(names), NATIVE[1] + 38), (244, 241, 248, 255))
    rig = Image.new("RGBA", (NATIVE[0] * len(names), NATIVE[1] + 38), (244, 241, 248, 255))
    for index, (name, label) in enumerate(names):
        image = draw_pose(name)
        image.save(OUT / f"{name}-frame-00.png")
        add_panel(clean, image, index, label, False)
        add_panel(rig, image, index, label, True)
    clean.convert("RGB").save(OUT / "preview-sheet-clean.png")
    rig.convert("RGB").save(OUT / "preview-sheet-rig.png")
    clean.save(LOG / "preview-sheet-clean.png")
    rig.save(LOG / "preview-sheet-rig.png")
    print(f"generated {len(names)} rig preview poses in {OUT}")


if __name__ == "__main__":
    main()
