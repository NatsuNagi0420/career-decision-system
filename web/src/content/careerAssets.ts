export type CareerVisualKey =
  | 'code'
  | 'data'
  | 'product'
  | 'creative'
  | 'business'
  | 'people'
  | 'research'
  | 'engineering'
  | 'service'

export type CareerExperienceTask = {
  id: string
  title: string
  duration: string
  content: string
  deliverable: string
  taskType: 'career_research' | 'skill_learning' | 'project'
}

export type CareerAsset = {
  visual: CareerVisualKey
  eyebrow: string
  scene: string
  outcomes: string[]
  starterQuestions: string[]
  experienceTasks: CareerExperienceTask[]
}

const DEFAULT_TASKS: CareerExperienceTask[] = [
  {
    id: 'job-sample-review',
    title: '拆解 5 个真实岗位',
    duration: '60-90 分钟',
    content: '选择 5 个同方向岗位，整理重复出现的职责、技能和经验要求。',
    deliverable: '一份包含高频要求、差异和疑问的岗位观察表。',
    taskType: 'career_research'
  },
  {
    id: 'micro-deliverable',
    title: '完成一个最小职业产出物',
    duration: '2-4 小时',
    content: '按照该方向的典型工作，完成一个边界清楚、可以展示的微型成果。',
    deliverable: '一个链接、文件或截图，并记录完成过程和遇到的困难。',
    taskType: 'project'
  }
]

const ASSETS: Record<string, CareerAsset> = {
  '技术研发': {
    visual: 'code',
    eyebrow: '构建与交付',
    scene: '把需求转化为可靠的软件、系统或自动化能力，并持续处理质量与协作问题。',
    outcomes: ['可运行功能或服务', '代码、测试与技术文档', '性能与稳定性改进记录'],
    starterQuestions: ['我是否享受长时间定位问题？', '我能否接受持续学习工具与基础知识？', '我更偏好构建产品还是研究技术？'],
    experienceTasks: [
      {
        id: 'build-small-feature',
        title: '交付一个可运行的小功能',
        duration: '3-6 小时',
        content: '选择一个真实小问题，完成设计、实现、验证和使用说明。',
        deliverable: '可运行结果、代码链接和一段取舍说明。',
        taskType: 'project'
      },
      ...DEFAULT_TASKS
    ]
  },
  '数据与算法': {
    visual: 'data',
    eyebrow: '分析与验证',
    scene: '从数据和业务问题出发，建立可复核的分析过程，并把结论转化为判断或产品能力。',
    outcomes: ['分析报告或数据产品', '可复现的数据处理过程', '指标定义与结论边界'],
    starterQuestions: ['我是否愿意反复校验数据质量？', '我能否清楚解释分析结论的限制？', '我更喜欢业务分析还是模型研究？'],
    experienceTasks: [
      {
        id: 'public-data-analysis',
        title: '完成一次公开数据分析',
        duration: '3-5 小时',
        content: '选择一个公开数据集，提出问题、清理数据、形成图表并解释局限。',
        deliverable: '一页分析结论、关键图表和可复现步骤。',
        taskType: 'project'
      },
      ...DEFAULT_TASKS
    ]
  },
  '产品与设计': {
    visual: 'product',
    eyebrow: '理解与设计',
    scene: '理解用户与业务约束，把模糊问题整理成可验证的产品方案或体验。',
    outcomes: ['需求说明或研究结论', '交互原型与设计方案', '验证记录和迭代依据'],
    starterQuestions: ['我能否区分用户表达和真实问题？', '我是否愿意根据反馈推翻原方案？', '我更偏好逻辑规划还是视觉表达？'],
    experienceTasks: [
      {
        id: 'product-teardown',
        title: '完成一次产品体验拆解',
        duration: '2-4 小时',
        content: '选择一个常用产品，分析目标用户、核心流程、关键问题和改进假设。',
        deliverable: '一份带流程图或原型的产品拆解。',
        taskType: 'project'
      },
      ...DEFAULT_TASKS
    ]
  },
  '市场与运营': {
    visual: 'creative',
    eyebrow: '沟通与增长',
    scene: '理解目标受众，通过内容、活动和数据反馈推动认知、使用或转化。',
    outcomes: ['内容或活动方案', '渠道与受众分析', '转化数据和复盘结论'],
    starterQuestions: ['我是否愿意持续观察受众反馈？', '我能否把创意与目标指标连接起来？', '我更喜欢内容、活动还是用户运营？'],
    experienceTasks: [
      {
        id: 'campaign-plan',
        title: '设计一次小型传播活动',
        duration: '2-4 小时',
        content: '为一个校园项目定义受众、信息、渠道、执行步骤和验证指标。',
        deliverable: '一页活动方案和可衡量的效果指标。',
        taskType: 'project'
      },
      ...DEFAULT_TASKS
    ]
  },
  '商业与服务': {
    visual: 'business',
    eyebrow: '需求与协作',
    scene: '识别客户或组织需求，通过沟通、方案和持续协作推动问题解决。',
    outcomes: ['需求记录与解决方案', '客户沟通和推进记录', '业务结果与复盘'],
    starterQuestions: ['我能否在不确定中持续推进？', '我是否愿意面对频繁沟通和结果压力？', '我更喜欢外部客户还是内部协作？'],
    experienceTasks: DEFAULT_TASKS
  },
  '职能与专业服务': {
    visual: 'people',
    eyebrow: '专业与支持',
    scene: '依靠专业规则和组织协作，为业务运行、人才或合规提供稳定支持。',
    outcomes: ['专业分析或流程文件', '合规、组织或运营建议', '跨部门协作记录'],
    starterQuestions: ['我是否重视规则、准确性和责任边界？', '我能否理解专业结论对业务的影响？', '我愿意在哪个专业领域长期积累？'],
    experienceTasks: DEFAULT_TASKS
  },
  '研究与咨询': {
    visual: 'research',
    eyebrow: '研究与表达',
    scene: '面对复杂问题收集证据、建立分析框架，并向他人解释判断与行动建议。',
    outcomes: ['研究报告与信息来源', '分析框架和关键假设', '汇报材料与建议'],
    starterQuestions: ['我能否在信息不完整时明确假设？', '我是否享受阅读、访谈和写作？', '我能否把复杂结论讲清楚？'],
    experienceTasks: DEFAULT_TASKS
  },
  '工程与制造': {
    visual: 'engineering',
    eyebrow: '设计与验证',
    scene: '围绕真实物理系统完成设计、实现、测量和改进，重视安全、质量与可制造性。',
    outcomes: ['设计图、样机或工程方案', '测试数据和问题记录', '质量与可靠性结论'],
    starterQuestions: ['我是否喜欢在真实约束下反复调试？', '我能否耐心记录测量和故障？', '我更偏好设计、制造还是现场工程？'],
    experienceTasks: DEFAULT_TASKS
  },
  '教育与公共服务': {
    visual: 'service',
    eyebrow: '成长与影响',
    scene: '理解具体群体的需要，通过教学、服务或公共项目形成长期而可观察的改变。',
    outcomes: ['课程、活动或服务方案', '对象反馈与观察记录', '项目复盘和改进建议'],
    starterQuestions: ['我是否愿意面对缓慢而长期的结果？', '我能否尊重服务对象的差异和边界？', '我更喜欢教学、项目还是一线服务？'],
    experienceTasks: DEFAULT_TASKS
  }
}

const FALLBACK: CareerAsset = {
  visual: 'research',
  eyebrow: '探索与验证',
  scene: '通过真实岗位、低成本体验和个人证据理解这个方向，而不是只依赖职业名称做判断。',
  outcomes: ['岗位样本观察', '一项可展示成果', '基于证据的方向判断'],
  starterQuestions: ['这个方向每天具体做什么？', '哪些要求我已经有证据？', '我愿意用什么行动继续验证？'],
  experienceTasks: DEFAULT_TASKS
}

export function getCareerAsset(category: string | null | undefined): CareerAsset {
  return category ? ASSETS[category] || FALLBACK : FALLBACK
}

