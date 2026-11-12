# 青穗集 · 登录注册素材整理：保留透明通道、裁除空白并输出统一后端素材目录。
from pathlib import Path
import json
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/品牌形象/网页素材拓展/登录注册原型与素材'
TARGET = ROOT / 'assets/web/brand/account'
ICONS = ['sprout', 'user', 'mail', 'lock', 'eye', 'eye-off', 'checkbox', 'checkbox-checked', 'arrow-right', 'key', 'cloud-sync', 'shield', 'sparkle', 'more', 'arrow-left', 'external-link']

def trim(image, pad=18):
    image = image.convert('RGBA')
    alpha = np.asarray(image.getchannel('A'))
    solid = alpha > 96
    ys = np.where(solid.sum(axis=1) >= max(3, image.width * .005))[0]
    xs = np.where(solid.sum(axis=0) >= max(3, image.height * .005))[0]
    if not len(xs) or not len(ys):
        raise ValueError('素材没有可用的透明主体')
    box = (max(0,int(xs[0])-pad),max(0,int(ys[0])-pad),min(image.width,int(xs[-1])+pad+1),min(image.height,int(ys[-1])+pad+1))
    image.putalpha(image.getchannel('A').point(lambda x: 0 if x < 8 else x))
    return image.crop(box)

def main():
    TARGET.mkdir(parents=True, exist_ok=True)
    manifest = []
    for index, name in enumerate(ICONS,1):
        source = next((SOURCE / '透明图标/独立图标').glob(str(index).zfill(2)+'_*.png'))
        image = trim(Image.open(source))
        image.thumbnail((100,100),Image.Resampling.LANCZOS)
        out = Image.new('RGBA',(128,128))
        out.alpha_composite(image,((128-image.width)//2,(128-image.height)//2))
        target = TARGET / (name+'.webp')
        out.save(target,'WEBP',lossless=True,method=6)
        manifest.append({'file':target.name,'source':source.name,'size':[128,128]})
    for prefix,name,limit in [('01','suinai-welcome',(900,1900)),('02','sprout-decoration',(520,420)),('03','welcome-bubble',(1000,360))]:
        source = next((SOURCE / '透明插画').glob(prefix+'_*.png'))
        image = trim(Image.open(source),32)
        image.thumbnail(limit,Image.Resampling.LANCZOS)
        target = TARGET / (name+'.webp')
        image.save(target,'WEBP',quality=92,method=6)
        manifest.append({'file':target.name,'source':source.name,'size':list(image.size)})
    (TARGET/'manifest.json').write_text(json.dumps({'source':'穗奈_登录注册原型与透明素材包.zip','assets':manifest},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'assets':len(manifest),'bytes':sum((TARGET/m['file']).stat().st_size for m in manifest)},ensure_ascii=False))

if __name__ == '__main__':
    main()
