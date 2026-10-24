# 青穗集 · 穗奈Cubism导入候选PSD：RGB8透明分层、统一1536坐标；只读源画，保留可动瞳孔与共享整臂，非cmo3。
from pathlib import Path
import sys
import json
import hashlib
from zipfile import ZipFile
from io import BytesIO

ROOT = Path(__file__).resolve().parents[2]
DEPS = ROOT / 'logs/seethrough-psd-review-20261018/deps'
if DEPS.is_dir():
    sys.path.insert(0, str(DEPS))
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import Group, PixelLayer

RUNTIME = ROOT / 'assets/web/brand/suinai-motion-v03'
OUT = ROOT / 'docs/品牌形象/Live2D原画/06-Cubism制作/穗奈_v03_动作与绑定包'
LOG = ROOT / 'logs/suinai-actions-v03-20261019'
SOURCE = ROOT / 'docs/品牌形象/Live2D原画/04-拆层交接/suinai_extensions_v03.zip'
EXPECTED = 'b81b6bfec2d02649210407e72971833151db81be38df9a3da623c5912be80bd0'


def main():
    before = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if before != EXPECTED:
        raise ValueError('Reviewed source hash changed.')
    manifest = json.loads((RUNTIME / 'manifest.json').read_text(encoding='utf-8-sig'))
    if manifest['sourceSha256'] != EXPECTED:
        raise ValueError('Run v03 asset export before building the PSD.')
    by_name = {a['name']: a for a in manifest['assets']}
    psd = PSDImage.new('RGBA', (1536, 1536), color=(0, 0, 0, 0), depth=8)
    audit = []

    def add(parent, name, image, visible=True, source='', clipping=False, derivation=None):
        bounds = image.getbbox()
        if not bounds:
            raise ValueError(f'Empty layer: {name}')
        layer = PixelLayer.frompil(image.crop(bounds), parent, name=name, top=bounds[1], left=bounds[0])
        layer.visible = visible
        layer.clipping = clipping
        audit.append({'name': name, 'visible': visible, 'bounds': list(bounds), 'source': source,
            'clipping': clipping, 'pixelSha256': hashlib.sha256(image.crop(bounds).tobytes()).hexdigest()})
        if derivation is not None:
            audit[-1]['derivation'] = derivation
        return layer

    def runtime(parent, name, asset, visible=True):
        info = by_name[asset]
        image = Image.new('RGBA', (1536, 1536))
        crop = Image.open(RUNTIME / Path(info['url']).name).convert('RGBA')
        image.paste(crop, tuple(info['bounds'][:2]))
        return add(parent, name, image, visible, source=info.get('source', info['url']), derivation=info.get('derivation'))

    def source(parent, name, path, visible=True, clipping=False):
        with ZipFile(SOURCE) as archive:
            matches = [entry for entry in archive.namelist() if entry == path or entry.endswith('/' + path)]
            if len(matches) != 1:
                raise ValueError(f'Ambiguous/missing source: {path}')
            image = Image.open(BytesIO(archive.read(matches[0]))).convert('RGBA')
        return add(parent, name, image, visible, source=path, clipping=clipping)

    runtime(psd, 'HairBack', 'back hair')
    for side in ['r', 'l']:
        group = Group.new(psd, name=f'ContinuousArm_{side.upper()}')
        for number in range(1, 7):
            # Full arm variants avoid introducing a one-pixel butt joint into the native rig input.
            runtime(group, f'Arm{side.upper()}_H{number:02d}', f'arm-{side}-H{number:02d}', visible=number == 1)
    for name in ['legwear', 'footwear', 'neck', 'bottomwear', 'topwear', 'ears-r', 'ears-l', 'face', 'nose']:
        runtime(psd, name.replace('-', '_').title(), name)
    runtime(psd, 'Blush_X01', 'blush', visible=False)
    for side in ['L', 'R']:
        group = Group.new(psd, name=f'Brow_{side}')
        for number in range(1, 7):
            source(group, f'Brow{side}_B{number:02d}', f'runtime_png/B{number:02d}_{side}.png', visible=number == 1)
    group = Group.new(psd, name='Mouth')
    for number in range(1, 8):
        runtime(group, f'Mouth_M{number:02d}', f'M{number:02d}', visible=number == 1)
    for side in ['L', 'R']:
        group = Group.new(psd, name=f'Eye_{side}')
        source(group, f'Eye{side}_White', f'source_layers/generated_parts/V02_{side}_sclera.png')
        source(group, f'Eye{side}_Iris_COMPLETE', f'source_layers/generated_parts/V02_{side}_iris_highlights.png', clipping=True)
        source(group, f'Eye{side}_LowerLid', f'source_layers/generated_parts/V02_{side}_lower_lid.png')
        source(group, f'Eye{side}_UpperLid', f'source_layers/generated_parts/V02_{side}_upper_lid.png')
        runtime(group, f'Eye{side}_Closed', f'eye-{side.lower()}-closed', visible=False)
        runtime(group, f'Eye{side}_SmileClosed', f'eye-{side.lower()}-smile', visible=False)
    for name in ['headwear', 'eyewear', 'front hair']:
        runtime(psd, name.replace(' ', '').title(), name)
    masks = Group.new(psd, name='IrisClipMasks_REFERENCE_HIDDEN')
    masks.visible = False
    for side in ['L', 'R']:
        source(masks, f'Eye{side}_ClipMask_REFERENCE', f'source_layers/generated_parts/V02_{side}_iris_clip_mask.png')
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'Suinai_v03_Cubism_import_candidate.psd'
    psd.save(path)
    reopened = PSDImage.open(path)
    leaves = [layer for layer in reopened.descendants() if not layer.is_group()]
    if len(leaves) != len(audit):
        raise ValueError('Saved PSD dropped a source layer.')
    for layer, record in zip(leaves, audit):
        image = layer.topil().convert('RGBA')
        if list(layer.bbox) != record['bounds'] or hashlib.sha256(image.tobytes()).hexdigest() != record['pixelSha256']:
            raise ValueError(f'PSD round-trip pixels/registration changed: {layer.name}')
    preview = reopened.composite(force=True, color=(0, 0, 0), alpha=0, ignore_preview=True).convert('RGBA')
    preview.save(OUT / 'import-neutral.png')
    after = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    assert before == after
    report = {'_comment': '青穗集 · PSD结构/像素往返检查，不冒充Cubism Editor实际导入验收。',
        'file': str(path), 'bytes': path.stat().st_size, 'canvas': list(reopened.size), 'depth': reopened.depth,
        'colorMode': str(reopened.color_mode), 'leafLayers': len(leaves), 'allLayerPixelsAndBoundsRoundTripExact': True,
        'sourceUnchanged': before == after, 'sourceSha256': after,
        'nativeEditorImportVerified': False, 'moc3Created': False, 'layers': audit}
    (LOG / 'psd-import-source-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUT / 'source-layer-map.json').write_text(json.dumps({'_comment': report['_comment'], 'layers': audit}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'layers'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
