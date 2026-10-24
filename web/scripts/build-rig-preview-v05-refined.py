# 青穗集 · 穗奈 v0.5 精修预览构建器：从像素网格重画可拆分角色和四个绑定关键姿势。
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "assets" / "web" / "brand" / "pixel-rig-v05" / "preview-refined"
LAYER_OUT = ROOT / "assets" / "web" / "brand" / "pixel-rig-v05" / "model-sheet-refined"
LOG = ROOT / "logs" / "suinai-face-20261018" / "v05-rig-preview-refined"

LOGICAL = (128, 160)
NATIVE_SCALE = 2
NATIVE = (LOGICAL[0] * NATIVE_SCALE, LOGICAL[1] * NATIVE_SCALE)
PREVIEW_SCALE = 3

# Shared 28-color palette. All drawing happens on the logical pixel grid.
OUTLINE = (48, 38, 56, 255)
OUTLINE_SOFT = (79, 57, 67, 255)
HAIR_DARK = (92, 59, 61, 255)
HAIR = (157, 94, 74, 255)
HAIR_LIGHT = (205, 133, 91, 255)
HAIR_SHINE = (235, 174, 117, 255)
SKIN_SHADOW = (201, 126, 111, 255)
SKIN = (247, 199, 169, 255)
SKIN_LIGHT = (255, 226, 199, 255)
CHEEK = (235, 145, 137, 255)
JACKET_DARK = (58, 72, 105, 255)
JACKET = (103, 132, 177, 255)
JACKET_LIGHT = (160, 188, 221, 255)
JACKET_HIGHLIGHT = (198, 216, 239, 255)
SHIRT = (250, 244, 231, 255)
SHIRT_SHADOW = (218, 210, 201, 255)
EYE_DARK = (77, 48, 48, 255)
EYE = (157, 89, 62, 255)
EYE_LIGHT = (241, 184, 104, 255)
GLASS = (89, 70, 83, 255)
PAPER_DARK = (112, 75, 67, 255)
PAPER = (232, 213, 186, 255)
PAPER_LIGHT = (255, 243, 214, 255)
GOLD = (220, 165, 78, 255)
MINT = (103, 192, 169, 255)
INK_BLUE = (78, 102, 147, 255)
TRANSPARENT = (0, 0, 0, 0)

POSES = [
    ("idle", "IDLE", "journal / neutral"),
    ("listen", "LISTEN", "face / attentive"),
    ("think", "THINK", "note / focused"),
    ("encourage", "ENCOURAGE", "card / warm"),
]


def rgba_layer() -> Image.Image:
    return Image.new("RGBA", LOGICAL, TRANSPARENT)


def polygon(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], fill: tuple[int, int, int, int], width: int = 1) -> None:
    point_list = list(points)
    draw.polygon(point_list, fill=fill)
    if width:
        draw.line(point_list + [point_list[0]], fill=OUTLINE, width=width, joint="curve")


def line(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], fill: tuple[int, int, int, int], width: int = 1) -> None:
    draw.line(list(points), fill=fill, width=width, joint="curve")


def add_cluster(draw: ImageDraw.ImageDraw, points: Iterable[tuple[int, int]], fill: tuple[int, int, int, int]) -> None:
    draw.polygon(list(points), fill=fill)


def draw_hair_back(layer: Image.Image) -> None:
    d = ImageDraw.Draw(layer)
    polygon(d, [(31, 78), (28, 55), (31, 37), (39, 23), (51, 15), (70, 13), (87, 19), (98, 34), (101, 57), (98, 87), (91, 106), (82, 111), (76, 90), (51, 90), (45, 109), (35, 104)], HAIR_DARK, 2)
    polygon(d, [(35, 65), (34, 41), (42, 26), (55, 18), (71, 17), (87, 24), (96, 42), (96, 74), (89, 96), (82, 101), (76, 78), (49, 78), (44, 100), (37, 96)], HAIR, 1)
    polygon(d, [(37, 45), (42, 28), (54, 20), (67, 18), (81, 25), (90, 39), (89, 51), (83, 42), (70, 30), (53, 29), (43, 39)], HAIR_LIGHT, 1)
    add_cluster(d, [(42, 29), (49, 23), (53, 23), (47, 34), (42, 39)], HAIR_SHINE)
    add_cluster(d, [(58, 18), (68, 16), (68, 22), (59, 25)], HAIR_SHINE)
    add_cluster(d, [(82, 29), (89, 38), (89, 46), (84, 39)], HAIR_SHINE)
    line(d, [(35, 59), (36, 88), (40, 100)], HAIR_DARK, 2)
    line(d, [(94, 50), (95, 78), (89, 100)], HAIR_DARK, 2)
    line(d, [(43, 32), (39, 55), (40, 74)], HAIR, 1)
    line(d, [(82, 28), (92, 51), (91, 76)], HAIR, 1)


def draw_body(layer: Image.Image) -> None:
    d = ImageDraw.Draw(layer)
    polygon(d, [(39, 88), (50, 81), (64, 84), (78, 81), (89, 88), (103, 101), (108, 159), (20, 159), (25, 108)], JACKET_DARK, 2)
    polygon(d, [(43, 91), (53, 85), (63, 88), (64, 107), (52, 113), (37, 105)], JACKET, 1)
    polygon(d, [(85, 91), (75, 85), (65, 88), (64, 107), (76, 113), (92, 105)], JACKET, 1)
    polygon(d, [(52, 86), (64, 96), (76, 86), (83, 158), (45, 158)], SHIRT, 1)
    polygon(d, [(52, 86), (64, 96), (64, 105), (57, 100)], SHIRT_SHADOW, 1)
    polygon(d, [(76, 86), (64, 96), (64, 105), (71, 100)], SHIRT_SHADOW, 1)
    line(d, [(42, 95), (34, 107), (30, 151)], JACKET_LIGHT, 2)
    line(d, [(86, 95), (94, 107), (98, 151)], JACKET_LIGHT, 2)
    line(d, [(48, 115), (45, 151)], JACKET_DARK, 1)
    line(d, [(80, 115), (83, 151)], JACKET_DARK, 1)
    add_cluster(d, [(29, 119), (33, 116), (37, 121), (34, 127)], JACKET_LIGHT)
    add_cluster(d, [(91, 116), (96, 120), (99, 127), (95, 128)], JACKET_LIGHT)


def draw_face(layer: Image.Image, pose: str) -> None:
    d = ImageDraw.Draw(layer)
    d.rectangle((57, 73, 70, 91), fill=SKIN_SHADOW)
    d.rectangle((59, 72, 68, 92), fill=SKIN)
    polygon(d, [(42, 39), (47, 28), (58, 23), (73, 24), (84, 31), (90, 43), (88, 61), (81, 72), (70, 79), (58, 78), (48, 71), (42, 59)], SKIN, 2)
    polygon(d, [(42, 53), (47, 68), (58, 77), (65, 77), (60, 71), (49, 66), (46, 54)], SKIN_SHADOW, 0)
    add_cluster(d, [(80, 44), (87, 46), (87, 56), (83, 61), (79, 57)], SKIN_LIGHT)
    add_cluster(d, [(47, 61), (52, 65), (56, 66), (53, 70), (48, 67)], CHEEK)
    add_cluster(d, [(76, 61), (81, 59), (84, 61), (81, 65), (76, 65)], CHEEK)

    # Brows and eyes are hand-authored per action so the same rig can carry emotion.
    if pose == "think":
        line(d, [(48, 45), (55, 43)], EYE_DARK, 2)
        line(d, [(72, 43), (79, 45)], EYE_DARK, 2)
        eye(d, 53, 52, pupil=(52, 50), open_level="soft")
        eye(d, 76, 52, pupil=(75, 50), open_level="soft")
        line(d, [(61, 66), (64, 67), (67, 66)], OUTLINE_SOFT, 1)
    elif pose == "encourage":
        line(d, [(48, 43), (55, 42)], EYE_DARK, 1)
        line(d, [(72, 42), (79, 43)], EYE_DARK, 1)
        eye(d, 53, 51, pupil=(53, 52), open_level="wide")
        eye(d, 76, 51, pupil=(76, 52), open_level="wide")
        line(d, [(60, 65), (64, 68), (68, 65)], OUTLINE_SOFT, 1)
    elif pose == "listen":
        line(d, [(48, 44), (55, 44)], EYE_DARK, 1)
        line(d, [(72, 43), (79, 42)], EYE_DARK, 1)
        eye(d, 53, 52, pupil=(55, 52), open_level="wide")
        eye(d, 76, 52, pupil=(78, 51), open_level="wide")
        line(d, [(61, 66), (64, 67), (67, 66)], OUTLINE_SOFT, 1)
    else:
        line(d, [(48, 44), (55, 43)], EYE_DARK, 1)
        line(d, [(72, 43), (79, 44)], EYE_DARK, 1)
        eye(d, 53, 52, pupil=(53, 52), open_level="normal")
        eye(d, 76, 52, pupil=(76, 52), open_level="normal")
        line(d, [(61, 66), (64, 68), (67, 66)], OUTLINE_SOFT, 1)

    # Nose and a few intentional pixel highlights keep the face readable at 2x.
    add_cluster(d, [(64, 56), (66, 59), (64, 61)], SKIN_SHADOW)
    d.point((63, 58), fill=SKIN_LIGHT)
    d.point((58, 34), fill=SKIN_LIGHT)
    d.point((73, 34), fill=SKIN_LIGHT)


def eye(d: ImageDraw.ImageDraw, cx: int, cy: int, pupil: tuple[int, int], open_level: str) -> None:
    if open_level == "wide":
        polygon(d, [(cx - 5, cy), (cx - 2, cy - 4), (cx + 3, cy - 4), (cx + 5, cy), (cx + 2, cy + 4), (cx - 2, cy + 4)], SKIN_LIGHT, 1)
    elif open_level == "soft":
        polygon(d, [(cx - 5, cy), (cx - 2, cy - 3), (cx + 3, cy - 3), (cx + 5, cy), (cx + 2, cy + 3), (cx - 2, cy + 3)], SKIN_LIGHT, 1)
    else:
        polygon(d, [(cx - 5, cy), (cx - 2, cy - 3), (cx + 3, cy - 3), (cx + 5, cy), (cx + 2, cy + 3), (cx - 2, cy + 3)], SKIN_LIGHT, 1)
    px, py = pupil
    d.rectangle((px - 2, py - 2, px + 2, py + 2), fill=EYE_DARK)
    d.rectangle((px - 1, py - 1, px + 1, py + 1), fill=EYE)
    d.point((px + 1, py - 1), fill=EYE_LIGHT)
    d.point((px - 1, py - 2), fill=SKIN_LIGHT)


def draw_hair_front(layer: Image.Image) -> None:
    d = ImageDraw.Draw(layer)
    polygon(d, [(39, 44), (40, 29), (50, 20), (62, 18), (73, 21), (84, 29), (87, 39), (79, 35), (73, 31), (68, 42), (63, 33), (57, 45), (53, 34), (47, 48)], HAIR_DARK, 1)
    polygon(d, [(42, 40), (44, 29), (53, 22), (62, 21), (69, 24), (65, 38), (60, 30), (55, 43), (51, 31), (46, 45)], HAIR_LIGHT, 0)
    polygon(d, [(76, 31), (84, 35), (88, 45), (87, 72), (83, 84), (78, 78), (81, 55)], HAIR, 1)
    polygon(d, [(39, 45), (35, 55), (36, 82), (41, 96), (46, 88), (43, 65)], HAIR, 1)
    line(d, [(45, 29), (51, 25), (54, 25)], HAIR_SHINE, 2)
    line(d, [(69, 25), (77, 30), (80, 35)], HAIR_SHINE, 1)
    add_cluster(d, [(84, 68), (88, 72), (86, 80), (82, 78)], HAIR_LIGHT)


def octagon(cx: int, cy: int, rx: int, ry: int) -> list[tuple[int, int]]:
    return [(cx - rx + 2, cy - ry), (cx + rx - 2, cy - ry), (cx + rx, cy - ry + 2), (cx + rx, cy + ry - 2), (cx + rx - 2, cy + ry), (cx - rx + 2, cy + ry), (cx - rx, cy + ry - 2), (cx - rx, cy - ry + 2)]


def draw_glasses(layer: Image.Image) -> None:
    d = ImageDraw.Draw(layer)
    d.line((58, 52, 71, 52), fill=GLASS, width=2)
    d.line((43, 51, 47, 51), fill=GLASS, width=1)
    d.line((84, 51, 88, 51), fill=GLASS, width=1)
    d.line(octagon(53, 52, 9, 8) + [octagon(53, 52, 9, 8)[0]], fill=GLASS, width=2, joint="curve")
    d.line(octagon(76, 52, 9, 8) + [octagon(76, 52, 9, 8)[0]], fill=GLASS, width=2, joint="curve")
    d.point((47, 48), fill=JACKET_HIGHLIGHT)
    d.point((80, 48), fill=JACKET_HIGHLIGHT)


def strip_points(start: tuple[int, int], end: tuple[int, int], width: int) -> list[tuple[int, int]]:
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    if abs(dx) >= abs(dy):
        off = (0, width)
    else:
        off = (width, 0)
    ox, oy = off
    return [(sx - ox, sy - oy), (sx + ox, sy + oy), (ex + ox, ey + oy), (ex - ox, ey - oy)]


def sleeve_segment(d: ImageDraw.ImageDraw, start: tuple[int, int], elbow: tuple[int, int], wrist: tuple[int, int], shade: int = 0) -> None:
    base = JACKET if shade == 0 else JACKET_LIGHT
    polygon(d, strip_points(start, elbow, 7), base, 1)
    polygon(d, strip_points(elbow, wrist, 6), base, 1)
    line(d, [(start[0] - 2, start[1]), (elbow[0] - 2, elbow[1]), (wrist[0] - 2, wrist[1])], JACKET_HIGHLIGHT, 1)
    d.rectangle((elbow[0] - 3, elbow[1] - 2, elbow[0] + 3, elbow[1] + 2), fill=JACKET_DARK)
    d.rectangle((wrist[0] - 4, wrist[1] - 2, wrist[0] + 4, wrist[1] + 2), fill=JACKET_DARK)


def draw_arm(layer: Image.Image, pose: str, side: str) -> None:
    d = ImageDraw.Draw(layer)
    if pose == "idle":
        if side == "left":
            sleeve_segment(d, (36, 97), (34, 113), (47, 123))
        else:
            sleeve_segment(d, (92, 97), (94, 113), (81, 123))
    elif pose == "listen":
        if side == "left":
            sleeve_segment(d, (36, 97), (33, 113), (46, 123))
        else:
            sleeve_segment(d, (92, 97), (97, 87), (86, 72), 1)
    elif pose == "think":
        if side == "left":
            sleeve_segment(d, (36, 97), (34, 113), (47, 123))
        else:
            sleeve_segment(d, (92, 97), (87, 108), (77, 113))
    else:
        if side == "left":
            sleeve_segment(d, (36, 97), (34, 113), (46, 123))
        else:
            sleeve_segment(d, (92, 97), (100, 96), (108, 87), 1)


def draw_hand(layer: Image.Image, pose: str, side: str) -> None:
    d = ImageDraw.Draw(layer)
    if pose == "idle":
        x, y, gesture = ((47, 126, "grip") if side == "left" else (81, 126, "grip"))
    elif pose == "listen":
        x, y, gesture = ((46, 126, "grip") if side == "left" else (85, 65, "cheek"))
    elif pose == "think":
        x, y, gesture = ((47, 126, "grip") if side == "left" else (76, 108, "chin"))
    else:
        x, y, gesture = ((46, 126, "grip") if side == "left" else (111, 84, "open"))
    if gesture == "open":
        polygon(d, [(x - 7, y + 5), (x - 8, y - 2), (x - 6, y - 8), (x - 3, y - 4), (x - 1, y - 11), (x + 2, y - 5), (x + 4, y - 10), (x + 7, y - 3), (x + 8, y + 4), (x + 4, y + 8), (x - 3, y + 8)], SKIN, 1)
        line(d, [(x - 4, y + 1), (x + 4, y + 2)], SKIN_SHADOW, 1)
        d.point((x + 2, y - 7), fill=SKIN_LIGHT)
    elif gesture == "cheek":
        polygon(d, [(x - 6, y + 7), (x - 8, y), (x - 5, y - 7), (x, y - 9), (x + 6, y - 5), (x + 7, y + 3), (x + 4, y + 8)], SKIN, 1)
        line(d, [(x - 3, y - 2), (x + 4, y - 2)], SKIN_SHADOW, 1)
        d.rectangle((x - 1, y - 7, x + 2, y - 4), fill=SKIN_LIGHT)
    elif gesture == "chin":
        polygon(d, [(x - 7, y + 7), (x - 8, y), (x - 5, y - 6), (x + 1, y - 8), (x + 7, y - 4), (x + 7, y + 4), (x + 3, y + 8)], SKIN, 1)
        line(d, [(x - 4, y - 1), (x + 4, y - 2)], SKIN_SHADOW, 1)
        d.point((x + 2, y - 5), fill=SKIN_LIGHT)
    else:
        polygon(d, [(x - 7, y + 7), (x - 8, y - 3), (x - 4, y - 8), (x + 4, y - 7), (x + 8, y - 2), (x + 7, y + 6), (x + 2, y + 8), (x - 3, y + 8)], SKIN, 1)
        line(d, [(x - 4, y - 1), (x + 4, y + 1)], SKIN_SHADOW, 1)
        d.point((x - 1, y - 5), fill=SKIN_LIGHT)


def draw_prop(layer: Image.Image, pose: str) -> None:
    d = ImageDraw.Draw(layer)
    if pose == "idle":
        x, y = 64, 130
        polygon(d, [(x - 18, y - 11), (x - 1, y - 14), (x + 18, y - 10), (x + 17, y + 10), (x, y + 14), (x - 17, y + 10)], PAPER_DARK, 1)
        polygon(d, [(x - 15, y - 8), (x - 2, y - 10), (x - 2, y + 10), (x - 14, y + 8)], PAPER_LIGHT, 0)
        polygon(d, [(x + 2, y - 10), (x + 15, y - 8), (x + 14, y + 8), (x + 2, y + 10)], PAPER, 0)
        line(d, [(x, y - 9), (x, y + 10)], PAPER_DARK, 1)
        line(d, [(x - 12, y - 2), (x - 5, y - 3)], PAPER_DARK, 1)
        line(d, [(x + 5, y - 3), (x + 12, y - 2)], PAPER_DARK, 1)
    elif pose == "think":
        x, y = 64, 130
        polygon(d, [(x - 20, y - 9), (x + 16, y - 13), (x + 19, y + 9), (x - 17, y + 13)], PAPER_DARK, 1)
        polygon(d, [(x - 16, y - 7), (x + 14, y - 10), (x + 16, y + 6), (x - 14, y + 9)], PAPER_LIGHT, 0)
        line(d, [(x - 9, y - 4), (x + 9, y - 6)], PAPER_DARK, 1)
        line(d, [(x - 7, y + 1), (x + 11, y - 1)], PAPER_DARK, 1)
        line(d, [(74, 113), (83, 103)], INK_BLUE, 2)
        d.point((84, 102), fill=GOLD)
    elif pose == "encourage":
        x, y = 104, 88
        polygon(d, [(x - 12, y - 8), (x + 10, y - 10), (x + 13, y + 5), (x + 2, y + 10), (x - 11, y + 6)], PAPER_DARK, 1)
        polygon(d, [(x - 9, y - 5), (x + 8, y - 7), (x + 10, y + 3), (x + 1, y + 7), (x - 8, y + 4)], PAPER_LIGHT, 0)
        line(d, [(x - 5, y - 1), (x + 6, y - 3)], PAPER_DARK, 1)
        line(d, [(x - 3, y + 3), (x + 4, y + 1)], PAPER_DARK, 1)


def draw_effects(layer: Image.Image, pose: str) -> None:
    d = ImageDraw.Draw(layer)
    if pose == "listen":
        d.point((96, 61), fill=MINT)
        d.point((99, 65), fill=MINT)
        d.point((94, 67), fill=GOLD)
    elif pose == "think":
        d.point((91, 95), fill=GOLD)
        d.point((95, 92), fill=MINT)
    elif pose == "encourage":
        line(d, [(119, 75), (119, 81)], GOLD, 1)
        line(d, [(116, 78), (122, 78)], GOLD, 1)
        d.point((112, 69), fill=MINT)
    else:
        d.point((27, 91), fill=MINT)
        d.point((101, 91), fill=GOLD)


def render_layers(pose: str) -> dict[str, Image.Image]:
    layers: dict[str, Image.Image] = {
        "hair-back": rgba_layer(),
        "body": rgba_layer(),
        "neck-face": rgba_layer(),
        "hair-front": rgba_layer(),
        "glasses": rgba_layer(),
        "arm-left": rgba_layer(),
        "arm-right": rgba_layer(),
        "prop": rgba_layer(),
        "hands": rgba_layer(),
        "effects": rgba_layer(),
    }
    draw_hair_back(layers["hair-back"])
    draw_body(layers["body"])
    draw_face(layers["neck-face"], pose)
    draw_hair_front(layers["hair-front"])
    draw_glasses(layers["glasses"])
    draw_arm(layers["arm-left"], pose, "left")
    draw_arm(layers["arm-right"], pose, "right")
    draw_prop(layers["prop"], pose)
    draw_hand(layers["hands"], pose, "left")
    draw_hand(layers["hands"], pose, "right")
    draw_effects(layers["effects"], pose)
    return layers


def composite(layers: dict[str, Image.Image]) -> Image.Image:
    result = Image.new("RGBA", LOGICAL, TRANSPARENT)
    for layer_id in ["hair-back", "body", "neck-face", "hair-front", "glasses", "arm-left", "arm-right", "prop", "hands", "effects"]:
        result.alpha_composite(layers[layer_id])
    return result


def upscale(image: Image.Image, scale: int = NATIVE_SCALE) -> Image.Image:
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


def font(size: int) -> ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/consola.ttf"),
        Path("C:/Windows/Fonts/lucon.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def draw_panel(canvas: Image.Image, sprite: Image.Image, index: int, pose: str, title: str, subtitle: str, rig: bool) -> None:
    panel_w = 322
    panel_y = 28
    panel_h = 390
    x = index * panel_w
    sprite_x = x + 33
    sprite_y = 70
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle((x + 10, panel_y, x + panel_w - 10, panel_y + panel_h - 10), radius=12, fill=(247, 243, 240, 255), outline=(206, 191, 186, 255), width=2)
    d.rectangle((x + 10, panel_y, x + panel_w - 10, panel_y + 48), fill=(55, 48, 68, 255))
    d.text((x + 24, panel_y + 10), title, fill=(255, 239, 218, 255), font=font(18))
    d.text((x + 24, panel_y + 30), subtitle, fill=(190, 211, 232, 255), font=font(10))
    # Pixel grid behind the sprite makes the native 2x rhythm visible without touching the art.
    for gx in range(x + 26, x + panel_w - 20, 16):
        d.line((gx, 82, gx, 358), fill=(232, 225, 224, 255), width=1)
    for gy in range(82, 359, 16):
        d.line((x + 26, gy, x + panel_w - 20, gy), fill=(232, 225, 224, 255), width=1)
    scaled = upscale(sprite, 2)
    canvas.alpha_composite(scaled, (sprite_x, sprite_y))
    d.text((x + 24, 397), f"{index + 1:02d}  4-FRAME KEY POSE", fill=(82, 66, 78, 255), font=font(10))
    if rig:
        anchors = [(64, 45), (64, 70), (64, 82), (36, 97), (92, 97), (47, 126), (81, 126), (64, 130)]
        for ax, ay in anchors:
            px, py = sprite_x + ax * 2, sprite_y + ay * 2
            d.rectangle((px - 4, py - 4, px + 4, py + 4), outline=(214, 74, 124, 255), width=2)
            d.line((px - 8, py, px + 8, py), fill=(214, 74, 124, 210), width=1)
            d.line((px, py - 8, px, py + 8), fill=(214, 74, 124, 210), width=1)
        # Bone lines follow the actual shoulder and forearm pivots for this preview.
        d.line((sprite_x + 36 * 2, sprite_y + 97 * 2, sprite_x + 34 * 2, sprite_y + 113 * 2, sprite_x + 47 * 2, sprite_y + 123 * 2), fill=(93, 74, 132, 210), width=2)
        d.line((sprite_x + 92 * 2, sprite_y + 97 * 2, sprite_x + 94 * 2, sprite_y + 113 * 2, sprite_x + 81 * 2, sprite_y + 123 * 2), fill=(93, 74, 132, 210), width=2)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    LAYER_OUT.mkdir(parents=True, exist_ok=True)
    LOG.mkdir(parents=True, exist_ok=True)

    meta = {
        "version": "0.5-refined-preview-01",
        "logical_canvas": list(LOGICAL),
        "native_canvas": list(NATIVE),
        "palette_colors": 28,
        "source": "hand-authored pixel grid; no raster resize from the old portrait",
        "poses": [name for name, _, _ in POSES],
    }
    (LAYER_OUT / "preview-manifest.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    clean = Image.new("RGBA", (322 * len(POSES), 424), (232, 226, 231, 255))
    rig = Image.new("RGBA", (322 * len(POSES), 424), (232, 226, 231, 255))
    d_clean = ImageDraw.Draw(clean)
    d_rig = ImageDraw.Draw(rig)
    d_clean.rectangle((0, 0, clean.width, 23), fill=(55, 48, 68, 255))
    d_rig.rectangle((0, 0, rig.width, 23), fill=(55, 48, 68, 255))
    d_clean.text((18, 5), "SUINAI // PIXEL RIG PREVIEW 01", fill=(255, 239, 218, 255), font=font(12))
    d_rig.text((18, 5), "SUINAI // PIXEL RIG + ANCHORS", fill=(255, 239, 218, 255), font=font(12))

    for index, (pose, title, subtitle) in enumerate(POSES):
        layers = render_layers(pose)
        sprite = composite(layers)
        native = upscale(sprite)
        native.save(OUT / f"{pose}-frame-00.png")
        sprite.save(LOG / f"{pose}-logical-frame-00.png")
        native.save(LOG / f"{pose}-frame-00.png")
        pose_dir = LAYER_OUT / pose
        pose_dir.mkdir(parents=True, exist_ok=True)
        for layer_id, layer in layers.items():
            layer.save(pose_dir / f"{layer_id}.png")
        draw_panel(clean, sprite, index, pose, title, subtitle, False)
        draw_panel(rig, sprite, index, pose, title, subtitle, True)

    clean.save(OUT / "preview-sheet-refined.png")
    rig.save(OUT / "preview-sheet-refined-rig.png")
    clean.save(LOG / "preview-sheet-refined.png")
    rig.save(LOG / "preview-sheet-refined-rig.png")
    print(f"generated refined pixel rig preview in {OUT}")


if __name__ == "__main__":
    main()
