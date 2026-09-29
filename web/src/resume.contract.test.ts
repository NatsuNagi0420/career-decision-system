import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORMAT_FIELDS, TEMPLATES, clampField, resolveFormat } from "./state/resumeTemplates";

/**
 * The resume sheet's two promises are checkable without a browser, so they are checked
 * here: that printing yields paper rather than the app, and that the template table
 * cannot describe a control it cannot move.
 *
 * The third thing — that the sheet is actually reachable on screen — is NOT covered
 * here, and no stub feed can cover it: an artifact card is drawn from that run's event
 * frames, not from `/feed`. It needs a real run.
 */
const css = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const print = css.slice(css.indexOf("@media print"));

describe("the resume print sheet", () => {
  it("declares an A4 page with zero margin, so Chrome adds no header of its own", () => {
    expect(print).toMatch(/@page\s*\{[^}]*size:\s*A4/);
    expect(print).toMatch(/@page\s*\{[^}]*margin:\s*0/);
    // The printable margin comes from the sheet's own padding, set in the base rule.
    expect(css).toMatch(/\.resume-sheet\s*\{[\s\S]*?padding:\s*var\(--rs-margin\)/);
  });

  it("hides the app and keeps the sheet", () => {
    for (const sel of [".sidebar", ".topbar", ".dock", ".no-print", ".linkbtn"]) expect(print).toContain(sel);
    // The toolbar is hidden through `.no-print`; nothing may hide the sheet itself.
    expect(print).not.toMatch(/\.resume-sheet\s*\{[^}]*display:\s*none/);
  });

  it("leaves only the paper: the feed goes invisible and the sheet is lifted back", () => {
    // `visibility`, not `display`: the sheet sits arbitrarily deep inside the timeline,
    // so a rule naming its ancestors would break the next time the markup moves.
    expect(print).toMatch(/\.feed,[\s\S]*?\.feed \* \{\s*visibility:\s*hidden !important/);
    expect(print).toMatch(/\.resume-sheet,[\s\S]*?\.resume-sheet \* \{\s*visibility:\s*visible !important/);
    // An absolutely positioned sheet shrink-to-fit to 324px in measurement — the page
    // width has to be stated or the A4 sheet prints as a narrow column.
    expect(print).toMatch(/\.resume-sheet \{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*210mm/);
  });

  it("never paints the sheet with an achromatic white", () => {
    const sheet = css.match(/\.resume-sheet\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(sheet).toMatch(/background:\s*var\(--md-surface/);
    expect(sheet).not.toMatch(/background:\s*(#fff|white)/);
  });
});

describe("the template table", () => {
  it("every format field can actually be moved across its own range", () => {
    for (const [key, field] of Object.entries(FORMAT_FIELDS)) {
      expect(field.min, key).toBeLessThan(field.max);
      expect(field.step, key).toBeGreaterThan(0);
      expect(clampField(key as keyof typeof FORMAT_FIELDS, field.max), key).toBe(field.max);
      expect(clampField(key as keyof typeof FORMAT_FIELDS, field.min), key).toBe(field.min);
    }
  });

  it("no built-in template ships a value its own control cannot show", () => {
    for (const template of TEMPLATES) {
      const resolved = resolveFormat(template, {});
      for (const [key, field] of Object.entries(FORMAT_FIELDS)) {
        const value = resolved[key as keyof typeof FORMAT_FIELDS];
        expect(value, `${template.id}.${key}`).toBeGreaterThanOrEqual(field.min);
        expect(value, `${template.id}.${key}`).toBeLessThanOrEqual(field.max);
      }
    }
  });

  it("every template reorders rather than drops sections", () => {
    for (const template of TEMPLATES) {
      if (!template.order) continue;
      expect(new Set(template.order).size, template.id).toBe(5);
    }
  });
});
