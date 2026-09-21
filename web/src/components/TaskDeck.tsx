import { useRef, useState, type CSSProperties } from "react";
import { api, newRequestId, type TaskEntry } from "../api/client";
import { Ms } from "./Ms";

interface Props {
  tasks: TaskEntry[];
  onSubmitted: (runId: string | null) => void;
}

/**
 * The action layer made visible: what 穗奈 asked the person to go do, and what came
 * back. A plan that lives only inside an artifact JSON is a screenshot of advice —
 * this is the surface where a task can actually be discharged, and the words typed
 * here are the same words an evidence row will later quote.
 */
export function TaskDeck({ tasks, onSubmitted }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** One id per task, kept for the life of this deck: retrying the same click is one
   *  statement, so it must carry the same id. Minting it per request would let a retry
   *  look like a second piece of evidence. */
  const requestIds = useRef<Record<string, string>>({});

  if (!tasks.length) {
    return null;
  }
  const pending = tasks.filter((task) => task.status !== "done").length;

  const submit = async (taskId: string) => {
    if (body.trim().length < 2 || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.submitTaskResult(
        taskId,
        body.trim(),
        link.trim(),
        (requestIds.current[taskId] ??= newRequestId()),
      );
      setExpanded(null);
      setBody("");
      setLink("");
      onSubmitted(outcome.run_id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tasks">
      <div className="tasks__head">
        <span className="agenthead__logo tasks__icon">
          <Ms g="checklist_rtl" size={18} />
        </span>
        <div>
          <h3 className="t-title-sm">行动清单</h3>
          <p className="t-label-sm faint">{pending ? `${pending} 项待你去做，做完把结果交回来` : "这一轮任务都已交回结果"}</p>
        </div>
      </div>

      <ul className="tasks__list">
        {tasks.map((task, index) => (
          <li
            className={`task${task.status === "done" ? " task--done" : ""}`}
            key={task.id}
            style={{ "--i": index } as CSSProperties}
          >
            <div className="task__row">
              <span className="pill pill--quiet">第 {task.week_no} 周</span>
              <span className="task__title t-body-md">{task.title}</span>
              <span className={task.status === "done" ? "pill pill--primary" : "pill pill--warn"}>
                {task.status === "done" ? "已交回" : "未交回"}
              </span>
            </div>

            {task.expected_output ? <p className="task__aim">期望产出：{task.expected_output}</p> : null}

            {task.results.length ? (
              <ul className="task__results">
                {task.results.map((result) => (
                  <li key={result.id}>
                    <blockquote className="task__quote">{result.body}</blockquote>
                    {result.link ? (
                      <a className="task__link" href={result.link} rel="noreferrer" target="_blank">
                        {result.link}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {expanded === task.id ? (
              <div className="task__form">
                <textarea
                  autoFocus
                  placeholder="实际发生了什么？写你看到的、听到的，不要写成应该怎样"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
                <input
                  placeholder="有链接就贴上（岗位 JD、聊天记录、作品页…可留空）"
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                />
                <div className="actions">
                  <button className="btn btn--primary" disabled={busy || body.trim().length < 2} onClick={() => void submit(task.id)}>
                    <Ms g="upload_file" size={18} />
                    <span>{busy ? "提交中…" : "交回结果"}</span>
                  </button>
                  <button className="btn btn--soft" disabled={busy} onClick={() => setExpanded(null)}>
                    <Ms g="close" size={18} />
                    <span>先不写</span>
                  </button>
                </div>
                {error ? <p className="tasks__error">{error}</p> : null}
              </div>
            ) : (
              <button className="btn btn--outline task__btn" onClick={() => setExpanded(task.id)}>
                <Ms g="edit_note" size={18} />
                <span>{task.results.length ? "再补一条" : "交回结果"}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
