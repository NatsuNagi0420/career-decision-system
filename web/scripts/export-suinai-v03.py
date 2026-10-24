# 青穗集 · 穗奈v03动作素材导出：只读原ZIP，按已复核的手掌侧别修正派生图，保留腕根后合成整臂；非Cubism模型。
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
DEPS = ROOT / 'logs/seethrough-psd-review-20261018/deps'
if DEPS.is_dir():
    sys.path.insert(0, str(DEPS))
from PIL import Image, ImageDraw

SOURCE = ROOT / 'docs/品牌形象/Live2D原画/04-拆层交接/suinai_extensions_v03.zip'
EXPECTED_SHA = 'b81b6bfec2d02649210407e72971833151db81be38df9a3da623c5912be80bd0'
TARGET = ROOT / 'assets/web/brand/suinai-motion-v03'
LOG = ROOT / 'logs/suinai-actions-v03-20261019'
PREFIX = '/api/assets/brand/suinai-motion-v03/'
BASE_ORDER = ['back hair', 'legwear', 'footwear', 'neck', 'bottomwear', 'topwear',
              'ears-r', 'ears-l', 'face', 'nose', 'headwear', 'eyewear', 'front hair']

# L/R mean the CHARACTER's side, not the viewer's. These three delivered palm
# drawings have the opposite thumb side; H03_L is already correct. Do not mirror
# every hand: relaxed, thinking and fist views have different palm/back angles.
PALM_CORRECTIONS = {
    ('l', 'H02'): {'axisX': 945.5, 'keepThroughY': 742, 'fullFromY': 750},
    ('r', 'H02'): {'axisX': 569.5, 'keepThroughY': 742, 'fullFromY': 750},
    ('r', 'H03'): {'axisX': 569.0, 'keepThroughY': 742, 'fullFromY': 750},
}


def orient_hand_for_arm(image, side, hand):
    """Correct reviewed distal palms; never move the registered wrist or sleeve."""
    rule = PALM_CORRECTIONS.get((side, hand))
    if rule is None:
        return image
    width = image.width
    start, end = rule['keepThroughY'] + 1, rule['fullFromY']
    # The +1 converts an axis specified in pixel-centre indices to PIL's affine
    # edge coordinates. Integer/half-integer axes retain the distal pixels exactly.
    reflected = image.transform(image.size, Image.Transform.AFFINE,
        (-1, 0, 2 * rule['axisX'] + 1, 0, 1, 0), Image.Resampling.NEAREST)
    result = reflected.copy()
    result.paste(image.crop((0, 0, width, start)), (0, 0))
    # Only the seven narrow wrist-transition rows are feathered. Premultiplied
    # colour avoids dark transparent fringes; the unedited root stays pixel-exact.
    if end > start:
        box = (0, start, width, end)
        mask = Image.new('L', (width, end - start))
        draw = ImageDraw.Draw(mask)
        for y in range(start, end):
            t = (y - rule['keepThroughY']) / (end - rule['keepThroughY'])
            draw.line((0, y - start, width - 1, y - start), fill=round(255 * t * t * (3 - 2 * t)))
        blend = Image.composite(reflected.crop(box).convert('RGBa'),
            image.crop(box).convert('RGBa'), mask).convert('RGBA')
        result.paste(blend, (0, start))
    if result.crop((0, 0, width, start)).tobytes() != image.crop((0, 0, width, start)).tobytes():
        raise ValueError('Hand correction changed the registered wrist root.')
    return result


def export_catalog():
    path = ROOT / 'docs/品牌形象/Live2D原画/05-动作与表情扩展/穗奈_40场景动作与补图交接_v01/catalog/actions.json'
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    rows = []
    for entry in data['actions']:
        row = {key: entry[key] for key in ['id', 'category', 'label', 'gesture', 'expression',
            'leftHand', 'rightHand', 'durationSec', 'playback', 'trigger', 'beats']}
        row.update(priority=entry['phase'] == 'P0', requestedGesture=entry['gesture'], substitution='')
        if entry['gesture'] == 'G13':
            row.update(gesture='G05', leftHand='H01', rightHand='H05',
                substitution='缺少笔与便签：先用专注整理动作替代，不呈现写字。',
                beats=['看向经历内容，右手抬到脸侧', '略向下移视线，专注梳理事实', '放下手，看回用户；本版不拿笔或便签'])
        if entry['rightHand'] == 'H07':
            row.update(rightHand='H06', substitution='拇指素材未采用：改为轻握拳认可。',
                beats=['先确认恢复状态', '右手轻握拳短促认可、轻颔首', '放手回待机，不使用拇指素材'])
        rows.append(row)
    if len(rows) != 40 or len({row['id'] for row in rows}) != 40:
        raise ValueError('Unexpected action catalog size or duplicate IDs.')
    text = '/** 青穗集 · 穗奈40场景动作目录：对照已确认的动作计划，明确两项道具替代，不冒充完整笔记动作。 */\n'
    text += 'export const SUINAI_ACTION_CATALOG = ' + json.dumps(rows, ensure_ascii=False, indent=2) + ' as const;\n'
    (ROOT / 'web/src/character/suinaiActionCatalog.ts').write_text(text, encoding='utf-8')


def main():
    before = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if before != EXPECTED_SHA:
        raise ValueError('The reviewed v03 source changed; do not overwrite runtime assets before review.')
    TARGET.mkdir(parents=True, exist_ok=True)
    LOG.mkdir(parents=True, exist_ok=True)
    assets = []
    decoded_pixels = 0
    with ZipFile(SOURCE) as archive:
        if archive.testzip():
            raise ValueError('Source CRC failed.')
        # Some deliveries wrap all files in a root directory. Match only one exact suffix.
        def member(path):
            candidates = [n for n in archive.namelist() if n == path or n.endswith('/' + path)]
            if len(candidates) != 1:
                raise ValueError(f'Ambiguous/missing source: {path}')
            return archive.read(candidates[0])

        def read(path):
            image = Image.open(BytesIO(member(path))).convert('RGBA')
            if image.size != (1536, 1536):
                raise ValueError(f'Incorrect aligned size: {path}')
            return image

        def export(name, image, provenance, derivation=None):
            nonlocal decoded_pixels
            bounds = image.getbbox()
            if not bounds:
                raise ValueError(f'Empty asset: {name}')
            slug = name.replace(' ', '_') + '.png'
            image.crop(bounds).save(TARGET / slug, optimize=True)
            decoded_pixels += (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])
            entry = {'name': name, 'url': PREFIX + slug, 'bounds': list(bounds), 'source': provenance}
            if derivation is not None:
                entry['derivation'] = derivation
            assets.append(entry)
            return name

        base = {}
        for name in BASE_ORDER:
            path = 'runtime_png/F01.png' if name == 'face' else 'source_layers/base/' + name.replace(' ', '_') + '.png'
            base[name] = export(name, read(path), path)
        arms = {}
        neutral_arm_matches = {}
        for side in ['l', 'r']:
            arms[side] = {}
            sleeve = read(f'runtime_png/ARM01_{side.upper()}.png')
            for index in range(1, 7):
                hand = f'H{index:02d}'
                path = f'runtime_png/{hand}_{side.upper()}.png'
                joined = sleeve.copy()
                joined.alpha_composite(orient_hand_for_arm(read(path), side, hand))
                if hand == 'H01':
                    original = read(f'source_layers/base/handwear-{side}.png')
                    neutral_arm_matches[side] = joined.tobytes() == original.tobytes()
                    if not neutral_arm_matches[side]:
                        raise ValueError('Neutral arm must reconstruct original source exactly.')
                rule = PALM_CORRECTIONS.get((side, hand))
                derivation = {'operation': 'reflect-distal-palm', **rule} if rule is not None else None
                arms[side][hand] = export(f'arm-{side}-{hand}', joined,
                    [f'runtime_png/ARM01_{side.upper()}.png', path], derivation)
        eyes = {}
        for side in ['l', 'r']:
            eyes[side] = {}
            # V02 has the neutral, complete iris. Never use V03's inward-baked gaze.
            for part in ['sclera', 'iris_highlights', 'iris_clip_mask', 'upper_lid', 'lower_lid']:
                path = f'source_layers/generated_parts/V02_{side.upper()}_{part}.png'
                eyes[side][part] = export(f'eye-{side}-{part}', read(path), path)
            for variant, code in [('closed', 'V04'), ('smile', 'V05')]:
                path = f'runtime_png/{code}_{side.upper()}.png'
                eyes[side][variant] = export(f'eye-{side}-{variant}', read(path), path)
            parts = [x for x in assets if x['name'].startswith(f'eye-{side}-')]
            bounds = [min(x['bounds'][0] for x in parts), min(x['bounds'][1] for x in parts),
                      max(x['bounds'][2] for x in parts), max(x['bounds'][3] for x in parts)]
            eyes[side]['bounds'] = bounds
            eyes[side]['anchorY'] = bounds[1] + (bounds[3] - bounds[1]) * .67
        brows, mouths = {}, {}
        for count in range(1, 7):
            code = f'B{count:02d}'
            left_path, right_path = f'runtime_png/{code}_L.png', f'runtime_png/{code}_R.png'
            pair = read(left_path)
            pair.alpha_composite(read(right_path))
            brows[code] = export(code, pair, [left_path, right_path])
        for count in range(1, 8):
            code = f'M{count:02d}'
            mouths[code] = export(code, read(f'runtime_png/{code}.png'), f'runtime_png/{code}.png')
        export('blush', read('runtime_png/X01.png'), 'runtime_png/X01.png')

    manifest = {
        '_comment': '青穗集 · v03坐标裁剪与整臂连续网格素材；不是.moc3，原画ZIP不被修改。',
        'version': 3, 'renderer': 'canvas-continuous-mesh', 'canvas': [1536, 1536],
        'sourceSha256': before,
        'handOrientation': {'revision': 1, 'convention': 'character-left-is-viewer-right',
            'corrections': {f'arm-{side}-{hand}': rule for (side, hand), rule in PALM_CORRECTIONS.items()}},
        'base': base, 'arms': arms, 'eyes': eyes, 'brows': brows, 'mouths': mouths,
        'views': {'portrait': [515, 0, 500, 615], 'face': [615, 5, 300, 360]},
        'assets': assets,
        'limitations': ['No moc3/cmo3: native Cubism rigging is still required.',
            'H07, H08 and P01/P02 are deliberately not loaded.',
            'Open eyes reuse neutral V02 sources; V03/V06 are not six independent eye shapes.',
            'Arm and selected hand share a single texture and continuous wrist deformation.',
            'Only H02_L/H02_R/H03_R distal palms are corrected; original wrist roots and H01 remain unchanged.'],
    }
    (TARGET / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    export_catalog()
    after = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    assert after == before
    report = {'source': str(SOURCE), 'sha256': before, 'sourceUnchanged': before == after,
        'assetCount': len(assets), 'decodedRGBABytes': decoded_pixels * 4,
        'pngBytes': sum((TARGET / Path(asset['url']).name).stat().st_size for asset in assets),
        'handOrientationCorrections': manifest['handOrientation'],
        'originalNeutralArmsPixelExact': neutral_arm_matches, 'status': 'exported_not_cubism'}
    (LOG / 'asset-export.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()

