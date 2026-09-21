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
