/** 青穗集 · 回复中断提示：以穗奈口吻说明未完成，保留技术详情，续接不重新提交用户消息。 */
import { AgentIcon } from "./AgentIcon";
import { SUINAI_AVATAR_URL } from "../assets";
import type { AgentRun } from "./types";

export function failureMessage(run: AgentRun): string {
  const code = run.error_code ?? "";
  if (code === "provider_timeout" || code === "run_timeout" || /模型请求超时|任务达到时长上限/.test(run.error ?? ""))
    return "穗奈开了个小差，这次还没答完。";
  if (code === "provider_429") return "模型服务暂时繁忙，稍后再试试吧。";
  if (["provider_network", "provider_stream", "provider_408", "provider_500", "provider_502", "provider_503", "provider_504"].includes(code))
    return "穗奈刚才没接上，已经完成的操作还在。";
  if (run.status === "cancelled") return "这次已停下，已有结果保留。";
  return run.error ?? "这次没有完成，可以查看执行记录。";
}

export function RunFailure({ run, disabled = false, onRetry, onDetails }: {
  run: AgentRun;
  disabled?: boolean;
  onRetry: () => void;
  onDetails: () => void;
}) {
  return <aside className="run-recovery" role="alert" aria-label="本次回复未完成">
    <img src={SUINAI_AVATAR_URL} alt="" width={30} height={30} />
    <span>{failureMessage(run)}</span>
    <div className="run-recovery__actions">
      {run.can_retry && <button type="button" disabled={disabled} className="run-recovery__retry" onClick={onRetry} title="从当前模型步骤续接，不重复提交消息或已完成的工具"><AgentIcon name="restore" size={14} />继续回复</button>}
      <button type="button" className="agent-icon-button" aria-label="查看中断原因" title="查看中断原因" onClick={onDetails}><AgentIcon name="terminal" size={16} /></button>
    </div>
  </aside>;
}
