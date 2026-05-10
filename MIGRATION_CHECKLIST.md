# 项目迁移检查清单

> **目的**：从当前物理机迁移到新物理机  
> **创建时间**：2026-05-11  
> **状态**：准备中

---

## 📋 迁移前检查清单

### 一、代码提交检查

#### 1. 检查未提交的文件

```bash
# 查看当前状态
git status

# 查看未跟踪的文件
git ls-files --others --exclude-standard

# 查看已修改但未暂存的文件
git diff --name-only

# 查看已暂存但未提交的文件
git diff --cached --name-only
```

**需要确认**：
- [ ] 所有重要文件已添加到 Git
- [ ] 临时文件、测试文件已清理
- [ ] 敏感信息已移除（密码、Token、密钥）

---

#### 2. 检查 .gitignore

确保以下文件/目录已被忽略：

```gitignore
# 依赖
node_modules/
.pnp
.pnp.js

# 测试
coverage/
.nyc_output/

# 构建产物
dist/
build/
*.local

# 环境变量（敏感信息）
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# 操作系统
.DS_Store
Thumbs.db

# 日志
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# 临时文件
*.tmp
*.temp
.cache/
```

**需要确认**：
- [ ] .gitignore 文件存在且配置正确
- [ ] 敏感文件不会被提交

---

#### 3. 提交所有更改

```bash
# 添加所有新文档
git add *.md

# 添加代码更改
git add frontend/fr/src/

# 查看将要提交的内容
git status

# 创建提交
git commit -m "docs: 完善重构文档体系

- 添加 REFACTOR_ROADMAP.md（系统性重构路线图）
- 添加 DEVELOPMENT_GUIDE.md（开发规范）
- 添加 API_SPECIFICATION.md（API 接口规范）
- 添加 COMPONENT_GUIDE.md（组件开发指南）
- 添加 TESTING_GUIDE.md（测试指南）
- 优化 JobExploration.vue 交互逻辑（移除强制跳转）
- 添加 ProfilePromptBanner.vue 组件

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### 二、环境配置文件准备

#### 1. 创建环境变量模板

**创建 `.env.example` 文件**（不包含敏感信息）：

```bash
# 前端环境变量模板
cat > frontend/fr/.env.example << 'EOF'
# API 配置
VITE_API_BASE_URL=http://localhost:8080/api/v1
VITE_API_TIMEOUT=30000

# 应用配置
VITE_APP_TITLE=职业规划平台
VITE_APP_VERSION=2.0.0

# 功能开关
VITE_ENABLE_MOCK=false
VITE_ENABLE_DEBUG=false

# 第三方服务（需要替换为实际值）
VITE_SENTRY_DSN=your_sentry_dsn_here
VITE_GA_ID=your_google_analytics_id_here
EOF
```

**创建后端配置模板**：

```bash
# 后端环境变量模板
cat > backend/ba/.env.example << 'EOF'
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=career_platform
DB_USERNAME=your_username
DB_PASSWORD=your_password

# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# JWT 配置
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRATION=86400

# 第三方服务
OPENAI_API_KEY=your_openai_key_here
ALIYUN_ACCESS_KEY=your_aliyun_key_here
EOF
```

**需要确认**：
- [ ] .env.example 已创建
- [ ] 不包含真实的敏感信息
- [ ] 包含所有必要的配置项

---

#### 2. 创建 README.md（如果没有）

```bash
cat > README.md << 'EOF'
# 职业规划平台

面向大学生的智能职业路径选择决策支持系统

## 项目结构

```
.
├── frontend/fr/          # 前端项目（Vue 3 + TypeScript）
├── backend/ba/           # 后端项目（Spring Boot）
├── docs/                 # 文档目录
└── *.md                  # 项目文档
```

## 快速开始

### 前端开发

```bash
cd frontend/fr
npm install
cp .env.example .env      # 复制环境变量模板并配置
npm run dev
```

### 后端开发

```bash
cd backend/ba
cp .env.example .env      # 复制环境变量模板并配置
./mvnw spring-boot:run
```

## 文档

- [重构路线图](./REFACTOR_ROADMAP.md) - 系统性重构计划
- [开发规范](./DEVELOPMENT_GUIDE.md) - 代码规范和最佳实践
- [API 规范](./API_SPECIFICATION.md) - 接口文档
- [组件开发指南](./COMPONENT_GUIDE.md) - 组件开发规范
- [测试指南](./TESTING_GUIDE.md) - 测试策略和用例

## 技术栈

### 前端
- Vue 3 + TypeScript
- Vite
- Pinia（状态管理）
- Element Plus（UI 组件库）
- ECharts（数据可视化）

### 后端
- Spring Boot
- MySQL
- Redis
- MyBatis

## 开发团队

- 前端开发：[团队成员]
- 后端开发：[团队成员]
- 产品设计：[团队成员]

## License

[MIT License](./LICENSE)
EOF
```

---

### 三、依赖和配置文件检查

#### 1. 前端依赖检查

```bash
cd frontend/fr

# 检查 package.json 是否存在
ls -la package.json

# 检查关键依赖
cat package.json | grep -A 20 '"dependencies"'
cat package.json | grep -A 20 '"devDependencies"'
```

**需要确认**：
- [ ] package.json 存在
- [ ] package-lock.json 或 yarn.lock 存在
- [ ] 所有依赖版本已锁定

---

#### 2. 后端依赖检查

```bash
cd backend/ba

# 检查 pom.xml 或 build.gradle
ls -la pom.xml

# 检查 application.properties 或 application.yml
ls -la src/main/resources/application*.properties
ls -la src/main/resources/application*.yml
```

**需要确认**：
- [ ] pom.xml 或 build.gradle 存在
- [ ] application.properties 不包含敏感信息
- [ ] 数据库配置使用环境变量

---

### 四、GitHub 推送准备

#### 1. 检查远程仓库

```bash
# 查看远程仓库
git remote -v

# 如果没有远程仓库，添加
git remote add origin https://github.com/your-username/career-platform.git

# 如果需要修改远程仓库地址
git remote set-url origin https://github.com/your-username/career-platform.git
```

---

#### 2. 推送到 GitHub

```bash
# 查看当前分支
git branch

# 推送到远程（首次推送）
git push -u origin master

# 或者推送到 main 分支
git push -u origin main

# 推送所有分支
git push --all origin

# 推送标签（如果有）
git push --tags origin
```

---

#### 3. 创建 .github 工作流（可选）

创建 GitHub Actions 配置：

```bash
mkdir -p .github/workflows

cat > .github/workflows/ci.yml << 'EOF'
name: CI

on:
  push:
    branches: [ master, main ]
  pull_request:
    branches: [ master, main ]

jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend/fr
          npm ci
      - name: Lint
        run: |
          cd frontend/fr
          npm run lint
      - name: Build
        run: |
          cd frontend/fr
          npm run build

  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-java@v3
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Build with Maven
        run: |
          cd backend/ba
          ./mvnw clean package -DskipTests
EOF
```

---

### 五、新机器设置指南

#### 1. 克隆项目

```bash
# 克隆项目
git clone https://github.com/your-username/career-platform.git
cd career-platform
```

---

#### 2. 前端环境设置

```bash
cd frontend/fr

# 安装 Node.js（推荐使用 nvm）
# Windows: 下载 Node.js 18+ 安装包
# macOS/Linux: 使用 nvm
nvm install 18
nvm use 18

# 安装依赖
npm install

# 复制环境变量
cp .env.example .env

# 编辑 .env 文件，填入实际配置
# 使用你喜欢的编辑器：code .env / vim .env / nano .env

# 启动开发服务器
npm run dev
```

---

#### 3. 后端环境设置

```bash
cd backend/ba

# 安装 Java 17+
# Windows: 下载 JDK 17 安装包
# macOS: brew install openjdk@17
# Linux: sudo apt install openjdk-17-jdk

# 安装 MySQL
# Windows: 下载 MySQL 安装包
# macOS: brew install mysql
# Linux: sudo apt install mysql-server

# 安装 Redis
# Windows: 下载 Redis for Windows
# macOS: brew install redis
# Linux: sudo apt install redis-server

# 复制环境变量
cp .env.example .env

# 编辑 .env 文件，填入实际配置

# 启动后端服务
./mvnw spring-boot:run
```

---

#### 4. IDE 设置

**VS Code 推荐插件**：

```json
{
  "recommendations": [
    "vue.volar",
    "vue.vscode-typescript-vue-plugin",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "antfu.iconify",
    "lokalise.i18n-ally"
  ]
}
```

创建 `.vscode/extensions.json`：

```bash
mkdir -p .vscode
cat > .vscode/extensions.json << 'EOF'
{
  "recommendations": [
    "vue.volar",
    "vue.vscode-typescript-vue-plugin",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss"
  ]
}
EOF
```

---

### 六、数据备份

#### 1. 数据库备份

```bash
# 导出数据库
mysqldump -u username -p career_platform > backup_$(date +%Y%m%d).sql

# 压缩备份文件
gzip backup_$(date +%Y%m%d).sql
```

**需要确认**：
- [ ] 数据库已备份
- [ ] 备份文件已保存到安全位置（云盘、U盘）

---

#### 2. 配置文件备份

```bash
# 备份所有 .env 文件（包含敏感信息，不要提交到 Git）
mkdir -p ~/backup/career-platform-env
cp frontend/fr/.env ~/backup/career-platform-env/frontend.env
cp backend/ba/.env ~/backup/career-platform-env/backend.env

# 备份到云盘或 U盘
```

**需要确认**：
- [ ] 环境变量文件已备份
- [ ] 备份文件已保存到安全位置

---

### 七、最终检查清单

#### 推送前最终确认

- [ ] 所有代码已提交到 Git
- [ ] .gitignore 配置正确
- [ ] 敏感信息已移除
- [ ] .env.example 已创建
- [ ] README.md 已创建或更新
- [ ] 依赖文件完整（package.json, pom.xml）
- [ ] 远程仓库已配置
- [ ] 代码已推送到 GitHub

#### 备份确认

- [ ] 数据库已备份
- [ ] 环境变量文件已备份
- [ ] 备份文件已保存到安全位置

#### 文档确认

- [ ] 所有重构文档已提交
- [ ] 开发指南已完善
- [ ] API 文档已完善

---

## 🚀 执行步骤

### Step 1：提交代码

```bash
# 1. 查看状态
git status

# 2. 添加所有更改
git add .

# 3. 创建提交
git commit -m "docs: 完善重构文档体系并优化岗位库交互"

# 4. 推送到 GitHub
git push -u origin master
```

### Step 2：备份敏感数据

```bash
# 1. 备份数据库
mysqldump -u root -p career_platform > backup.sql

# 2. 备份环境变量
mkdir -p ~/backup/career-platform-env
cp frontend/fr/.env ~/backup/career-platform-env/
cp backend/ba/.env ~/backup/career-platform-env/

# 3. 保存到云盘或 U盘
```

### Step 3：新机器克隆

```bash
# 在新机器上执行
git clone https://github.com/your-username/career-platform.git
cd career-platform

# 恢复环境变量
cp ~/backup/career-platform-env/frontend.env frontend/fr/.env
cp ~/backup/career-platform-env/backend.env backend/ba/.env

# 安装依赖
cd frontend/fr && npm install
cd ../backend/ba && ./mvnw clean install
```

---

## 📞 遇到问题？

如果在新机器上遇到问题，参考以下文档：
- [开发规范](./DEVELOPMENT_GUIDE.md)
- [重构路线图](./REFACTOR_ROADMAP.md)
- [API 规范](./API_SPECIFICATION.md)

---

**创建者**：开发团队  
**最后更新**：2026-05-11
