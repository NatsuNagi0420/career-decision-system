<!-- 青穗集 · 穗奈 v0.5 Pixelorama 素材模板：记录分层文件和制作顺序。 -->
# 穗奈 v0.5 Pixelorama 素材模板

这里是穗奈正式动作素材的制作模板，不是已经完成的角色图。`pixel-v04` 只作为视觉参考，不能直接拆成最终动作。

- 画布：256×320 原生像素，对应 128×160 逻辑网格。
- 图层：`layers/` 下的 10 个透明 PNG，按 `manifest.json` 的 depth 从后往前叠加。
- 锚点：使用 `manifest.json` 的原生像素坐标；所有关节和道具位置都要围绕这些点画。
- 动作：先完成 `model-sheet/frame-00`，再制作 idle 和 listen 的 4 帧关键姿势。
- 工具：用 `D:\IDE\Pixelorama\Pixelorama-Windows-64bit\Pixelorama.exe` 打开每个 PNG 或建立同尺寸工程。

## 制作顺序

1. 在 `neck-face` 层完成头、脸、耳朵和下巴的稳定轮廓。
2. 在 `body` 层完成放松的肩线、衣领和开衫大色块。
3. 在 `hair-back`、`hair-front` 层分出前后发束，发夹单独保留在前发层。
4. 在 `glasses` 层画圆框眼镜，确保镜框不依赖脸部抗锯齿。
5. 在 `arm-left`、`arm-right` 和 `hands` 层制作待机手部，再复制出倾听手部。
6. 最后添加 `prop` 和 `effects`，不要先用道具遮住关节问题。

每一层都要保留透明边界和 pivot 对齐，导出前检查 1×、2×和真实桌面小窗三个尺寸。
