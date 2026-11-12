/** 青穗集 · 特色体验引导与浮层定位：纯函数，不操作对话、模型或用户文件。 */
import { ONBOARDING_STEP_IDS } from "../../../agent/src/onboarding-contract";
export { ONBOARDING_VERSION, ONBOARDING_LAST_STEP } from "../../../agent/src/onboarding-contract";
export type TourSide = "top" | "right" | "bottom" | "left";
export interface TourRect { x: number; y: number; width: number; height: number; }
export interface TourViewport { width: number; height: number; x?: number; y?: number; }
export function onboardingSteps(mode: "local" | "server") {
  const content: Record<typeof ONBOARDING_STEP_IDS[number], { title: string; text: string; side: TourSide }> = {
    chat: { title: "聊着聊着，更了解你", text: "告诉我做过的事和现在的困惑。我会从聊天中整理经历、能力和偏好，逐步形成你的职业画像；重要更新会请你确认。", side: "top" },
    upload: { title: "让真实经历，成为你的底气", text: mode === "server" ? "点回形针导入文字版 PDF、DOCX 或项目介绍，我会结合材料梳理你的经历。缺少的信息会再问你，不替你编造。" : "点回形针导入旧简历或项目资料；旁边的文件夹还能绑定本机项目，结合代码梳理项目经历。缺少的信息会再问你，不替你编造。", side: "top" },
    workbench: { title: "推荐岗位，也说清为什么", text: "在工作台查看岗位库里的推荐，把岗位要求与你的经历逐项对照。查看详情、收藏感兴趣的岗位，再决定自己的方向。", side: "right" },
    learning: { title: "知道差在哪，也知道怎么学", text: "选择「定学习计划」，把目标岗位需要的知识拆成具体练习和成长行动。回来说说进展，我们再一起调整下一步。", side: "top" },
    resume: { title: "简历，在你眼前一点点写好", text: "选择「写／改简历」，聊着整理经历，右侧就能预览制作过程与排版。支持切换模板、框选一处提出修改，再导出简历。", side: "top" },
    memory: { title: "聊过的重点，下次还能接着说", text: "打开「穗奈·忆迹场」，在三维星云中查看我记住的经历、目标和偏好。你可以纠正或删除记忆，决定让我记住什么。", side: "right" },
  };
  return ONBOARDING_STEP_IDS.map(id => ({ id, ...content[id] }));
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
export function clipTourTarget(rect: TourRect, viewport: TourViewport): TourRect | null {
  const vx = viewport.x ?? 0, vy = viewport.y ?? 0;
  const x = Math.max(vx + 6, rect.x - 7), y = Math.max(vy + 6, rect.y - 7);
  const right = Math.min(vx + viewport.width - 6, rect.x + rect.width + 7), bottom = Math.min(vy + viewport.height - 6, rect.y + rect.height + 7);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
export function placeTourPanel(target: TourRect | null, viewport: TourViewport, size: { width: number; height: number }, preferred: TourSide) {
  const vx = viewport.x ?? 0, vy = viewport.y ?? 0, margin = 12, gap = 20;
  const width = Math.min(size.width, viewport.width - margin * 2), height = Math.min(size.height, viewport.height - margin * 2);
  if (!target) return { x: vx + (viewport.width - width) / 2, y: vy + (viewport.height - height) / 2, side: null, arrow: 0 };
  const cx = target.x + target.width / 2, cy = target.y + target.height / 2;
  const candidates: Record<TourSide, { x: number; y: number }> = {
    top: { x: clamp(cx - width / 2, vx + margin, vx + viewport.width - width - margin), y: target.y - height - gap },
    bottom: { x: clamp(cx - width / 2, vx + margin, vx + viewport.width - width - margin), y: target.y + target.height + gap },
    right: { x: target.x + target.width + gap, y: clamp(cy - height / 2, vy + margin, vy + viewport.height - height - margin) },
    left: { x: target.x - width - gap, y: clamp(cy - height / 2, vy + margin, vy + viewport.height - height - margin) },
  };
  const order: TourSide[] = [...new Set<TourSide>([preferred, "top", "bottom", "right", "left"])];
  for (const side of order) {
    const point = candidates[side];
    if (point.x >= vx + margin && point.y >= vy + margin && point.x + width <= vx + viewport.width - margin && point.y + height <= vy + viewport.height - margin) {
      return { ...point, side, arrow: clamp(side === "top" || side === "bottom" ? cx - point.x : cy - point.y, 34, (side === "top" || side === "bottom" ? width : height) - 34) };
    }
  }
  // 极窄或横屏设备放到可见区域，不让说明框跑到屏幕外。
  return { x: clamp(cx - width / 2, vx + margin, vx + viewport.width - width - margin), y: clamp(target.y - height - gap, vy + margin, vy + viewport.height - height - margin), side: null, arrow: 0 };
}
export function onboardingCacheKey(userId: number, mode: "local" | "server") { return `suinai.onboarding.v1.${mode}.${userId}`; }
