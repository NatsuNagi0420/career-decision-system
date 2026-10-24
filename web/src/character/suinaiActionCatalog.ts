/** 青穗集 · 穗奈40场景动作目录：对照已确认的动作计划，明确两项道具替代，不冒充完整笔记动作。 */
export const SUINAI_ACTION_CATALOG = [
  {
    "id": "A01",
    "category": "通用",
    "label": "初次见面问好",
    "gesture": "G02",
    "expression": "E02",
    "leftHand": "H02",
    "rightHand": "H01",
    "durationSec": 3.8,
    "playback": "one_shot_then_idle",
    "trigger": "进入当前会话且首次显示角色",
    "beats": [
      "先对视，再抬左手",
      "手腕摆动两次，头稍侧倾",
      "手落下后保留温柔笑"
    ],
    "priority": true,
    "requestedGesture": "G02",
    "substitution": ""
  },
  {
    "id": "A02",
    "category": "通用",
    "label": "安静陪伴",
    "gesture": "G01",
    "expression": "E01",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 5,
    "playback": "quiet_loop",
    "trigger": "没有进行中的任务或用户正在阅读",
    "beats": [
      "舒肩看用户",
      "仅呼吸眨眼，手臂静置",
      "待机连续，不加重复强调"
    ],
    "priority": true,
    "requestedGesture": "G01",
    "substitution": ""
  },
  {
    "id": "A03",
    "category": "通用",
    "label": "认真听你输入",
    "gesture": "G04",
    "expression": "E03",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 2.8,
    "playback": "enter_then_hold",
    "trigger": "用户在输入框持续输入",
    "beats": [
      "眼神先集中输入区",
      "手臂上收、头右倾",
      "保持专注，别一直点头"
    ],
    "priority": true,
    "requestedGesture": "G04",
    "substitution": ""
  },
  {
    "id": "A04",
    "category": "通用",
    "label": "听懂后的点头",
    "gesture": "G03",
    "expression": "E02",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 1.8,
    "playback": "one_shot_then_idle",
    "trigger": "用户提交的信息已成功接收",
    "beats": [
      "目光从提交内容回用户",
      "一次短促点头",
      "轻抬嘴角回正"
    ],
    "priority": false,
    "requestedGesture": "G03",
    "substitution": ""
  },
  {
    "id": "A05",
    "category": "通用",
    "label": "邀请补充一句",
    "gesture": "G07",
    "expression": "E03",
    "leftHand": "H01",
    "rightHand": "H03",
    "durationSec": 3.2,
    "playback": "enter_then_hold",
    "trigger": "系统发现一个明确的资料缺项并展示提问",
    "beats": [
      "看向缺项提示",
      "右掌由低到胸前，眉稍抬",
      "保持掌位等待补充"
    ],
    "priority": true,
    "requestedGesture": "G07",
    "substitution": ""
  },
  {
    "id": "A06",
    "category": "通用",
    "label": "请你做个选择",
    "gesture": "G07",
    "expression": "E09",
    "leftHand": "H01",
    "rightHand": "H04",
    "durationSec": 3,
    "playback": "enter_then_hold",
    "trigger": "界面确有两个以上可选项且需要选择",
    "beats": [
      "先看一侧选项",
      "右食指轻指一次，单眉上抬",
      "回用户视线，等选择"
    ],
    "priority": false,
    "requestedGesture": "G07",
    "substitution": ""
  },
  {
    "id": "A07",
    "category": "通用",
    "label": "接住用户的困惑",
    "gesture": "G11",
    "expression": "E08",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 3.4,
    "playback": "one_shot_then_idle",
    "trigger": "用户主动表达求职困惑或焦虑",
    "beats": [
      "先用关切眼看用户",
      "一手近胸，轻前倾一小拍",
      "缓慢呼气并回到闭口安静"
    ],
    "priority": false,
    "requestedGesture": "G11",
    "substitution": ""
  },
  {
    "id": "A08",
    "category": "通用",
    "label": "解释接下来步骤",
    "gesture": "G10",
    "expression": "E05",
    "leftHand": "H04",
    "rightHand": "H01",
    "durationSec": 4,
    "playback": "one_shot_then_idle",
    "trigger": "已列出接下来要做的两三步",
    "beats": [
      "先看步骤一",
      "两次清晰手部节拍，眉形舒展",
      "回正介绍下一步"
    ],
    "priority": false,
    "requestedGesture": "G10",
    "substitution": ""
  },
  {
    "id": "A09",
    "category": "画像",
    "label": "开始整理画像",
    "gesture": "G05",
    "expression": "E04",
    "leftHand": "H01",
    "rightHand": "H05",
    "durationSec": 3.6,
    "playback": "enter_then_hold",
    "trigger": "profile_diagnose 对应任务实际运行",
    "beats": [
      "先看现有经历",
      "手到脸侧，眼神侧上移",
      "停顿思考不摇手"
    ],
    "priority": true,
    "requestedGesture": "G05",
    "substitution": ""
  },
  {
    "id": "A10",
    "category": "画像",
    "label": "记录一条经历",
    "gesture": "G05",
    "expression": "E12",
    "leftHand": "H01",
    "rightHand": "H05",
    "durationSec": 4.2,
    "playback": "one_shot_then_idle",
    "trigger": "经历写入或明确展示记录动作",
    "beats": [
      "看向经历内容，右手抬到脸侧",
      "略向下移视线，专注梳理事实",
      "放下手，看回用户；本版不拿笔或便签"
    ],
    "priority": false,
    "requestedGesture": "G13",
    "substitution": "缺少笔与便签：先用专注整理动作替代，不呈现写字。"
  },
  {
    "id": "A11",
    "category": "画像",
    "label": "画像整理完成",
    "gesture": "G08",
    "expression": "E07",
    "leftHand": "H03",
    "rightHand": "H03",
    "durationSec": 3.8,
    "playback": "one_shot_then_idle",
    "trigger": "画像结果已生成且可见；临时稿必须标出",
    "beats": [
      "眉形从专注舒展为坚定",
      "双掌依次展开介绍画像",
      "点头一次后收手"
    ],
    "priority": true,
    "requestedGesture": "G08",
    "substitution": ""
  },
  {
    "id": "A12",
    "category": "画像",
    "label": "核对不确定信息",
    "gesture": "G09",
    "expression": "E09",
    "leftHand": "H01",
    "rightHand": "H04",
    "durationSec": 3,
    "playback": "enter_then_hold",
    "trigger": "存在待用户核实的具体画像字段",
    "beats": [
      "视线停在一个待核实字段",
      "右食指提示、单眉轻抬",
      "低手等待用户"
    ],
    "priority": false,
    "requestedGesture": "G09",
    "substitution": ""
  },
  {
    "id": "A13",
    "category": "画像",
    "label": "确认画像修正",
    "gesture": "G03",
    "expression": "E11",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 2.2,
    "playback": "one_shot_then_idle",
    "trigger": "用户修正已被成功保存",
    "beats": [
      "先舒眉",
      "轻闭眼同时小点头",
      "睁眼回正，手不抬"
    ],
    "priority": false,
    "requestedGesture": "G03",
    "substitution": ""
  },
  {
    "id": "A14",
    "category": "岗位",
    "label": "正在匹配方向",
    "gesture": "G05",
    "expression": "E12",
    "leftHand": "H01",
    "rightHand": "H05",
    "durationSec": 3.4,
    "playback": "enter_then_hold",
    "trigger": "job_match 任务实际运行",
    "beats": [
      "眼神先扫两侧岗位内容",
      "右手到脸侧，低头停顿",
      "保持检查眼、不做点头结论"
    ],
    "priority": true,
    "requestedGesture": "G05",
    "substitution": ""
  },
  {
    "id": "A15",
    "category": "岗位",
    "label": "展示推荐岗位",
    "gesture": "G06",
    "expression": "E05",
    "leftHand": "H03",
    "rightHand": "H01",
    "durationSec": 3.6,
    "playback": "one_shot_then_idle",
    "trigger": "岗位结果已显示；参考样本有清晰标记",
    "beats": [
      "目光先看岗位卡片",
      "左手托掌到外侧，轻点头",
      "微笑闭口看用户"
    ],
    "priority": false,
    "requestedGesture": "G06",
    "substitution": ""
  },
  {
    "id": "A16",
    "category": "岗位",
    "label": "比较两个选择",
    "gesture": "G10",
    "expression": "E04",
    "leftHand": "H04",
    "rightHand": "H04",
    "durationSec": 4.6,
    "playback": "one_shot_then_idle",
    "trigger": "用户选定的两个岗位与比较内容均可见",
    "beats": [
      "先看左侧岗位",
      "左右手交替两拍，目光左右",
      "抿嘴停顿后看用户"
    ],
    "priority": true,
    "requestedGesture": "G10",
    "substitution": ""
  },
  {
    "id": "A17",
    "category": "岗位",
    "label": "指出一个差距",
    "gesture": "G09",
    "expression": "E08",
    "leftHand": "H01",
    "rightHand": "H04",
    "durationSec": 3.2,
    "playback": "one_shot_then_idle",
    "trigger": "显示一条有根据的岗位技能差距",
    "beats": [
      "眉部先变关切",
      "食指提示差距，身体稍后收",
      "收手、目光回用户"
    ],
    "priority": false,
    "requestedGesture": "G09",
    "substitution": ""
  },
  {
    "id": "A18",
    "category": "岗位",
    "label": "给出备选方向",
    "gesture": "G07",
    "expression": "E09",
    "leftHand": "H01",
    "rightHand": "H03",
    "durationSec": 3.7,
    "playback": "enter_then_hold",
    "trigger": "新方向仅为备选且已解释依据与不确定性",
    "beats": [
      "先看备选方向",
      "右掌向外邀请、单眉略抬",
      "抬眼等待选择"
    ],
    "priority": false,
    "requestedGesture": "G07",
    "substitution": ""
  },
  {
    "id": "A19",
    "category": "学习与练习",
    "label": "圈出关键知识缺口",
    "gesture": "G09",
    "expression": "E12",
    "leftHand": "H01",
    "rightHand": "H04",
    "durationSec": 3.1,
    "playback": "one_shot_then_idle",
    "trigger": "learning_path 已给出明确技能项",
    "beats": [
      "视线向下聚焦技能项",
      "右食指向下轻提示",
      "停顿后抿嘴看用户"
    ],
    "priority": true,
    "requestedGesture": "G09",
    "substitution": ""
  },
  {
    "id": "A20",
    "category": "学习与练习",
    "label": "讲解一个知识点",
    "gesture": "G06",
    "expression": "E05",
    "leftHand": "H03",
    "rightHand": "H01",
    "durationSec": 4,
    "playback": "one_shot_then_idle",
    "trigger": "已有实际知识解释内容",
    "beats": [
      "稳定看用户",
      "左掌托示两拍、眉轻抬",
      "不张嘴，收手"
    ],
    "priority": false,
    "requestedGesture": "G06",
    "substitution": ""
  },
  {
    "id": "A21",
    "category": "学习与练习",
    "label": "邀请先做一道题",
    "gesture": "G07",
    "expression": "E07",
    "leftHand": "H01",
    "rightHand": "H04",
    "durationSec": 3,
    "playback": "one_shot_then_idle",
    "trigger": "页面有可实际作答的练习",
    "beats": [
      "抬眉看用户",
      "右食指提示题目，清楚点头",
      "收手让出阅读空间"
    ],
    "priority": false,
    "requestedGesture": "G07",
    "substitution": ""
  },
  {
    "id": "A22",
    "category": "学习与练习",
    "label": "等待作答",
    "gesture": "G04",
    "expression": "E03",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 2.4,
    "playback": "enter_then_hold",
    "trigger": "用户正在作答或思考",
    "beats": [
      "看题目区",
      "只轻侧头，不做大手势",
      "降低手位并保持安静"
    ],
    "priority": false,
    "requestedGesture": "G04",
    "substitution": ""
  },
  {
    "id": "A23",
    "category": "学习与练习",
    "label": "回答正确的认可",
    "gesture": "G12",
    "expression": "E06",
    "leftHand": "H06",
    "rightHand": "H01",
    "durationSec": 2.6,
    "playback": "one_shot_then_idle",
    "trigger": "当前题目经实际判定为正确",
    "beats": [
      "眉眼先舒展",
      "单手轻拳向上一次",
      "笑眼恢复并放手"
    ],
    "priority": true,
    "requestedGesture": "G12",
    "substitution": ""
  },
  {
    "id": "A24",
    "category": "学习与练习",
    "label": "答错后的安抚",
    "gesture": "G11",
    "expression": "E08",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 3.2,
    "playback": "one_shot_then_idle",
    "trigger": "判定错误且已给出可理解的反馈",
    "beats": [
      "先看错误反馈再看用户",
      "单手近胸、头向另一侧轻倾",
      "点头一次后准备讲解，闭口"
    ],
    "priority": false,
    "requestedGesture": "G11",
    "substitution": ""
  },
  {
    "id": "A25",
    "category": "学习与练习",
    "label": "给一条提示",
    "gesture": "G09",
    "expression": "E04",
    "leftHand": "H01",
    "rightHand": "H04",
    "durationSec": 3.3,
    "playback": "one_shot_then_idle",
    "trigger": "已展示一条不直接泄题的提示",
    "beats": [
      "先思考侧目",
      "右手食指短指关键点",
      "眉部舒展、回用户目光"
    ],
    "priority": false,
    "requestedGesture": "G09",
    "substitution": ""
  },
  {
    "id": "A26",
    "category": "发展路线",
    "label": "讲清阶段路线",
    "gesture": "G10",
    "expression": "E05",
    "leftHand": "H04",
    "rightHand": "H01",
    "durationSec": 4.8,
    "playback": "one_shot_then_idle",
    "trigger": "发展路线或学习阶段已实际生成",
    "beats": [
      "看第一阶段",
      "左手由低到高三拍提示",
      "顺视线回到用户"
    ],
    "priority": false,
    "requestedGesture": "G10",
    "substitution": ""
  },
  {
    "id": "A27",
    "category": "发展路线",
    "label": "先走下一小步",
    "gesture": "G09",
    "expression": "E07",
    "leftHand": "H01",
    "rightHand": "H04",
    "durationSec": 2.8,
    "playback": "one_shot_then_idle",
    "trigger": "用户有一个可执行的明确下一步",
    "beats": [
      "先看下一步位置",
      "右食指提示并坚定点头",
      "手收回，温暖微笑"
    ],
    "priority": true,
    "requestedGesture": "G09",
    "substitution": ""
  },
  {
    "id": "A28",
    "category": "发展路线",
    "label": "里程碑达成",
    "gesture": "G12",
    "expression": "E06",
    "leftHand": "H06",
    "rightHand": "H06",
    "durationSec": 3.2,
    "playback": "one_shot_then_idle",
    "trigger": "里程碑已经由用户确认或系统验证完成",
    "beats": [
      "先抬双眉",
      "双轻拳同时上举一次",
      "笑眼短停再落手"
    ],
    "priority": false,
    "requestedGesture": "G12",
    "substitution": ""
  },
  {
    "id": "A29",
    "category": "发展路线",
    "label": "回顾与收尾",
    "gesture": "G14",
    "expression": "E11",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 3.1,
    "playback": "one_shot_then_idle",
    "trigger": "用户请求回顾或主动结束这轮任务",
    "beats": [
      "先缓慢收手",
      "轻闭眼、短颔首",
      "睁眼进入安静待机"
    ],
    "priority": false,
    "requestedGesture": "G14",
    "substitution": ""
  },
  {
    "id": "A30",
    "category": "简历",
    "label": "收到简历文件",
    "gesture": "G03",
    "expression": "E03",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 2,
    "playback": "enter_then_hold",
    "trigger": "实际上传成功；解析未必完成",
    "beats": [
      "先看上传文件",
      "一次简短点头，眼神仍专注",
      "回到检查姿势，不庆祝"
    ],
    "priority": false,
    "requestedGesture": "G03",
    "substitution": ""
  },
  {
    "id": "A31",
    "category": "简历",
    "label": "专注检查简历",
    "gesture": "G05",
    "expression": "E12",
    "leftHand": "H01",
    "rightHand": "H05",
    "durationSec": 3.6,
    "playback": "enter_then_hold",
    "trigger": "resume_build 或简历解析任务实际运行",
    "beats": [
      "目光自上向下扫简历",
      "右手抬到脸侧、头略左倾",
      "抿嘴停顿保持阅读"
    ],
    "priority": true,
    "requestedGesture": "G05",
    "substitution": ""
  },
  {
    "id": "A32",
    "category": "简历",
    "label": "指出一处可改进",
    "gesture": "G09",
    "expression": "E08",
    "leftHand": "H01",
    "rightHand": "H04",
    "durationSec": 3.4,
    "playback": "one_shot_then_idle",
    "trigger": "已展示具体原句与修改理由",
    "beats": [
      "先看原句",
      "右食指指向句子、关切内眉",
      "看回用户时收手"
    ],
    "priority": true,
    "requestedGesture": "G09",
    "substitution": ""
  },
  {
    "id": "A33",
    "category": "简历",
    "label": "介绍优化方案",
    "gesture": "G06",
    "expression": "E05",
    "leftHand": "H03",
    "rightHand": "H01",
    "durationSec": 3.8,
    "playback": "one_shot_then_idle",
    "trigger": "有可对照的修改建议或新版本",
    "beats": [
      "先看修改后段落",
      "左掌托示并点头一拍",
      "眉舒展、看回用户"
    ],
    "priority": false,
    "requestedGesture": "G06",
    "substitution": ""
  },
  {
    "id": "A34",
    "category": "简历",
    "label": "帮助挑选模板",
    "gesture": "G10",
    "expression": "E09",
    "leftHand": "H04",
    "rightHand": "H01",
    "durationSec": 4,
    "playback": "one_shot_then_idle",
    "trigger": "页面有真实可选简历模板",
    "beats": [
      "先看模板一",
      "左手两拍依次提示模板",
      "抬单眉等用户选择"
    ],
    "priority": false,
    "requestedGesture": "G10",
    "substitution": ""
  },
  {
    "id": "A35",
    "category": "简历",
    "label": "根据经历撰写简历",
    "gesture": "G05",
    "expression": "E12",
    "leftHand": "H01",
    "rightHand": "H05",
    "durationSec": 4.5,
    "playback": "one_shot_then_idle",
    "trigger": "简历生成任务实际运行且资料可用",
    "beats": [
      "看向经历内容，右手抬到脸侧",
      "略向下移视线，专注梳理事实",
      "放下手，看回用户；本版不拿笔或便签"
    ],
    "priority": false,
    "requestedGesture": "G13",
    "substitution": "缺少笔与便签：先用专注整理动作替代，不呈现写字。"
  },
  {
    "id": "A36",
    "category": "简历",
    "label": "导出文件成功",
    "gesture": "G08",
    "expression": "E06",
    "leftHand": "H03",
    "rightHand": "H03",
    "durationSec": 3.3,
    "playback": "one_shot_then_idle",
    "trigger": "实际导出接口成功且可下载文件已就绪",
    "beats": [
      "先看导出就绪的位置",
      "双掌同时展开、短笑眼",
      "点头一次后迅速回待机"
    ],
    "priority": true,
    "requestedGesture": "G08",
    "substitution": ""
  },
  {
    "id": "A37",
    "category": "确认与异常",
    "label": "等待用户确认",
    "gesture": "G07",
    "expression": "E03",
    "leftHand": "H01",
    "rightHand": "H03",
    "durationSec": 3,
    "playback": "enter_then_hold",
    "trigger": "approval_required 或实际需要用户决策",
    "beats": [
      "看用户",
      "右掌由低到身前，专注闭口",
      "头保持正向等待，不反复招手"
    ],
    "priority": true,
    "requestedGesture": "G07",
    "substitution": ""
  },
  {
    "id": "A38",
    "category": "确认与异常",
    "label": "处理中稍等",
    "gesture": "G11",
    "expression": "E08",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 2.8,
    "playback": "enter_then_hold",
    "trigger": "任务仍在运行且耗时超过产品设定阈值",
    "beats": [
      "先看正在处理的任务区",
      "一手收身前、很轻前倾",
      "舒缓示意一次，目光回界面"
    ],
    "priority": false,
    "requestedGesture": "G11",
    "substitution": ""
  },
  {
    "id": "A39",
    "category": "确认与异常",
    "label": "失败后的关切",
    "gesture": "G11",
    "expression": "E08",
    "leftHand": "H01",
    "rightHand": "H01",
    "durationSec": 3.2,
    "playback": "one_shot_then_idle",
    "trigger": "run_failed 或可靠的上传/导出失败信号",
    "beats": [
      "直接关切看用户、头略低",
      "双手慢慢收低，不点头庆祝",
      "稳定闭口等待下一步操作"
    ],
    "priority": true,
    "requestedGesture": "G11",
    "substitution": ""
  },
  {
    "id": "A40",
    "category": "确认与异常",
    "label": "恢复后可以继续",
    "gesture": "G03",
    "expression": "E11",
    "leftHand": "H01",
    "rightHand": "H06",
    "durationSec": 2.6,
    "playback": "one_shot_then_idle",
    "trigger": "故障已恢复或下一步可执行；重试未成功时不可庆祝",
    "beats": [
      "先确认恢复状态",
      "右手轻握拳短促认可、轻颔首",
      "放手回待机，不使用拇指素材"
    ],
    "priority": false,
    "requestedGesture": "G03",
    "substitution": "拇指素材未采用：改为轻握拳认可。"
  }
] as const;
