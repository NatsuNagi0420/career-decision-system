# ActivityMonitor 类型定义文档

## PageState 字段说明

### 完成状态字段（boolean）

| 字段名 | 类型 | 说明 | 设置时机 |
|--------|------|------|----------|
| `entryCompleted` | boolean | 综合信息录入是否完成 | 用户在"综合信息录入"页面提交表单后 |
| `deepAssessmentStarted` | boolean | 深度测评是否已开始 | 用户开始MBTI测评时 |
| `deepAssessmentCompleted` | boolean | 深度测评是否已完成 | 用户完成MBTI测评后 |
| `profileGenerated` | boolean | 能力画像是否已生成完成 | 能力画像生成流式响应完成后 |
| `targetJobSelected` | boolean | 是否已选定目标岗位 | 用户在"岗位探索"页面选定目标岗位后 |
| `pathPlanGenerated` | boolean | 职业路径规划是否已生成完成 | 路径规划生成流式响应完成后 |
| `reportGenerated` | boolean | 职业规划报告是否已生成完成 | 报告页面生成完成后 |

### 进行中状态字段（boolean）

| 字段名 | 类型 | 说明 | 用途 |
|--------|------|------|------|
| `profileGenerating` | boolean | 能力画像是否正在生成中 | **防止推理链执行期间被主动消息打断**<br>- 生成开始时设为 `true`<br>- 生成完成或失败时设为 `false` |
| `pathPlanGenerating` | boolean | 职业路径规划是否正在生成中 | **防止推理链执行期间被主动消息打断**<br>- 生成开始时设为 `true`<br>- 生成完成或失败时设为 `false` |

### 数值统计字段

| 字段名 | 类型 | 说明 | 计算方式 |
|--------|------|------|----------|
| `profileViewDuration` | number | 能力画像页面停留时长（秒） | 在能力画像页面时，每次发送信号时计算：`(Date.now() - pageEnteredAt) / 1000` |
| `browsedJobCount` | number | 已浏览的岗位详情数量 | 用户每次点击查看岗位详情时递增 |

## ActivitySignal 字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `page` | string | 当前页面路径（如 `/capability-profile`） |
| `pageEnteredAt` | number | 进入当前页面的时间戳（毫秒） |
| `lastActionAt` | number | 最近一次用户操作的时间戳（毫秒） |
| `recentActions` | string[] | 最近操作类型列表（最多保留10条） |
| `pageState` | PageState | 页面关键业务状态（见上表） |

## 关键操作类型（actionType）

以下操作会立即触发信号发送到后端：

- `entry_submitted` - 信息录入提交
- `assessment_started` - 深度测评开始
- `assessment_completed` - 深度测评完成
- `profile_generated` - 能力画像生成完成
- `target_job_selected` - 目标岗位选定
- `path_plan_generated` - 路径规划生成完成

## 使用示例

### 1. 记录能力画像生成开始

```typescript
import { activityMonitor } from '@/utils/activityMonitor'

// 生成开始时
activityMonitor.updatePageState({ profileGenerating: true })
```

### 2. 记录能力画像生成完成

```typescript
// 生成完成时
activityMonitor.recordAction('能力画像生成完成')
activityMonitor.updatePageState({ 
  profileGenerated: true, 
  profileGenerating: false 
})
```

### 3. 记录能力画像生成失败

```typescript
// 生成失败时（确保清除 generating 标志）
activityMonitor.updatePageState({ profileGenerating: false })
```

### 4. 记录目标岗位选定

```typescript
activityMonitor.recordAction('选定目标岗位', { 
  targetJobSelected: true 
})
```

## 字段命名规范

### 完成状态字段命名

- 格式：`{功能名}Generated` 或 `{功能名}Completed`
- 示例：
  - `profileGenerated` - 能力画像已生成
  - `pathPlanGenerated` - 路径规划已生成
  - `entryCompleted` - 信息录入已完成

### 进行中状态字段命名

- 格式：`{功能名}Generating` 或 `{功能名}InProgress`
- 示例：
  - `profileGenerating` - 能力画像生成中
  - `pathPlanGenerating` - 路径规划生成中

### 选择状态字段命名

- 格式：`{对象名}Selected`
- 示例：
  - `targetJobSelected` - 目标岗位已选定

## 与后端的协调

### 后端 ActivityController 使用 pageState 判断主动推送时机

后端在 `ActivityController.signal()` 方法中会检查：

```java
// 若正在生成中，不推送主动消息
if (pageState.get("profileGenerating") == Boolean.TRUE || 
    pageState.get("pathPlanGenerating") == Boolean.TRUE) {
    return ResponseEntity.ok(Map.of("shouldPush", false));
}
```

这确保了多步推理链执行期间不会被主动消息打断。

## 注意事项

1. **必须成对设置 generating 标志**：
   - 生成开始时设为 `true`
   - 生成完成、失败、超时时都必须设为 `false`
   - 否则会导致后续主动消息永久被阻止

2. **字段命名保持一致**：
   - 前端 TypeScript 使用驼峰命名（`profileGenerated`）
   - 后端 Java 也使用驼峰命名（`profileGenerated`）
   - JSON 序列化时保持一致

3. **关键操作立即发送**：
   - 使用 `recordAction()` 记录的关键操作会立即发送信号
   - 使用 `updatePageState()` 仅更新状态，不立即发送
   - 心跳每45秒自动发送一次

4. **状态持久化**：
   - `pageState` 在页面切换时会重置
   - 如需跨页面保持状态，应使用 localStorage 或后端存储
