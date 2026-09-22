/**
 * Turning tool payloads into something a person can read, without losing the audit
 * trail.
 *
 * §6.4 requires verbatim quotes, and the model obeys it literally — measured in the
 * first real run it quoted `{"count": 2, "runs": [...]}` at a student as if that were
 * a sentence. Refusing the raw payload would break the evidence contract; showing it
 * as the quote breaks the page. So: render a readable rendering, keep the original
 * one click away.
 */

export interface ReadableQuote {
  text: string;
  /** Non-null when the verbatim source is structured data that needs folding. */
  raw: string | null;
}

const READABLE_KEYS = [
  "title",
  "name",
  "statement",
  "body",
  "quote",
  "summary",
  "description",
  "text",
  "content",
  "detail",
  "conclusion",
  "question",
  "responsibilities",
  "requirement",
];

export function parseStructured(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function readableQuote(text: string): ReadableQuote {
  const parsed = parseStructured(text);
  if (parsed === null) {
    return { text, raw: null };
  }
  if (isEmptyResult(parsed)) {
    // "返回为空" is the fact the agent is citing here; describing it as an
    // unrenderable blob hides the one thing that made the conclusion provisional.
    return { text: "工具返回为空，没有任何条目", raw: text.trim() };
  }
  return { text: summarise(parsed) || "一段结构化结果，没有可直接展示的文字，原样附在下面", raw: text.trim() };
}

function isEmptyResult(parsed: unknown): boolean {
  if (Array.isArray(parsed)) {
    return parsed.length === 0;
  }
  if (parsed && typeof parsed === "object") {
    const values = Object.values(parsed as Record<string, unknown>);
    return values.length === 0 || values.every(isEmptyResult);
  }
  return false;
}

function summarise(value: unknown, depth = 0): string {
  if (typeof value === "string") {
    return depth === 0 ? value.trim() : "";
  }
  if (Array.isArray(value)) {
    if (depth > 2) {
      return "";
    }
    const parts = value.map((entry) => summarise(entry, depth + 1)).filter(Boolean);
    return parts.slice(0, 3).join("；") + (parts.length > 3 ? `；等 ${parts.length} 条` : "");
  }
  if (value && typeof value === "object") {
    if (depth > 2) {
      return "";
    }
    const record = value as Record<string, unknown>;
    // Only named, human-meaningful fields are surfaced. Printing arbitrary values
    // because they happened to be strings is how a run id ends up as prose.
    const picked = dedupe(
      READABLE_KEYS.map((key) => record[key])
        .map((entry) => (typeof entry === "string" ? entry.trim() : summarise(entry, depth + 1)))
        .filter(Boolean),
    );
    if (picked.length) {
      return picked.slice(0, 3).join(" / ");
    }
    const nested = dedupe(
      Object.values(record)
        .filter((entry) => typeof entry === "object" && entry !== null)
        .map((entry) => summarise(entry, depth + 1))
        .filter(Boolean),
    );
    return nested.slice(0, 3).join(" / ");
  }
  return "";
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * A `source_refs` entry that names the actual row a tool read.
 *
 * The server already verifies these (`_attribute_quotes` binds each quoted sentence to
 * a row) and already ships them to this file's caller, but both reading surfaces showed
 * only a count — "3 条来源" is a number the user has to trust, and `evidence_basis[].source`
 * is a word the *model* chose. §目标二 asks for the former to be checkable, so this is
 * the one place that turns a table name into something a student can go and look up.
 */
export interface SourcePointer {
  table: string;
  label: string;
  id: string;
}

/** Which run and which tool: bookkeeping every 成果物 carries, not a piece of data. */
const LEDGER_TABLES = new Set(["agent_runs", "tool"]);

const TABLE_LABELS: Record<string, string> = {
  jobs: "岗位样本",
  job_requirement_items: "岗位要求条目",
  career_directions: "职业方向",
  profile_facts: "我的经历事实",
  evidence_items: "证据条目",
  task_results: "我提交的结果",
  decision_candidates: "候选方向",
  decision_projects: "决策项目",
  action_plans: "行动计划",
  plan_tasks: "计划任务",
  weekly_reviews: "周复盘",
  comparison_results: "比较结果",
  artifacts: "成果物",
};

export function rowPointers(refs: Array<Record<string, unknown>>): SourcePointer[] {
  const seen = new Set<string>();
  const rows: SourcePointer[] = [];
  for (const entry of refs) {
    const table = String(entry.table ?? "");
    const id = String(entry.id ?? "");
    if (!table || !id || LEDGER_TABLES.has(table) || seen.has(`${table}#${id}`)) {
      continue;
    }
    seen.add(`${table}#${id}`);
    // An unlabelled table still shows its own name: hiding a pointer we haven't named
    // yet would re-create "值在、没人读" the first time a tool reads a new table.
    rows.push({ table, id, label: TABLE_LABELS[table] ?? table });
  }
  return rows;
}

/** What a job seeker reads: which kinds of rows, and how many. Never an identifier —
 *  these ids are 32-char hex, and printing them turned the honesty feature into noise.
 *  The full pointer stays available through pointerDetail() (hover / researcher mode). */
export function pointerSummary(refs: Array<Record<string, unknown>>): string {
  const counts = new Map<string, number>();
  for (const row of rowPointers(refs)) {
    counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  }
  return [...counts].map(([label, n]) => `${label} ${n} 条`).join(" · ");
}

/** The same pointers with their ids, for the attribute a researcher can open. */
export function pointerDetail(refs: Array<Record<string, unknown>>): string {
  return rowPointers(refs)
    .map((row) => `${row.table}#${row.id}`)
    .join(" ");
}

/**
 * The run-header pill. A finished run says nothing about provenance, so this must never
 * read a percentage off `run.status` — the shell used to print "100% 证据可溯源" for any
 * completed run, which is a made-up number in the one place the product promises evidence.
 * Only a 成果物's own measured coverage may appear as a percent; otherwise say what is
 * actually known (how many sentences were checked against source text) and name the gap.
 */
export function evidencePill(input: { coverage: number | null; quotes: number; provisional: boolean }): string {
  const tail = input.provisional ? " · 临时结论" : "";
  if (!input.quotes) {
    return `还没有可比对的原文${tail}`;
  }
  return input.coverage === null
    ? `${input.quotes} 条原句可比对 · 覆盖度未测${tail}`
    : `${input.quotes} 条原句可比对 · 覆盖度 ${String(input.coverage)}%${tail}`;
}
