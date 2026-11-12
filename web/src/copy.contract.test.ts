/** 青穗集 · 用户文案契约：隐藏内部术语，并保留用户已要求的对话归档操作。 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The owner's ruling, 2026-09-22: a job seeker is a consumer, and words like 疑点 /
 * 覆盖度 / 溯源 / token are what an internal reviewer reads. They may still exist — on
 * the surfaces the researcher switch reveals. So this is a two-way list: any term found
 * somewhere else fails, and a term that stops being needed has to leave the list too.
 */
const BANNED = ["疑点", "覆盖度", "覆盖率", "溯源", "核验", "归档", "棋盘", "交回", "推理", "决策项目", "赛道", "复盘", "行动项", "tokens"];

const RESEARCHER_SURFACES = new Set([
  // Coarse on purpose: this list says which *file* may carry a term, not which element.
  // Each entry below sits behind .research-only or the researcher view; a new term in a
  // consumer string fails even if it lands in one of these files.
  "src/App.tsx:tokens",
  "src/components/ArtifactCard.tsx:覆盖度",
  "src/components/ArtifactCard.tsx:推理",
  "src/components/ArtifactCard.tsx:tokens",
  "src/components/Timeline.tsx:推理",
  "src/state/readable.ts:决策项目",
  "src/state/readable.ts:复盘",
]);

const SRC = fileURLToPath(new URL("./", import.meta.url));

// 用户明确要求归档对话及记忆，这是正常产品操作，与旧业务内部的归档术语不同。
const CONVERSATION_SURFACES = new Set([
  "src/agent/AgentApp.tsx:归档",
  "src/agent/ChatComposer.tsx:归档",
  "src/agent/ConversationHistory.tsx:归档",
  "src/agent/MemorySea.tsx:归档",
]);

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      sources(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Only what a user can read: string literals and JSX text, with comments removed.
 *  Matching the whole file would flag identifiers like `tokenStore` as UI copy. */
function visibleText(file: string): string {
  const raw = readFileSync(file, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  const chunks: string[] = [];
  for (const m of raw.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`|>\s*([^<>{}\n]+?)\s*</g)) {
    // 模板表达式中的变量名不是用户文案，例如 ${entry.input_tokens}。
    chunks.push((m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").replace(/\$\{[^}]*\}/g, ""));
  }
  return chunks.join("\n");
}

const FILES = sources(SRC).sort();
const FOUND = new Map<string, number>();
for (const file of FILES) {
  const rel = `src/${file.slice(SRC.length).replace(/^\/+/, "")}`.replace(/\\/g, "/");
  const text = visibleText(file);
  for (const term of BANNED) {
    const hits = text.split(term).length - 1;
    if (hits) {
      FOUND.set(`${rel}:${term}`, hits);
    }
  }
}

describe("consumer copy", () => {
  it("scans the real component sources, not an empty list", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(10);
    // If the scan finds nothing at all, the allow-list would pass for the wrong reason.
    expect([...FOUND.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("keeps internal vocabulary on researcher surfaces only", () => {
    const offenders = [...FOUND.keys()].filter((key) => !RESEARCHER_SURFACES.has(key) && !CONVERSATION_SURFACES.has(key));
    expect(offenders).toEqual([]);
    const stale = [...RESEARCHER_SURFACES, ...CONVERSATION_SURFACES].filter((key) => !FOUND.has(key));
    expect(stale, "these exemptions are no longer used by anything — delete them").toEqual([]);
  });
});
