/** 青穗集 · 穗奈统一播放时钟：暂停不推进、拖动不混入旧姿态、单次完成只通知一次，便于迁移到Cubism。 */
import { ACTION_BY_ID, blendActionPose, sampleAction, type ActionFrame, type SuinaiActionId } from "./suinaiActions";
import type { SuinaiPose } from "./suinaiGesture";
export class SuinaiActionPlayer {
  id: SuinaiActionId;
  seconds = 0;
  private transitionAge = 0;
  private previousPose: SuinaiPose | null = null;
  private notified = false;
  constructor(id: SuinaiActionId) { this.id = id; }
  get duration(): number { return ACTION_BY_ID[this.id].durationSec; }
  get progress(): number { return this.seconds / this.duration; }
  get frame(): ActionFrame {
    const frame = sampleAction(this.id, this.seconds);
    return this.previousPose ? blendActionPose(this.previousPose, frame, this.transitionAge) : frame;
  }
  start(id: SuinaiActionId): void {
    this.previousPose = this.frame.pose; this.id = id; this.seconds = 0; this.transitionAge = 0; this.notified = false;
  }
  advance(delta: number): void {
    const step = Number.isFinite(delta) ? Math.max(0, Math.min(.05, delta)) : 0;
    this.seconds = Math.min(this.duration, this.seconds + step); this.transitionAge += step;
    if (this.transitionAge >= .32) this.previousPose = null;
  }
  seek(fraction: number): void {
    this.seconds = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * this.duration;
    this.previousPose = null; this.notified = this.progress === 1;
  }
  takeCompletion(): boolean {
    if (this.progress < 1 || this.notified || ACTION_BY_ID[this.id].playback === "quiet_loop") return false;
    this.notified = true; return true;
  }
}
