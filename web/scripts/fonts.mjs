/**
 * Vendor the two webfonts into `web/public/fonts/` and pin which icons are used.
 *
 * Why this is a committed script rather than a one-off download: the shipped Material
 * Symbols file is subset from ~6600 glyphs down to the ones this app actually renders,
 * so the subset has to be **reproducible**. When somebody adds `<Ms g="new_icon" />`,
 * `fonts.contract.test.mjs` goes red naming the icon, and `npm run fonts` rebuilds the
 * file. A hand-made subset would instead draw the icon's own name as text — which is
 * exactly how `source` and `chat_bubble_outline` (real Material *Icons* names, absent
 * from Material Symbols) sat on screen as words.
 *
 * Needs python with `pip install fonttools brotli`. The whole-font download lands in
 * `.font-src/` (gitignored) and is never served.
 *
 * Run:  npm run fonts          download + subset + rewrite the manifest
 *       npm run fonts:check    rewrite the manifest only (no font tooling needed)
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { collectIconNames, MANIFEST } from "./icons-usage.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(WEB, "public", "fonts");
const CACHE = join(WEB, ".font-src");

/** Google serves woff2 only to clients that declare support for it. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function cssFor(family) {
  // Material Symbols asks for FILL as a *range* (`0..1`) so Google answers with a file
  // that carries fvar/gvar — `.ms-fill` needs that axis, and the fully-pinned
  // `@24,400,0,0` form returns a static instance where the axis does not exist.
  const axes = family === "Material Symbols Outlined" ? ":opsz,wght,FILL,GRAD@24,400,0..1,0" : ":wght@400;500;600;700";
  const r = await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}${axes}&display=swap`, {
    headers: { "user-agent": UA },
  });
  if (!r.ok) throw new Error(`${family}: css2 answered ${r.status}`);
  return r.text();
}

const get = async (url) => Buffer.from(await (await fetch(url, { headers: { "user-agent": UA } })).arrayBuffer());

/**
 * The `latin` face only. Chinese has always come from the system stack in `--md-font`
 * (Noto Sans SC / PingFang / YaHei), never from this file, so dropping the other
 * unicode-range subsets changes nothing that was rendering.
 */
async function vendorTextFace() {
  const css = await cssFor("Plus Jakarta Sans");
  const block = css.match(/\/\* latin \*\/\s*@font-face\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error("Plus Jakarta Sans: no latin @font-face");
  const buf = await get(block[1].match(/url\((https:[^)]+)\)/)[1]);
  writeFileSync(join(OUT, "plus-jakarta-sans.latin.woff2"), buf);
  return buf.length;
}

/**
 * Three flags here are load-bearing, and each one was learned by shipping the wrong
 * answer past a green test suite:
 *
 *  - `--glyphs` by name, not `--text`: every symbol's ligature is spelled from the same
 *    a–z plus `_`, so closing over codepoints keeps every outline. Google's own `&text=`
 *    endpoint proves that — it answers 263KB of the 316KB.
 *  - `--text` as well: `--glyphs` alone also prunes the cmap, and a font with no a–z
 *    entries can never be fed a ligature name. It loads, it validates, and every icon
 *    renders as its own word.
 *  - `--no-layout-closure`: without it, `--text` re-expands the glyph set to every
 *    ligature composable from those letters (393KB). With it, only the rules for the
 *    names we asked for survive — 10.2KB.
 *
 * The ligature feature tag is not stable across builds (the static instance carries
 * rlig, the FILL-axis one keeps rclt), so the script verifies the cut instead of
 * assuming the flags worked.
 */
function subsetIcons(names) {
  const full = join(CACHE, "material-symbols-outlined.full.woff2");
  const target = join(OUT, "material-symbols-outlined.woff2");
  const py = `
import sys
from fontTools.ttLib import TTFont
from fontTools.subset import main
# Everything an icon name can be spelled from.
KEYS = "abcdefghijklmnopqrstuvwxyz0123456789_"
src, target, names = sys.argv[1], sys.argv[2], sys.argv[3:]
have = set(TTFont(src).getGlyphOrder())
missing = [n for n in names if n not in have]
if missing:
    print("字体里没有这些名字: " + " ".join(missing)); sys.exit(3)
print("整包 glyph 数 %d → 目标 %d" % (len(have), len(names)))
main([src, "--glyphs=" + ",".join(names),
      "--text=" + KEYS,
      "--no-layout-closure",
      "--layout-features=rlig,rclt", "--flavor=woff2", "--no-hinting",
      "--output-file=" + target])
cut = TTFont(target)
feats = sorted({r.FeatureTag for r in cut['GSUB'].table.FeatureList.FeatureRecord})
axes = [a.axisTag for a in cut['fvar'].axes] if 'fvar' in cut else []
mapped = [c for c in KEYS if ord(c) in cut.getBestCmap()]
# HarfBuzz applies rclt and rlig by default; require whichever one this build uses.
assert {'rlig', 'rclt'} & set(feats), "裁完没有连字特性，图标会变成文字: " + str(feats)
assert axes == ['FILL'], "FILL 轴丢了，.ms-fill 会失效: " + str(axes)
# --glyphs alone prunes the cmap too, and a font with no a–z entries can never be fed a
# ligature name: it stays valid, loads fine, and renders every icon as its own word.
assert len(mapped) == len(KEYS), "cmap 丢了输入字符，图标会变成文字: 只剩 " + "".join(mapped)
print("子集校验通过: 连字特性 " + str(feats) + ", 可变轴 " + str(axes) + ", glyph " + str(len(cut.getGlyphOrder())) + ", cmap 输入 " + str(len(mapped)))
`;
  const r = spawnSync(process.env.PYTHON || "python", ["-c", py, full, target, ...names], {
    stdio: "inherit",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (r.status !== 0) throw new Error(`subset 退出码 ${r.status}`);
  return statSync(target).size;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });
const names = collectIconNames();
writeFileSync(MANIFEST, `${names.join("\n")}\n`);
console.log(`图标名 ${names.length} 个 → ${relative(WEB, MANIFEST)}`);

if (process.argv.includes("--check")) {
  console.log("--check: 只重算清单");
} else {
  console.log(`Plus Jakarta Sans latin: ${(await vendorTextFace() / 1024).toFixed(1)} KB`);
  const full = join(CACHE, "material-symbols-outlined.full.woff2");
  if (!existsSync(full)) {
    const css = await cssFor("Material Symbols Outlined");
    writeFileSync(full, await get(css.match(/url\((https:[^)]+)\)/)[1]));
  }
  const fullSize = statSync(full).size;
  const size = subsetIcons(names);
  console.log(`Material Symbols: ${(fullSize / 1024).toFixed(1)} KB → ${(size / 1024).toFixed(1)} KB，省 ${((1 - size / fullSize) * 100).toFixed(1)}%`);
}
