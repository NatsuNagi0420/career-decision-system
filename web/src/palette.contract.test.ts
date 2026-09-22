import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");
const SOURCE = css.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");

const TOKENS: Record<string, string> = {};
for (const m of SOURCE.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) TOKENS[m[1]] = m[2].toLowerCase();

function channel(hex: string, i: number) {
  const v = parseInt(hex.slice(i, i + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string) {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}
function contrast(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}
function resolve(value: string) {
  const m = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (m) return TOKENS[m[1]];
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

/** Every block that sets both a background colour and a text colour, as a pair. */
function colourPairs(): Array<{ sel: string; fg: string; bg: string; fgRaw: string; bgRaw: string }> {
  const out: Array<{ sel: string; fg: string; bg: string; fgRaw: string; bgRaw: string }> = [];
  let sel = "";
  let bg: string | null = null;
  let bgRaw = "";
  for (const raw of SOURCE.split("\n")) {
    const head = raw.match(/^([^\s{}@][^{}]*)\{$/);
    if (head) {
      sel = head[1].trim();
      bg = null;
      continue;
    }
    const b = raw.match(/^\s+background(?:-color)?:\s*([^;]+);$/);
    if (b) {
      const hex = resolve(b[1].trim());
      bg = hex ?? null;
      bgRaw = b[1].trim();
      continue;
    }
    const f = raw.match(/^\s+color:\s*([^;]+);$/);
    if (f && bg) {
      const hex = resolve(f[1].trim());
      if (hex) out.push({ sel, fg: hex, bg, fgRaw: f[1].trim(), bgRaw });
    }
  }
  return out;
}

describe("palette", () => {
  it("the surface ramp keeps the brand hue: no zero-chroma white sneaks back in", () => {
    const flat = Object.entries(TOKENS)
      .filter(([name, hex]) => name.startsWith("--md-surface") && hsl(hex).s < 0.05)
      .map(([name, hex]) => `${name} ${hex} (saturation ${(hsl(hex).s * 100).toFixed(0)}%)`);
    expect(flat).toEqual([]);
  });

  it("the theme carries at least two hue families, so it cannot go monotone again", () => {
    const hues = ["--md-primary", "--md-secondary", "--md-tertiary"].map((n) => hsl(TOKENS[n]).h);
    const distances: number[] = [];
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const d = Math.abs(hues[i] - hues[j]);
        distances.push(Math.min(d, 360 - d));
      }
    }
    expect(Math.max(...distances)).toBeGreaterThanOrEqual(60);
  });

  it("every solid text-on-fill pair in the stylesheet clears body-text contrast", () => {
    const pairs = colourPairs();
    // A guard that counts nothing is how "all colours pass" gets written by accident:
    // this file is CRLF in the working tree, and one dropped \r used to zero these out.
    expect(pairs.length).toBeGreaterThan(20);
    const weak = pairs
      .filter(({ fg, bg }) => contrast(fg, bg) < 4.5)
      .map(({ sel, fg, bg }) => `${sel}: ${contrast(fg, bg).toFixed(2)}`);
    expect(weak).toEqual([]);
  });
});
