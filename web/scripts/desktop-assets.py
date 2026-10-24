# 青穗集 · 桌面主题素材构建：从原创透明原图制作半身素材，并封装带许可的本地像素字体。
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs' / '品牌形象'
OUT = ROOT / 'assets' / 'web' / 'brand' / 'desktop'
FONTS = ROOT / 'web' / 'public' / 'fonts'
OUT.mkdir(parents=True, exist_ok=True)

FACES = {
    'smile': '默认微笑', 'think': '认真思考', 'happy': '完成后的开心',
    'listen': '专注倾听', 'explain': '温和讲解', 'worry': '轻度担心',
    'warn': '重要提醒', 'encourage': '鼓励行动',
}
for name, source in FACES.items():
    image = Image.open(SOURCE / f'BgSub_{source}.png').convert('RGBA')
    box = image.getchannel('A').getbbox()
    image = image.crop(box)
    image.thumbnail((640, 760), Image.Resampling.LANCZOS)
    image.save(OUT / f'suinai-{name}.webp', quality=94, method=6)

archive = ROOT / 'web' / '.font-src' / 'fusion-pixel.zip'
if not archive.exists():
    raise SystemExit('请先将 Fusion Pixel 12px proportional otf.woff2 官方发行包放入 web/.font-src/fusion-pixel.zip')
with ZipFile(archive) as zipped:
    FONTS.joinpath('fusion-pixel-12px-zh-hans.woff2').write_bytes(zipped.read('fusion-pixel-12px-proportional-zh_hans.otf.woff2'))
    license_dir = FONTS / 'fusion-pixel-licenses'
    license_dir.mkdir(exist_ok=True)
    for name in zipped.namelist():
        if name == 'OFL.txt' or name.startswith('LICENSES/'):
            if name.endswith('/'):
                continue
            dest = license_dir / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(zipped.read(name))
print(f'Exported {len(FACES)} portraits; pixel font and upstream licenses are local.')
