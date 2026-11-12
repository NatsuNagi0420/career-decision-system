/** 青穗集 · 职业规划视觉素材：复用用户提供的像素图标，头像与动态穗奈保持原版。 */
import { assetUrl } from "../assets";
const ICONS = {
  newChat: "new_chat", history: "chat_history", resume: "upload_resume", send: "send_message",
  folder: "project_folder", target: "goal_target", strengths: "strengths_star", compass: "career_compass",
  plan: "action_plan", search: "source_search", settings: "settings", complete: "complete",
  sprout: "brand-sprout", notes: "step-notes", growth: "step-sprout", direction: "step-compass",
  heart: "card-heart", star: "card-star", seedling: "card-sprout", memory: "memory-nebula.svg",
} as const;
export function CareerIcon({ name, size = 24, className = "" }: { name: keyof typeof ICONS; size?: number; className?: string }) {
  const file = ICONS[name];
  return <img className={"career-pixel-icon " + className} src={assetUrl("brand/career-pixel/" + file + (file.includes(".") ? "" : ".png"))} alt="" width={size} height={size} aria-hidden="true" draggable={false} />;
}
export const CAREER_STARTERS = [
  { id: "experience", number: "01", icon: "notes" as const, title: "梳理经历", description: "回顾做过的事\n找到值得被看见的经验", prompt: "我想先梳理自己的经历。请从我的教育背景、做过的项目或工作开始，一次只问一两个问题，帮我整理真实经历和成果，不要替我编造。" },
  { id: "strengths", number: "02", icon: "growth" as const, title: "发现优势", description: "结合兴趣与能力\n认识独一无二的自己", prompt: "我想知道自己的优势。请结合我已有的经历、兴趣和反馈，帮我找到可以举证的能力与优势；资料不足时先问我，不要直接给结论。" },
  { id: "direction", number: "03", icon: "direction" as const, title: "探索方向", description: "对照期待的生活\n一起找到下一步方向", prompt: "我想探索适合自己的职业方向。请先了解我的背景、兴趣、城市和工作偏好，再给出几个可比较的方向，明确哪些判断还需要真实岗位资料验证。" },
];
export const CAREER_QUICK_PROMPTS = [
  { icon: "strengths" as const, label: "帮我梳理优势", prompt: CAREER_STARTERS[1].prompt },
  { icon: "resume" as const, label: "一起打磨简历", prompt: "我想优化简历。我可以先粘贴简历或导入文本资料。请根据我的真实经历，指出需要补充的事实，再给出修改建议；不要编造成果，确认后再保存为可导出的文件。" },
  { icon: "plan" as const, label: "制定学习路线", prompt: "我想为目标岗位制定学习路线。请先问我目标、现有能力和每周可用时间，再分阶段整理知识、练习与阶段产出，标注需要进一步核实的资料。" },
];
