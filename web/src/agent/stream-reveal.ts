/** 青穗集 · 连续解码时间轴：合并已收小分片、交叠衔接乱码，限制等待积压并保留字素边界。 */
export const STREAM_HOLD_MS = 240;
export const STREAM_LETTER_MS = 320;
export const STREAM_DUST_MS = 580;
export const STREAM_HANDOFF_OVERLAP_MS = 120;
export const STREAM_MAX_QUEUE_MS = 900;
const MAX_ANIMATED_UNITS = 1200;
const GROUP_UNITS = 16;
const STEP_MS = 28;
export interface RevealBatch {
  from: number;
  to: number;
  appearsAt: number;
  beginsAt: number;
  stepMs: number;
}
export interface RevealState {
  content: string;
  enabled: boolean;
  batches: RevealBatch[];
}
export interface RevealFrame {
  state: RevealState;
  now: number;
}
export interface StreamGlyph {
  text: string;
  index: number;
}
const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh", { granularity: "grapheme" }) : undefined;
export function streamGraphemes(text: string): StreamGlyph[] {
  if (segmenter) return Array.from(segmenter.segment(text), part => ({ text: part.segment, index: part.index }));
  let index = 0;
  return Array.from(text, value => { const glyph = { text: value, index }; index += value.length; return glyph; });
}
function lastGlyphAt(batch: RevealBatch): number {
  return batch.beginsAt + Math.max(0, batch.to - batch.from - 1) * batch.stepMs;
}
export function batchTextEndsAt(batch: RevealBatch): number {
  return lastGlyphAt(batch) + STREAM_LETTER_MS;
}
export function batchEndsAt(batch: RevealBatch): number {
  return lastGlyphAt(batch) + STREAM_DUST_MS;
}
export function settleReveal(state: RevealState, now: number): RevealState {
  const batches = state.batches.filter(batch => batchEndsAt(batch) > now);
  return batches.length === state.batches.length ? state : { ...state, batches };
}
export function receiveReveal(previous: RevealState, content: string, now: number, enabled: boolean): RevealState {
  if (!enabled || !content.startsWith(previous.content)) return { content, enabled, batches: [] };
  const cutoff = Math.max(0, content.length - MAX_ANIMATED_UNITS);
  const batches = previous.batches.filter(batch => batch.to > cutoff && batchEndsAt(batch) > now);
  let from = Math.max(previous.content.length, cutoff);
  // 大块内容只给末段做动画，但不从代理对或组合字素中间开始。
  if (from > previous.content.length) {
    const windowStart = Math.max(previous.content.length, from - 32);
    const boundary = streamGraphemes(content.slice(windowStart)).find(glyph => windowStart + glyph.index >= from);
    from = boundary ? windowStart + boundary.index : content.length;
  }
  const glyphs = streamGraphemes(content.slice(from));
  let index = 0;
  while (index < glyphs.length) {
    const last = batches.at(-1);
    const start = from + glyphs[index].index;
    // 高频单字分片接入同一小段，不为每个网络包额外等待一次。旧字的绝对时间不变。
    const merge = last && last.to === start && last.to - last.from < GROUP_UNITS
      && last.beginsAt + (start - last.from) * last.stepMs >= now + STREAM_HOLD_MS;
    const capacity = merge ? GROUP_UNITS - (last.to - last.from) : GROUP_UNITS;
    let end = start;
    do {
      const glyph = glyphs[index];
      if (end > start && from + glyph.index + glyph.text.length - start > capacity) break;
      end = from + glyph.index + glyph.text.length;
      index++;
    } while (index < glyphs.length && end - start < capacity);
    if (merge) {
      batches[batches.length - 1] = { ...last, to: end };
      continue;
    }
    // 下一段乱码在前一段最后几个字变清楚时出现，先交棒、再解码，而非两段同时闪完。
    const handoff = last ? batchTextEndsAt(last) - STREAM_HANDOFF_OVERLAP_MS : now;
    const appearsAt = Math.max(now, Math.min(handoff, now + STREAM_MAX_QUEUE_MS));
    batches.push({ from: start, to: end, appearsAt, beginsAt: appearsAt + STREAM_HOLD_MS, stepMs: STEP_MS });
  }
  return { content, enabled, batches };
}
export function createReveal(content: string, now: number, enabled: boolean): RevealState {
  return receiveReveal({ content: "", enabled, batches: [] }, content, now, enabled);
}
export function glyphSchedule(state: RevealState, sourceOffset: number): { appearsAt: number; readyAt: number } | undefined {
  const batch = state.batches.find(item => sourceOffset >= item.from && sourceOffset < item.to);
  return batch ? { appearsAt: batch.appearsAt, readyAt: batch.beginsAt + (sourceOffset - batch.from) * batch.stepMs } : undefined;
}
export function glyphReadyAt(state: RevealState, sourceOffset: number): number | undefined {
  return glyphSchedule(state, sourceOffset)?.readyAt;
}
const GLYPHS = ["░", "▒", "◇", "⋆", "⊹", "▧", "⌁", "⋄"];
export function scrambleGlyph(index: number): string {
  return GLYPHS[((index * 7) % GLYPHS.length + GLYPHS.length) % GLYPHS.length];
}
/** Markdown 的实体、转义与代码换行不一定与显示字符等长，按原文顺序定位，避免旧字被当成新字重播。 */
export function glyphSourceOffsets(glyphs: StreamGlyph[], source: string, start: number): number[] {
  let cursor = 0;
  return glyphs.map(glyph => {
    const entity = /^&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/i.exec(source.slice(cursor));
    if (entity && (glyph.text !== "&" || /^&amp;$/i.test(entity[0]))) {
      const offset = cursor;
      cursor += entity[0].length;
      return start + offset;
    }
    const found = source.indexOf(glyph.text, cursor);
    const offset = found >= 0 ? found : cursor;
    cursor = offset + glyph.text.length;
    return start + Math.min(offset, Math.max(0, source.length - 1));
  });
}

