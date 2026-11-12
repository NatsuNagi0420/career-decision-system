/** 青穗集 · 入门引导公开契约：只记录教学进度，不创建对话、画像或模型任务。 */
export const ONBOARDING_VERSION = 1 as const;
// 保留原三步顺序；两端共用步骤上限，扩展特色介绍时不会提前完成或丢失进度。
export const ONBOARDING_STEP_IDS = ["chat", "upload", "workbench", "learning", "resume", "memory"] as const;
export const ONBOARDING_LAST_STEP = ONBOARDING_STEP_IDS.length - 1;
export type OnboardingStatus = "pending" | "completed" | "skipped" | "legacy";
export interface OnboardingState {
  version: typeof ONBOARDING_VERSION;
  status: OnboardingStatus;
  step: number;
  updated_at: string | null;
}
export interface OnboardingUpdate {
  status: Exclude<OnboardingStatus, "legacy">;
  step: number;
}
