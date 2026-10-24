# 青穗集 · 手掌朝向像素回归：核对人工指端点、原始腕根/袖子、非目标手形与原ZIP不变，生成可重现的修复前基线。
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
import hashlib
import json
import sys
import importlib.util

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOG = ROOT / 'logs/suinai-hand-orientation-fix-20261019'
LOG = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_LOG
spec = importlib.util.spec_from_file_location('suinai_v03_export', Path(__file__).with_name('export-suinai-v03.py'))
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
from PIL import Image, ImageDraw, ImageFont, ImageOps


def area(wrist, middle, thumb):
    return ((middle[0] - wrist[0]) * (thumb[1] - wrist[1])
        - (middle[1] - wrist[1]) * (thumb[0] - wrist[0]))


def same(a, b):
    # Cropping legally drops hidden RGB outside alpha bounds. Compare visible RGBA,
    # not undefined colour in completely transparent pixels.
    def canonical(image):
        clean = Image.new('RGBA', image.size)
        clean.alpha_composite(image)
        return clean.tobytes()
    return a.size == b.size and canonical(a) == canonical(b)


def main():
    LOG.mkdir(parents=True, exist_ok=True)
    baseline = LOG / 'baseline'
    baseline.mkdir(exist_ok=True)
    source_before = hashlib.sha256(exporter.SOURCE.read_bytes()).hexdigest()
    assert source_before == exporter.EXPECTED_SHA, 'Reviewed source hash changed.'
    manifest = json.loads((exporter.TARGET / 'manifest.json').read_text(encoding='utf-8'))
    fixture = json.loads((ROOT / 'web/e2e/fixtures/suinai-hand-orientation.json').read_text(encoding='utf-8-sig'))
    assets = {a['name']: a for a in manifest['assets']}
    expected_targets = {'arm-l-H02', 'arm-r-H02', 'arm-r-H03'}
    assert set(manifest['handOrientation']['corrections']) == expected_targets
    assert {a['name'] for a in manifest['assets'] if 'derivation' in a} == expected_targets
    baseline_assets, arm_checks, palm_checks = [], [], []
    originals, current = {}, {}
    with ZipFile(exporter.SOURCE) as archive:
        def read(path):
            matches = [n for n in archive.namelist() if n == path or n.endswith('/' + path)]
            assert len(matches) == 1
            return Image.open(BytesIO(archive.read(matches[0]))).convert('RGBA')

        for side in ['l', 'r']:
            sleeve = read(f'runtime_png/ARM01_{side.upper()}.png')
            for index in range(1, 7):
                hand = f'H{index:02d}'
                name = f'arm-{side}-{hand}'
                source_hand = read(f'runtime_png/{hand}_{side.upper()}.png')
                original = sleeve.copy()
                original.alpha_composite(source_hand)
                originals[name] = original
                before_bounds = original.getbbox()
                original.crop(before_bounds).save(baseline / f'{name}.png')
                baseline_assets.append({'name': name, 'bounds': list(before_bounds), 'file': f'{name}.png'})
                info = assets[name]
                output = Image.new('RGBA', (1536, 1536))
                with Image.open(exporter.TARGET / Path(info['url']).name) as image:
                    output.paste(image.convert('RGBA'), tuple(info['bounds'][:2]))
                current[name] = output
                root_box = (0, 0, 1536, 743)
                assert same(original.crop(root_box), output.crop(root_box)), f'{name}: wrist/sleeve changed.'
                changed = not same(original, output)
                assert changed == (name in expected_targets), f'{name}: wrong correction scope.'
                if hand == 'H01':
                    assert same(output, read(f'source_layers/base/handwear-{side}.png')), 'Neutral art changed.'
                if name in expected_targets:
                    rule = manifest['handOrientation']['corrections'][name]
                    # Independent construction: transpose+integer translation, not the exporter's affine helper.
                    reflected_hand = Image.new('RGBA', original.size)
                    reflected_hand.paste(source_hand.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
                        (round(2 * rule['axisX'] - 1535), 0))
                    reflection = sleeve.copy()
                    reflection.alpha_composite(reflected_hand)
                    box = (0, rule['fullFromY'], 1536, 1536)
                    assert same(reflection.crop(box), output.crop(box)), f'{name}: distal palm transform mismatch.'
                    # Wrist corridor must remain solid, not just share a registration point.
                    wx = 946 if side == 'l' else 570
                    for y in range(728, 758):
                        assert min(output.getpixel((x, y))[3] for x in range(wx - 7, wx + 8)) > 200, f'{name}: wrist gap at {y}.'
                arm_checks.append({'asset': name, 'changed': changed, 'wristAndSleevePixelExactThroughY': 742,
                    'correctionScopeMatched': True, 'neutralExact': True if hand == 'H01' else None})

        for reference in fixture['palms']:
            name = reference['asset']
            before_area = area(reference['wrist'], reference['original']['middle'], reference['original']['thumb'])
            after_area = area(reference['wrist'], reference['expected']['middle'], reference['expected']['thumb'])
            assert after_area * reference['areaSign'] > 2000, f'{name}: thumb-side contract failed.'
            assert (before_area * reference['areaSign'] < 0) == (name in expected_targets)
            alphas = {}
            for landmark in ['thumb', 'middle']:
                original_point, expected_point = reference['original'][landmark], reference['expected'][landmark]
                assert originals[name].getpixel(tuple(original_point))[3] > 140, f'{name}: invalid original landmark.'
                alpha = current[name].getpixel(tuple(expected_point))[3]
                assert alpha > 140, f'{name}: actual corrected {landmark} pixel missing.'
                alphas[landmark] = alpha
            old_thumb_alpha = current[name].getpixel(tuple(reference['original']['thumb']))[3]
            if name in expected_targets:
                assert old_thumb_alpha < 30, f'{name}: wrong-side thumb silhouette remains.'
            palm_checks.append({'asset': name, 'beforeSignedArea': before_area, 'afterSignedArea': after_area,
                'expectedAreaSign': reference['areaSign'], 'actualCorrectedLandmarkAlpha': alphas,
                'oldThumbPositionAlpha': old_thumb_alpha})

    after = hashlib.sha256(exporter.SOURCE.read_bytes()).hexdigest()
    assert source_before == after
    (baseline / 'manifest.json').write_text(json.dumps({'_comment': 'Original reviewed hand/sleeve composition, before palm correction.',
        'assets': baseline_assets}, indent=2) + '\n', encoding='utf-8')
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 22)
    sheet = Image.new('RGB', (1200, 1180), (235, 240, 234))
    draw = ImageDraw.Draw(sheet)
    for row, reference in enumerate(fixture['palms']):
        name, wx = reference['asset'], reference['wrist'][0]
        for col, (label, image) in enumerate([('BEFORE', originals[name]), ('AFTER', current[name])]):
            crop = image.crop((wx - 65, 710, wx + 65, 850))
            tile = Image.new('RGBA', crop.size, (33, 43, 52, 255))
            tile.alpha_composite(crop)
            tile = ImageOps.contain(tile, (240, 255), Image.Resampling.NEAREST)
            x, y = col * 600, row * 295
            draw.text((x + 22, y + 8), f'{name} | {label}', font=font, fill=(38, 69, 50))
            sheet.paste(tile, (x + 270, y + 35))
    sheet.save(LOG / 'source-palms-before-after.jpg', quality=95)
    report = {'status': 'passed', 'sourceSha256': after, 'sourceUnchanged': True,
        'fullyTransparentRGBIgnored': True, 'correctionCount': len(expected_targets), 'armsChecked': arm_checks, 'palmsChecked': palm_checks,
        'anatomyScope': 'Manually reviewed open-palm thumb landmarks only; not an automatic anatomy score.',
        'baseline': str(baseline)}
    (LOG / 'hand-pixel-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
