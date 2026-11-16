# 仓库首页配图

此目录只存放根 README 使用的公开展示图。截图使用测试或虚构示例资料；不从真实用户数据库采集内容，不展示令牌、API Key、真实联系方式或本机项目绝对路径。

## 界面图片

| 文件 | 内容与采集日期 | 来源与处理 |
| --- | --- | --- |
| `images/desktop.jpg` | 主对话空态，2026-11-12 | `logs/2026-11-12-home-balance/after-wide.jpg`；等比例缩至 1680 像素宽 |
| `images/evidence.jpg` | 职业资料核对，2026-10-28 | `logs/jev-career-integration-20261028-1818/career-evidence-confirmed.jpg`；等比例缩放 |
| `images/learning.jpg` | 学习路线，2026-11-12 | `logs/learning-20261112/learning-preview.jpg`；JPEG 压缩 |
| `images/interview.jpg` | 文字模拟面试，2026-11-13 | `logs/interview-window-20261113/interview-window.png`；JPEG 压缩 |
| `images/resume-writing.jpg` | 简历实时书写，2026-10-27 | `logs/resume-writing-motion-20261027/writing-preview.jpg`；裁剪矩形 `(745, 0, 1803, 800)`，去除两侧和页尾空白，人物“林知夏”为虚构示例 |
| `images/login.jpg` | PC 登录入口，2026-11-16 | Chrome 访问本机开发界面；未输入账号、密码或 Key |
| `images/memory.jpg` | 当前忆迹场，2026-11-16 | Chrome 访问 `scripts/qa/preview-memory-multinode.mts --serve` 启动的独立预览，35 条合成记忆；裁剪矩形 `(45, 72, 1103, 1033)` 聚焦记忆窗口 |
| `images/mobile.jpg` | 移动端首页、成长、岗位，历史 H5 预览 | 本机 H5 合成数据截图 `H5-01/02/03` 拼图；仅在图外增加栏目名，没有修改界面内容。原件存放于本机 `docs/传智杯/WXUniapp/页面截图_H5合成演示/` |

历史截图也保存在本机 `docs/传智杯/AIWeb/项目详细情况素材_v0.3/` 中。它们是实际页面运行结果，但不同于“当前全部页面均已重新验收”。移动图不能当作微信原生真机运行证据，合成资料也不能当作产品效果数据。

当前登录与记忆截图的原始采集文件存于本机 `logs/readme-refresh-20261116/`，不进入 Git。登录截图来自开发前端；记忆截图来自隔离 SQLite、模型替身与禁用命令的本机预览服务，不调用付费模型，不修改真实用户数据。

## 可编辑示意图

- `images/career-journey.svg`：职业成长路线，包含事实积累的回流关系，不表示强制线性表单。
- `images/system-architecture.svg`：本机执行、Hub 同步、官方 / 自配模型与可选云端执行的逻辑架构。箭头表达逻辑调用，省略实际 HTTPS 反向代理与内部存储实现。

SVG 为本仓库直接编写的可编辑矢量图，没有使用生图模型生成虚构页面。全部展示文件使用相对路径，便于 GitHub 渲染及仓库离线阅读。
