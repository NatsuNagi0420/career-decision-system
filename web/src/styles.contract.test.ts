import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");
const SOURCE = css.replace(/\/\*[\s\S]*?\*\//g, "");

// Names outside the size ladder: 9999 is a shape, 2px is the speech-bubble corner.
const LADDER = ["--r-sm", "--r-md", "--r-lg"] as const;
const EXCEPTIONS = ["--r-full", "--r-tail"] as const;

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

function usedTokens(): Set<string> {
  return new Set(
    [...SOURCE.matchAll(/var\((--r-[a-z0-9]+)\)/g)].map((m) => m[1]),
  );
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

  it("the table is exactly these five names: a sixth is a size to guess at", () => {
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

  it("a quoted block rounds only its far corners, and they are all the same corner", () => {
    const halfRounded = radiusDeclarations()
      .filter(([prop, value]) => prop === "border-radius" && value.split(/\s+/)[0] === "0")
      .map(([, value]) => value);
    expect(halfRounded.length).toBeGreaterThan(0);
    expect([...new Set(halfRounded)]).toEqual(["0 var(--r-sm) var(--r-sm) 0"]);
  });
});
