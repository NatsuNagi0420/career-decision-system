/** 青穗集 · 语音输入：录音权限流与识别占位，识别接口就绪后按帧上传。 */
import { apiUrl } from "./api";

const MAX_DURATION_MS = 60000;
const MIN_DURATION_MS = 600;

export interface VoiceRecognition {
  text: string;
}

function recorder(): UniApp.RecorderManager | null {
  // #ifdef MP-WEIXIN
  return wx.getRecorderManager();
  // #endif
  return null;
}

export function voiceAvailable(): boolean {
  return Boolean(recorder());
}

function ensureRecordPermission(): Promise<boolean> {
  return new Promise(resolve => {
    uni.getSetting({
      success: result => {
        if (result.authSetting["scope.record"] === false) {
          uni.showModal({
            title: "需要麦克风权限",
            content: "穗奈需要听你说话才能整理成文字，请在设置里开启麦克风。",
            confirmText: "去设置",
            success: result => { if (result.confirm) uni.openSetting({ complete: () => resolve(false) }); else resolve(false); },
          });
          return;
        }
        resolve(true);
      },
      fail: () => resolve(true), // 拿不到授权状态时先尝试录音，失败再走 fail 分支
    });
  });
}

export interface VoiceSession {
  stop: () => void;
}

/** 开始录音；返回的 stop() 结束录音并把临时文件交给识别接口（占位）。 */
export async function startVoiceInput(onResult: (result: VoiceRecognition) => void, onError: (message: string) => void): Promise<VoiceSession | null> {
  const manager = recorder();
  if (!manager) {
    onError("当前环境不支持语音输入");
    return null;
  }
  if (!(await ensureRecordPermission())) return null;

  let settled = false;
  manager.onStart(() => undefined);
  manager.onError(() => {
    if (settled) return;
    settled = true;
    onError("录音没有成功，再试一次吧");
  });
  manager.onStop(async result => {
    if (settled) return;
    settled = true;
    if (result.duration < MIN_DURATION_MS) {
      onError("说话时间太短了");
      return;
    }
    try {
      const recognized = await recognizeVoice(result.tempFilePath, result.duration);
      if (!recognized.text.trim()) onError("没有听清你说的话");
      else onResult({ text: recognized.text });
    } catch {
      onError("语音识别还没就绪，先打字告诉穗奈吧");
    }
  });

  manager.start({
    duration: MAX_DURATION_MS,
    format: "mp3",
    sampleRate: 16000,
    numberOfChannels: 1,
    encodeBitRate: 48000,
  });

  return {
    stop: () => {
      try { manager.stop(); } catch { /* 已结束时忽略 */ }
    },
  };
}

/** 识别占位：后端 /agent/voice/transcribe 未部署时抛错，UI 走"识别未就绪"提示。 */
async function recognizeVoice(tempFilePath: string, _duration: number): Promise<VoiceRecognition> {
  const result = await new Promise<{ statusCode: number; data: string }>((resolve, reject) => {
    uni.uploadFile({
      url: apiUrl("/api/v1/agent/voice/transcribe"),
      filePath: tempFilePath,
      name: "audio",
      success: resolve,
      fail: reject,
    });
  });
  if (result.statusCode !== 200) throw new Error("transcribe_unavailable");
  const payload = JSON.parse(result.data) as VoiceRecognition;
  return { text: String(payload.text ?? "") };
}
