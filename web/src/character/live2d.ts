/** 青穗集 · Live2D 交互契约：用确定的任务状态驱动表情，动画不是业务成功的证据。 */
import { assetUrl } from "../assets";
export const LIVE2D_PRESETS = {
  idle: { label: "自然待机", hint: "轻微呼吸、眨眼，保持安静的陪伴。", params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamEyeBallX: 0, ParamEyeBallY: 0, ParamMouthForm: .15 } },
  listening: { label: "认真倾听", hint: "用户正在输入；不发送、不保存，也不调用模型。", params: { ParamAngleX: -3, ParamAngleY: 2, ParamAngleZ: 3, ParamEyeBallX: 0, ParamEyeBallY: .1, ParamMouthForm: .2 } },
  thinking: { label: "分析思考", hint: "只有实际运行中的任务，才进入分析状态。", params: { ParamAngleX: -7, ParamAngleY: -4, ParamAngleZ: -3, ParamEyeBallX: -.25, ParamEyeBallY: -.3, ParamBrowLY: -.15, ParamBrowRY: -.15, ParamMouthForm: -.15 } },
  explaining: { label: "解释建议", hint: "看向用户并保持自然表情；文字回复不会自动假装有语音。", params: { ParamAngleX: 3, ParamAngleY: 1, ParamAngleZ: -1, ParamEyeBallX: 0, ParamEyeBallY: 0, ParamMouthForm: .35 } },
  success: { label: "完成反馈", hint: "仅在任务或文件导出确实完成时触发。", params: { ParamAngleX: 0, ParamAngleY: 4, ParamAngleZ: -4, ParamEyeBallX: 0, ParamEyeBallY: 0, ParamMouthForm: .8, ParamEyeLSmile: .7, ParamEyeRSmile: .7, ParamBrowLY: .2, ParamBrowRY: .2, ParamTere: .25 } },
  concern: { label: "温和关切", hint: "出现错误或需要检查时温和提醒，不夸张庆祝。", params: { ParamAngleX: 2, ParamAngleY: -3, ParamAngleZ: 2, ParamEyeBallX: 0, ParamEyeBallY: -.1, ParamBrowLY: -.25, ParamBrowRY: -.25, ParamBrowLForm: -.3, ParamBrowRForm: -.3, ParamMouthForm: -.4 } },
} as const;
export type CompanionState = keyof typeof LIVE2D_PRESETS;
export type CompanionMotion = "nod" | "tilt" | "celebrate";
export const LIVE2D_MODEL = { url: assetUrl("live2d/models/Haru/Haru.model3.json"), name: "Haru / Live2D 官方示例", isPlaceholder: true } as const;
export interface CompanionSignals { error?: boolean; running?: boolean; awaitingConfirmation?: boolean; completed?: boolean; composing?: boolean; replying?: boolean }
export function companionStateFor(signals: CompanionSignals): CompanionState {
  if (signals.error) return "concern";
  if (signals.awaitingConfirmation) return "explaining";
  if (signals.running) return "thinking";
  if (signals.completed) return "success";
  if (signals.composing) return "listening";
  if (signals.replying) return "explaining";
  return "idle";
}
export function safeCompanionState(value: unknown): CompanionState {
  return typeof value === "string" && Object.hasOwn(LIVE2D_PRESETS, value) ? value as CompanionState : "idle";
}
export function clampUnit(value: number): number { return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0; }
export interface Live2DInfo { parameters: number; drawables: number; missingParameters: string[]; supportedMotions: CompanionMotion[] }
export interface Live2DController {
  setState(state: CompanionState): void;
  setPaused(paused: boolean): void;
  setPointer(x: number, y: number): void;
  setTracking(enabled: boolean): void;
  setMouth(value: number): void;
  setZoom(value: number): void;
  playMotion(motion: CompanionMotion): boolean;
  destroy(): void;
}
export interface Live2DRuntime {
  createCompanion(canvas: HTMLCanvasElement, options: { modelUrl: string; signal: AbortSignal; onFrame?: (frame: number) => void; onError?: (message: string) => void }): Promise<{ controller: Live2DController; info: Live2DInfo }>;
}


