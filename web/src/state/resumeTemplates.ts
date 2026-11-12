/** 青穗集 · 简历模板配置：编辑窗口选择样式，纸面预览与导出共享当前选项。 */
import { useSyncExternalStore, type CSSProperties } from "react";

/**
 * Resume templates: a *style* (which order, how headings look) times a *format* (the
 * numbers), so a person can change the spacing without changing the layout, and vice
 * versa. The split is borrowed from ResumeForge's `resume_template.py`, which keeps
 * `kind=style` and `kind=format` as separate rows for exactly this reason.
 *
 * Built-ins live here as code, never as database rows — ResumeForge's other lesson:
 * once shipped templates are data, upgrading the app means overwriting what the person
 * has. Their choice is stored in `localStorage` like `career.research` and
 * `career.motion`, because a layout preference is not business data and must not have
 * to pass through the write-approval gate.
 */

export type FormatKey = "fontSize" | "lineHeight" | "margin" | "sectionSpacing" | "entrySpacing";

/** One table feeds the steppers, the validation and the labels — JobSync keeps these
 *  three in sync by holding a single `PDF_NUMERIC_SETTINGS` map, and drift between them
 *  is exactly the bug that produces a control that cannot be moved to its own maximum. */
export const FORMAT_FIELDS: Record<FormatKey, { label: string; min: number; max: number; step: number; decimals: number; unit: string }> = {
  fontSize: { label: "字号", min: 8, max: 16, step: 0.5, decimals: 1, unit: "pt" },
  lineHeight: { label: "行距", min: 1, max: 2, step: 0.05, decimals: 2, unit: "" },
  margin: { label: "页边距", min: 18, max: 90, step: 1, decimals: 0, unit: "pt" },
  sectionSpacing: { label: "节间距", min: 0, max: 32, step: 1, decimals: 0, unit: "pt" },
  entrySpacing: { label: "条目间距", min: 0, max: 32, step: 1, decimals: 0, unit: "pt" },
};

export type Format = Partial<Record<FormatKey, number>>;

export interface Template {
  id: string;
  name: string;
  note: string;
  /** Absent means "keep the server's order" — the graduation-year rule wins. */
  order?: string[];
  format: Format;
}

export const TEMPLATES: Template[] = [
  { id: "one-page", name: "一页纸标准", note: "最常见的中文校招版面，节与节分得开", format: { fontSize: 10.5, lineHeight: 1.5, margin: 42, sectionSpacing: 18, entrySpacing: 6 } },
  { id: "study", name: "研究向", note: "教育与作品在前，留白更多", order: ["education", "awards", "skills", "experience", "evidence"], format: { fontSize: 11, lineHeight: 1.65, margin: 56, sectionSpacing: 24, entrySpacing: 8 } },
  { id: "compact", name: "紧凑", note: "字号小、行距紧，先把一页塞满", format: { fontSize: 9.5, lineHeight: 1.35, margin: 28, sectionSpacing: 10, entrySpacing: 3 } },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0].id;
const TEMPLATE_KEY = "career.resumeTemplate";
const FORMAT_KEY = "career.resumeFormat";

export const byId = (id: string): Template => TEMPLATES.find((entry) => entry.id === id) ?? TEMPLATES[0];

export function clampField(key: FormatKey, value: number): number {
  const field = FORMAT_FIELDS[key];
  if (!Number.isFinite(value)) return field.min;
  const snapped = Math.round(Math.min(field.max, Math.max(field.min, value)) / field.step) * field.step;
  // Rounding to the field's own decimal count is what stops 0.05 steps from printing
  // 1.1500000000000001 in the label.
  return Number(snapped.toFixed(field.decimals));
}

/** Template defaults first, then whatever the person nudged away from them. */
export function resolveFormat(template: Template, overrides: Format): Format {
  const out: Format = {};
  for (const key of Object.keys(FORMAT_FIELDS) as FormatKey[]) {
    out[key] = overrides[key] ?? template.format[key] ?? FORMAT_FIELDS[key].min;
  }
  return out;
}

export function formatVars(format: Format): CSSProperties {
  const px = (key: FormatKey) => `${format[key] ?? FORMAT_FIELDS[key].min}${FORMAT_FIELDS[key].unit}`;
  return {
    "--rs-font": px("fontSize"),
    "--rs-leading": String(format.lineHeight ?? FORMAT_FIELDS.lineHeight.min),
    "--rs-margin": px("margin"),
    "--rs-section": px("sectionSpacing"),
    "--rs-entry": px("entrySpacing"),
  } as CSSProperties;
}

export function formatLabel(key: FormatKey, format: Format): string {
  const field = FORMAT_FIELDS[key];
  const value = format[key] ?? field.min;
  return `${field.label} ${value}${field.unit}`;
}

/** Order the template forces, or the server's own sequence when the template abstains. */
export function orderedSections<T extends { key: string }>(template: Template, serverOrder: T[]): T[] {
  if (!template.order) return serverOrder;
  const rank = new Map(template.order.map((key, index) => [key, index]));
  return [...serverOrder].sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
}

export function loadTemplateId(): string {
  try {
    const id = localStorage.getItem(TEMPLATE_KEY);
    return TEMPLATES.some((entry) => entry.id === id) ? (id as string) : DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export function loadOverrides(): Format {
  try {
    const raw = localStorage.getItem(FORMAT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Format) : {};
    const out: Format = {};
    for (const key of Object.keys(FORMAT_FIELDS) as FormatKey[]) if (typeof parsed[key] === "number") out[key] = clampField(key, parsed[key] as number);
    return out;
  } catch {
    return {};
  }
}

export function saveTemplateId(id: string): void {
  try {
    localStorage.setItem(TEMPLATE_KEY, id);
    window.dispatchEvent(new Event("career:resume-template"));
  } catch {
    /* A private-mode write failure is not worth a toast: the choice just resets next load. */
  }
}

export function saveOverrides(format: Format): void {
  try {
    localStorage.setItem(FORMAT_KEY, JSON.stringify(format));
  } catch {
    /* same */
  }
}

export type { Format as ResumeFormat };

function subscribeTemplate(onChange: () => void) {
  window.addEventListener("career:resume-template", onChange);
  window.addEventListener("storage", onChange);
  return () => { window.removeEventListener("career:resume-template", onChange); window.removeEventListener("storage", onChange); };
}
export function useResumeTemplate() {
  return [useSyncExternalStore(subscribeTemplate, loadTemplateId, () => DEFAULT_TEMPLATE), saveTemplateId] as const;
}
