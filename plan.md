# 智能体升级改造计划

> 本文档描述将项目从"单轮问答式大模型调用"升级为"具备多步推理、主动感知、流式响应的智能体"的完整方案。
> 每条改造链路均给出当前完整链路、改造后完整链路、改动文件清单及具体实现思路。
> 全文以当前项目实际代码为基础展开，所有类名、方法名、字段名均可直接对照源码。

---

## 目录

- [一、方向二：多步推理链](#一方向二多步推理链)
  - [1.1 能力画像生成——六步推理链](#11-能力画像生成六步推理链)
  - [1.2 职业路径规划——五步推理链](#12-职业路径规划五步推理链)
- [二、方向三：主动感知与触发](#二方向三主动感知与触发)
  - [2.1 六大触发场景](#21-六大触发场景)
  - [2.2 前端信号采集与发送](#22-前端信号采集与发送)
  - [2.3 后端处理链路](#23-后端处理链路)
  - [2.4 前端主动消息展示](#24-前端主动消息展示)
- [三、方向四：流式响应](#三方向四流式响应)
  - [3.1 后端流式基础设施——AiUtils 流式方法](#31-后端流式基础设施aiutils-流式方法)
  - [3.2 助手对话流式链路](#32-助手对话流式链路)
  - [3.3 能力画像生成流式链路](#33-能力画像生成流式链路)
  - [3.4 职业路径规划流式链路](#34-职业路径规划流式链路)
- [四、交汇点约定](#四交汇点约定)
- [五、联动审查与潜在问题排查](#五联动审查与潜在问题排查)

---

## 一、方向二：多步推理链

### 1.1 能力画像生成——六步推理链

#### 1.1.1 当前完整链路

**前端：**

```
CapabilityProfile.vue (onMounted)
  → loadEntryDraft()                          src/utils/storage.ts
  → loadDeepAssessmentDraft()                 src/utils/storage.ts
  → loadTargetJob()                           src/utils/storage.ts
  → generateCapabilityProfileDraftApi()        src/api/capability.ts
    → POST /api/capability/profile/draft      body: CapabilityProfileRequest
    → 等待 60s 超时
    → 返回 CapabilityProfileResponse
  → saveCapabilityProfileDraft()               src/utils/storage.ts
  → 渲染雷达图、柱状图、技能标签
```

**后端：**

```
CapabilityController.profileDraft()            controller/CapabilityController.java:24
  → AuthContext.getUserId()
  → capabilityService.generateProfile(req)     service/impl/CapabilityServiceImpl.java:42
    → assembleUserRequest(req)                 (当前为空方法，直接返回 req)
    → buildFallback(req)                       (预先生成兜底数据)
    → aiUtils.getChatResponse(systemPrompt, userPrompt)   utils/AiUtils.java:270
      → REST 一次调用大模型接口
      → 返回 raw JSON 字符串
    → parseProfileJson(reply)                  (提取 JSON)
    → normalizeProfile(parsed, fallback)       (字段校验与回退)
    → buildJobSearchTerms(profile, req)        (提取搜索关键词)
    → buildRecommendedJobsFromTitlesOrKeywords(...)  (查数据库岗位)
    → buildMatchScores(profile, jobs)          (计算匹配度)
    → buildProfileResponse(profile, jobs, scores, keyword)
    → 返回 Map<String, Object>
```

**问题：** 一次大模型调用承载了"分析背景 + 分析人格 + 分析技能 + 生成雷达图 + 生成建议 + 推荐岗位"六大任务，提示词臃肿（systemPrompt 约 300 字），JSON schema 约束含十个字段，模型容易漏字段或产生幻觉评分。

---

#### 1.1.2 改造后链路

**前端（保持不变，仅调用地址从 `/api/capability/profile/draft` 改为 `/api/capability/profile/stream`）：**

```
CapabilityProfile.vue (onMounted)
  → 同上组装 payload
  → new EventSource('/api/capability/profile/stream', { method: 'POST', body: payload })
  → 接收 SSE 事件流（方向四负责流式传输）
    event: step     → 页面展示当前步骤摘要
    event: progress → 更新进度条
    event: complete → 获取最终结果 JSON，渲染图表
  → saveCapabilityProfileDraft()
```

**后端推理链（在 CapabilityServiceImpl 中新增方法 `generateProfileWithChain`）：**

```
第 1 步：解析用户背景
  输入: req.basic, req.education, req.experiences, req.age
  模型调用 #1 → 输出 JSON: { backgroundSummary: string, educationLevel: string, experienceHighlights: string[] }
  异常兜底: { backgroundSummary: "信息有限", educationLevel: req.education ?? "本科", experienceHighlights: [] }

第 2 步：解析人格与价值观
  输入: req.mbtiResult, req.values, req.questionnaireAnswers
  模型调用 #2 → 输出 JSON: { personalityTraits: string[], workStyle: string, coreValues: string[] }
  异常兜底: { personalityTraits: ["未完成测评"], workStyle: "未知", coreValues: [] }

第 3 步：解析技能与竞争力
  输入: req.skills, req.certificates, req.links, 第 1 步输出的 experienceHighlights
  模型调用 #3 → 输出 JSON: { skillMatrix: { name: string, level: number, evidence: string }[], competitivenessSummary: string }
  异常兜底: 基于 req.skills 直接构造技能矩阵

第 4 步：综合生成能力画像
  输入: 第 1/2/3 步所有输出
  模型调用 #4 → 输出 JSON: { completenessScore, competitivenessStars, tags: string[], radar: { indicators, values }, suggestions: { shortTerm, longTerm } }
  异常兜底: 使用原 buildFallback 方法

第 5 步：生成推荐岗位关键词
  输入: 第 4 步输出的 tags, radar, suggestions, 第 2 步输出的 personalityTraits
  模型调用 #5 → 输出 JSON: { recommendedKeywords: string[], recommendedJobTitles: string[], recommendedJobCards: [{ title, matchScore }] }
  异常兜底: 基于 skills 和 target.role 构造默认关键词

第 6 步：组装最终响应
  输入: 第 4/5 步输出
  本地逻辑（不调模型）: 
    → buildJobSearchTerms(profile, req) → 查数据库岗位
    → buildMatchScores(profile, jobs)
    → buildProfileResponse(profile, jobs, scores, keyword)
  输出: 最终 Map<String, Object> → SSE complete 事件
```

**每一步的 SSE 事件推送（方向四负责）：**

```
第 1 步调用前: event: step, data: { step: 1, total: 6, summary: "正在分析你的教育背景与经历..." }
第 1 步完成后: event: progress, data: { step: 1, partial: { backgroundSummary, educationLevel } }
第 2 步调用前: event: step, data: { step: 2, total: 6, summary: "正在分析你的人格特质与价值观..." }
第 2 步完成后: event: progress, data: { step: 2, partial: { personalityTraits, coreValues } }
...（每步类推）
第 6 步完成后: event: complete, data: <最终完整结果 JSON>
任一步异常: 静默回退到兜底数据，继续后续步骤，不中断链路（除非所有步骤全部失败则发送 error 事件）
```

---

#### 1.1.3 改动文件清单及实现思路

**文件 1: `backend/ba/src/main/java/com/example/ba/utils/AiUtils.java`**

改动内容：新增多轮对话上下文方法。

```java
// 新增方法：支持传入对话历史进行多轮调用
// 对话历史格式: List<Map<String, String>>，每个 Map 包含 role 和 content
// 每次调用都会在之前的对话基础上追加新消息
public String getChatResponseWithHistory(
    String systemPrompt,
    List<Map<String, String>> history,  // 前序轮次的 role/content 记录
    String currentUserPrompt
) {
    // 构造 messages 数组时，先插入 system，再遍历 history 追加 user/assistant 交替，
    // 最后追加当前的 user message
    // 其他逻辑与现有 getChatResponse(systemPrompt, userPrompt) 一致
}
```

实现要点：`callOpenAiChatCompletions` 和 `callAnthropicMessages` 当前只处理 system + user 两条消息。需要改为支持 messages 数组的多轮拼接。可以在内部新增一个私有方法 `callOpenAiChatCompletionsMultiTurn`，接收完整的 `List<Map<String, String>> messages`，外层方法统一调用它。

---

**文件 2: `backend/ba/src/main/java/com/example/ba/service/impl/CapabilityServiceImpl.java`**

改动内容：新增 `generateProfileWithChain` 方法，保留原 `generateProfile` 作为底层单步调用工具。

实现思路：

```java
public Map<String, Object> generateProfileWithChain(
    CapabilityProfileRequestDTO req,
    SseEmitter emitter  // 用于流式推送（方向四），若为 null 则不推送
) {
    // 1. 组装请求
    CapabilityProfileRequestDTO effectiveReq = assembleUserRequest(req);
    String userData = safeToString(effectiveReq);
    Map<String, Object> fallback = buildFallback(effectiveReq);
    
    // 2. 维护对话历史（多轮上下文积累）
    List<Map<String, String>> history = new ArrayList<>();
    
    // 3. 定义 6 步的提示词模板和 JSON Schema
    // 每一步作为独立的 user prompt，system prompt 保持不变
    // 前一步的输出通过 history 传递给后续步骤
    
    // 第 1 步
    emitStep(emitter, 1, 6, "正在分析你的教育背景与经历...");
    String step1Prompt = buildStep1Prompt(userData);  // 只要求输出背景摘要
    String step1Result = aiUtils.getChatResponseWithHistory(STEP_SYSTEM_PROMPT, history, step1Prompt);
    Map<String, Object> step1Data = parseProfileJson(step1Result) != null 
        ? parseProfileJson(step1Result) : getStep1Fallback(effectiveReq);
    history.add(Map.of("role", "user", "content", step1Prompt));
    history.add(Map.of("role", "assistant", "content", step1Result));
    emitProgress(emitter, 1, step1Data);
    
    // 第 2 步（类似结构，user prompt 中包含第 1 步输出的引用）
    // ...
    
    // 第 4 步输出是画像核心
    Map<String, Object> rawProfile = normalizeProfile(step4Data, fallback);
    
    // 第 5 步输出是推荐关键词
    // 第 6 步：本地逻辑（不调模型）
    List<JobInfo> jobs = buildRecommendedJobsFromTitlesOrKeywords(...);
    List<Integer> scores = buildMatchScores(...);
    Map<String, Object> finalResult = buildProfileResponse(rawProfile, jobs, scores, keyword);
    
    emitComplete(emitter, finalResult);
    return finalResult;
}
```

新增提示词常量（六步各自独立）：

```java
// 全局系统角色（所有步骤共用）
private static final String STEP_SYSTEM_PROMPT = 
    "你是职业规划平台的分析引擎。请根据输入输出严格 JSON，不要输出多余文字。";

// 第 1 步提示词模板
private String buildStep1Prompt(String userData) {
    return "请分析以下用户的背景信息，提取教育背景、经历亮点和整体背景摘要。\n"
        + "输出格式：{ \"backgroundSummary\": string, \"educationLevel\": string, "
        + "\"experienceHighlights\": string[] }\n"
        + "用户信息：" + userData;
}
// 第 2-5 步同样定义独立的提示词模板，每步只要求输出该步需要的 JSON 字段
```

兜底策略：每一步都有独立的 fallback 方法（`getStep1Fallback`、`getStep2Fallback` 等），步与步之间独立兜底，不因某一步失败而中断全链路。

---

**文件 3: `backend/ba/src/main/java/com/example/ba/controller/CapabilityController.java`**

改动内容：新增流式端点 `/api/capability/profile/stream`，替换原 `/api/capability/profile/draft`。

实现思路：

```java
@PostMapping(value = "/profile/stream", produces = "text/event-stream;charset=UTF-8")
public SseEmitter profileStream(@RequestBody CapabilityProfileRequestDTO req) {
    SseEmitter emitter = new SseEmitter(120_000L); // 2 分钟超时
    Long userId = AuthContext.getUserId();
    if (req != null && userId != null) {
        req.setUserId(userId);
    }
    // 异步执行推理链，不阻塞主线程
    executorService.execute(() -> {
        try {
            capabilityService.generateProfileWithChain(req, emitter);
        } catch (Exception e) {
            sendSseEvent(emitter, "error", Map.of("message", e.getMessage()));
        } finally {
            emitter.complete();
        }
    });
    return emitter;
}
```

同步保留旧端点 `/api/capability/profile/draft`，内部改为调用 `generateProfileWithChain(req, null)`（无 SSE 推送时返回完整结果），保证降级兼容（若前端 SSE 不可用可切回原端点）。

---

**文件 4: `frontend/fr/src/api/capability.ts`**

改动内容：新增流式请求方法 `generateCapabilityProfileStreamApi`。

```typescript
// 新增：创建 SSE 连接获取能力画像
export const generateCapabilityProfileStreamApi = (
  payload: CapabilityProfileRequest
): EventSource => {
  // 将 payload 序列化后作为查询参数或使用 POST + ReadableStream
  // 由于 EventSource 只支持 GET，改用 fetch + ReadableStream 实现 POST SSE
  const token = Cookies.get('token')
  // 返回 fetch Promise，由调用方处理流
  return fetch(`${baseURL}/capability/profile/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })
}
```

---

**文件 5: `frontend/fr/src/pages/CapabilityProfile.vue`**

改动内容：在 `onMounted` 中将调用从 `generateCapabilityProfileDraftApi` 改为使用 `fetch` + `ReadableStream` 消费 SSE 流。

实现要点（与方向四流式前端组件联动）：不再 `await` 一次请求获取完整结果，而是创建 `fetch` 连接后读取 `response.body` 的流式数据，逐行解析 SSE 事件，根据事件类型更新页面状态（步骤摘要文本、进度百分比、中间结果预览、最终完整结果）。

---

### 1.2 职业路径规划——五步推理链

#### 1.2.1 当前完整链路

**前端：**

```
PathPlanning.vue (fetchPathData)
  → loadEntryDraft()                          src/utils/storage.ts
  → loadDeepAssessmentDraft()                 src/utils/storage.ts
  → loadTargetJob()                           src/utils/storage.ts
  → generatePathPlanApi(payload)               src/api/persistence.ts
    → POST /api/path-plan/generate            body: CapabilityProfileRequestDTO
    → 返回 { nodes, links, recommendations }
  → savePathGraph(res)                         src/utils/storage.ts
  → initGraph()                                ECharts 力导向图渲染
```

**后端：**

```
PathPlanController.generate()                  controller/PathPlanController.java:23
  → AuthContext.getUserId()
  → capabilityService.generateCareerPath(req)  service/impl/CapabilityServiceImpl.java:701
    → assembleUserRequest(req)
    → buildPathFallback(req)
    → aiUtils.getChatResponse(systemPrompt, userPrompt)
      → REST 一次调用
      → 返回 raw JSON
    → parseProfileJson(reply)
    → normalizeCareerPath(parsed, fallback)
      → 校验 nodes/links/recommendations 结构
    → 返回 Map<String, Object>
```

**问题：** 一次调用将"差距分析 + 路径生成 + 阶段规划 + 备选方案"全部塞入一个提示词，模型对节点数量、结构和关系的准确性不稳定，经常出现悬空节点（有 link 指向的 target 在 nodes 中不存在）或缺少主路径。

---

#### 1.2.2 改造后链路

**第 1 步：提取当前能力基线**
  输入: 用户信息（同画像推理链第 1/2/3 步输出可复用，因路径规划通常在画像之后）
  模型调用 #1 → 输出 JSON: { currentCapabilities: { name: string, level: string }[], strengths: string[], gaps: string[] }
  异常兜底: { currentCapabilities: [], strengths: [], gaps: ["需完善个人信息后评估"] }

**第 2 步：解析目标岗位要求**
  输入: req.target.role, req.target.jobType, req.target.cities
  模型调用 #2 → 输出 JSON: { targetRequirements: { skill: string, importance: string }[], typicalPath: string[], industryInsight: string }
  异常兜底: { targetRequirements: [], typicalPath: [target.role], industryInsight: "信息有限" }

**第 3 步：差距分析**
  输入: 第 1 步输出 currentCapabilities + 第 2 步输出 targetRequirements
  模型调用 #3 → 输出 JSON: { gapMatrix: { area: string, currentLevel: string, requiredLevel: string, priority: string }[], totalGap: string }
  异常兜底: { gapMatrix: [], totalGap: "需完善信息后评估" }

**第 4 步：生成分阶段路径**
  输入: 第 3 步输出 gapMatrix, 第 1 步输出 strengths/gaps, 第 2 步输出 typicalPath
  模型调用 #4 → 输出 JSON: { nodes: [...], links: [...], recommendations: [...] }
  （与当前 generateCareerPath 要求的 JSON Schema 一致）
  异常兜底: buildPathFallback(req)

**第 5 步：校验与组装（本地逻辑）**
  输入: 第 4 步输出
  本地逻辑: 遍历 links，检查每个 source/target 在 nodes 中是否存在 → 
    若存在悬空引用，自动补全缺失节点或移除无效 link →
    最终 normalizeCareerPath
  输出: 最终 Map<String, Object>

---

#### 1.2.3 改动文件清单及实现思路

**文件 1: `backend/ba/src/main/java/com/example/ba/service/impl/CapabilityServiceImpl.java`**

改动内容：新增 `generateCareerPathWithChain` 方法，五步推理链，结构与 `generateProfileWithChain` 类似。

实现要点：
- 如果能力画像推理链刚执行完（同一次请求上下文中），第 1 步可直接复用画像推理链的第 1/2/3 步输出，跳过模型调用（合并推理链可节省二至三次调用）
- 其余步骤的新增提示词模板、独立 fallback 方法参考画像链的模式
- 第 5 步的悬空节点校验是纯本地逻辑，新增私有方法：

```java
private Map<String, Object> validateAndFixGraph(Map<String, Object> graph, Map<String, Object> fallback) {
    // 1. 收集所有 node.id
    Set<String> nodeIds = collectNodeIds(graph);
    // 2. 检查所有 link.source 和 link.target
    Set<String> missingIds = new HashSet<>();
    for (link : links) {
        if (!nodeIds.contains(link.source)) missingIds.add(link.source);
        if (!nodeIds.contains(link.target)) missingIds.add(link.target);
    }
    // 3. 移除无效 link，或为缺失节点自动补全占位节点
    // 4. 若修复后仍不满足条件（如 links 为空），返回 fallback
}
```

**文件 2: `backend/ba/src/main/java/com/example/ba/controller/PathPlanController.java`**

改动内容：新增流式端点 `/api/path-plan/generate/stream`。

```java
@PostMapping(value = "/generate/stream", produces = "text/event-stream;charset=UTF-8")
public SseEmitter generateStream(@RequestBody(required = false) CapabilityProfileRequestDTO req) {
    // 结构与 CapabilityController.profileStream 一致
    // 调用 capabilityService.generateCareerPathWithChain(req, emitter)
}
```

**文件 3: `frontend/fr/src/api/persistence.ts`**

改动内容：新增 `generatePathPlanStreamApi`（POST SSE 请求），参照 `capability.ts` 的改动模式。

**文件 4: `frontend/fr/src/pages/PathPlanning.vue`**

改动内容：`fetchPathData` 方法中，将 `await generatePathPlanApi(payload)` 改为消费 SSE 流，逐步展示推理步骤摘要和进度，流结束后渲染完整力导向图。

---

## 二、方向三：主动感知与触发

### 2.1 六大触发场景

| 编号 | 页面 | 触发条件 | 冷却规则 | 主动消息内容 |
|------|------|----------|----------|-------------|
| T1 | 信息录入页 | 停留超 5 分钟且表单未完成 | 同页最多 5 次，间隔 ≥ 15 分钟 | "填写遇到困难了吗？你可以上传简历，我来帮你自动提取信息。" + [去上传简历] |
| T2 | 信息录入页 | 深度问卷已开始但未提交 | 同页最多 5 次，间隔 ≥ 15 分钟 | "问卷还没完成，完成后的分析会更准确哦。" + [继续问卷] |
| T3 | 能力画像页 | 画像生成完成，展示超过 30 秒未离开 | 仅触发 1 次（进入岗位探索后重置） | "你的能力画像已生成，去看看匹配的岗位吧！" + [去岗位探索] |
| T4 | 岗位探索页 | 浏览超过 3 个岗位详情但未选定目标 | 同页最多 5 次，间隔 ≥ 15 分钟 | "你已经浏览了好几个岗位，需要我帮你对比分析吗？" + [帮我对比] |
| T5 | 岗位探索页 | 已选定目标岗位超过 30 秒未进入路径规划 | 仅触发 1 次（进入路径规划后重置） | "目标岗位已选定，接下来看看你的职业发展路径吧！" + [去路径规划] |
| T6 | 路径规划页 | 规划完成后超过 30 秒未进入报告 | 仅触发 1 次（进入报告后重置） | "路径规划已完成，生成一份完整的职业发展报告吧！" + [去生成报告] |

---

### 2.2 前端信号采集与发送

**新增文件: `frontend/fr/src/utils/activityMonitor.ts`**

职责：采集当前页面行为信号，定时发送到后端。

```typescript
// 核心数据结构
interface ActivitySignal {
  page: string                    // 当前路由路径
  pageEnteredAt: number           // 进入页面的时间戳
  lastActionAt: number            // 最近一次用户操作时间戳
  recentActions: string[]         // 最近操作类型列表
  pageState: {                    // 页面关键业务状态
    entryCompleted: boolean       // 信息录入是否完成
    deepAssessmentStarted: boolean
    deepAssessmentCompleted: boolean
    profileGenerated: boolean     // 能力画像是否已生成
    profileViewDuration: number   // 画像页停留时长(秒)
    browsedJobCount: number       // 已浏览的岗位详情数
    targetJobSelected: boolean    // 是否选定了目标岗位
    pathPlanGenerated: boolean    // 路径规划是否已完成
    reportGenerated: boolean      // 报告是否已生成
  }
}

// 发送时机:
// 1. 页面切换时（router.afterEach）
// 2. 关键操作完成时（测评提交、画像生成、目标岗位选定等）
// 3. 定时心跳（每 45 秒一次，附带停留时长与操作状态）

// 主动消息防抖: 
// 本地维护一个 Map<page, { lastPushTime, pushCount }>，
// 后端返回"应推送"时，前端检查冷却规则再决定是否展示
```

**改动文件: `frontend/fr/src/router/index.ts`**

改动内容：在 `router.afterEach` 钩子中调用 `activityMonitor.onPageChange(to.path)`，触发信号发送。

**改动文件: 各业务页面**

在六个关键事件点调用 `activityMonitor.recordAction(eventType, stateUpdate)`：
- ComprehensiveEntry.vue: 表单提交时、深度问卷开始/完成时
- CapabilityProfile.vue: 画像生成完成时
- JobExploration.vue: 浏览岗位详情时、选定目标岗位时
- PathPlanning.vue: 路径规划完成时

---

### 2.3 后端处理链路

**新增文件: `backend/ba/src/main/java/com/example/ba/controller/ActivityController.java`**

职责：接收前端信号，调用模型判断是否需要介入。

```
POST /api/activity/signal
  入参: ActivitySignal (对应前端的完整结构，新增 DTO)
  
  Controller 处理:
    1. 提取 page、pageState、时间戳
    2. 检查冷却期（查询 Redis/内存 Map，key: userId+page，value: 上次推送时间和次数）
       - 若在冷却期内 → 直接返回 { shouldPush: false }
    3. 若不在冷却期 → 调用 aiUtils.getChatResponse(systemPrompt, userPrompt)
       - systemPrompt 定义"星途"角色 + 六种触发场景的判定规则 + 禁止主动推送的情况
       - userPrompt = 当前页面 + 页面状态 JSON
    4. 解析模型返回的 JSON: { shouldPush: boolean, message: string, buttons: [...] }
    5. 若 shouldPush=true → 更新 Redis/内存冷却记录
    6. 返回 { shouldPush, message, buttons }
```

**新增文件: `backend/ba/src/main/java/com/example/ba/dto/ActivitySignalDTO.java`**

```java
@Data
public class ActivitySignalDTO {
    private String page;
    private Long pageEnteredAt;
    private Long lastActionAt;
    private List<String> recentActions;
    private Map<String, Object> pageState;
}
```

**冷却期存储方案：**

由于项目当前无 Redis 依赖，使用 `ConcurrentHashMap<String, Map<String, Object>>` 做内存级冷却记录，key 为 `userId + ":" + page`，value 包含 `lastPushTime` 和 `pushCount`。应用重启后冷却记录清空（可接受）。

---

### 2.4 前端主动消息展示

**改动文件: `frontend/fr/src/components/AiAssistant.vue`**

改动内容：助手面板新增"主动消息"展示逻辑。

实现思路：
1. 新增 `proactiveMessages` 响应式数组，与普通 `messages` 数组分开管理
2. 前端定时获取主动消息的方式：在组件内启动一个 `setInterval`（每 45 秒），调用 `/api/activity/signal` 发送当前页面的 `ActivitySignal`
3. 收到 `shouldPush: true` 后：
   - 检查本地冷却计数（与后端双重保障）
   - 若通过，将主动消息以特殊的 `ChatMessage`（额外字段 `proactive: true`）插入 `messages` 数组
   - 若助手面板关闭，主动消息先暂存在队列中，面板打开时一次性展示（最多展示最近 3 条，旧的丢弃）
4. 主动消息的视觉样式：与用户主动发起的对话区分，气泡使用浅紫背景 + 左侧脉冲角标（当前 CSS 已有 `fab-halo` 的脉冲动画可复用），在消息末尾附带 10 秒倒计时自动消失（或用户点击关闭）
5. 主动消息不被 `parseReply` 处理（其 buttons 由后端直接返回，格式已确定）

---

## 三、方向四：流式响应

覆盖三个长耗时调用：助手对话、能力画像生成、职业路径规划。统一使用 SSE 协议，约定统一事件格式。

### 3.1 后端流式基础设施——AiUtils 流式方法

**改动文件: `backend/ba/src/main/java/com/example/ba/utils/AiUtils.java`**

改动内容：新增流式调用方法 `streamChatResponse`。

```java
/**
 * 流式调用大模型，将每个增量 token 通过回调传出。
 * @param systemPrompt 系统角色定义
 * @param messages 当前的完整消息列表（包含历史）
 * @param onToken 每个增量 token/事件 的回调，传入完整的 SSE 事件 data 字符串
 */
public void streamChatResponse(
    String systemPrompt,
    List<Map<String, String>> messages,
    Consumer<String> onToken,    // 每收到一个增量片段时调用
    Consumer<Throwable> onError
) {
    // 使用 RestTemplate 暂无法优雅处理 SSE 流，改用 Java 11 HttpClient 或 OkHttp
    // 核心：以流式模式连接大模型接口，设置 stream: true
    // 逐行读取响应体，遇到 "data: " 开头的行时提取 JSON、解析 delta.content
    // 将增量文本通过 onToken.accept(deltaText) 回调出去
}
```

关键实现细节：
- 当前 `AiUtils` 使用 `RestTemplate`（阻塞、一次性读取），需要升级为支持流式读取的客户端。推荐使用 Java 11 自带的 `java.net.http.HttpClient`，无需引入新依赖
- OpenAI 兼容接口的流式响应格式为每行 `data: {"choices":[{"delta":{"content":"..."}}]}`，最后一行 `data: [DONE]`
- Anthropic 协议的流式格式不同（SSE 事件类型更多），需要分开处理

---

### 3.2 助手对话流式链路

**当前链路：**

```
前端 AiAssistant.vue send()
  → assistantChatApi({ page, message, context })
    → POST /api/assistant/chat
  → await 一次性返回 { reply: string }
  → parseReply(reply) → 渲染文本和按钮
```

**改造后链路：**

```
前端 AiAssistant.vue sendStream()
  → fetch('/api/assistant/chat/stream', { method: 'POST', body })
  → 读取 response.body.getReader()
  → 逐行解析 SSE:
      event: token    → 追加到当前回复文本，打字机效果渲染
      event: buttons  → 解析动作按钮 JSON
      event: done     → 标记回复完成
      event: error    → 显示错误提示
```

**后端改动文件:**

`backend/ba/src/main/java/com/example/ba/controller/AssistantController.java`

新增 `/api/assistant/chat/stream` 端点：

```java
@PostMapping(value = "/chat/stream", produces = "text/event-stream;charset=UTF-8")
public SseEmitter chatStream(@RequestBody AssistantChatDTO dto) {
    SseEmitter emitter = new SseEmitter(60_000L);
    
    // 构造 messages 列表
    String systemPrompt = buildStreamSystemPrompt();  // 复用原 systemPrompt
    List<Map<String, String>> messages = new ArrayList<>();
    messages.add(Map.of("role", "user", "content", dto.getMessage()));
    
    executorService.execute(() -> {
        try {
            aiUtils.streamChatResponse(
                systemPrompt,
                messages,
                token -> sendSseEvent(emitter, "token", Map.of("text", token)),
                error -> { sendSseEvent(emitter, "error", Map.of("message", error.getMessage())); emitter.complete(); }
            );
            sendSseEvent(emitter, "done", Map.of());
            emitter.complete();
        } catch (Exception e) {
            sendSseEvent(emitter, "error", Map.of("message", e.getMessage()));
            emitter.complete();
        }
    });
    return emitter;
}
```

**前端改动文件:**

`frontend/fr/src/api/assistant.ts` — 新增 `assistantChatStreamApi` 方法（返回 `fetch` Promise）。

`frontend/fr/src/components/AiAssistant.vue` — `send` 方法扩展为两个分支：
- 默认走流式 `sendStream()`
- 若流式连接失败（如浏览器不支持），自动降级到旧的 `send()` 一次性请求
- 流式模式下：先插入 pending 消息 → 随 `token` 事件逐字追加 `content` → `done` 事件时解析末尾按钮 JSON → 移除 pending 标记

---

### 3.3 能力画像生成流式链路

已在方向二 1.1.2 和 1.1.3 中完整描述。流式端点 `POST /api/capability/profile/stream` 在推理链的每一步通过 `SseEmitter` 推送 `step`/`progress`/`complete` 事件。

**前端改动文件:** `frontend/fr/src/pages/CapabilityProfile.vue`

在 `onMounted` 中：
1. 将 `loading` 从简单的 `true/false` 改为携带进度信息：`{ isLoading: true, step: 1, total: 6, summary: '正在分析你的教育背景与经历...' }`
2. 页面顶部新增"推理进度条"区域（六个步骤指示器，当前步骤高亮，已完成步骤打勾）
3. 每个 `progress` 事件携带的中间结果展示在对应步骤下方（如"已识别背景摘要：计算机科学与技术专业..."）
4. `complete` 事件到达后，替换为完整的雷达图和岗位推荐列表

---

### 3.4 职业路径规划流式链路

已在方向二 1.2.2 和 1.2.3 中完整描述。流式端点 `POST /api/path-plan/generate/stream`。

**前端改动文件:** `frontend/fr/src/pages/PathPlanning.vue`

改动方式与能力画像页一致：加载状态改为步骤进度条，推理过程逐步展示中间摘要，最终力导向图在 `complete` 事件后渲染。

---

## 四、交汇点约定

### 4.1 AiUtils 方法命名与参数规范

改造后 AiUtils 将包含以下公开方法，按调用模式分类：

| 方法签名 | 用途 | 调用方 |
|---------|------|--------|
| `getChatResponse(String, String)` | 单次非流式（保留） | 降级兜底 |
| `getChatResponseWithHistory(String, List, String)` | 多轮非流式 | 推理链各步骤内部调用 |
| `streamChatResponse(String, List, Consumer, Consumer)` | 流式对话 | AssistantController |
| `getChatResponseWithHistoryAndStream(String, List, String, Consumer, Consumer)` | 单步调用 + 流式输出增量 | 推理链各步骤内部推送中间结果 |

参数约定：`systemPrompt` 统一为 `String`，消息列表统一为 `List<Map<String, String>>`（每项含 `role` 和 `content`），流式回调统一为 `Consumer<String>`（回调内容为纯文本增量）。

### 4.2 主动消息与流式回复的排队策略

当方向三的主动消息推送与方向四的用户主动流式对话同时到达时：

- **前端排队规则：** 若当前正在流式播放对话回复（`isStreaming === true`），则主动消息进入等待队列。流式回复的 `done` 事件到达后，检查队列，依次展示等待中的主动消息。每个主动消息展示 10 秒后自动消失，超时不展示下一个队列消息。
- **后端不排队：** ActivityController 的信号处理不感知流式状态，独立返回结果。

### 4.3 推理链进行中触发主动消息的处理

方向二推理链正在执行时（用户处于能力画像页或路径规划页，页面正在加载/展示进度条），方向三的心跳信号发送到后端。

后端 ActivityController 在调用模型判断是否介入时，`pageState` 中包含 `profileGenerating: true` / `pathPlanGenerating: true` 字段。提示词中明确要求："若页面状态表明当前有推理正在进行中，无论停留时间多长，一律判定为不需主动推送"。

这使得推理进行中不会被打断。推理完成后前端会更新 `pageState`（设置 `profileGenerating: false`），下一次心跳才会被判定为可触发主动消息。

### 4.4 SseEmitter 辅助方法

在 Controller 层统一工具方法（可放在 `AiUtils` 或新建 `SseUtils`）：

```java
public static void sendSseEvent(SseEmitter emitter, String eventName, Object data) {
    try {
        emitter.send(SseEmitter.event()
            .name(eventName)
            .data(data, MediaType.APPLICATION_JSON));
    } catch (IOException e) {
        // 客户端已断开，忽略
    }
}
```

---

## 五、联动审查与潜在问题排查

### 5.1 场景一：能力画像页——全流程联动

**模拟路径：** 用户进入能力画像页 → 方向二六步推理链启动 → 方向四流式推送进度 → 推理完成 → 方向三检测到"画像生成完成" → 推送主动消息。

**潜在问题及排查方向：**

1. **问题：** 推理链最后一步（本地岗位查询 + 组装）抛出异常（如数据库连接超时），导致 `complete` 事件永远不发出。
   **排查：** 第 6 步本地逻辑需要用 try-catch 包裹，异常时将前面步骤已生成的画像内容作为部分结果通过 `complete` 发出（不包含推荐岗位），并附带 `warning: "岗位推荐暂时不可用"`。

2. **问题：** 前端 SSE 连接在推理链执行到第 3 步时断连（用户刷新页面或网络抖动），后端推理链仍在执行但前端已丢失连接。
   **排查：** `SseEmitter` 的 `onCompletion` 和 `onTimeout` 回调中设置一个 `cancelled` 标志，推理链每步执行前检查此标志，若已取消则提前返回（避免浪费模型调用成本）。

3. **问题：** 方向三心跳在推理完成前发送，因 `profileGenerating: true` 被抑制；推理完成后前端将 `profileGenerating` 设为 `false`，但下一次心跳尚未到达，主动消息延迟。
   **排查：** 前端在推理完成的 `complete` 事件处理中，除了设置 `profileGenerating: false`，还主动触发一次信号发送（`activityMonitor.sendNow()`），不等心跳间隔。

---

### 5.2 场景二：助手对话与主动消息并发

**模拟路径：** 用户打开助手面板输入问题 → 方向四流式回复正在逐字输出 → 方向三定时心跳判断应推送主动消息 → 主动消息加入前端等待队列。

**潜在问题及排查方向：**

1. **问题：** 流式回复播放完毕（`done` 事件）→ 主动消息立即插入 → 主动消息 10 秒后自动消失 → 用户可能错过。
   **排查：** 主动消息插入后，助手面板顶部显示一个微小的未读标记（红色圆点），面板关闭再打开时最近一条未读主动消息始终可见。

2. **问题：** 流式回复内容很长（如模型输出了一大段职业分析），播放时间超过 45 秒 → 下一个心跳到达 → 队列中堆积多条主动消息。
   **排查：** 前端队列最大长度为 3，超出时优先丢弃最旧的未展示主动消息。

---

### 5.3 场景三：两个标签页并发

**模拟路径：** 用户同时打开能力画像页和岗位探索页两个标签。

**潜在问题及排查方向：**

1. **问题：** 冷却记录在后端内存中，两个标签页的请求携带相同的 userId + 不同 page，冷却各自独立——这是预期行为，没有问题。

2. **问题：** 两个标签页同时调用流式大模型接口，模型并发配额耗尽。
   **排查：** 当前不做跨标签同步（保持简单）。若遇到并发限制，在 AiUtils 中加入调用计数器（`AtomicInteger`），超过上限时返回 `rate_limit` 错误，前端展示"当前使用人数较多，请稍后再试"。

---

### 5.4 场景四：推理链某一步模型返回格式异常

**模拟路径：** 能力画像推理链第 4 步模型返回的 JSON 缺少 `radar` 字段。

**潜在问题及排查方向：**

1. **问题：** `parseProfileJson` 返回 null → 触发该步的 fallback → 后续步骤拿到的是 fallback 数据而非模型生成数据 → 最终画像质量下降。
   **排查：** 每一步的 fallback 数据要设计得足够合理（不低于当前 `buildFallback` 的质量）。同时，每一步的异常都记录日志（`log.warn("Step {} AI returned invalid JSON, using fallback", step, e)`），方便后续排查模型问题。

2. **问题：** 连续多步都失败（例如模型接口全部超时）→ 最终结果完全由 fallback 组装 → 用户看到的结果与无大模型参与无异。
   **排查：** 在最终 `complete` 事件中附加一个 `source` 字段：`"ai"` 表示全程大模型生成，`"partial"` 表示部分步骤使用了 fallback，`"fallback"` 表示全部 fallback。前端不需要特殊处理，仅作为调试信息。

---

### 5.5 跨方向文件改动汇总

| 文件 | 方向二 | 方向三 | 方向四 | 改动类型 |
|------|--------|--------|--------|----------|
| `backend/.../utils/AiUtils.java` | 新增多轮历史方法 | — | 新增流式调用方法 | **核心改动** |
| `backend/.../impl/CapabilityServiceImpl.java` | 新增 generateProfileWithChain / generateCareerPathWithChain | — | — | **核心改动** |
| `backend/.../controller/CapabilityController.java` | — | — | 新增 /profile/stream 端点 | 新增端点 |
| `backend/.../controller/PathPlanController.java` | — | — | 新增 /generate/stream 端点 | 新增端点 |
| `backend/.../controller/AssistantController.java` | — | — | 新增 /chat/stream 端点 | 新增端点 |
| `backend/.../controller/ActivityController.java` | — | **新增文件** | — | 新 Controller |
| `backend/.../dto/ActivitySignalDTO.java` | — | **新增文件** | — | 新 DTO |
| `frontend/.../utils/activityMonitor.ts` | — | **新增文件** | — | 新工具模块 |
| `frontend/.../router/index.ts` | — | 添加路由钩子 | — | 小幅改动 |
| `frontend/.../api/assistant.ts` | — | — | 新增 stream 方法 | 新增方法 |
| `frontend/.../api/capability.ts` | — | — | 新增 stream 方法 | 新增方法 |
| `frontend/.../api/persistence.ts` | — | — | 新增 stream 方法 | 新增方法 |
| `frontend/.../components/AiAssistant.vue` | — | 新增主动消息展示逻辑 | 流式对话消费 | **核心改动** |
| `frontend/.../pages/CapabilityProfile.vue` | — | 记录操作事件 | 消费 SSE 流 + 进度展示 | **核心改动** |
| `frontend/.../pages/PathPlanning.vue` | — | 记录操作事件 | 消费 SSE 流 + 进度展示 | **核心改动** |
| `frontend/.../pages/ComprehensiveEntry.vue` | — | 记录操作事件 | — | 小幅改动 |
| `frontend/.../pages/JobExploration.vue` | — | 记录操作事件 | — | 小幅改动 |

---

### 5.6 实施顺序建议

1. **第一阶段（基础设施）：** 方向四的 `AiUtils.streamChatResponse` + `AssistantController.chatStream`，先跑通一条端到端流式链路，验证 SSE 机制可用。
2. **第二阶段（核心升级）：** 方向二的推理链 + 流式推送，在流式基础就绪后，能力画像和路径规划依次接入。
3. **第三阶段（体验增强）：** 方向三的主动感知，此时推理链已稳定运行，pageState 信号已有现成数据来源，接入成本最低。
