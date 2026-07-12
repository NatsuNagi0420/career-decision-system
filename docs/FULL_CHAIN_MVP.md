# 第一版全链路状态

## 用户闭环

```text
Web 注册与引导
  -> 职业方向与真实岗位探索
  -> 2 至 5 个候选的决策项目
  -> 确认主目标和备选目标
  -> 生成 2 至 12 周行动计划
  -> Web 或 Android 完成任务并记录成果
  -> 提交每周复盘并确认计划调整
```

## 数据流

```text
Web / Android
  -> HTTPS Backend（认证、用户隔离、事务、MySQL）
  -> HTTP Agent（仅本机内部令牌）
  -> LangGraph 规则基线
  -> 可选 OpenAI-compatible 模型
  -> Pydantic 结构校验
  -> Backend 审计与业务持久化
```

Agent 只提出候选和修改建议，不直接写数据库。用户确认后由后端业务接口写入。

## 已完成

- Flyway B1/V2-V6，旧报告和旧路径接口继续兼容。
- 职业目录、个人证据、决策项目、候选、岗位样本、比较、目标。
- 行动计划、成果、变更历史、每周复盘、项目报告快照和工作台聚合。
- Web 四区导航、五阶段决策、行动计划、复盘和上下文 AI 导师。
- Android 四页行动端、Keystore 会话、Token 刷新、Room 缓存和 WorkManager 队列。
- 计划、任务状态和任务成果使用 `requestId` 防重复提交。
- 32 条固定 Agent 教练评测和真实模型配置模板。

## 地址

```text
Agent  http://127.0.0.1:8001
Backend https://192.168.1.159:8443
Web     https://192.168.1.159:5173
```

## 自动化结果

- 后端：执行 116 项，115 通过，1 条有编号的平台例外。
- Agent：88 条通过，Ruff 通过。
- Web：119 条单测、类型检查、生产构建、6 条 Playwright 流程通过。
- Android：24 条单测、Debug/Release 构建和 Release Lint 通过。
- Android：Repository/ViewModel/离线队列测试、Debug/Release 构建和 Release Lint 通过。

## 外部待验收

- 真机安装本地 CA 后，通过 HTTPS 完成任务并在 Web 看到同步结果。
- 注入真实供应商密钥，确认 `generationMode=llm`，并实测超时后的规则降级。
- 10 至 15 名学生试点以及下一周复盘/继续率。

这些结果依赖设备、密钥和真实参与者，不能在代码测试中伪造为完成。
