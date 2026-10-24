<!-- 青穗集 · See-through审查补充v02：以用户确认的全身v2输入重新对齐，纠正旧半身对照的适用范围。 -->
# See-through PSD：确认实际输入后的补充审查

日期：2026-10-18。

## 实际输入已确认

`D:\Project\career-decision-system\docs\品牌形象\穗奈v2\穗奈_Live2D全身立绘_整体风格统一.png`

尺寸：1440×2560。SHA256：`552bac8795fd85fce19e762c6525aff82241368c96868b7bdc78b70755b5addd`。

本次PSD以这张全身版为唯一外观对照，不用旧半身图判定还原度。

## 更正与确认

1. 腿、鞋原本就在实际输入中，不是工具凭空补出。
2. 将原图等比缩放0.6得到864×1536，再左右各补336像素，可与PSD的1536×1536建立几何对照。实际查看对照后，人物比例、服装及鞋的位置基本对应，没有证据仅凭方形画布就判定人物被压扁。
3. 这只是建立比较坐标，不能声称逐项验证了工具内部重采样过程或所有像素一一还原。
4. 前次的 `source-vs-psd.png` 使用的是另一版旧半身输入，不能用于这次的还原度评价。v01中“实际输入待确认”已结束，以本补充记录为准。

## 当前结论

**可以保留这份PSD作为粗拆起点，不需要因全身构图或方形画布推翻重跑。仍需修整后再作为正式建模原画验收。**

真实待修项保持：眼镜在脸层下、脸底斑驳/残留、眼口细分、主发束拆分、必要衣物关节遮挡补全、轮廓边缘清理。对齐新输入后，这些问题依然可见，不是与旧版比较造成的假象。

原图比当前PSD面部保有更多原生像素，后续优先回到实际原图恢复细节；不把现有小部件放大当作新增细节。旧半身眉毛小样不是本版坐标，不直接混贴。

## 已完成的新账号交接包

`D:\Project\career-decision-system\docs\品牌形象\Live2D原画\04-拆层交接\穗奈v2_SeeThrough拆层修整交接包_v01.zip`

包含：实际全身原图、现有24层PSD、已确认坐标、当前图层清单、对齐与问题预览、完整修整任务、验收清单和可直接发送的入口提示词。没有混入旧单眉任务或旧半身原图。

该包是让新账号继续执行的输入与说明，不是已经修好的分层成品。已重新打开ZIP并核对CRC与逐文件SHA256；原图和PSD未改写。

## 本次日志与预览

`D:\Project\career-decision-system\logs\seethrough-psd-review-20261018\`

新增：
- `compare_confirmed_input.py`
- `confirmed-input-report.json`
- `confirmed-input-aligned.png`
- `confirmed-input-vs-psd.png`
- `confirmed-face-comparison.png`
- `confirmed-source-face-native.png`
- `prepare_confirmed_handoff.py`
- `handoff-validation.json`

未制作修复后的PSD，未实际打开原生图像编辑器、导入Cubism、制作绑定或动作。
