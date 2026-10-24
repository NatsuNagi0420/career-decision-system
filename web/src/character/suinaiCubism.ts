/** 青穗集 · 穗奈Cubism迁移契约：从同一动作采样器导出真实motion3/exp3格式；参数绑定仍需原生模型制作。 */
import { ACTION_BY_ID, EXPRESSION_SPECS, sampleAction, type ActionFrame, type ExpressionId, type SuinaiActionId } from "./suinaiActions";
export interface CubismParameter { id: string; label: string; min: number; max: number; default: number; keys: number[]; binding: string }
const parameter = (id: string, label: string, min: number, max: number, initial: number, binding: string, keys = [min, initial, max]): CubismParameter => ({ id, label, min, max, default: initial, keys: [...new Set(keys)].sort((a, b) => a - b), binding });
export const SUINAI_CUBISM_PARAMETERS: CubismParameter[] = [
  parameter("ParamAngleY", "点头", -10, 10, 0, "整头变形器：轻微俯仰，脸、五官、眼镜与头发同步"),
  parameter("ParamAngleZ", "侧头", -10, 10, 0, "整头旋转变形器：锚点(756,236)，不要单独移动脸底内的头发"),
  parameter("ParamBodyAngleZ", "身体倾斜", -3, 3, 0, "整个人物父旋转变形器"),
  parameter("ParamBodyY", "身体起落", -10, 10, 0, "身体父变形器垂直位移；负值向上"),
  parameter("ParamEyeBallX", "同向视线X", -1, 1, 0, "两眼中性瞳孔共用值，左右最大约3.2原画像素，裁剪到眼白遮罩"),
  parameter("ParamEyeBallY", "同向视线Y", -1, 1, 0, "正值向上，两眼最大约2.5原画像素，裁剪到眼白遮罩"),
  ...["L", "R"].flatMap(side => [
    parameter(`ParamEye${side}Open`, `${side}眼开合`, 0, 1, 1, "闭眼用V04/V05轮廓，中间关键形修眼睑；不要只缩放整块眼图", [0, .35, .7, 1]),
    parameter(`ParamEye${side}Smile`, `${side}眼笑眼`, 0, 1, 0, "仅在闭合区间将V04切换为V05笑眼", [0, 1]),
    parameter(`ParamBrow${side}Y`, `${side}眉高`, -1, 1, 0, "参考B01-B06形态，眉毛独立网格变形"),
    parameter(`ParamBrow${side}Form`, `${side}眉形`, -1, 1, 0, "负为温和关切，正为专注；避免过度皱眉"),
  ]),
  parameter("ParamMouthForm", "闭口嘴形", -1, 1, 0, "参考M01/M02/M03/M06/M07画出关键形；以M01为静止默认"),
  parameter("ParamMouthOpenY", "嘴部开合", 0, 1, 0, "M04/M05作小中开口，文本不循环口型；不代表音素绑定", [0, .25, .6, 1]),
  ...["L", "R"].flatMap(side => [
    parameter(`ParamArm${side}Shoulder`, `${side}肩`, -20, 20, 0, "袖子根部固定，向肘部渐变；不要让肩缝漂浮"),
    parameter(`ParamArm${side}Elbow`, `${side}肘`, -165, 165, 0, "连续网格/弯曲变形器，保留肘部体积", [-165, -110, -55, 0, 55, 110, 165]),
    parameter(`ParamArm${side}Wrist`, `${side}腕`, -16, 16, 0, "腕和手掌共用连续形变，不独立刚性旋转切片", [-16, 0, 16]),
    parameter(`ParamHand${side}`, `${side}手形`, 1, 6, 1, "H01放松/H02招手/H03托示/H04提示/H05思考/H06轻拳；用不透明度切换", [1, 2, 3, 4, 5, 6]),
  ]),
  parameter("ParamTere", "轻微脸红", 0, 1, 0, "X01不透明度；实际场景最大约0.2", [0, 1]),
];
const EXPRESSION_VALUES: Record<ExpressionId, [number, number, number, number, number, number]> = {
  // brow-left-Y, brow-right-Y, brow-left-form, brow-right-form, mouth-form, mouth-open
  E01: [0, 0, 0, 0, 0, 0], E02: [0, 0, 0, 0, .3, 0], E03: [-.08, -.08, .2, .2, 0, 0],
  E04: [.12, -.05, -.2, .1, -.22, 0], E05: [-.04, -.04, .15, .15, .3, 0], E06: [.15, .15, .25, .25, .85, 0],
  E07: [.08, .08, .25, .25, .45, 0], E08: [.2, .2, -.5, -.5, -.35, 0], E09: [.25, -.05, .2, 0, .3, 0],
  E10: [.25, .25, .25, .25, .2, .2], E11: [0, 0, 0, 0, .3, 0], E12: [-.12, -.12, .25, .25, -.22, 0],
};
function expressionParameters(id: ExpressionId, weight: number): Record<string, number> {
  return Object.fromEntries(["ParamBrowLY", "ParamBrowRY", "ParamBrowLForm", "ParamBrowRForm", "ParamMouthForm", "ParamMouthOpenY"].map((name, index) => [name, EXPRESSION_VALUES[id][index] * weight]));
}
export function cubismParametersForFrame(frame: ActionFrame): Record<string, number> {
  const { pose } = frame, eyeOpen = (1 - frame.closure) * (1 - EXPRESSION_SPECS[frame.expression].softness * frame.expressionWeight);
  const values: Record<string, number> = {
    ParamAngleY: -pose.nod * .8, ParamAngleZ: pose.head, ParamBodyAngleZ: pose.body, ParamBodyY: pose.lift,
    ParamEyeBallX: pose.gazeX / 3.2, ParamEyeBallY: -pose.gazeY / 2.5,
    ParamEyeLOpen: eyeOpen, ParamEyeROpen: eyeOpen,
    ParamEyeLSmile: frame.closedStyle === "smile" ? frame.closure : 0, ParamEyeRSmile: frame.closedStyle === "smile" ? frame.closure : 0,
    ParamArmLShoulder: pose.left.shoulder, ParamArmLElbow: pose.left.elbow, ParamArmLWrist: pose.left.wrist,
    ParamArmRShoulder: pose.right.shoulder, ParamArmRElbow: pose.right.elbow, ParamArmRWrist: pose.right.wrist,
    ParamHandL: Number(frame.leftHand.slice(1)), ParamHandR: Number(frame.rightHand.slice(1)), ParamTere: frame.blush,
    ...expressionParameters(frame.expression, frame.expressionWeight),
  };
  return Object.fromEntries(SUINAI_CUBISM_PARAMETERS.map(definition => [definition.id, Number(Math.max(definition.min, Math.min(definition.max, values[definition.id])).toFixed(5))]));
}
export function makeCubismMotion(id: SuinaiActionId) {
  const action = ACTION_BY_ID[id], count = Math.ceil(action.durationSec * 30);
  const samples = Array.from({ length: count + 1 }, (_, index) => {
    const seconds = index * action.durationSec / count;
    return { time: Number(seconds.toFixed(6)), values: cubismParametersForFrame(sampleAction(id, seconds)) };
  });
  let totalSegments = 0, totalPoints = 0;
  const curves = SUINAI_CUBISM_PARAMETERS.map(parameter => {
    const stepped = parameter.id === "ParamHandL" || parameter.id === "ParamHandR";
    const points = samples.filter((sample, index) => !stepped || index === 0 || index === count || sample.values[parameter.id] !== samples[index - 1].values[parameter.id]);
    totalSegments += points.length - 1; totalPoints += points.length;
    return { Target: "Parameter", Id: parameter.id, FadeInTime: .2, FadeOutTime: .25,
      Segments: points.flatMap((point, index) => index === 0 ? [point.time, point.values[parameter.id]] : [stepped ? 2 : 0, point.time, point.values[parameter.id]]) };
  });
  return { Version: 3, Meta: { Duration: action.durationSec, Fps: 30, Loop: action.playback === "quiet_loop", AreBeziersRestricted: true, CurveCount: curves.length, TotalSegmentCount: totalSegments, TotalPointCount: totalPoints, UserDataCount: 0, TotalUserDataSize: 0 }, Curves: curves };
}
export function makeCubismExpression(id: ExpressionId) {
  const values = { ...expressionParameters(id, 1), ParamTere: id === "E06" ? .2 : 0 };
  return { Type: "Live2D Expression", FadeInTime: .25, FadeOutTime: .3, Parameters: Object.entries(values).map(([Id, Value]) => ({ Id, Value, Blend: "Overwrite" })) };
}
