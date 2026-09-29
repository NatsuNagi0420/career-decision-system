/**
 * The webfont is a subset, so "the page looks fine locally" is not evidence.
 *
 * These four assertions are what keep the vendored fonts honest: nothing may reach a
 * CDN, every file the stylesheet names must exist, and every icon name the source can
 * hand to <Ms> must be present in the subset's manifest — the failure mode for any of
 * them is an icon rendering as its own name in words.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectIconNames, MANIFEST } from "./icons-usage.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(WEB, "index.html"), "utf8");
const fontCss = readFileSync(join(WEB, "public", "fonts.css"), "utf8");
const manifest = readFileSync(MANIFEST, "utf8").split("\n").filter(Boolean);

describe("vendored webfonts", () => {
  it("the document asks no third-party host for anything", () => {
    const external = [...html.matchAll(/https?:\/\/[^\s"']+/g)].map((m) => m[0]);
    expect(external).toEqual([]);
  });

  it("every file fonts.css names is on disk", () => {
    const refs = [...fontCss.matchAll(/url\("(\/[^"]+)"\)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(2);
    for (const ref of refs) expect(existsSync(join(WEB, "public", ref.slice(1))), `缺 ${ref}`).toBe(true);
  });

  it("the icon manifest is worth reading", () => {
    // A guard that counts nothing passes by accident: this file once parsed 0 pairs
    // because of CRLF and reported "all colours fine".
    expect(manifest.length).toBeGreaterThan(40);
    expect(new Set(manifest).size).toBe(manifest.length);
  });

  it("every icon the source can ask for is in the subset", () => {
    const known = new Set(manifest);
    const missing = collectIconNames().filter((name) => !known.has(name));
    expect(missing, `跑 npm run fonts 重建子集；缺: ${missing.join(" ")}`).toEqual([]);
  });
});
