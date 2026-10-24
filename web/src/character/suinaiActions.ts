/** 青穗集 · 穗奈动作导演：13个可用基础动作编排40场景，统一表情时序、手形、起落与Cubism参数映射。 */
import { SUINAI_ACTION_CATALOG } from "./suinaiActionCatalog";
import { blendPose, neutralPose, samplePoseClip, smoothUnit, type ArmPose, type GestureClip, type SuinaiPose } from "./suinaiGesture";
export type SuinaiActionId = (typeof SUINAI_ACTION_CATALOG)[number]["id"];
export type SuinaiAction = (typeof SUINAI_ACTION_CATALOG)[number];
export type GestureId = "G01" | "G02" | "G03" | "G04" | "G05" | "G06" | "G07" | "G08" | "G09" | "G10" | "G11" | "G12" | "G14";
export type HandShape = "H01" | "H02" | "H03" | "H04" | "H05" | "H06";
export type ExpressionId = "E01" | "E02" | "E03" | "E04" | "E05" | "E06" | "E07" | "E08" | "E09" | "E10" | "E11" | "E12";
export const SUINAI_ACTIONS: readonly SuinaiAction[] = SUINAI_ACTION_CATALOG;
export const ACTION_BY_ID = Object.fromEntries(SUINAI_ACTIONS.map(action => [action.id, action])) as Record<SuinaiActionId, SuinaiAction>;
export const ACTION_CATEGORIES = [...new Set(SUINAI_ACTIONS.map(action => action.category))];
export const ACTION_SHOWCASE: SuinaiActionId[] = ["A01", "A03", "A09", "A11", "A16", "A24", "A28", "A29"];
export const EXPRESSION_SPECS: Record<ExpressionId, { label: string; brow: string; mouth: string; softness: number; closure?: "smile" | "closed" }> = {
  E01: { label: "平静陪伴", brow: "B01", mouth: "M01", softness: 0 },
  E02: { label: "温柔微笑", brow: "B01", mouth: "M02", softness: .05 },
  E03: { label: "专注倾听", brow: "B02", mouth: "M01", softness: 0 },
  E04: { label: "思考斟酌", brow: "B03", mouth: "M07", softness: .03 },
  E05: { label: "清楚讲解", brow: "B02", mouth: "M02", softness: 0 },
  E06: { label: "开心认可", brow: "B04", mouth: "M03", softness: .02, closure: "smile" },
  E07: { label: "坚定鼓励", brow: "B04", mouth: "M02", softness: .04 },
  E08: { label: "温和关切", brow: "B05", mouth: "M06", softness: .06 },
  E09: { label: "询问确认", brow: "B06", mouth: "M02", softness: 0 },
  E10: { label: "轻度惊喜", brow: "B04", mouth: "M04", softness: 0 },
  E11: { label: "安心释然", brow: "B01", mouth: "M02", softness: .03, closure: "closed" },
  E12: { label: "集中检查", brow: "B02", mouth: "M07", softness: .02 },
};
const LINES: Record<SuinaiActionId, string> = {
  A01: "你来啦。今天想先整理经历，还是看看适合的方向？", A02: "我在这里。不用急着把所有事都想清楚。",
  A03: "慢慢说，我在认真听。", A04: "嗯，我理解你的意思了。", A05: "如果愿意，可以再说说你当时做了什么。",
  A06: "这两个方向里，你更想先了解哪一个？", A07: "暂时没有方向也没关系，我们先把问题拆小一点。",
  A08: "先认识你，再找方向，最后把下一步变得具体。", A09: "我会把你提供的经历和偏好放在一起整理。",
  A10: "先梳理这段经历：你负责了什么，又带来了哪些变化？", A11: "画像整理好了。我们一起看看，有没有哪里需要修正。",
  A12: "这一项我还不能确定，想先和你核对一下。", A13: "收到，这一项以你确认的内容为准。",
  A14: "我在对照你的经历、兴趣和岗位要求。", A15: "这几个岗位值得优先看看，我会说明推荐的依据。",
  A16: "先比较工作内容，再看看要求和你的偏好。", A17: "这里有一处差距，但它不等于你不适合这个方向。",
  A18: "也可以先看看这个备选方向，不用立刻做决定。", A19: "我们先补这个知识点，它会影响后面的练习。",
  A20: "先理解核心概念，再用一个例子把它讲清楚。", A21: "要不要先做一道小题，看看哪些地方已经掌握了？",
  A22: "你可以按自己的节奏想一想，我等你。", A23: "这次思路对了，你抓住了关键。",
  A24: "这一题没答对也没关系，我们一起看看卡在哪里。", A25: "给你一个提示：先从题目里的这个条件入手。",
  A26: "把路线分成三个阶段，每一段都留一个可验证的小目标。", A27: "今天先完成这一小步就好。",
  A28: "这个里程碑完成了。你做的努力，已经变成了进展。", A29: "今天就先到这里。把这一步记下来，我们下次接着走。",
  A30: "简历文件收到了。我会先确认其中的信息，不擅自改写事实。", A31: "我在检查经历描述、结构和岗位匹配程度。",
  A32: "这句话还可以更具体：你的贡献是什么，有没有可核实的结果？", A33: "可以从结构、表达和重点三个方面来优化。",
  A34: "先选信息层次清楚、适合目标岗位的模板。", A35: "我会根据你确认过的经历来组织简历，不补造数字。",
  A36: "文件导出成功。下载后再核对一次联系方式和排版。", A37: "请先检查一下。你确认后，我再继续下一步。",
  A38: "目前还在处理中，不需要重复提交。", A39: "这一步没完成。我会说明原因，再看看怎么继续。",
  A40: "已经恢复了。我们可以从刚才那一步继续。",
};
export const actionLine = (id: SuinaiActionId): string => LINES[id];
const arm = (shoulder = 0, elbow = 0, wrist = 0): ArmPose => ({ shoulder, elbow, wrist });
const pose = (value: Partial<SuinaiPose> = {}): SuinaiPose => ({ ...neutralPose(), ...value });
const k = (at: number, value: Partial<SuinaiPose> = {}) => ({ at, pose: pose(value) });
const clip = (...frames: ReturnType<typeof k>[]): GestureClip => ({ duration: 1, frames });
// Normalized timelines include anticipation, an intelligible held beat, and a relaxed exit.
const BASE_GESTURES: Record<Exclude<GestureId, "G10">, GestureClip> = {
  G01: clip(k(0), k(1)),
  G02: clip(k(0), k(.09, { head: -1, left: arm(-2, -12) }),
    k(.27, { body: -1, head: 3, lift: -2, left: arm(-9, -148, -6) }),
    k(.36, { body: -1, head: 3, left: arm(-9, -146, 13) }),
    k(.46, { body: -1, head: 2.5, left: arm(-9, -148, -12) }),
    k(.56, { body: -1, head: 3, left: arm(-9, -146, 12) }),
    k(.65, { body: -.8, head: 2, left: arm(-9, -148, -7) }), k(.76, { head: 1, left: arm(-6, -114) }), k(1)),
  G03: clip(k(0), k(.18, { head: -1, nod: -1.5 }), k(.39, { head: 1.1, nod: 9, lift: 2 }),
    k(.57, { head: -.7, nod: -1.2 }), k(.72, { head: .4, nod: 1.5 }), k(1)),
  G04: clip(k(0), k(.3, { body: -1, head: 5, right: arm(2, -88, 3) }),
    k(.5, { body: -1, head: 5, nod: 5, right: arm(2, -94, 4) }),
    k(.65, { body: -.8, head: 5, right: arm(2, -88, 3) }), k(1)),
  G05: clip(k(0), k(.13, { head: -1, gazeX: 1, gazeY: -.6, right: arm(1, -30) }),
    k(.34, { body: 1, head: -5, gazeX: 2.5, gazeY: -1.4, right: arm(-8, -162, 2) }),
    k(.58, { body: 1, head: -5, nod: 2, gazeX: 2.5, gazeY: -1.4, right: arm(-8, -165, 2) }),
    k(.72, { body: .5, head: -2, gazeX: .4, right: arm(-5, -154) }), k(1)),
  G06: clip(k(0), k(.16, { head: -.5, left: arm(-3, -25) }),
    k(.35, { body: -1, head: 2, gazeX: 1.2, left: arm(-11, -94, 6), right: arm(1, -15) }),
    k(.53, { body: -1, head: 2, nod: 4, left: arm(-11, -101, 10), right: arm(1, -15) }),
    k(.72, { head: 1, left: arm(-10, -90, -2), right: arm(1, -12) }), k(1)),
  G07: clip(k(0), k(.15, { right: arm(3, 22) }),
    k(.37, { body: .7, head: -3.5, gazeX: -1, right: arm(10, 88, -6) }),
    k(.55, { body: .7, head: -3.5, nod: 2, right: arm(10, 96, -2) }),
    k(.73, { body: .7, head: -3.5, right: arm(10, 88, -6) }), k(1)),
  G08: clip(k(0), k(.12, { lift: 1, left: arm(-2, -12), right: arm(2, 12) }),
    k(.36, { head: -1.5, lift: -5, left: arm(-12, -108, -6), right: arm(12, 108, 6) }),
    k(.52, { head: 2, nod: 3, lift: -3, left: arm(-14, -116, 4), right: arm(14, 116, -4) }),
    k(.69, { head: 0, lift: -1, left: arm(-10, -99), right: arm(10, 99) }), k(1)),
  G09: clip(k(0), k(.16, { head: 1, right: arm(3, 23) }),
    k(.37, { body: .7, head: -2, gazeX: -2.3, right: arm(11, 112, -5) }),
    k(.58, { body: .7, head: -2, nod: 2, gazeX: -2.3, right: arm(11, 114, -3) }),
    k(.72, { head: -1, gazeX: 0, right: arm(8, 101) }), k(1)),
  G11: clip(k(0), k(.27, { body: -1.2, head: 3.5, nod: 3, right: arm(3, -74, 3), left: arm(-1, -8) }),
    k(.5, { body: -1.6, head: 3.5, nod: 6, right: arm(3, -86, 4), left: arm(-1, -8) }),
    k(.7, { body: -1.2, head: 2, nod: 2, right: arm(3, -78), left: arm(-1, -6) }), k(1)),
  G12: clip(k(0), k(.13, { nod: 1.5, lift: 2, left: arm(-2, -20) }),
    k(.34, { body: -.6, head: 1.5, lift: -4, left: arm(-6, -134, -3) }),
    k(.48, { body: -.6, head: 1.5, nod: 4, lift: -6, left: arm(-6, -143, 3) }),
    k(.63, { head: .5, left: arm(-5, -130) }), k(1)),
  G14: clip(k(0), k(.2, { head: .5, nod: -2 }), k(.45, { head: 1.5, nod: 8, lift: 2 }),
    k(.62, { head: 1, nod: 4 }), k(.83, { head: .4, nod: 1 }), k(1)),
};
function explanationClip(action: SuinaiAction): GestureClip {
  const count = action.id === "A26" ? 3 : 2, both = action.rightHand !== "H01";
  const frames = [k(0), k(.12, { head: -.7, left: arm(-2, -16) })];
  for (let index = 0; index < count; index++) {
    const at = .26 + index * (.43 / (count - 1)), right = both && index % 2 === 1;
    frames.push(k(at, { head: right ? -2 : 2, gazeX: right ? -2 : 2, nod: index % 2 ? 3 : 0,
      left: right ? arm(-2, -14) : arm(-10, -106, -2), right: right ? arm(10, 106, 2) : arm(2, -14) }));
    if (index < count - 1) frames.push(k(at + .09, { head: 0, left: arm(-4, -65), right: arm(2, both ? 60 : -14) }));
  }
  frames.push(k(.83, { head: .6, left: arm(-5, -70), right: arm(2, both ? 45 : -10) }), k(1));
  return clip(...frames);
}
export interface ActionFrame {
  pose: SuinaiPose; expression: ExpressionId; expressionWeight: number;
  closure: number; closedStyle: "smile" | "closed"; leftHand: HandShape; rightHand: HandShape;
  blush: number; phase: "准备" | "进入" | "回应" | "收回" | "保持" | "完成";
}
const envelope = (t: number) => smoothUnit(t / .2) * (1 - smoothUnit((t - .76) / .24));
function clampTime(seconds: number, duration: number): number {
  return Math.max(0, Math.min(duration, Number.isFinite(seconds) ? seconds : 0));
}
export function sampleAction(id: SuinaiActionId, seconds: number): ActionFrame {
  const action = ACTION_BY_ID[id], t = clampTime(seconds, action.durationSec) / action.durationSec;
  const holds = action.playback === "enter_then_hold", quiet = action.playback === "quiet_loop";
  const u = holds ? Math.min(.55, t * .75) : t;
  const weight = quiet ? 0 : holds ? smoothUnit(t / .3) : envelope(t);
  let result = samplePoseClip(action.gesture === "G10" ? explanationClip(action) : BASE_GESTURES[action.gesture], u);
  // Scene-specific acting: comparing, scanning and failure must not be identical renamed clips.
  if (["A14", "A31", "A35", "A10"].includes(id)) {
    result = { ...result, gazeX: weight * (id === "A14" ? 1.4 : -1.4), gazeY: weight * 1.7, head: result.head * .72 };
  }
  if (id === "A09") result = { ...result, gazeX: result.gazeX * -.8 };
  if (["A17", "A32", "A19"].includes(id)) result = { ...result, gazeY: weight * 1.3, nod: result.nod + weight * 2 };
  if (id === "A25") result = { ...result, head: result.head - weight * 2, gazeY: -weight * .5 };
  if (id === "A12") result = { ...result, head: result.head * 1.7, right: { ...result.right, elbow: result.right.elbow * .84 } };
  if (id === "A18") result = { ...result, gazeX: -weight * 2.7, head: result.head * 1.2 };
  if (id === "A22") result = { ...result, head: result.head * .7, right: { ...result.right, elbow: result.right.elbow * .75 } };
  if (id === "A30") result = { ...result, gazeY: weight * 1.5, nod: result.nod * .65 };
  if (id === "A38") result = { ...result, head: result.head * -.65, nod: result.nod * .4 };
  if (id === "A39") result = { ...result, head: result.head * .55, nod: weight * 5, lift: weight * 2,
    right: { ...result.right, elbow: result.right.elbow * .55 } };
  if (id === "A40") result = { ...result, right: arm(2 * weight, -91 * weight, 2 * weight) };
  if (id === "A28") result = { ...result, right: arm(-result.left.shoulder, -result.left.elbow, -result.left.wrist), nod: result.nod * 1.2 };
  if (id === "A23") result = { ...result, lift: result.lift * .6 };
  if (t === 1 && !holds) result = neutralPose();
  const expression = action.expression as ExpressionId;
  const closedWindow = smoothUnit((u - .27) / .09) * (1 - smoothUnit((u - .57) / .12));
  const handWindow = u > .055 && (holds || u < .96);
  return { pose: result, expression, expressionWeight: weight,
    closure: EXPRESSION_SPECS[expression].closure ? closedWindow : 0,
    closedStyle: EXPRESSION_SPECS[expression].closure ?? "closed",
    leftHand: handWindow ? action.leftHand as HandShape : "H01", rightHand: handWindow ? action.rightHand as HandShape : "H01",
    blush: expression === "E06" ? weight * .2 : 0,
    phase: t === 1 ? holds ? "保持" : "完成" : t < .08 ? "准备" : t < .27 ? "进入" : t < .74 || holds ? "回应" : "收回" };
}
export const actionDuration = (id: SuinaiActionId) => ACTION_BY_ID[id].durationSec;
export function blendActionPose(previous: SuinaiPose, frame: ActionFrame, elapsed: number): ActionFrame {
  return { ...frame, pose: blendPose(previous, frame.pose, smoothUnit(elapsed / .32)) };
}
export interface ActionSignals {
  error?: boolean; running?: boolean; awaitingConfirmation?: boolean; composing?: boolean;
  verifiedCompletion?: "profile" | "export" | "milestone"; domain?: "profile" | "jobs" | "learning" | "route" | "resume";
}
/** Only confirmed state signals select a success reaction; text content alone is never evidence. */
export function actionForSignals(signals: ActionSignals): SuinaiActionId {
  if (signals.error) return "A39";
  if (signals.awaitingConfirmation) return "A37";
  if (signals.running) return signals.domain === "resume" ? "A31" : signals.domain === "jobs" ? "A14" : "A09";
  if (signals.verifiedCompletion) return { profile: "A11", export: "A36", milestone: "A28" }[signals.verifiedCompletion] as SuinaiActionId;
  return signals.composing ? "A03" : "A02";
}
