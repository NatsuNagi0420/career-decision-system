"""青穗集 · 原创启动字标：从已许可像素字体生成逐字扫描路径、麦穗描边和一致的静态回退。"""
from __future__ import annotations
import json
from pathlib import Path
from xml.sax.saxutils import escape
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "assets/web/projects/qingsuiji-boot/scene-1"
FPS, FRAMES = 60, 78
INK = [0.9373, 0.9216, 0.9882, 1]
MINT = [0.6314, 0.8353, 0.7882, 1]
MUTED = [0.6471, 0.6588, 0.7765, 1]
font = TTFont(ROOT / "public/fonts/fusion-pixel-12px-zh-hans.woff2")
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()

def static(value):
    return {"a": 0, "k": value}

def animate(values):
    result = []
    for index, (time, value) in enumerate(values):
        frame = {"t": time, "s": value if isinstance(value, list) else [value]}
        if index + 1 < len(values):
            frame["o"] = {"x": [.20], "y": [.75]}
        frame["i"] = {"x": [.34], "y": [.94]}
        result.append(frame)
    return {"a": 1, "k": result}

def contour(points, closed=True):
    return {"v": points, "i": [[0, 0] for _ in points], "o": [[0, 0] for _ in points], "c": closed}

def glyph_paths(letter, x, baseline, scale):
    pen = RecordingPen()
    glyphs[cmap[ord(letter)]].draw(pen)
    paths, points = [], []
    for op, args in pen.value:
        if op == "moveTo":
            points = []
        if op in {"moveTo", "lineTo"}:
            points.append([round(x + args[0][0] * scale, 4), round(baseline - args[0][1] * scale, 4)])
        elif op in {"closePath", "endPath"}:
            if points and points[-1] == points[0]:
                points.pop()
            paths.append(contour(points, op == "closePath"))
        else:
            raise ValueError("The pixel-font path is no longer line-only: " + op)
    return paths

def base_layer(name, index):
    return {"ty": 4, "ind": index, "nm": name, "ip": 0, "op": FRAMES, "st": 0,
            "ks": {"o": static(100), "r": static(0), "p": static([0, 0, 0]), "a": static([0, 0, 0]), "s": static([100, 100, 100])}}

def fill(color, slot):
    return {"ty": "fl", "c": {"a": 0, "k": color, "sid": slot}, "o": static(100), "r": 1}

def shapes(paths):
    return [{"ty": "sh", "ks": static(p), "nm": "Pixel outline"} for p in paths]

def svg_path(p):
    if not p["v"]:
        return ""
    return "M" + " L".join(f"{x:g},{y:g}" for x, y in p["v"]) + (" Z" if p["c"] else "")

layers, poster = [], []
# The same original wheat geometry as PixelIcon, staged from stem to upper leaves.
wheat = [
    [[12, 22], [12, 4]],
    [[12, 16], [6, 13], [6, 10], [12, 13]],
    [[12, 16], [18, 13], [18, 10], [12, 13]],
    [[12, 12], [6, 9], [6, 6], [12, 9]],
    [[12, 12], [18, 9], [18, 6], [12, 9]],
    [[12, 8], [7, 5], [7, 2], [12, 5]],
    [[12, 8], [17, 5], [17, 2], [12, 5]],
]
for index, points in enumerate(wheat):
    layer = base_layer("Wheat / " + str(index), index + 1)
    layer["ks"]["p"], layer["ks"]["a"], layer["ks"]["s"] = static([320, 71, 0]), static([12, 12, 0]), static([400, 400, 100])
    layer["shapes"] = shapes([contour(points, False)]) + [
        {"ty": "st", "c": {"a": 0, "k": MINT, "sid": "accentColor"}, "o": static(100), "w": static(1.3), "lc": 3, "lj": 1, "ml": 4},
        {"ty": "tm", "s": static(0), "e": animate([(index * 2, 8 if index == 0 else 0), (18 + index * 2, 100)]), "o": static(0), "m": 1},
    ]
    layers.append(layer)
    transformed = contour([[320 + (x - 12) * 4, 71 + (y - 12) * 4] for x, y in points], False)
    poster.append('<path d="' + svg_path(transformed) + '" fill="none" stroke="#a1d5c9" stroke-width="5.2" stroke-linecap="square" stroke-linejoin="miter"/>')

# Fixed wordmark contours intentionally receive path-mask reveals; no font is fetched by the animation.
size, tracking = 84, 18
x = (640 - (3 * size + 2 * tracking)) / 2
for index, letter in enumerate("青穗集"):
    paths = glyph_paths(letter, x, 227, size / 1200)
    layer = base_layer("Wordmark / " + letter, len(layers) + 1)
    layer["shapes"] = shapes(paths) + [fill(INK, "inkColor")]
    left, top, bottom = x - 4, 140, 245
    empty = contour([[left, top], [left, top], [left, bottom], [left, bottom]])
    full = contour([[left, top], [x + size + 4, top], [x + size + 4, bottom], [left, bottom]])
    layer["hasMask"] = True
    layer["masksProperties"] = [{"inv": False, "mode": "a", "nm": "Pixel scan / " + letter,
        "pt": animate([(10 + index * 6, [empty]), (28 + index * 6, [full])]), "o": static(100), "x": static(0)}]
    layers.append(layer)
    poster.append('<path d="' + ' '.join(svg_path(p) for p in paths) + '" fill="#efebfc" fill-rule="nonzero"/>')
    x += size + tracking

copy = "CAREER DESKTOP"
scale, tracking = 24 / 1200, 4
width = sum(font["hmtx"].metrics[cmap[ord(ch)]][0] * scale for ch in copy) + (len(copy) - 1) * tracking
x, english = (640 - width) / 2, []
for letter in copy:
    if letter != " ":
        english.extend(glyph_paths(letter, x, 281, scale))
    x += font["hmtx"].metrics[cmap[ord(letter)]][0] * scale + tracking
layer = base_layer("CAREER DESKTOP / support", len(layers) + 1)
layer["ks"]["o"] = animate([(29, 0), (45, 100)])
layer["shapes"] = shapes(english) + [fill(MUTED, "mutedColor")]
layers.append(layer)
poster.append('<path d="' + ' '.join(svg_path(p) for p in english) + '" fill="#a5a8c6"/>')
scene = {"v": "5.13.0", "fr": FPS, "ip": 0, "op": FRAMES, "w": 640, "h": 340,
    "nm": "青穗集 · 像素启动字标 / transparent", "assets": [], "layers": list(reversed(layers)),
    "slots": {"inkColor": {"p": static(INK)}, "accentColor": {"p": static(MINT)}, "mutedColor": {"p": static(MUTED)}},
    "meta": {"generator": "青穗集 · build-boot-lottie.py", "background": "transparent", "durationSec": FRAMES / FPS,
        "typography": "Licensed Fusion Pixel contours; intentional per-glyph path-mask reveal", "audio": False}}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "lottie.json").write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
(OUT / "controls.json").write_text(json.dumps({"controls": [{"sid": "inkColor", "label": "主标题颜色"}, {"sid": "accentColor", "label": "麦穗颜色"}, {"sid": "mutedColor", "label": "副标题颜色"}]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "poster.svg").write_text('<!-- 青穗集 · 启动字标静态回退：与 Lottie 同源，纯矢量、无外部字体。 -->\n<svg xmlns="http://www.w3.org/2000/svg" width="640" height="340" viewBox="0 0 640 340" role="img" aria-label="青穗集 CAREER DESKTOP"><title>青穗集 CAREER DESKTOP</title>' + ''.join(poster) + '</svg>\n', encoding="utf-8")
(OUT / "LICENSE-font.txt").write_text((ROOT / "public/fonts/fusion-pixel-OFL.txt").read_text(encoding="utf-8"), encoding="utf-8")
print(json.dumps({"scene": str(OUT / "lottie.json"), "bytes": (OUT / "lottie.json").stat().st_size, "frames": FRAMES, "layers": len(layers)}, ensure_ascii=False))
