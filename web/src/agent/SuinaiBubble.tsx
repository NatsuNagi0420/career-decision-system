/** 青穗集 · 穗奈像素气泡：明确区分意图猜测与本地轻提醒，只有点击才能启动任务或填入消息。 */
import { SUINAI_AVATAR_URL, SUINAI_SPEECH_BUBBLE_URL } from "../assets";
export function SuinaiBubble({ message, kind, actionLabel, disabled, compact = false, onAccept, onDismiss }: { message: string; kind: "intent" | "idle"; actionLabel: string; disabled: boolean; compact?: boolean; onAccept: () => void; onDismiss: () => void }) {
  return <aside className={"suinai-bubble" + (compact ? " suinai-bubble--compact" : "")} aria-label={kind === "intent" ? "穗奈的意图建议" : "穗奈的轻提醒"} aria-live="polite">
    {!compact && <img className="suinai-bubble__frame" src={SUINAI_SPEECH_BUBBLE_URL} alt="" aria-hidden="true" />}
    <div className="suinai-bubble__content"><header>{compact && <img src={SUINAI_AVATAR_URL} alt="" width={24} height={24} />}<span>{kind === "intent" ? "穗奈的小猜测" : "穗奈想说"}</span><button type="button" aria-label="收起穗奈气泡" onClick={onDismiss}>×</button></header>
      <p title={message}>{message}</p><div className="suinai-bubble__actions"><button type="button" disabled={disabled} onClick={onAccept}>{actionLabel}<span aria-hidden="true"> ↗</span></button><button type="button" onClick={onDismiss}>{kind === "intent" ? "先不用" : "先休息一会儿"}</button></div>
    </div>
  </aside>;
}
