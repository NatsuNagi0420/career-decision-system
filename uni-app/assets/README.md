/** 青穗集 · 小程序素材目录说明：记录素材来源、用途和运行时边界。 */
# Uni-app 素材目录

素材来源：`D:/Project/career-decision-system/assets/穗奈_小程序端原型与透明图标_全量包.zip`

## 目录

- `src/static/assets/icons/`：透明像素图标，可直接用于 uni-app 页面和微信小程序。
- `src/static/assets/tabbar/`：专门给微信底部导航使用的 81×81 小图标，每张控制在 40KB 以内。
- `src/static/assets/characters/`：穗奈、像素猫和场景插画，可直接用于页面展示。
- `src/static/assets/index.ts`：运行时素材路径索引，页面应从这里取路径。
- `assets/prototypes/`：14 张页面原型，仅作为设计参考，不参与小程序运行时打包。
- `assets/asset-inventory.json`：每个文件的来源、目标路径、大小和 SHA-256。

## 使用

```ts
import { assetPaths } from "../../static/assets";

const avatar = assetPaths.characters.suinaiWave;
```

模板中可以绑定 `avatar`；静态资源路径统一以 `/static/assets/` 开头。原有 `src/static/suinai-avatar.png` 和像素字体保留，后续替换头像时再逐页切换到角色素材。


微信小程序端不加载本地 @font-face 字体，使用系统中文字体回退；H5 端继续使用像素字体。
