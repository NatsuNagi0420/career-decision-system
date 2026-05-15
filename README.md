# Career Decision System

AI驱动的大学生职业规划智能助手系统

## 项目简介

本项目是一个基于AI的职业规划系统，帮助大学生通过MBTI性格测评、技能自评等方式，生成个性化的职业规划建议。

## 技术栈

### 前端
- Vue 3 + TypeScript
- Element Plus
- ECharts
- Vite

### 后端
- Spring Boot 3.x
- MyBatis
- MySQL 8.0
- Redis

### AI服务
- 通义千问 / DeepSeek
- SSE流式输出

## 快速开始

### 环境要求
- JDK 17+
- Node.js 18+
- MySQL 8.0+
- Redis 6.0+

### 配置文件

#### 后端配置
1. 复制配置模板：
```bash
cd backend/ba/src/main/resources
cp application-dev.properties.example application-dev.properties
```

2. 修改 `application-dev.properties`，填入你的配置：
```properties
# 数据库配置
spring.datasource.password=your_database_password

# AI API配置
ai.api.key=your_ai_api_key_here
```

#### 前端配置
1. 复制配置模板：
```bash
cd frontend/fr
cp .env.example .env
```

2. 修改 `.env`，填入后端地址：
```
VITE_API_BASE_URL=http://localhost:8080/api
```

### 数据库初始化
```bash
mysql -u root -p < backend/ba/sql/career_db.sql
```

### 启动项目

#### 启动后端
```bash
cd backend/ba
mvn spring-boot:run
```

#### 启动前端
```bash
cd frontend/fr
npm install
npm run dev
```

## 功能模块

- 👤 用户系统：注册、登录、权限管理
- 📝 MBTI性格测评：93题专业测评
- ⭐ 技能自评：多维度技能评估
- 🎨 能力画像：AI生成能力分析
- 💼 岗位探索：职位信息浏览
- 🗺️ 职业路径规划：AI生成职业规划
- 📊 综合报告：完整分析报告
- 🤖 AI智能助手：实时对话咨询

## 项目结构

```
career-decision-system/
├── backend/ba/              # 后端服务
│   ├── src/
│   ├── sql/                 # 数据库脚本
│   └── data/                # 测评数据
├── frontend/fr/             # 前端应用
│   ├── src/
│   └── public/
└── video_anime/             # 演示动画（可选）
```

## 注意事项

⚠️ **敏感信息保护**
- 不要提交 `.env` 文件
- 不要提交 `application-dev.properties` 和 `application-prod.properties`
- 使用 `.example` 模板文件作为参考

## 开发文档

详细开发文档请参考项目 Wiki。

## License

MIT License
