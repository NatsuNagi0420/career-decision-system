# 项目文件结构清单（清理后）

生成时间：2026-05-09  
项目路径：D:\Project\服创

---

## 📁 根目录文件

```
D:\Project\服创\
├── .gitignore                        # Git忽略规则
├── DEVELOPMENT_LOG.md                # 开发日志 (47KB)
├── PROJECT_CLEANUP_REPORT.md         # 清理报告 (11KB)
├── PROJECT_SUMMARY_REPORT.md         # 项目总结 (11KB)
├── TODO.md                           # 问题清单 (27KB)
├── package.json                      # npm配置（测试用）
├── package-lock.json                 # npm锁文件 (42KB)
├── plan.md                           # 计划文档 (40KB)
└── test-progress-ui.js               # 自动化测试脚本 (14KB)
```

---

## 📂 目录结构

### 1. .claude/ - Claude配置
```
.claude/
├── settings.json                     # Claude全局设置
└── settings.local.json               # Claude本地设置
```

### 2. backend/ - 后端代码
```
backend/ba/
├── .mvn/wrapper/                     # Maven wrapper
├── data/                             # 运行时数据
│   └── activity_cooldown.json        # 活动冷却数据
├── sql/                              # 数据库脚本
│   └── career_db.sql                 # 数据库初始化脚本
├── src/
│   ├── main/
│   │   ├── java/com/example/ba/
│   │   │   ├── BaApplication.java   # Spring Boot主类
│   │   │   ├── common/              # 通用类
│   │   │   │   └── Result.java      # 统一返回结果
│   │   │   ├── config/              # 配置类
│   │   │   │   ├── AuthInterceptor.java
│   │   │   │   └── WebConfig.java
│   │   │   ├── controller/          # 控制器
│   │   │   │   ├── ActivityController.java
│   │   │   │   ├── AiHealthController.java
│   │   │   │   ├── AssistantController.java
│   │   │   │   ├── CacheController.java
│   │   │   │   ├── CapabilityController.java
│   │   │   │   ├── JobController.java
│   │   │   │   ├── MbtiController.java
│   │   │   │   ├── PathPlanController.java
│   │   │   │   ├── ReportArchiveController.java
│   │   │   │   ├── ResumeController.java
│   │   │   │   └── UserController.java
│   │   │   ├── dto/                 # 数据传输对象
│   │   │   │   ├── ActivitySignalDTO.java
│   │   │   │   ├── AssistantChatDTO.java
│   │   │   │   ├── CapabilityProfileRequestDTO.java
│   │   │   │   ├── JobRecommendRequestDTO.java
│   │   │   │   ├── MbtiSubmitDTO.java
│   │   │   │   ├── ReportArchiveRequestDTO.java
│   │   │   │   ├── ReportGenerateRequestDTO.java
│   │   │   │   ├── ResumeParseResultDTO.java
│   │   │   │   ├── UserLoginDTO.java
│   │   │   │   └── UserRegisterDTO.java
│   │   │   ├── mapper/              # MyBatis映射器
│   │   │   │   ├── JobMapper.java
│   │   │   │   ├── MbtiMapper.java
│   │   │   │   ├── UserMapper.java
│   │   │   │   ├── UserReportArchiveMapper.java
│   │   │   │   └── UserTokenMapper.java
│   │   │   ├── pojo/                # 实体类
│   │   │   │   ├── JobInfo.java
│   │   │   │   ├── MbtiOption.java
│   │   │   │   ├── MbtiQuestion.java
│   │   │   │   ├── MbtiUserAnswer.java
│   │   │   │   ├── User.java
│   │   │   │   ├── UserReportArchive.java
│   │   │   │   └── UserToken.java
│   │   │   ├── service/             # 服务接口
│   │   │   │   ├── CapabilityService.java
│   │   │   │   ├── JobService.java
│   │   │   │   ├── MbtiService.java
│   │   │   │   ├── ResumeParseService.java
│   │   │   │   └── UserService.java
│   │   │   ├── service/impl/        # 服务实现
│   │   │   │   ├── CapabilityServiceImpl.java
│   │   │   │   ├── JobServiceImpl.java
│   │   │   │   ├── MbtiServiceImpl.java
│   │   │   │   └── UserServiceImpl.java
│   │   │   ├── utils/               # 工具类
│   │   │   │   ├── AiUtils.java
│   │   │   │   ├── AuthContext.java
│   │   │   │   ├── BaseUrlUtils.java
│   │   │   │   └── JsonUtils.java
│   │   │   └── vo/                  # 视图对象
│   │   │       ├── LoginVO.java
│   │   │       └── MbtiQuestionVO.java
│   │   └── resources/
│   │       ├── application.properties  # 应用配置
│   │       ├── mapper/              # MyBatis XML映射
│   │       ├── static/              # 静态资源
│   │       └── templates/           # 模板文件
│   └── test/
│       └── java/com/example/ba/
│           └── BaApplicationTests.java
├── pom.xml                           # Maven配置
├── start-backend.bat                 # 启动脚本
└── HELP.md                           # 帮助文档
```

### 3. frontend/ - 前端代码
```
frontend/fr/
├── public/                           # 静态资源
│   ├── favicon.ico
│   └── favicon.png
├── src/
│   ├── api/                          # API接口
│   │   ├── assistant.ts
│   │   ├── capability.ts
│   │   ├── jobs.ts
│   │   ├── persistence.ts
│   │   ├── report.ts
│   │   ├── resume.ts
│   │   └── user.ts
│   ├── assets/                       # 资源文件
│   │   └── global.css
│   ├── components/                   # 组件
│   │   ├── AiAssistant.vue
│   │   ├── AppDialog.vue
│   │   ├── AppFooter.vue
│   │   ├── DeepAssessmentQuestionnaire.vue
│   │   └── Navbar.vue
│   ├── pages/                        # 页面
│   │   ├── CapabilityProfile.vue    # 能力画像
│   │   ├── ComprehensiveEntry.vue   # 综合信息录入
│   │   ├── Home.vue                 # 首页
│   │   ├── JobExploration.vue       # 岗位探索
│   │   ├── Login.vue                # 登录
│   │   ├── PathPlanning.vue         # 路径规划
│   │   ├── Report.vue               # 报告生成
│   │   └── ReportsList.vue          # 报告列表
│   ├── router/                       # 路由
│   │   └── index.ts
│   ├── stores/                       # 状态管理
│   │   ├── counter.ts
│   │   └── theme.ts
│   ├── utils/                        # 工具函数
│   │   ├── activityMonitor.ts       # 活动监控
│   │   ├── activityMonitor.types.md
│   │   ├── auth.ts                  # 认证工具
│   │   ├── request.ts               # 请求封装
│   │   ├── sseParser.ts             # SSE解析
│   │   └── storage.ts               # 本地存储
│   ├── App.vue                       # 根组件
│   └── main.ts                       # 入口文件
├── .editorconfig                     # 编辑器配置
├── .env                              # 环境变量
├── .env.example                      # 环境变量示例
├── .eslintcache                      # ESLint缓存
├── .gitignore                        # Git忽略规则
├── .oxlintrc.json                    # Oxlint配置
├── .prettierrc.json                  # Prettier配置
├── DESIGN.md                         # 设计文档
├── env.d.ts                          # 环境类型定义
├── eslint.config.ts                  # ESLint配置
├── index.html                        # HTML模板
├── package.json                      # npm配置
├── package-lock.json                 # npm锁文件
├── README.md                         # 说明文档
├── tsconfig.json                     # TypeScript配置
├── tsconfig.app.json                 # 应用TS配置
├── tsconfig.node.json                # Node TS配置
└── vite.config.ts                    # Vite配置
```

### 4. docs/ - 文档目录
```
docs/
├── archive/                          # 归档文件
│   ├── PROBLEM5_COMPLETION_REPORT.md
│   ├── PROBLEM6_COMPLETION_REPORT.md
│   ├── PROBLEM7_COMPLETION_REPORT.md
│   ├── PROBLEM9_COMPLETION_REPORT.md
│   └── PROBLEM6_TEST_GUIDE.md
├── image/                            # 图片资源
│   ├── 前端技术栈.png
│   ├── 功能结构图.png
│   ├── 后端技术栈.png
│   ├── 技术架构图.png
│   ├── 技术路线图.png
│   ├── 研究目标.png
│   ├── 系统架构.png
│   ├── 逻辑架构图.png
│   └── 部署架构图.png
├── 大学生简历模板/                   # 简历模板
├── 岗位数据表/                       # 岗位数据
├── AI大学生职业规划问卷（格式版）.docx
├── generate_docx.py                  # 文档生成脚本
├── HELP.md                           # 帮助文档
├── helpfr.md                         # 前端帮助
├── 开发规范.md                       # 开发规范
├── 功能链路帮助手册.md               # 功能手册
├── 项目计划书.docx                   # 项目计划书
├── 项目计划书.md
├── 项目计划书.pdf
├── 项目计划书_纯文本版.txt
├── 项目部署文档.md                   # 部署文档
└── [其他项目文档]
```

### 5. server/ - 静态资源服务器
```
server/
├── images/
│   ├── avatar/                       # 头像
│   ├── background/                   # 背景图
│   └── gif/                          # GIF动图
└── videos/                           # 视频资源
```

### 6. codex-academic-paper-skills-main/ - 学术论文技能包
```
codex-academic-paper-skills-main/
└── codex-academic-paper-skills-main/
    ├── skills/
    │   ├── academic-paper-composer/
    │   └── academic-paper-strategist/
    ├── LICENSE
    └── README.md
```

---

## 📊 文件统计

### 代码文件
- **后端Java文件**：~60个
- **前端Vue/TS文件**：~30个
- **配置文件**：~20个

### 文档文件
- **项目文档**：~20个
- **归档报告**：5个
- **图片资源**：~20个

### 总计
- **目录数**：~50个
- **文件数**：~200个（不含node_modules和target）

---

## 🗑️ 已清理文件

### 已删除（10个文件）
1. test-debug.js
2. test-sse-progress.sh
3. test-screenshot.png
4. AUTOMATED_TEST_REPORT.md
5. TEST_REPORT.md
6. TEST_SUMMARY.md
7. VERIFICATION_REPORT.md
8. BROWSER_TEST_GUIDE.md
9. PROBLEM1_TEST_GUIDE.md
10. PROBLEM7_TEST_GUIDE.md

### 已归档到 docs/archive/（5个文件）
1. PROBLEM5_COMPLETION_REPORT.md
2. PROBLEM6_COMPLETION_REPORT.md
3. PROBLEM7_COMPLETION_REPORT.md
4. PROBLEM9_COMPLETION_REPORT.md
5. PROBLEM6_TEST_GUIDE.md

---

## 📋 核心文件说明

### 根目录核心文件
- **DEVELOPMENT_LOG.md** - 开发过程记录
- **PROJECT_SUMMARY_REPORT.md** - 项目总结报告（9个问题修复完成）
- **PROJECT_CLEANUP_REPORT.md** - 清理分析报告
- **TODO.md** - 问题清单（已更新所有状态）
- **test-progress-ui.js** - 自动化E2E测试脚本（Puppeteer）
- **package.json** - 测试依赖配置

### 后端核心文件
- **CapabilityServiceImpl.java** - 能力画像服务实现（推理链+缓存）
- **AiUtils.java** - AI工具类（SSE流式传输）
- **application.properties** - 应用配置

### 前端核心文件
- **CapabilityProfile.vue** - 能力画像页（含进度显示UI）
- **PathPlanning.vue** - 路径规划页（含进度显示UI）
- **sseParser.ts** - SSE解析工具
- **storage.ts** - 本地存储工具

---

## 🎯 项目状态

- ✅ 代码结构清晰
- ✅ 冗余文件已清理
- ✅ 文档已归档整理
- ✅ 核心功能完整
- ✅ 测试脚本可用

**项目就绪，可以部署！** 🚀

---

**清单生成时间**：2026-05-09  
**清单生成者**：Claude (Opus 4.7)
