"""青穗集 · 生成常用汉字和界面字形的统一像素字体，供微信与 H5 离线使用。"""
import base64
from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/fonts/fusion-pixel-12px-zh-hans.woff2"
FONT_NAME = "Qingsui Pixel UI"


def main():
    # 收录 GB2312 常用汉字、标点和拉丁字母，动态岗位名不再只依赖源码文案中的字形。
    characters = set(chr(code) for code in range(32, 127))
    for first in range(0xA1, 0xF8):
        for second in range(0xA1, 0xFF):
            try:
                characters.update(bytes((first, second)).decode("gb2312"))
            except UnicodeDecodeError:
                continue
    for path in sorted((ROOT / "src").rglob("*")):
        if path.suffix not in {".vue", ".ts", ".js", ".json"}:
            continue
        characters.update(path.read_text(encoding="utf-8"))

    font = TTFont(SOURCE, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = []
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text="".join(sorted(characters)))
    subsetter.subset(font)
    # 为派生子集更名，保留原版权与 OFL 授权记录。
    for name in font["name"].names:
        if name.nameID in {1, 3, 4, 6, 16}:
            value = FONT_NAME.replace(" ", "") if name.nameID == 6 else FONT_NAME
            name.string = value.encode(name.getEncoding())
    font.flavor = "woff2"
    output = BytesIO()
    font.save(output)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    css = (
        "/* 青穗集 · 自动生成的像素界面字体；运行 scripts/prepare-ui-font.py 更新，授权见 assets/fonts/。 */\n"
        "@font-face {\n"
        f'  font-family: "{FONT_NAME}";\n'
        f'  src: url("data:font/woff2;base64,{encoded}") format("woff2");\n'
        "  font-style: normal;\n"
        "  font-weight: 400;\n"
        "  font-display: swap;\n"
        "}\n"
    )
    # 原生底栏有独立样式作用域；两份生成结果共用同一字体定义。
    for relative in ("src/styles/pixel-font.scss", "src/custom-tab-bar/pixel-font.wxss"):
        (ROOT / relative).write_text(css, encoding="utf-8", newline="\n")
    print(f"UI font: {len(characters)} characters, {len(output.getvalue())} bytes; generated two stylesheets.")


if __name__ == "__main__":
    main()
