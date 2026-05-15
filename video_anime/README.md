# 视频动画制作项目

## 项目说明
本项目用于制作"基于AI的大学生职业规划智能体"演示视频中的动画部分。

## 目录结构

```
video_anime/
├── docs/                          # 文档目录
│   ├── 动画清单.md                # 需要制作的动画列表
│   ├── 设计方案.md                # 整体设计方案
│   ├── 制作大纲.md                # 制作步骤和时间规划
│   └── 技术规范.md                # 技术实现规范
├── src/                           # 源代码目录
│   ├── components/                # 可复用组件
│   ├── animations/                # 动画页面
│   │   ├── opening.vue           # 开场动画
│   │   ├── architecture.vue      # 系统架构动画
│   │   ├── dataflow.vue          # 数据流动画
│   │   ├── stats.vue             # 统计数据动画
│   │   ├── flow.vue              # 功能流程动画
│   │   ├── techstack.vue         # 技术栈动画
│   │   └── models.vue            # AI模型动画
│   ├── assets/                    # 资源文件
│   │   ├── images/               # 图片资源
│   │   └── fonts/                # 字体文件
│   ├── App.vue                    # 主应用
│   ├── main.js                    # 入口文件
│   └── router.js                  # 路由配置
├── public/                        # 公共资源
├── package.json                   # 项目配置
└── README.md                      # 项目说明
```

## 快速开始

### 1. 安装依赖
```bash
cd video_anime
npm install
```

### 2. 启动开发服务器
```bash
npm run dev
```

### 3. 访问动画页面
```
http://localhost:5173/opening        # 开场动画
http://localhost:5173/architecture   # 架构动画
http://localhost:5173/stats          # 统计动画
...
```

### 4. 录制动画
- 使用 OBS Studio 录制浏览器窗口
- 分辨率：1920x1080
- 帧率：60fps
- 格式：MP4

## 技术栈

- **框架**：Vue 3 + Vite
- **语言**：JavaScript/TypeScript
- **动画库**：CSS3 Animations + Vue Transition
- **图表**：可选 ECharts、D3.js
- **工具**：OBS Studio（录制）、剪映（剪辑）

## 开发规范

- 所有动画尺寸：1920x1080
- 帧率：60fps
- 配色方案：统一使用项目主题色
- 字体：思源黑体
- 动画时长：单个动画 5-30 秒

## 导出流程

1. 在浏览器中打开动画页面
2. 使用 OBS Studio 录制
3. 导出为 MP4 格式
4. 保存到 `video_anime/output/` 目录
5. 在剪映中导入并集成到主视频

---

**创建日期**：2026-05-14  
**维护人员**：开发团队
