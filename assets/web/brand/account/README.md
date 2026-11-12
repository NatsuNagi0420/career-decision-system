# 登录与注册公共素材

来源：用户提供的“穗奈_登录注册原型与透明素材包.zip”。原始稿与原型图整理于 docs/品牌形象/网页素材拓展/登录注册原型与素材。

19 张 WebP：16 枚 128×128 图标，加穗奈欢迎立绘、芽苗书本装饰和像素气泡。均保留透明通道；统一通过 /api/assets/brand/account/ 获取。manifest.json 记录对应原稿。

重新整理：python scripts/assets/prepare-auth-assets.py（需要 Pillow、NumPy）。

登录页使用欢迎立绘与轻微呼吸动态；主对话区域继续使用既有穗奈动作资源。页面中的文字、标签和状态由真实 HTML 渲染，不使用原型上的生成文字。
