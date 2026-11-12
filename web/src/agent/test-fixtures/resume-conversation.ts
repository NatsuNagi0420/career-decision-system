/** 青穗集 · 简历回归测试夹具：固定数据只用于测试，不进入产品对话。 */
import { createResumeExample, changeResumeExample } from "../resume-flow";
export const RESUME_DEMO_TURNS = [
  { user: "我是软件工程本科，2027 届，想找前端实习。没正式实习过，小组做过一个校园报名网站，感觉没什么可写的。", reply: "没有实习，不代表没有值得写的经历。报名网站可以作为课程 / 校园项目，关键不是把它说得多大，而是让人看懂你真的做了什么。\n\n我们先不评价整个项目：你亲手负责的是哪一部分？\n\n小提醒：招聘者需要分清个人贡献和小组成果，这比一句‘参与网站开发’更有信息量。" },
  { user: "我是小组成员，用 React 和 TypeScript 写了活动列表、条件筛选和报名表单校验，也用了 Git。后端和部署不是我做的。", reply: "这已经清楚多了：页面展示、筛选交互和输入校验，都是具体的前端工作。后端和部署不是你负责的，就不用写成全栈项目。\n\n这个项目实际上线使用了吗？没有统计过数据也没关系。" },
  { user: "是课程项目，没上线，也没统计数据。我还独立做过课程管理后台，用 React 和 CSS 做了空态、错误提示和手机端适配。", reply: "那就如实写课程项目，不需要为了‘量化’去编用户量或性能提升。你提到的空态、错误提示、手机适配，反而能说明你考虑了真实的使用细节。\n\n比如第一段可以写成：‘作为小组成员，使用 React、TypeScript 实现活动列表、条件筛选与报名表单校验，并用 Git 协作。’没有给你添加负责范围之外的东西。\n\n除了这两个项目，你还有哪些实际用过的技术，或想保留的其他经历？" },
  { user: "会 JavaScript、HTML、CSS，React 和 TypeScript 是项目里用过的。没用过 Vue，也没做过自动化测试。摄影社团做过海报和现场拍照。", reply: "我会把已经用过的技术和待学习的东西分开。摄影经历也可以保留下来，只是投前端时，通常不如这两个项目值得占据版面。\n\n现在有没有具体想投的岗位要求？没有也完全可以，我们先做一份前端方向版，不假装已经完成岗位匹配。" },
  { user: "有一份 JD：面向 2027 届本科生。掌握 JavaScript、HTML、CSS。熟悉 React 或 Vue。了解 TypeScript，能使用 Git 协作。能对接 REST API。自动化测试经验优先。", reply: "这份要求里，React 和基础前端技术能从你的项目中找到依据，两个项目应该重点写。摄影社团可以本次先不展示，原始经历仍然保留。\n\n有一点要留白：你还没说过自己对接 REST API 的经历，自动化测试也明确没有做过。我不会把 JD 里的要求直接补进你的技能栏。\n\n在真实对话里，这时会让你核对一份很短的经历小结和取舍；确认后才起草。下面可以继续看这个虚构例子的纸面效果。" },
];
export function completedResumeExample() {
  let state = createResumeExample();
  state = changeResumeExample(state, { type: "task.request", kind: "facts" });
  state = changeResumeExample(state, { type: "facts.confirm", facts: state.facts });
  state = changeResumeExample(state, { type: "task.request", kind: "selection" });
  state = changeResumeExample(state, { type: "selection.confirm", choices: state.selection!.choices });
  return changeResumeExample(state, { type: "task.request", kind: "rewrite" });
}
