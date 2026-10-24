# 青穗集 · 穗奈补图结构检查：只读验证交付清单、PNG与坐标，输出报告；不代替美术或Cubism原生验证。
from __future__ import annotations
import argparse
import json
from pathlib import Path
from zipfile import ZipFile, BadZipFile
from xml.etree import ElementTree as ET
from PIL import Image, ImageDraw

KIT = Path(__file__).resolve().parents[1]
REQUESTS = json.loads((KIT / 'catalog/assets_requested.json').read_text(encoding='utf-8'))
EXPRESSIONS = json.loads((KIT / 'catalog/expressions.json').read_text(encoding='utf-8'))


def inside(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or not relative or '\\' in relative:
        raise ValueError('Use a nonempty relative POSIX path')
    candidate = root.joinpath(relative).resolve()
    candidate.relative_to(root)
    if Path(relative).is_absolute():
        raise ValueError('Absolute path is not allowed')
    return candidate


def check(delivery: Path, out: Path) -> dict:
    delivery = delivery.resolve()
    out = out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    errors, warnings, results = [], [], []
    manifest_path = delivery / 'delivery_manifest.json'
    if not manifest_path.is_file():
        return {'status': 'failed', 'errors': ['delivery_manifest.json is missing'], 'warnings': [], 'assets': [], 'summary': {}}
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    except (ValueError, OSError) as error:
        return {'status': 'failed', 'errors': ['Invalid manifest: ' + str(error)], 'warnings': [], 'assets': [], 'summary': {}}
    if not isinstance(manifest, dict):
        return {'status': 'failed', 'errors': ['Manifest must be a JSON object'], 'warnings': [], 'assets': [], 'summary': {}}
    if manifest.get('workingCanvas') != [1536, 1536]:
        errors.append('workingCanvas must be [1536, 1536]')
    if manifest.get('colorSpace') != 'sRGB':
        errors.append('Manifest colorSpace must declare sRGB')
    if manifest.get('baseSourceSha256') != REQUESTS['conventions']['baseSourceSha256']:
        errors.append('Wrong baseline source SHA256')
    entries = manifest.get('assets')
    if not isinstance(entries, list) or not all(isinstance(item, dict) for item in entries):
        errors.append('assets must be a list of objects')
        entries = []
    actual = {}
    for item in entries:
        key = item.get('id')
        if not isinstance(key, str):
            errors.append('An asset has a non-string id')
            continue
        if key in actual:
            errors.append('Duplicate asset id: ' + key)
        actual[key] = item
    requested = {item['id']: item for item in REQUESTS['assets']}
    for key in set(actual) - set(requested):
        errors.append('Unexpected request id: ' + key)
    thumbnails = []
    completed_files = set()
    for key, request in requested.items():
        item = actual.get(key)
        result = {'id': key, 'phase': request['phase'], 'status': item.get('status') if item else 'unlisted', 'errors': [], 'warnings': []}
        results.append(result)
        if item is None:
            result['errors'].append('Request is not listed in manifest')
            continue
        status = item.get('status')
        if status not in ('completed', 'missing', 'deferred'):
            result['errors'].append('status must be completed/missing/deferred')
            continue
        if status != 'completed':
            if not isinstance(item.get('reason'), str) or not item['reason'].strip():
                result['errors'].append('Noncompleted asset needs a truthful reason')
            continue
        if item.get('path') != request['runtimeFile']:
            result['errors'].append('path differs from the requested runtimeFile')
        try:
            file = inside(delivery, item.get('path'))
            if file in completed_files:
                result['errors'].append('Another completed request uses the same file')
            completed_files.add(file)
            if not file.is_file():
                raise ValueError('Completed asset file is missing')
            with Image.open(file) as raw:
                if raw.format != 'PNG' or raw.mode != 'RGBA' or raw.size != (1536, 1536):
                    result['errors'].append('Must be a 1536x1536 RGBA PNG')
                    continue
                image = raw.copy()
                if 'icc_profile' not in raw.info:
                    result['warnings'].append('No embedded ICC profile; visually verify exported sRGB colors')
            alpha = image.getchannel('A')
            bounds = alpha.getbbox()
            if bounds is None:
                result['errors'].append('Alpha is empty')
                continue
            if alpha.getextrema()[0] != 0:
                result['errors'].append('No fully transparent background pixels')
            result['actualBounds'] = list(bounds)
            if item.get('bounds') != list(bounds):
                result['errors'].append('Recorded bounds do not equal actual nonzero Alpha bounds')
            if item.get('canvas') != [1536, 1536]:
                result['errors'].append('Asset canvas must be declared as [1536,1536]')
            source_layers = item.get('sourceLayers')
            if not isinstance(source_layers, list) or not source_layers or not all(isinstance(v, str) and v for v in source_layers):
                result['errors'].append('Completed asset must list real source-layer paths')
            if not isinstance(item.get('changedFromBase'), str) or not item['changedFromBase'].strip():
                result['errors'].append('Completed asset needs changedFromBase explanation')
            if request.get('side') and item.get('side') != request['side']:
                result['errors'].append('Wrong or missing L/R side')
            if request.get('attachPoint'):
                if item.get('attachPoint') != request['attachPoint']:
                    result['errors'].append('Wrist attachPoint does not match request')
                x0, y0, x1, y1 = request['overlapZone']
                if alpha.crop((x0, y0, x1, y1)).getbbox() is None:
                    result['errors'].append('No pixels in the wrist overlap zone')
            thumbnails.append((key, image.crop(bounds)))
        except (ValueError, TypeError, KeyError, OSError) as error:
            result['errors'].append(str(error))
    project = manifest.get('sourceProject')
    if project:
        try:
            source = inside(delivery, project)
            if not source.is_file() or source.suffix.lower() not in ('.ora', '.psd'):
                errors.append('sourceProject is not an existing ORA/PSD file')
            elif source.suffix.lower() == '.ora':
                with ZipFile(source) as archive:
                    if archive.testzip() is not None:
                        errors.append('ORA CRC is invalid')
                    if archive.read('mimetype').strip() != b'image/openraster':
                        errors.append('Source is not an OpenRaster project')
                    stack = ET.fromstring(archive.read('stack.xml'))
                    if (stack.get('w'), stack.get('h')) != ('1536', '1536'):
                        errors.append('ORA canvas is not 1536x1536')
                    if not stack.findall('.//layer'):
                        errors.append('ORA has no actual layers')
            else:
                with source.open('rb') as handle:
                    header = handle.read(6)
                if header != b'8BPS\x00\x01':
                    errors.append('PSD header does not identify a real PSD')
        except (ValueError, TypeError, OSError, KeyError, ET.ParseError, BadZipFile) as error:
            errors.append('Invalid sourceProject: ' + str(error))
    else:
        errors.append('Editable sourceProject is missing; keep PNG results as partial delivery')
    preview_files = ['previews/neutral_1536.png', 'previews/hand_joints_100pct.png', 'previews/hide_features.png', 'previews/hide_hair_and_eyewear.png', 'previews/body_without_original_hands.png']
    preview_files += ['previews/contact_' + value + '.png' for value in ('greeting', 'thinking', 'responding', 'success')]
    preview_files += [row['previewFile'] for row in EXPRESSIONS['expressions']]
    preview_files += ['previews/hands/' + row['id'] + '.png' for row in REQUESTS['assets'] if row['kind'] == 'hand']
    for relative in preview_files:
        try:
            preview = inside(delivery, relative)
            with Image.open(preview) as im:
                im.load()
                if im.width < 1 or im.height < 1:
                    raise ValueError('Empty image')
        except (OSError, ValueError) as error:
            errors.append('Missing/unreadable required preview ' + relative + ': ' + str(error))
    if not (delivery / 'DELIVERY_REPORT.md').is_file():
        errors.append('DELIVERY_REPORT.md is missing')
    for result in results:
        errors.extend(result['id'] + ': ' + error for error in result['errors'])
        warnings.extend(result['id'] + ': ' + warning for warning in result['warnings'])
    valid = [row for row in results if row['status'] == 'completed' and not row['errors']]
    incomplete = [row['id'] for row in results if row['status'] != 'completed']
    summary = {'requested': len(requested), 'declaredCompleted': sum(row['status'] == 'completed' for row in results), 'validStructure': len(valid), 'incompleteIds': incomplete, 'p0Total': sum(v['phase'] == 'P0' for v in requested.values()), 'p0Valid': sum(v['phase'] == 'P0' for v in valid)}
    if thumbnails:
        columns, cellw, cellh = 6, 180, 200
        count = (len(thumbnails) + columns - 1) // columns
        sheet = Image.new('RGB', (columns * cellw, count * cellh), '#eeeeea')
        draw = ImageDraw.Draw(sheet)
        for index, (key, image) in enumerate(thumbnails):
            x = index % columns * cellw
            y = index // columns * cellh
            image.thumbnail((cellw - 20, cellh - 36), Image.Resampling.LANCZOS)
            tile = Image.new('RGBA', image.size, '#e0e9de')
            tile.alpha_composite(image)
            sheet.paste(tile.convert('RGB'), (x + (cellw - image.width) // 2, y + 26))
            draw.text((x + 8, y + 7), key, fill='#203c30')
        sheet.save(out / 'contact_sheet.jpg', quality=92)
    return {'_comment': 'Geometry, files and registered wrist coordinates only; visual anatomy, actual layer editability and Cubism are NOT verified.', 'status': 'passed' if not errors and not incomplete else 'partial_or_failed', 'summary': summary, 'errors': errors, 'warnings': warnings, 'assets': results}


def main() -> int:
    parser = argparse.ArgumentParser(description='Validate Suinai extension delivery without running files from the returned package')
    parser.add_argument('delivery', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = check(args.delivery, args.out)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'machine_report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + chr(10), encoding='utf-8')
    print(json.dumps({'status': result['status'], 'summary': result['summary'], 'errorCount': len(result['errors']), 'warningCount': len(result['warnings'])}, ensure_ascii=False))
    return 0 if result['status'] == 'passed' else 2


if __name__ == '__main__':
    raise SystemExit(main())
