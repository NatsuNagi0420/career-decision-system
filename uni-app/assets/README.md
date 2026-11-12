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

模板中可以绑定 `avatar`；静态资源路径统一以 `/static/assets/` 开头。原有 `src/static/suinai-avatar.png` 保留，后续替换头像时再逐页切换到角色素材。


## 界面字体

- `assets/fonts/`：Fusion Pixel 原始字体与完整 OFL 许可，仅作为生成源，不进入运行时包。
- `scripts/prepare-ui-font.py`：收集源码中的界面文字，生成名为 `Qingsui Pixel UI` 的字体子集，保留原始版权记录。
- `src/styles/pixel-font.scss`：微信与 H5 共用的内嵌字体声明；原生底栏的独立样式使用同步生成的 `src/custom-tab-bar/pixel-font.wxss`。

标题、导航和短按钮使用像素字体；长对话、用户经历、岗位描述和简历使用系统中文字体。字体随包提供，不依赖远程字体请求，也不阻塞首屏显示。新增中文界面文案后，可运行 `python scripts/prepare-ui-font.py` 更新子集（需安装 `fonttools[woff]`）；生成结果已保存到源码，正常构建不依赖 Python。字体中没有的动态字符由系统字体回退。

## 角色形象

小程序统一使用原有穗奈：棕发、圆眼镜、发夹和浅紫外套。小头像统一引用 `assetPaths.characters.suinaiAvatar`；欢迎区引用原有 `suinaiWave` 立绘。头像从已有全身图直接裁切，使用 `scripts/prepare-suinai-avatar.py` 可重复生成，不重新绘制人物。后续原型只借鉴布局与通用图标，角色使用同一套穗奈素材。
