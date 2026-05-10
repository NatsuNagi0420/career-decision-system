@echo off
set AI_API_KEY=sk-d3c1335bbd504bce896f9e965de5dce5
set AI_API_BASE_URL=https://api.deepseek.com
set AI_API_MODEL=deepseek-v4-flash
echo Starting backend with DeepSeek API configuration...
mvn spring-boot:run
