/** 青穗集 · 纸面逐字书写：只排队已收到的字素，原位解码并让笔尖跟随当前字位，不改变交付正文。 */
import { scrambleGlyph, streamGraphemes, STREAM_DUST_MS, STREAM_LETTER_MS } from "./stream-reveal";
import glyphCss from "./stream-glyphs.css?inline";
import paperCss from "./resume-paper-motion.css?inline";

export const PAPER_INK_STEP_MS = 30;
export const PAPER_INK_HOLD_MS = 220;
export const PAPER_INK_MAX_QUEUE_MS = 4200;
export interface InkTiming { receivedAt: number; appearsAt: number; readyAt: number }
/** 压缩尚未开始的长队列；已经落笔的字符不重新排期，避免分片重来或无限追赶。 */
export function appendInkTimings(pending: InkTiming[], count: number, now: number): InkTiming[] {
  const tail = pending.at(-1)?.readyAt ?? now;
  const first = Math.max(now + PAPER_INK_HOLD_MS, tail + PAPER_INK_STEP_MS);
  const added = Array.from({ length: count }, (_, index) => ({ receivedAt: now, appearsAt: now, readyAt: first + index * PAPER_INK_STEP_MS }));
  const all = [...pending, ...added];
  if ((all.at(-1)?.readyAt ?? now) > now + PAPER_INK_MAX_QUEUE_MS) {
    const future = all.filter(item => item.readyAt > now + 90);
    const start = Math.min(future[0]?.readyAt ?? first, now + PAPER_INK_HOLD_MS);
    const step = Math.min(PAPER_INK_STEP_MS, (now + PAPER_INK_MAX_QUEUE_MS - start) / Math.max(1, future.length - 1));
    future.forEach((item, index) => { item.readyAt = Math.min(item.readyAt, start + index * step); });
  }
  all.forEach(item => { item.appearsAt = Math.max(item.receivedAt, item.readyAt - PAPER_INK_HOLD_MS); });
  return added;
}

type TextSink = (target: Element, text: string) => void;
/** 保留同一张纸和相同字段节点；文本字段交由书写器更新，已挂载的字不会随网络包重新播放。 */
export function syncPaperNode(target: Element, source: Element, textSink?: TextSink) {
  for (const attribute of [...target.attributes]) if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
  for (const attribute of [...source.attributes]) if (target.getAttribute(attribute.name) !== attribute.value) target.setAttribute(attribute.name, attribute.value);
  if (!source.childElementCount) {
    const text = source.textContent ?? "";
    if (textSink) textSink(target, text);
    else if (target.textContent !== text) target.textContent = text;
    return;
  }
  const nodes = [...source.childNodes];
  const key = (node: Node) => node.nodeType === 1 ? (node as Element).getAttribute("data-resume-key") : null;
  nodes.forEach((next, index) => {
    let existing = target.childNodes[index];
    if (!existing || existing.nodeType !== next.nodeType || existing.nodeName !== next.nodeName || key(existing) !== key(next)) {
      const inserted = target.ownerDocument.importNode(next, false);
      if (existing) target.replaceChild(inserted, existing); else target.appendChild(inserted);
      existing = inserted;
    }
    if (next.nodeType === 1) syncPaperNode(existing as Element, next as Element, textSink);
    else if (existing.textContent !== next.textContent) existing.textContent = next.textContent;
  });
  while (target.childNodes.length > nodes.length) target.lastChild?.remove();
}

interface InkField { element: Element; text: string; units: Set<InkUnit> }
interface InkUnit { timing: InkTiming; node: HTMLSpanElement; field: InkField; phase: "hidden" | "mask" | "decoding" }
interface WriterOptions { activity: (writing: boolean) => void; measure: () => void }
// 笔尖坐标为 (3, 39)，定位只读最终字位，不向文档正文插入图标或额外占位。
const PEN_SVG = '<svg viewBox="0 0 36 44" fill="none" aria-hidden="true"><path d="m3 39 3-10L23 4a3.5 3.5 0 0 1 5-1l3 2a3.5 3.5 0 0 1 1 5L14 34 3 39Z" fill="#bca4d5" stroke="#705586" stroke-width="1.4" stroke-linejoin="round"/><path d="m6 29 8 5-11 5 3-10Z" fill="#f4e5ce" stroke="#705586" stroke-width="1.2"/><path d="m3 39 4.8-2.3-3.4-2.4L3 39Z" fill="#695275"/><path d="m23 4 9 6-3 4-9-6 3-4Z" fill="#dbe8db" stroke="#705586" stroke-width="1.2"/><path d="m10 28 13-18" stroke="#f7f1fc" stroke-width="2" stroke-linecap="round"/><path d="m22 8 7 5-11 16" stroke="#806294" stroke-width="1.2" stroke-linecap="round"/></svg>';
export class ResumePaperWriter {
  private fields = new Map<Element, InkField>();
  private units: InkUnit[] = [];
  private pen: HTMLDivElement;
  private raf = 0;
  private writing = false;
  private disposed = false;
  private requestId: string | undefined;
  private position: { x: number; y: number } | undefined;
  private lastTick = 0;
  private lastWritten = 0;
  private lastMeasure = 0;
  private point = 0;
  constructor(readonly sheet: Element, private options: WriterOptions) {
    const doc = sheet.ownerDocument;
    if (!doc.getElementById("resume-ink-styles")) {
      const style = doc.createElement("style"); style.id = "resume-ink-styles";
      style.textContent = glyphCss + "\n" + paperCss; doc.head.appendChild(style);
    }
    this.pen = doc.createElement("div"); this.pen.className = "resume-writing-pen";
    this.pen.setAttribute("aria-hidden", "true"); this.pen.innerHTML = PEN_SVG;
    doc.body.appendChild(this.pen);
  }
  private activity(value: boolean) {
    if (this.writing === value) return;
    this.writing = value; this.options.activity(value);
  }
  private clearField(field: InkField) {
    for (const unit of field.units) unit.node.remove();
    this.units = this.units.filter(unit => unit.field !== field); field.units.clear();
  }
  private text(element: Element, text: string, animate: boolean) {
    let field = this.fields.get(element);
    if (field?.text === text) return;
    const previous = field?.text ?? "";
    if (!field) { field = { element, text: "", units: new Set() }; this.fields.set(element, field); }
    if (!animate) {
      this.clearField(field); element.textContent = text; field.text = text; return;
    }
    let prefix = previous;
    if (!text.startsWith(previous)) {
      prefix = "";
      for (const part of streamGraphemes(previous)) {
        if (text.slice(part.index, part.index + part.text.length) !== part.text) break;
        prefix += part.text;
      }
      this.clearField(field); element.textContent = prefix;
    } else if (!previous) element.textContent = "";
    const glyphs = streamGraphemes(text.slice(prefix.length));
    const now = performance.now();
    // 所有字段共用落笔队列，后一个字段衔接前一个，避免笔尖在多处同时解码的文字之间跳动。
    const timings = appendInkTimings(this.units.filter(unit => this.sheet.contains(unit.node)).map(unit => unit.timing), glyphs.length, now);
    const fragment = element.ownerDocument.createDocumentFragment();
    glyphs.forEach((glyph, index) => {
      const node = element.ownerDocument.createElement("span");
      node.className = "resume-ink-token"; node.dataset.phase = "hidden";
      const letter = element.ownerDocument.createElement("span"); letter.className = "resume-ink-letter"; letter.textContent = glyph.text;
      const code = element.ownerDocument.createElement("span"); code.className = "resume-ink-code"; code.setAttribute("aria-hidden", "true");
      code.dataset.glyph = /\s/u.test(glyph.text) ? "" : scrambleGlyph(this.point);
      code.dataset.next = /\s/u.test(glyph.text) ? "" : scrambleGlyph(this.point + 1);
      code.dataset.last = /\s/u.test(glyph.text) ? "" : scrambleGlyph(this.point + 2);
      node.style.setProperty("--glyph-phase", `${-(this.point % 4) * 65}ms`);
      node.style.setProperty("--dust-x", `${this.point % 2 ? 8 : -8}px`);
      node.style.setProperty("--dust-y", `${-8 - this.point % 8}px`);
      if (this.point++ % 4 === 0) node.dataset.particles = "true";
      node.append(letter, code); fragment.appendChild(node);
      const unit: InkUnit = { timing: timings[index], node, field: field!, phase: "hidden" };
      field!.units.add(unit); this.units.push(unit);
    });
    element.appendChild(fragment); field.text = text;
  }
  update(source: Element, animate: boolean, requestId?: string) {
    if (this.disposed) return;
    if (requestId && requestId !== this.requestId) { this.settle(); this.requestId = requestId; }
    // 没有真实生成请求时直接显示历史内容；流结束后只让当前队列自然收尾。
    if (!animate) this.settle();
    const writing = animate && Boolean(requestId || this.units.length);
    syncPaperNode(this.sheet, source, (target, text) => this.text(target, text, writing && !target.closest(".resume-header") && target.tagName !== "H2"));
    for (const [element, field] of this.fields) if (!this.sheet.contains(element)) { this.clearField(field); this.fields.delete(element); }
    this.options.measure();
    if (this.units.length) { this.activity(true); this.start(); }
    else { this.activity(false); this.pen.dataset.visible = "false"; }
  }
  private start() { if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(this.tick); }
  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    let current: InkUnit | undefined;
    this.units = this.units.filter(unit => {
      if (!this.sheet.contains(unit.node)) { unit.field.units.delete(unit); return false; }
      if (now >= unit.timing.readyAt + STREAM_DUST_MS) {
        unit.node.replaceWith(this.sheet.ownerDocument.createTextNode(unit.node.querySelector(".resume-ink-letter")!.textContent ?? ""));
        unit.field.units.delete(unit);
        if (!unit.field.units.size) unit.field.element.textContent = unit.field.text;
        return false;
      }
      const phase = now >= unit.timing.readyAt ? "decoding" : now >= unit.timing.appearsAt ? "mask" : "hidden";
      if (phase !== unit.phase) { unit.phase = phase; unit.node.dataset.phase = phase; }
      if (phase === "decoding" && now < unit.timing.readyAt + STREAM_LETTER_MS) current = unit;
      return true;
    });
    if (current) {
      const rect = current.node.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (now - current.timing.readyAt) / PAPER_INK_STEP_MS));
      this.movePen(rect.left + rect.width * progress, rect.bottom - 3, now);
      this.lastWritten = now;
    } else if (now - this.lastWritten > 360) this.pen.dataset.visible = "false";
    if (now - this.lastMeasure > 120) { this.options.measure(); this.lastMeasure = now; }
    this.lastTick = now;
    if (this.units.length) this.start();
    else { this.pen.dataset.visible = "false"; this.activity(false); }
  };
  private movePen(x: number, y: number, now: number) {
    const previous = this.position ?? { x, y };
    const lift = Math.abs(y - previous.y) > 12 || Math.abs(x - previous.x) > 64;
    const alpha = 1 - Math.exp(-Math.min(48, now - this.lastTick || 16) / (lift ? 34 : 46));
    const point = { x: previous.x + (x - previous.x) * alpha, y: previous.y + (y - previous.y) * alpha };
    this.position = point;
    this.pen.dataset.visible = "true"; this.pen.dataset.lifted = String(lift);
    this.pen.style.transform = `translate3d(${point.x - 3}px,${point.y - 39}px,0)`;
  }
  settle() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    for (const field of this.fields.values()) { field.element.textContent = field.text; field.units.clear(); }
    this.units = []; this.pen.dataset.visible = "false"; this.position = undefined; this.lastTick = 0; this.activity(false);
  }
  destroy() { this.disposed = true; this.settle(); this.pen.remove(); this.fields.clear(); }
}
