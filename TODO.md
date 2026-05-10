# 智能体升级改造 - 待办事项清单

> 本文档记录智能体升级改造完成后发现的潜在问题和优化建议，按优先级排序。

**当前状态：** Phase 1-4 已完成，进入优化和测试阶段

---

## ⚠️ 重要工作流程规范

### 修复流程（必须严格遵守）

每个问题的修复必须按照以下流程进行：

```
1. 阅读问题描述和修复方案
2. 实施代码修改
3. 后端编译验证（mvn clean compile）
4. 执行功能测试（见测试清单）
5. 验证其他功能未受影响
6. 更新问题状态为 ✅
7. 提交代码并记录到 DEVELOPMENT_LOG.md
8. 进入下一个问题
```

**⚠️ 严禁跳过测试步骤！**
- 每个问题修复后必须完成完整的功能测试
- 只有在确认功能正常且未影响其他功能后，才能标记为完成
- 如果测试发现问题，必须立即修复并重新测试

---

## 🔴 高优先级问题（建议立即修复）

### 问题1：推理链缓存键设计不合理 ⭐⭐ 最严重

**状态：** ✅ 已完成

**问题描述：**
- 当前缓存键只使用 `userId`
- 如果用户修改了目标岗位，缓存仍然生效
- 导致路径规划与新目标岗位不匹配
- **这是一个逻辑bug，会导致用户得到错误的路径规划**

**示例场景：**
```
1. 用户选择"前端工程师"，生成能力画像
2. 缓存键：userId=123
3. 用户修改目标为"产品经理"，生成路径规划
4. 系统复用缓存（userId=123），但缓存内容是基于"前端工程师"的分析
5. 结果：路径规划与"产品经理"目标不匹配 ❌
```

**影响范围：**
- `backend/ba/src/main/java/com/example/ba/service/impl/CapabilityServiceImpl.java`
  - `generateProfileWithChain()` 方法（第1094-1100行）
  - `generateCareerPathWithChain()` 方法（第1194-1252行）

**修复方案：**

#### 步骤1：添加缓存键生成方法
在 `CapabilityServiceImpl` 类中添加：
```java
/**
 * 生成缓存键：userId + 目标岗位
 * 确保不同目标岗位使用不同的缓存
 */
private String generateCacheKey(CapabilityProfileRequestDTO req) {
    if (req.getUserId() == null) {
        return null;
    }
    
    String targetRole = "unknown";
    if (req.getTarget() != null && notBlank(req.getTarget().getRole())) {
        targetRole = req.getTarget().getRole();
    }
    
    // 使用 userId:targetRole 作为缓存键
    return req.getUserId() + ":" + targetRole;
}
```

#### 步骤2：修改缓存存储逻辑
在 `generateProfileWithChain()` 方法中（第1094-1100行），替换：
```java
// 原代码：
if (effectiveReq.getUserId() != null) {
    reasoningCache.put(effectiveReq.getUserId(), new ReasoningCache(...));
}

// 修改为：
String cacheKey = generateCacheKey(effectiveReq);
if (cacheKey != null) {
    Map<String, Object> step1Data = Map.of("response", step1Response, "prompt", step1Prompt);
    Map<String, Object> step2Data = Map.of("response", step2Response, "prompt", step2Prompt);
    Map<String, Object> step3Data = Map.of("response", step3Response, "prompt", step3Prompt);
    reasoningCache.put(cacheKey, new ReasoningCache(step1Data, step2Data, step3Data));
    log.info("Cached reasoning chain steps 1-3 for key: {}", cacheKey);
}
```

#### 步骤3：修改缓存读取逻辑
在 `generateCareerPathWithChain()` 方法中（第1194-1252行），替换：
```java
// 原代码：
ReasoningCache cache = null;
if (effectiveReq.getUserId() != null) {
    cache = reasoningCache.get(effectiveReq.getUserId());
    if (cache != null && !cache.isExpired()) {
        log.info("Reusing cached reasoning chain steps 1-3 for user {}", effectiveReq.getUserId());
        // ...
    }
}

// 修改为：
String cacheKey = generateCacheKey(effectiveReq);
ReasoningCache cache = null;
if (cacheKey != null) {
    cache = reasoningCache.get(cacheKey);
    if (cache != null && !cache.isExpired()) {
        log.info("Reusing cached reasoning chain steps 1-3 for key: {}", cacheKey);
        // ... 复用逻辑保持不变 ...
    } else if (cache != null) {
        log.info("Cache expired for key: {}, executing full reasoning chain", cacheKey);
        reasoningCache.remove(cacheKey);
    }
}
```

**测试清单：**

```markdown
### 编译测试
- [ ] 后端编译通过：`cd backend/ba && mvn clean compile`
- [ ] 无编译错误

### 功能测试
- [ ] 测试1：缓存复用（相同目标岗位）
  1. 启动后端服务
  2. 生成能力画像（目标：前端工程师）
  3. 5分钟内生成路径规划（目标：前端工程师）
  4. 查看后端日志，应显示：`Reusing cached reasoning chain steps 1-3 for key: {userId}:前端工程师`
  5. ✅ 缓存命中

- [ ] 测试2：缓存失效（不同目标岗位）
  1. 生成能力画像（目标：前端工程师）
  2. 修改目标为"产品经理"
  3. 生成路径规划（目标：产品经理）
  4. 查看后端日志，应显示：`executing full reasoning chain`（不应复用缓存）
  5. ✅ 缓存未命中，执行完整推理链

- [ ] 测试3：路径规划内容正确性
  1. 生成能力画像（目标：产品经理）
  2. 生成路径规划（目标：产品经理）
  3. 检查路径规划的节点名称、技能列表是否与"产品经理"相关
  4. ✅ 路径规划内容与目标岗位匹配

### 回归测试
- [ ] 能力画像生成功能正常
- [ ] 路径规划生成功能正常
- [ ] AI助手对话功能正常
- [ ] 主动消息推送功能正常
```

**预计工作量：** 1-2小时（含测试）

---

### 问题2：图谱质量缺少语义校验 ⭐

**状态：** ✅ 已完成

**问题描述：**
- 当前只对图谱结构进行校验（节点存在性、链接有效性）
- AI可能生成不合理的职业路径：
  - 时间跨度不合理（如"当前岗位"到"CEO"标注"1年"）
  - 技能关联度低（如"前端工程师"到"数据科学家"缺少过渡）
  - 节点命名模糊（如"待补充岗位"）
- 用户体验差，可能误导职业规划

**影响范围：**
- `backend/ba/src/main/java/com/example/ba/service/impl/CapabilityServiceImpl.java`
  - `validateAndFixGraph()` 方法（第1375-1446行）
  - `generateCareerPathWithChain()` 方法（第1184-1367行）

**修复方案：**

#### 步骤1：添加语义校验方法
在 `CapabilityServiceImpl` 类中添加：
```java
/**
 * 语义校验：检查路径合理性
 * @param graph 图谱数据
 * @return true=合理，false=不合理
 */
private boolean validatePathSemantics(Map<String, Object> graph) {
    List<Map<String, Object>> nodes = (List<Map<String, Object>>) graph.get("nodes");
    List<Map<String, Object>> links = (List<Map<String, Object>>) graph.get("links");
    
    if (nodes == null || links == null) {
        return false;
    }
    
    // 1. 检查节点数量（至少3个）
    if (nodes.size() < 3) {
        log.warn("Path has too few nodes: {}", nodes.size());
        return false;
    }
    
    // 2. 检查时间跨度合理性（单个阶段不超过5年）
    for (Map<String, Object> link : links) {
        String label = String.valueOf(link.get("label"));
        if (label.contains("年")) {
            int years = extractYears(label);
            if (years > 5) {
                log.warn("Unrealistic time span: {}", label);
                return false;
            }
        }
    }
    
    // 3. 检查是否有"待补充岗位"等占位符
    for (Map<String, Object> node : nodes) {
        String name = String.valueOf(node.get("name"));
        if (name.contains("待补充") || name.contains("占位") || name.equals("null")) {
            log.warn("Found placeholder node: {}", name);
            return false;
        }
    }
    
    return true;
}

/**
 * 从标签中提取年份数字（取最大值）
 * 例如："1-2年" -> 2, "3年" -> 3
 */
private int extractYears(String label) {
    Pattern pattern = Pattern.compile("(\\d+)[-~]?(\\d+)?年");
    Matcher matcher = pattern.matcher(label);
    if (matcher.find()) {
        String max = matcher.group(2);
        return max != null ? Integer.parseInt(max) : Integer.parseInt(matcher.group(1));
    }
    return 0;
}
```

#### 步骤2：在validateAndFixGraph中集成语义校验
在 `validateAndFixGraph()` 方法的最后（第1443行之前）添加：
```java
// 在返回之前添加语义校验
if (!validatePathSemantics(graph)) {
    log.warn("Path semantics validation failed, using fallback");
    return fallback;
}

graph.put("nodes", nodes);
graph.put("links", links);
return graph;
```

#### 步骤3：优化AI Prompt（可选但推荐）
在 `generateCareerPathWithChain()` 方法中，修改步骤4的Prompt（第1219行和第1331行）：
```java
String step4Prompt = "基于差距分析，请生成职业发展路径图谱JSON。要求：\n" +
    "1. 时间跨度合理：初级到中级1-2年，中级到高级2-3年，高级到专家3-5年\n" +
    "2. 技能连贯性：每个阶段的技能应基于前一阶段，逐步深化\n" +
    "3. 节点命名具体：使用明确的岗位名称，避免'待补充岗位'等模糊表述\n" +
    "4. 至少包含3-5个节点，2-4条主路径\n" +
    "JSON格式：nodes(id/name/type), links(source/target/type/label/skills), recommendations";
```

**测试清单：**

```markdown
### 编译测试
- [ ] 后端编译通过：`cd backend/ba && mvn clean compile`
- [ ] 无编译错误
- [ ] 需要添加 `import java.util.regex.Pattern;` 和 `import java.util.regex.Matcher;`

### 功能测试
- [ ] 测试1：正常路径生成
  1. 生成能力画像和路径规划（目标：前端工程师）
  2. 检查生成的图谱是否包含3-5个节点
  3. 检查时间跨度是否合理（每个阶段≤5年）
  4. 检查节点名称是否具体（无"待补充岗位"）
  5. ✅ 图谱质量良好

- [ ] 测试2：语义校验生效
  1. 查看后端日志
  2. 如果AI生成了不合理的路径，应该看到警告日志：
     - "Path has too few nodes"
     - "Unrealistic time span"
     - "Found placeholder node"
  3. 系统应该使用fallback数据
  4. ✅ 语义校验正常工作

- [ ] 测试3：Fallback数据展示
  1. 如果触发fallback，检查前端显示的路径规划
  2. 应该显示3个节点、2条链接的基本路径
  3. ✅ Fallback数据正常展示

### 回归测试
- [ ] 能力画像生成功能正常
- [ ] 路径规划生成功能正常
- [ ] 悬空节点修复功能正常
```

**预计工作量：** 3-4小时（含测试）

---

### 问题3：Fallback数据过于简单，用户价值低

**状态：** ✅ 已完成

**问题描述：**
- 当前fallback数据固定为3个节点、2条链接
- 节点命名通用："当前岗位"、"目标岗位"、"备选岗位"
- 技能列表空泛："核心技能强化"、"跨领域知识"
- 用户无法从fallback数据中获得实际指导价值

**影响范围：**
- `backend/ba/src/main/java/com/example/ba/service/impl/CapabilityServiceImpl.java`
  - `buildPathFallback()` 方法（第888-910行）

**修复方案：**

#### 步骤1：添加辅助方法
在 `CapabilityServiceImpl` 类中添加：
```java
/**
 * 根据目标岗位推断当前岗位
 */
private String inferCurrentRole(String targetRole) {
    if (targetRole.contains("高级") || targetRole.contains("资深")) {
        return targetRole.replace("高级", "").replace("资深", "");
    } else if (targetRole.contains("架构师")) {
        return "高级" + targetRole.replace("架构师", "工程师");
    } else if (targetRole.contains("经理") || targetRole.contains("主管")) {
        return targetRole.replace("经理", "专员").replace("主管", "专员");
    }
    return "初级" + targetRole;
}

/**
 * 获取中间过渡岗位
 */
private String getIntermediateRole(String targetRole) {
    if (targetRole.contains("高级")) {
        return targetRole.replace("高级", "中级");
    } else if (targetRole.contains("架构师")) {
        return "高级" + targetRole.replace("架构师", "工程师");
    } else if (targetRole.contains("经理")) {
        return targetRole.replace("经理", "组长");
    }
    return "中级" + targetRole;
}

/**
 * 根据岗位获取所需技能列表
 */
private List<String> getRequiredSkillsForRole(String role) {
    if (role.contains("前端")) {
        return List.of("HTML/CSS/JavaScript", "Vue/React框架", "工程化工具", "性能优化");
    } else if (role.contains("后端")) {
        return List.of("Java/Python/Go", "数据库设计", "微服务架构", "高并发处理");
    } else if (role.contains("产品")) {
        return List.of("需求分析", "原型设计", "数据分析", "项目管理");
    } else if (role.contains("数据")) {
        return List.of("Python/SQL", "机器学习", "数据可视化", "业务理解");
    } else if (role.contains("测试")) {
        return List.of("测试用例设计", "自动化测试", "性能测试", "质量保障");
    } else if (role.contains("运维")) {
        return List.of("Linux系统", "Docker/K8s", "监控告警", "自动化部署");
    }
    return List.of("专业技能", "沟通协作", "问题解决", "持续学习");
}
```

#### 步骤2：重写buildPathFallback方法
替换现有的 `buildPathFallback()` 方法（第888-910行）：
```java
private Map<String, Object> buildPathFallback(CapabilityProfileRequestDTO req) {
    Map<String, Object> out = new HashMap<>();
    
    // 提取目标岗位信息
    String targetRole = "目标岗位";
    if (req != null && req.getTarget() != null && notBlank(req.getTarget().getRole())) {
        targetRole = req.getTarget().getRole();
    }
    
    // 根据目标岗位推断当前岗位和中间岗位
    String currentRole = inferCurrentRole(targetRole);
    String intermediateRole = getIntermediateRole(targetRole);
    
    // 根据目标岗位生成具体的技能列表
    List<String> requiredSkills = getRequiredSkillsForRole(targetRole);
    
    // 构建节点
    List<Map<String, Object>> nodes = new ArrayList<>();
    nodes.add(Map.of("id", "1", "name", currentRole, "type", "current"));
    nodes.add(Map.of("id", "2", "name", intermediateRole, "type", "alternative"));
    nodes.add(Map.of("id", "3", "name", targetRole, "type", "target"));

    // 构建链接（分配技能）
    List<Map<String, Object>> links = new ArrayList<>();
    int midPoint = Math.min(2, requiredSkills.size());
    links.add(Map.of(
        "source", "1", 
        "target", "2", 
        "type", "promotion", 
        "label", "1-2年", 
        "skills", requiredSkills.subList(0, midPoint)
    ));
    links.add(Map.of(
        "source", "2", 
        "target", "3", 
        "type", "promotion", 
        "label", "2-3年", 
        "skills", requiredSkills.subList(midPoint, requiredSkills.size())
    ));

    // 构建推荐路径
    List<Map<String, Object>> recs = new ArrayList<>();
    recs.add(Map.of(
        "name", "主路径", 
        "steps", List.of(currentRole, intermediateRole, targetRole)
    ));

    out.put("nodes", nodes);
    out.put("links", links);
    out.put("recommendations", recs);
    return out;
}
```

**测试清单：**

```markdown
### 编译测试
- [ ] 后端编译通过：`cd backend/ba && mvn clean compile`
- [ ] 无编译错误

### 功能测试
- [ ] 测试1：前端工程师Fallback
  1. 模拟AI失败，触发fallback（可以临时断开网络）
  2. 目标岗位：高级前端工程师
  3. 检查fallback数据：
     - 当前岗位：前端工程师
     - 中间岗位：中级高级前端工程师
     - 目标岗位：高级前端工程师
     - 技能：HTML/CSS/JavaScript, Vue/React框架, 工程化工具, 性能优化
  4. ✅ Fallback数据具体且有价值

- [ ] 测试2：产品经理Fallback
  1. 目标岗位：产品经理
  2. 检查fallback数据：
     - 当前岗位：产品专员
     - 中间岗位：产品组长
     - 目标岗位：产品经理
     - 技能：需求分析, 原型设计, 数据分析, 项目管理
  3. ✅ Fallback数据与岗位匹配

- [ ] 测试3：未知岗位Fallback
  1. 目标岗位：区块链专家
  2. 检查fallback数据：
     - 应该使用通用技能：专业技能, 沟通协作, 问题解决, 持续学习
  3. ✅ 未知岗位有兜底方案

### 回归测试
- [ ] 正常路径生成功能不受影响
- [ ] 能力画像生成功能正常
```

**预计工作量：** 2-3小时（含测试）

---

## 🟡 中优先级问题（建议尽快修复）

### 问题4：缺少推理链执行日志和监控

**状态：** ✅ 已完成

**问题描述：**
- 当前只记录了步骤失败的日志
- 缺少每步执行耗时统计
- 无法评估缓存复用的实际效果
- 无法识别性能瓶颈

**影响范围：**
- `backend/ba/src/main/java/com/example/ba/service/impl/CapabilityServiceImpl.java`
  - `generateProfileWithChain()` 方法
  - `generateCareerPathWithChain()` 方法

**修复方案：**

在每个推理步骤前后添加耗时统计，在方法开始和结束记录总耗时。

**详细修改位置：**
1. 在 `generateProfileWithChain()` 方法开始添加总计时
2. 在每个步骤（步骤1-6）前后添加计时
3. 在 `generateCareerPathWithChain()` 方法开始添加总计时
4. 在每个步骤（步骤1-5）前后添加计时
5. 在缓存命中/未命中时添加日志

**预计工作量：** 2小时（含测试）

---

### 问题5：AI Prompt可以进一步优化

**状态：** ✅ 已完成

**问题描述：**
- 当前Prompt较为简单，可能导致AI输出质量不稳定
- 缺少Few-shot示例
- 缺少输出格式约束

**修复方案：**
优化步骤4的Prompt，添加详细的要求和示例。

**预计工作量：** 3小时（含测试）

---

**状态：** ✅ 已完成（详见 PROBLEM6_COMPLETION_REPORT.md）

**问题描述：**
- **能力画像页面**：后端发送6步推理链进度，前端JS接收了loadingState，但模板中完全没有显示进度的UI
- **路径规划页面**：后端发送5步推理链进度，前端JS接收了loadingState，但只有loading遮罩，没有显示步骤进度
- **报告生成页面**：可能也缺少进度显示
- **用户体验问题**：
  - 用户不知道系统在做什么
  - 用户不知道需要等多久
  - 用户可能以为系统卡死了
  - 后端已经发送了详细的进度信息（step、total、summary），但前端没有显示

**影响范围：**
- `frontend/fr/src/pages/CapabilityProfile.vue` - 能力画像页
- `frontend/fr/src/pages/PathPlanning.vue` - 路径规划页
- `frontend/fr/src/pages/Report.vue` - 报告生成页

**修复方案：**

#### 步骤1：在CapabilityProfile.vue中添加进度显示UI

在模板中添加进度提示组件（在页面顶部或覆盖层）：

```vue
<template>
  <div class="profile-page clay-page">
    <Navbar />
    
    <!-- 加载进度提示 -->
    <div v-if="loadingState.isLoading" class="loading-overlay">
      <div class="loading-content">
        <el-progress 
          :percentage="Math.round((loadingState.step / loadingState.total) * 100)"
          :stroke-width="8"
          status="success"
        />
        <p class="loading-text">
          步骤 {{ loadingState.step }}/{{ loadingState.total }}: {{ loadingState.summary }}
        </p>
        <p class="loading-hint">正在为您生成个性化能力画像，请稍候...</p>
      </div>
    </div>
    
    <div class="profile-container">
      <!-- 原有内容 -->
    </div>
  </div>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  width: 400px;
  padding: 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.loading-text {
  margin-top: 20px;
  font-size: 16px;
  color: #1f2937;
  font-weight: 500;
}

.loading-hint {
  margin-top: 8px;
  font-size: 14px;
  color: #6b7280;
}
</style>
```

#### 步骤2：在PathPlanning.vue中添加进度显示UI

类似地，在路径规划页面添加进度提示：

```vue
<template>
  <div class="path-page clay-page">
    <Navbar />
    
    <!-- 加载进度提示 -->
    <div v-if="loadingState.isLoading" class="loading-overlay">
      <div class="loading-content">
        <el-progress 
          :percentage="Math.round((loadingState.step / loadingState.total) * 100)"
          :stroke-width="8"
          status="success"
        />
        <p class="loading-text">
          步骤 {{ loadingState.step }}/{{ loadingState.total }}: {{ loadingState.summary }}
        </p>
        <p class="loading-hint">正在为您规划职业发展路径，请稍候...</p>
      </div>
    </div>
    
    <div class="path-container">
      <!-- 原有内容 -->
    </div>
  </div>
</template>
```

#### 步骤3：在Report.vue中添加进度显示UI

检查Report.vue是否有loadingState，如果有则添加类似的进度显示UI。

**测试清单：**

```markdown
### 功能测试
- [ ] 测试1：能力画像生成进度显示
  1. 打开能力画像页面
  2. 点击"生成能力画像"
  3. 观察页面是否显示进度条和步骤信息
  4. 确认显示：步骤 1/6: 正在分析你的教育背景与经历...
  5. 确认显示：步骤 2/6: 正在分析你的人格特质与价值观...
  6. 确认显示：步骤 3/6: 正在分析你的技能与竞争力...
  7. 确认显示：步骤 4/6: 正在生成综合能力画像...
  8. 确认显示：步骤 5/6: 正在生成推荐岗位关键词...
  9. 确认显示：步骤 6/6: 正在组装最终结果...
  10. ✅ 进度显示正常，用户体验良好

- [ ] 测试2：路径规划生成进度显示
  1. 打开路径规划页面
  2. 点击"生成路径规划"
  3. 观察页面是否显示进度条和步骤信息
  4. 确认显示：步骤 1/5: 正在分析你的当前能力基线...
  5. 确认显示：步骤 2/5: 正在分析目标岗位要求...
  6. 确认显示：步骤 3/5: 正在进行能力差距分析...
  7. 确认显示：步骤 4/5: 正在生成分阶段职业路径...
  8. 确认显示：步骤 5/5: 正在校验和组装最终路径...
  9. ✅ 进度显示正常，用户体验良好

- [ ] 测试3：缓存命中时的进度显示
  1. 生成能力画像（目标：前端工程师）
  2. 5分钟内生成路径规划（目标：前端工程师）
  3. 观察进度显示是否直接从步骤4开始
  4. 确认显示：步骤 4/5: 正在生成分阶段职业路径...
  5. ✅ 缓存命中时进度显示正确

- [ ] 测试4：报告生成进度显示
  1. 打开报告生成页面
  2. 点击"生成报告"
  3. 观察页面是否显示进度信息
  4. ✅ 进度显示正常

### 回归测试
- [ ] 能力画像生成功能正常
- [ ] 路径规划生成功能正常
- [ ] 报告生成功能正常
- [ ] 进度显示不影响原有功能
```

**预计工作量：** 2-3小时（含测试）

---

### 问题7：前端错误提示不够友好

**状态：** ✅ 已完成

**问题描述：**
- 当推理链失败时，前端只显示"推理链执行失败，使用默认方案"
- 用户不知道具体哪一步失败
- 无法判断是网络问题还是AI服务问题

**修复方案：**
后端在SSE error事件中包含更多信息，前端显示更详细的错误信息。

**预计工作量：** 1-2小时（含测试）

---

## 🟢 低优先级问题（可以延后处理）

### 问题9：推理链缓存管理增强
**状态：** ✅ 已完成
**预计工作量：** 3-4小时

**问题描述：**
- 当前推理链缓存只存在内存中（ConcurrentHashMap）
- 缺少缓存统计和监控能力
- 缺少手动清理和自动过期清理机制

**影响：**
- 无法了解缓存使用情况
- 无法评估缓存效果
- 过期缓存无法自动清理

**修复方案：**
- ✅ 添加缓存统计功能（总数、命中率、过期数）
- ✅ 添加手动清理接口（清空所有缓存、清理过期缓存）
- ✅ 添加自动定时清理（每小时执行一次）
- ✅ 提供REST API管理接口
- ✅ 完善日志记录

**完成报告：** 详见 `PROBLEM9_COMPLETION_REPORT.md`

### 问题10：缺少端到端测试
**状态：** ❌ 待修复
**预计工作量：** 6-8小时

**问题描述：**
- 当前只有手动测试
- 缺少自动化测试
- 回归测试成本高

**影响：**
- 代码修改后需要大量手动测试
- 容易引入回归bug
- 测试覆盖率低

**修复方案：**
- 编写端到端测试用例
- 使用Selenium或Playwright进行UI自动化测试
- 集成到CI/CD流程

---

## 📊 工作量统计

| 优先级 | 问题数量 | 已完成 | 待解决 | 预计总工作量 |
|--------|---------|--------|--------|-------------|
| 🔴 高优先级 | 3 | 3 | 0 | 6-9小时 |
| 🟡 中优先级 | 4 | 4 | 0 | 9-12小时 |
| 🟢 低优先级 | 2 | 1 | 1 | 9-12小时 |
| **总计** | **9** | **8** | **1** | **24-33小时** |

**当前进度：** 8/9 问题已完成 (89%)

---

## 🎯 强制执行顺序

**必须按照以下顺序修复，不得跳过：**

### 第一批：核心Bug修复（必须完成）
1. ✅ **问题1**：修复缓存键设计（1-2小时）⭐⭐ 最严重的逻辑bug
2. ✅ **问题2**：添加图谱语义校验（3-4小时）⭐ 直接影响用户体验
3. ✅ **问题3**：优化Fallback数据（2-3小时）

### 第二批：体验优化（建议完成）
4. ✅ **问题4**：添加执行日志和监控（2小时）
5. ✅ **问题6**：添加前端生成进度显示（已完成）⭐ 严重影响用户体验
6. ✅ **问题7**：优化错误提示（1-2小时）

### 第三批：长期优化（可选）
7. ✅ **问题5**：优化AI Prompt（3小时）
8. ✅ **问题9**：推理链缓存管理增强（3-4小时）
9. ⏸️ **问题10**：编写端到端测试（6-8小时）

---

## 📝 状态图例

- ❌ 待修复
- 🔄 修复中
- ✅ 已完成
- ⏸️ 暂缓

---

## 🔍 通用测试清单（每个问题修复后必须执行）

```markdown
### 1. 编译测试
- [ ] 后端编译通过：`cd backend/ba && mvn clean compile`
- [ ] 无编译错误和警告

### 2. 启动测试
- [ ] 后端启动成功：`mvn spring-boot:run`
- [ ] 无启动错误
- [ ] 端口8080正常监听

### 3. 核心功能回归测试
- [ ] 能力画像生成功能正常（流式响应、步骤进度、最终结果）
- [ ] 路径规划生成功能正常（流式响应、步骤进度、图谱展示）
- [ ] AI助手对话功能正常（流式输出、按钮解析、页面跳转）
- [ ] 主动消息推送功能正常（冷却期、消息展示）

### 4. 日志检查
- [ ] 后端日志无ERROR级别错误
- [ ] 前端浏览器控制台无红色错误

### 5. 数据完整性
- [ ] 生成的数据结构完整（无null、无undefined）
- [ ] 前端正确展示所有数据
```

---

**文档创建时间：** 2026-05-09  
**最后更新：** 2026-05-09  
**维护者：** 开发团队

**重要提醒：**
- 每个问题修复后必须完成完整测试
- 只有测试通过才能标记为 ✅
- 严禁跳过测试步骤
- 发现问题立即修复，不要累积
