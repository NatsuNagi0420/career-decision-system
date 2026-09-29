/**
 * Which icon names this app asks the webfont for.
 *
 * Pure — no network, no writes — so both the build script (`fonts.mjs`) and the contract
 * test (`fonts.contract.test.mjs`) can run the same scan. That matters: if the test used
 * a looser regex than the builder, a name could pass the test and still be missing from
 * the subset, and the icon would then draw its own name as text.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");

export const MANIFEST = join(WEB, "scripts", "icons.used.txt");

/** Every .ts/.tsx under src, tests excluded: a test fixture is not a screen. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

/** The contents of the `{...}` opening at `index`, found by brace depth. */
function balanced(text, index) {
  let depth = 0;
  for (let i = index; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}" && --depth === 0) return text.slice(index + 1, i);
  }
  return "";
}

/**
 * Every name that can reach <Ms>'s `g` prop.
 *
 * A union over channels, not one clever parse: `g="x"`, `g={expr}` (ternaries and `??`),
 * `glyph:` fields in the lookup tables, and the two named glyph tables. Operands of a
 * comparison are dropped — the string after `=== "x"` is a state name, not an icon.
 */
export function collectIconNames() {
  const names = new Set();
  const add = (value) => /^[a-z][a-z0-9_]*$/.test(value) && names.add(value);

  for (const file of sourceFiles(join(WEB, "src"))) {
    const text = readFileSync(file, "utf8");
    for (const [, name] of text.matchAll(/\bg="([a-z0-9_]+)"/g)) add(name);
    for (const [, name] of text.matchAll(/\bglyph:\s*"([a-z0-9_]+)"/g)) add(name);

    for (const match of text.matchAll(/\bg=/g)) {
      if (text.slice(match.index + 2, match.index + 3) !== "{") continue;
      const expr = balanced(text, match.index + 2).replace(/[=!]==?\s*"[a-z0-9_]*"/g, " ");
      for (const [, lit] of expr.matchAll(/"([a-z0-9_]+)"/g)) add(lit);
    }

    for (const [, body] of text.matchAll(/const (?:GLYPH|ROW_GLYPHS)[^=]*=\s*(\{[\s\S]*?\}|[[\]\s\S]*?\])/g)) {
      for (const [, lit] of body.matchAll(/"([a-z0-9_]+)"/g)) add(lit);
    }
  }
  return [...names].sort();
}
