# 🔒 敏感信息检查报告

> **检查时间**：2026-05-11  
> **检查范围**：整个项目目录  
> **状态**：⚠️ 发现敏感信息

---

## ⚠️ 发现的敏感信息

### 1. **backend/ba/src/main/resources/application.properties**

**问题**：包含敏感信息且已被 Git 跟踪

**敏感内容**：
```properties
# 数据库密码（明文）
spring.datasource.username=root
spring.datasource.password=root

# AI API 密钥（明文）
ai.api.key=${AI_API_KEY:${ANTHROPIC_AUTH_TOKEN:sk-d3c1335bbd504bce896f9e965de5dce5}}
```

**风险等级**：🔴 **高危**

**影响**：
- 数据库密码暴露
- DeepSeek API 密钥暴露（sk-d3c1335bbd504bce896f9e965de5dce5）
- 任何人克隆仓库都能看到这些信息

---

### 2. **frontend/fr/.env**

**问题**：包含内网 IP 地址，但已被 .gitignore 忽略

**内容**：
```
VITE_API_BASE_URL=http://192.168.1.199:8080/api
```

**风险等级**：🟡 **低危**（已被 .gitignore 忽略，不会提交）

---

## ✅ 安全的配置

### 1. **.gitignore 配置正确**

已正确忽略：
- ✅ `.env` 文件
- ✅ `node_modules/`
- ✅ `target/`
- ✅ `.idea/`
- ✅ `.vscode/`

---

## 🚨 必须立即执行的操作

### Step 1：移除 Git 历史中的敏感信息

```bash
cd d:/Project/服创

# 1. 创建 application.properties 的安全版本
cat > backend/ba/src/main/resources/application.properties << 'EOF'
# Server Configuration
server.port=${SERVER_PORT:8080}
server.address=0.0.0.0

# Database Configuration
spring.datasource.url=jdbc:mysql://${DB_HOST:localhost}:${DB_PORT:3306}/${DB_NAME:career_db}?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=GMT%2B8
spring.datasource.username=${DB_USERNAME:root}
spring.datasource.password=${DB_PASSWORD:your_password_here}
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

spring.sql.init.mode=always

# MyBatis Configuration
mybatis.type-aliases-package=com.example.ba.pojo
mybatis.mapper-locations=classpath:mapper/*.xml
mybatis.configuration.map-underscore-to-camel-case=true

# Logging
logging.level.com.example.ba.mapper=debug

# AI Configuration
ai.api.key=${AI_API_KEY:your_api_key_here}
ai.api.base-url=${AI_API_BASE_URL:https://api.deepseek.com}
ai.api.model=${AI_API_MODEL:deepseek-v4-flash}
EOF

# 2. 创建 .env 模板（后端）
cat > backend/ba/.env.example << 'EOF'
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=career_db
DB_USERNAME=root
DB_PASSWORD=your_password_here

# AI API 配置
AI_API_KEY=your_deepseek_api_key_here
AI_API_BASE_URL=https://api.deepseek.com
AI_API_MODEL=deepseek-v4-flash
EOF

# 3. 创建实际的 .env 文件（不提交）
cat > backend/ba/.env << 'EOF'
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=career_db
DB_USERNAME=root
DB_PASSWORD=root

# AI API 配置
AI_API_KEY=sk-d3c1335bbd504bce896f9e965de5dce5
AI_API_BASE_URL=https://api.deepseek.com
AI_API_MODEL=deepseek-v4-flash
EOF

# 4. 更新 .gitignore
cat >> .gitignore << 'EOF'

# 后端环境变量
backend/ba/.env
backend/ba/.env.local
backend/ba/.env.*.local
EOF
```

### Step 2：从 Git 历史中移除敏感信息

⚠️ **警告**：这会重写 Git 历史！

```bash
# 方案 A：如果还没有推送到远程，直接修改最后一次提交
git add backend/ba/src/main/resources/application.properties
git add backend/ba/.env.example
git add .gitignore
git commit --amend -m "fix: 移除敏感信息，使用环境变量

- 将数据库密码改为环境变量
- 将 AI API 密钥改为环境变量
- 添加 .env.example 模板
- 更新 .gitignore

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

# 方案 B：如果已经推送到远程，需要使用 git filter-branch 或 BFG Repo-Cleaner
# 建议：创建新的私有仓库，重新开始
```

### Step 3：验证敏感信息已移除

```bash
# 检查当前文件内容
cat backend/ba/src/main/resources/application.properties | grep -i password

# 检查 Git 历史
git log --all --full-history --source --pretty=format:"%H" -- backend/ba/src/main/resources/application.properties | xargs -I {} git show {}:backend/ba/src/main/resources/application.properties | grep -i "sk-"
```

---

## 📝 推送前检查清单

在推送到 GitHub 之前，**必须确认**：

- [ ] ✅ application.properties 已改为使用环境变量
- [ ] ✅ backend/ba/.env.example 已创建
- [ ] ✅ backend/ba/.env 已添加到 .gitignore
- [ ] ✅ 敏感信息已从 Git 历史中移除
- [ ] ✅ 运行 `git log -p | grep -i "sk-"` 确认无 API 密钥
- [ ] ✅ 运行 `git log -p | grep -i "password"` 确认无明文密码

---

## 🔐 安全建议

### 1. **立即更换 API 密钥**

即使你移除了 Git 历史中的密钥，如果已经推送到公开仓库，密钥可能已经泄露。

**操作**：
1. 登录 DeepSeek 控制台
2. 撤销旧密钥：`sk-d3c1335bbd504bce896f9e965de5dce5`
3. 生成新密钥
4. 更新 `backend/ba/.env` 文件

### 2. **使用私有仓库**

如果项目包含商业代码或敏感业务逻辑，建议：
- 使用 GitHub 私有仓库
- 或使用 GitLab 私有仓库
- 或使用公司内部 Git 服务器

### 3. **配置 Git Hooks**

防止未来误提交敏感信息：

```bash
# 创建 pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash

# 检查是否包含敏感信息
if git diff --cached | grep -E "(password|api[_-]?key|secret|token).*=.*['\"]?[a-zA-Z0-9]{20,}"; then
    echo "❌ 错误：检测到可能的敏感信息！"
    echo "请检查提交内容，确保没有硬编码密码、API密钥等敏感信息。"
    exit 1
fi

exit 0
EOF

chmod +x .git/hooks/pre-commit
```

---

## 📦 备份敏感数据

在推送到 GitHub 之前，备份这些文件到**安全位置**（不要提交到 Git）：

```bash
# 创建备份目录
mkdir -p ~/career-platform-backup

# 备份敏感配置
cp backend/ba/.env ~/career-platform-backup/backend.env
cp frontend/fr/.env ~/career-platform-backup/frontend.env

# 备份数据库
mysqldump -u root -p career_db > ~/career-platform-backup/database_$(date +%Y%m%d).sql

# 压缩备份
cd ~/career-platform-backup
tar -czf career-platform-backup-$(date +%Y%m%d).tar.gz *.env *.sql

# 保存到云盘或 U盘
```

---

## ✅ 安全推送流程

```bash
# 1. 确认敏感信息已移除
git status
git diff backend/ba/src/main/resources/application.properties

# 2. 添加所有更改
git add .

# 3. 提交
git commit -m "docs: 完善重构文档体系并移除敏感信息

- 添加 REFACTOR_ROADMAP.md（系统性重构路线图）
- 添加 DEVELOPMENT_GUIDE.md（开发规范）
- 添加 API_SPECIFICATION.md（API 接口规范）
- 添加 COMPONENT_GUIDE.md（组件开发指南）
- 添加 TESTING_GUIDE.md（测试指南）
- 添加 MIGRATION_CHECKLIST.md（迁移检查清单）
- 优化 JobExploration.vue 交互逻辑
- 添加 ProfilePromptBanner.vue 组件
- 移除 application.properties 中的敏感信息
- 添加环境变量配置模板

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"

# 4. 推送到 GitHub
git push -u origin master
```

---

## 🚨 如果已经推送了敏感信息

### 方案 1：删除仓库重新开始（推荐）

```bash
# 1. 在 GitHub 上删除仓库
# 2. 创建新的私有仓库
# 3. 清理本地历史后重新推送
git checkout --orphan latest_branch
git add -A
git commit -m "Initial commit with security fixes"
git branch -D master
git branch -m master
git push -f origin master
```

### 方案 2：使用 BFG Repo-Cleaner

```bash
# 1. 下载 BFG
# https://rtyley.github.io/bfg-repo-cleaner/

# 2. 清理敏感信息
java -jar bfg.jar --replace-text passwords.txt career-platform.git

# 3. 清理 Git 历史
cd career-platform.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 4. 强制推送
git push --force
```

---

**创建者**：安全团队  
**最后更新**：2026-05-11  
**优先级**：🔴 **紧急**
