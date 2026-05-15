# 字体文件说明

本项目使用以下字体，但字体文件体积较大，未包含在仓库中。

## 需要的字体

### 1. Noto Serif CJK SC（思源宋体）
- **用途**：中文显示
- **下载地址**：https://github.com/notofonts/noto-cjk/releases
- **需要的文件**：
  - NotoSerifCJKsc-Regular.otf
  - NotoSerifCJKsc-Bold.otf

### 2. Roboto
- **用途**：英文和数字显示
- **下载地址**：https://fonts.google.com/specimen/Roboto
- **需要的文件**：
  - Roboto-Regular.ttf
  - Roboto-Bold.ttf
  - Roboto-Medium.ttf
  - Roboto-Light.ttf
  - RobotoCondensed-Regular.ttf
  - RobotoCondensed-Bold.ttf

## 安装步骤

1. 下载上述字体文件
2. 将字体文件放置到 `video_anime/src/assets/fonts/` 目录
3. 字体会通过 CSS `@font-face` 自动加载

## 备注

- 字体文件总大小约 150MB
- 已在 `.gitignore` 中排除，不会提交到仓库
- 如果不需要演示动画功能，可以跳过字体安装
