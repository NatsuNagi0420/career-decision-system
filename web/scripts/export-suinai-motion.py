# 青穗集 · 穗奈分层动作预览导出：从已验收小样只读提取真实部件，保留坐标与出处，不生成或修改原画。
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
from xml.etree import ElementTree as ET
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
DEPS = ROOT / 'logs/seethrough-psd-review-20261018/deps'
if DEPS.is_dir():
    sys.path.insert(0, str(DEPS))
from PIL import Image

SOURCE = ROOT / 'docs/品牌形象/Live2D原画/04-拆层交接/穗奈v2_脸底实际修补小样_v01.zip'
TARGET = ROOT / 'assets/web/brand/suinai-motion-v01'
LOG = ROOT / 'logs/suinai-motion-preview-20261019'
EXPECTED_SHA = '552fbfd323326ef4e3bd6bf320eba0244354e896ed16a7a33672d73668689e86'


def main():
    before = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if before != EXPECTED_SHA:
        raise ValueError('Source ZIP changed; review it before exporting this asset version.')
    TARGET.mkdir(parents=True, exist_ok=True)
    LOG.mkdir(parents=True, exist_ok=True)
    result = {
        '_comment': '青穗集 · 真实分层素材坐标清单；Canvas动作验证，非Cubism模型。',
        'version': 1,
        'sourceSha256': before,
        'canvas': [1536, 1536],
        'views': {'portrait': [515, 0, 500, 615], 'face': [615, 5, 300, 360]},
        'layers': [],
        'limitations': ['脸底仍包含固定头发；头发不作独立运动', '眼部仅作二维压合试验，无网格绑定', '不含开口素材，不制作说话口型'],
    }
    with ZipFile(SOURCE) as archive:
        if archive.testzip() is not None:
            raise ValueError('Source ZIP CRC failed.')
        ora_member = next(name for name in archive.namelist() if name.endswith('.ora'))
        with ZipFile(BytesIO(archive.read(ora_member))) as ora:
            xml = ET.fromstring(ora.read('stack.xml'))
            flattened = Image.new('RGBA', (1536, 1536))
            # OpenRaster stack is top first; the runtime list and neutral preview are bottom first.
            for node in reversed(xml.find('stack').findall('layer')):
                attrs = node.attrib
                if attrs.get('visibility', 'visible') != 'visible':
                    continue
                if attrs.get('opacity', '1.0') != '1.0' or attrs.get('composite-op', 'svg:src-over') != 'svg:src-over':
                    raise ValueError('Unsupported layer compositing.')
                if int(attrs.get('x', 0)) != 0 or int(attrs.get('y', 0)) != 0:
                    raise ValueError('Expected aligned full-canvas input layers.')
                image = Image.open(BytesIO(ora.read(attrs['src']))).convert('RGBA')
                bounds = image.getbbox()
                if image.size != (1536, 1536) or not bounds:
                    raise ValueError(f'Unexpected source size or empty layer: {attrs["name"]}')
                slug = attrs['name'].replace(' ', '_')
                image.crop(bounds).save(TARGET / f'{slug}.png')
                flattened.alpha_composite(image)
                result['layers'].append({'name': attrs['name'], 'url': f'/api/assets/brand/suinai-motion-v01/{slug}.png', 'bounds': list(bounds)})
            merged = Image.open(BytesIO(ora.read('mergedimage.png'))).convert('RGBA')
            if flattened.tobytes() != merged.tobytes():
                raise ValueError('Extracted layers do not reconstruct the delivered mergedimage.')
            flattened.crop((515, 0, 1015, 615)).save(TARGET / 'neutral-portrait.png')
    result['eyes'] = {}
    for side in ('l', 'r'):
        parts = [x for x in result['layers'] if x['name'] in (f'eyewhite-{side}', f'irides-{side}', f'eyelash-{side}')]
        bounds = [min(p['bounds'][0] for p in parts), min(p['bounds'][1] for p in parts), max(p['bounds'][2] for p in parts), max(p['bounds'][3] for p in parts)]
        result['eyes'][side] = {'bounds': bounds, 'anchorY': bounds[1] + (bounds[3] - bounds[1]) * 0.67}
    (TARGET / 'manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    after = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    assert before == after
    summary = {'source': str(SOURCE), 'source_sha256': after, 'source_unchanged': True, 'exported_visible_layers': len(result['layers']), 'neutral_reconstruction_matches_delivered_ora': True, 'eyes': result['eyes'], 'exported_png_bytes': sum(p.stat().st_size for p in TARGET.glob('*.png'))}
    (LOG / 'asset-export-report.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
