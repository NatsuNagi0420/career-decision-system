export interface Failure {
  /** Chinese label for the node that gave up, or null when we have no label for it. */
  stage: string | null;
  detail: string;
}

const STAGE_LABELS: Record<string, string> = {
  select_action: "决定下一步",
  synthesize: "整理结论",
  finalize: "收尾写入",
  budget: "想到的量超了上限",
  restart: "重启后对账",
  approval: "确认过期",
  background: "后台任务",
};

// `run.error` is written as `<stage>: <原因>` by whichever node gave up. An unlabelled
// prefix comes back verbatim: a failure we cannot name is still one the person has to see.
export function describeFailure(error: string | null | undefined): Failure | null {
  if (!error) return null;
  const hit = /^([a-z_]+):([\s\S]*)$/.exec(error);
  const label = hit ? STAGE_LABELS[hit[1]] : undefined;
  if (!hit || !label) return { stage: null, detail: error };
  return { stage: label, detail: hit[2].trim() };
}

/** The one sentence both the status ribbon and the timeline line show. */
export function formatFailure(error: string | null | undefined, fallback: string): string {
  const failure = describeFailure(error);
  if (!failure) return fallback;
  return failure.stage ? `失败在「${failure.stage}」：${failure.detail}` : failure.detail;
}
