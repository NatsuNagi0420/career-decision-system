import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");
const SOURCE = css.replace(/\/\*[\s\S]*?\*\//g, "");

// Names outside the size ladder: 9999 is a shape, 2px is the speech-bubble corner.
const LADDER = ["--r-none", "--r-sm", "--r-md", "--r-lg"] as const;
const EXCEPTIONS = ["--r-full", "--r-tail"] as const;

// Square is the machine speaking: rails, controls, labels, instrumentation. Anything
// not listed here is content or the person's own paper, and must stay rounded — so
// making a new element square is a deliberate edit to this list, not a stray value.
const CHROME = new Set([
  ".item", ".navpill", ".count", ".status", ".anchor span", ".track", ".track__badge",
  ".session", ".branch__item", ".menu", ".menu__row", ".usercard", ".search",
  ".dock__inner", ".picker__panel", ".picker__item", ".live", ".live__reason", ".notice",
  ".btn", ".cta", ".minibtn", ".iconbtn", ".inspector__btn", ".inspector__icon", ".send",
  ".fieldbtn", ".dock__field", ".seg", ".seg__btn", ".picker__btn", ".ask",
  ".decision textarea", '.auth input[type="text"], .auth input[type="password"]',
  ".pill", ".tag", ".srcchip", ".ribbon", ".ribbon__id", ".gauge__flag", ".picker__soon",
  ".thought__tool", ".thought__summary", ".thought__wall", ".bar__track", ".bar__fill",
  ".thought__bar", ".gauge",
]);

function tokens(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of SOURCE.matchAll(/(--r-[a-z0-9]+)\s*:\s*(\d+)px/g)) out[m[1]] = Number(m[2]);
  return out;
}

function radiusDeclarations(): Array<[string, string]> {
  return [...SOURCE.matchAll(/(border(?:-[a-z]+)*-radius)\s*:\s*([^;}]+)/g)].map((m) => [
    m[1],
    m[2].trim(),
  ]);
}

/** Last declaration per top-level selector, which is what the browser renders.
 *  Selector text may be spread over several lines, so it is accumulated and folded. */
function effectiveRadius(): Map<string, string> {
  const lines = SOURCE.split("\n");
  const out = new Map<string, string>();
  let depth = 0;
  let current: string | null = null;
  let pending: string[] = [];
  for (const raw of lines) {
    const opens = (raw.match(/\{/g) || []).length;
    const closes = (raw.match(/\}/g) || []).length;
    if (depth === 0) {
      if (/\{/.test(raw)) {
        const head = [...pending, raw.slice(0, raw.indexOf("{"))].join(" ").replace(/\s+/g, " ").trim();
        current = /^[^\s{}@]/.test(head) ? head : null;
        pending = [];
      } else if (/^[^\s{}@]/.test(raw) && !/^\s/.test(raw)) {
        pending.push(raw);
      }
    }
    const r = raw.match(/^\s+border-radius:\s*([^;]+);$/);
    if (r && current) out.set(current, r[1].trim());
    depth += opens - closes;
    if (closes > 0) pending = [];
    if (depth <= 0) {
      depth = 0;
      current = null;
    }
  }
  return out;
}

function usedTokens(): Set<string> {
  return new Set([...SOURCE.matchAll(/var\((--r-[a-z0-9]+)\)/g)].map((m) => m[1]));
}

describe("shape tokens", () => {
  it("every radius comes from the token table, never a one-off number", () => {
    const rogue = radiusDeclarations()
      .filter(([, value]) =>
        value
          .split(/\s+/)
          .some((part) => part !== "0" && !/^var\(--r-[a-z0-9]+\)$/.test(part)),
      )
      .map(([prop, value]) => `${prop}: ${value}`);
    expect(rogue).toEqual([]);
  });

  it("the table is exactly these six names: a seventh is a size to guess at", () => {
    expect(Object.keys(tokens()).sort()).toEqual([...LADDER, ...EXCEPTIONS].sort());
  });

  it("the ladder names say the size, so no two tokens share a value", () => {
    const defined = tokens();
    const pairs = Object.entries(defined);
    expect(new Set(pairs.map(([, px]) => px)).size).toBe(pairs.length);
    const sizes = LADDER.map((name) => defined[name]);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it("a token nobody reads is how a second name for the same size gets back in", () => {
    const used = usedTokens();
    for (const name of Object.keys(tokens())) {
      expect(used.has(name), `${name} is defined but unused`).toBe(true);
    }
  });

  it("shape carries who is speaking: only the chrome may be square", () => {
    const offenders = [...effectiveRadius()].filter(([sel, value]) => {
      const square = value === "var(--r-none)";
      return CHROME.has(sel) ? false : square;
    });
    expect(offenders).toEqual([]);
  });

  it("every chrome control is actually square, so the list is not decoration", () => {
    const rendered = effectiveRadius();
    const allowed = new Set(["var(--r-none)", "var(--r-full)", "var(--r-sm)"]);
    const offenders = [...CHROME]
      .filter((sel) => rendered.has(sel) && !allowed.has(rendered.get(sel) as string))
      .map((sel) => `${sel} => ${rendered.get(sel)}`);
    expect(offenders).toEqual([]);
  });

  it("the signal yellow never becomes text: 1.32:1 on this paper is an erasure", () => {
    const asText = [...SOURCE.matchAll(/(?:^|[;\s])color:\s*var\(--signal\)/g)].length;
    expect(asText).toBe(0);
  });

  it("a quoted block rounds only its far corners, and they are all the same corner", () => {
    const halfRounded = radiusDeclarations()
      .filter(([prop, value]) => prop === "border-radius" && value.split(/\s+/)[0] === "0")
      .map(([, value]) => value);
    expect(halfRounded.length).toBeGreaterThan(0);
    expect([...new Set(halfRounded)]).toEqual(["0 var(--r-sm) var(--r-sm) 0"]);
  });
});
