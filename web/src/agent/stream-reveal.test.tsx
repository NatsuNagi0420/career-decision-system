/** 青穗集 · 流式粒子解码回归：完整分片占位、旧字稳定、字素边界、Markdown 安全与动画有界。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent } from "./MessageContent";
import { batchEndsAt, batchTextEndsAt, createReveal, glyphReadyAt, glyphSchedule, glyphSourceOffsets, receiveReveal, settleReveal, streamGraphemes, STREAM_HOLD_MS, STREAM_HANDOFF_OVERLAP_MS, STREAM_MAX_QUEUE_MS } from "./stream-reveal";

function render(content: string, now = 1000) {
  return renderToStaticMarkup(<MessageContent content={content} reveal={{ state: createReveal(content, now, true), now }} />);
}
function tokens(html: string) { return (html.match(/class="stream-token"/g) ?? []).length; }

describe("已收分片的粒子显字", () => {
  it("这是示例文字：六个已收汉字对应六个等位乱码，不只是三个尾字符", () => {
    const content = "这是示例文字", state = createReveal(content, 1000, true);
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0]).toMatchObject({ from: 0, to: 6 });
    expect(tokens(render(content))).toBe(6);
    expect(render(content)).toContain('class="stream-token__letter">这</span>');
    expect(render(content)).toContain('class="stream-token__glyph"');
    expect(render(content)).toContain('data-particles="true"');
    for (let index = 0; index < content.length; index++) expect(glyphReadyAt(state, index)).toBeGreaterThan(1000);
    expect(glyphReadyAt(state, content.length)).toBeUndefined();
  });
  it("已收字符先占位，逐字分片合并为连续小段，旧字时间不被改变", () => {
    let state = createReveal("第一批", 1000, true);
    const first = glyphReadyAt(state, 0)!;
    state = receiveReveal(state, "第一批第二批", 1030, true);
    expect(glyphReadyAt(state, 0)).toBe(first);
    expect(glyphReadyAt(state, 3)).toBeGreaterThan(glyphReadyAt(state, 2)!);
    expect(state.content).toBe("第一批第二批");
    expect(state.batches.at(-1)?.to).toBe(6);
  });
  it("上一段快解完时下一段乱码已经出现，下一段解码不与前段同时闪完", () => {
    const state = createReveal("甲".repeat(16) + "乙".repeat(16), 1000, true);
    const [first, second] = state.batches;
    expect(state.batches).toHaveLength(2);
    expect(second.appearsAt).toBe(batchTextEndsAt(first) - STREAM_HANDOFF_OVERLAP_MS);
    expect(second.appearsAt).toBeLessThan(batchTextEndsAt(first));
    expect(second.beginsAt).toBeGreaterThan(batchTextEndsAt(first));
    expect(glyphSchedule(state, 16)?.appearsAt).toBe(second.appearsAt);
    expect(second.beginsAt - second.appearsAt).toBe(STREAM_HOLD_MS);
    expect(batchTextEndsAt(first) - 1000).toBeGreaterThan(800);
  });
  it("后一片已收时接入前段交棒位置，不以网络包到达时间重新开始整个动画", () => {
    const prior = createReveal("甲".repeat(16), 1000, true);
    const state = receiveReveal(prior, prior.content + "乙".repeat(8), 1200, true);
    expect(state.batches[0]).toEqual(prior.batches[0]);
    expect(state.batches[1].appearsAt).toBe(batchTextEndsAt(prior.batches[0]) - STREAM_HANDOFF_OVERLAP_MS);
    expect(state.batches[1].appearsAt).toBeGreaterThan(1200);
  });
  it("晚到的分片不能套用已过去的显字时刻，每个新字都先有乱码停留", () => {
    const prior = createReveal("第一批", 1000, true);
    const state = receiveReveal(prior, prior.content + "晚到的新字", 1600, true);
    expect(state.batches[0]).toEqual(prior.batches[0]);
    const next = glyphSchedule(state, prior.content.length)!;
    expect(next.appearsAt).toBeGreaterThanOrEqual(1600);
    expect(next.readyAt - next.appearsAt).toBeGreaterThanOrEqual(STREAM_HOLD_MS);
  });
  it("很晚才返回下一片时立即衔接，不伪造未收到的字，也不保留旧队列继续等", () => {
    const prior = createReveal("已经完成", 1000, true);
    const state = receiveReveal(prior, prior.content + "网络现在才返回", 6000, true);
    expect(state.batches).toHaveLength(1);
    expect(state.batches[0].from).toBe(prior.content.length);
    expect(state.batches[0].appearsAt).toBe(6000);
    expect(glyphSchedule(state, state.content.length)).toBeUndefined();
  });
  it("已解码正文不回到乱码，流式结束后完整文本直接保留且遮罩可回收", () => {
    const old = settleReveal(createReveal("已经读到的文字", 1000, true), 3000);
    const state = receiveReveal(old, old.content + "新文字", 3010, true);
    expect(glyphReadyAt(state, 0)).toBeUndefined();
    expect(glyphReadyAt(state, old.content.length)).toBeGreaterThan(3010);
    const html = renderToStaticMarkup(<MessageContent content={state.content} reveal={{ state, now: 3010 }} />);
    expect(tokens(html)).toBe(3);
    expect(html).toContain("已经读到的文字");
    expect(settleReveal(state, 6000).batches).toHaveLength(0);
  });
  it("历史消息、关闭动效和内容替换都直接显示，不重播旧段落", () => {
    const state = createReveal("直接读正文", 1000, false);
    expect(state.batches).toEqual([]);
    expect(renderToStaticMarkup(<MessageContent content={state.content} />)).not.toContain("stream-token");
    const prior = createReveal("旧答案", 1000, true);
    expect(receiveReveal(prior, "不同的新答案", 1100, true).batches).toEqual([]);
    expect(receiveReveal(prior, prior.content, 1100, false).batches).toEqual([]);
  });
  it("emoji、组合符、空格、换行保留，不拆成残缺字符或给空白生成噪声", () => {
    expect(streamGraphemes("你👩‍💻e\u0301好").map(glyph => glyph.text)).toEqual(["你", "👩‍💻", "e\u0301", "好"]);
    expect(tokens(render("你👩‍💻e\u0301 好\n下一行"))).toBe(7);
    expect(render("第一行\n第二行")).toContain("\n");
    const glyphs = streamGraphemes("甲&乙😀");
    expect(glyphSourceOffsets(glyphs, "甲&amp;乙😀", 10)).toEqual([10, 11, 16, 17]);
  });
  it("大量返回和连续分片动画都有限长，不排队几十秒，也不长时间保留逐字 DOM", () => {
    const state = createReveal("文".repeat(8000), 1000, true);
    expect(state.batches[0].to - state.batches[0].from).toBeLessThanOrEqual(1200);
    expect(Math.max(...state.batches.map(batchEndsAt)) - 1000).toBeLessThanOrEqual(STREAM_MAX_QUEUE_MS + 1250);
    expect(tokens(render(state.content))).toBeLessThanOrEqual(1200);
    expect(settleReveal(state, 4000).batches).toEqual([]);
    let stream = createReveal("", 0, true);
    for (let index = 0; index < 500; index++) stream = receiveReveal(stream, "文".repeat(index + 1), index * 32, true);
    expect(stream.batches.length).toBeLessThan(50);
  });
});

describe("粒子效果不改 Markdown 与文件安全边界", () => {
  it("标题、强调、列表和代码保留原有结构，只有可见文字被包装", () => {
    const html = render("# 标题\n\n**重点**和`代码`\n\n- 项目一\n- 项目二\n\n```ts\nconst a = 1;\n```");
    expect(html).toContain("<h1>"); expect(html).toContain("<strong>");
    expect(html).toContain("<ul>"); expect(html).toContain("<code>");
    expect(html).toContain('<code class="language-ts">');
    expect(html).not.toContain('class="stream-token__letter">*</span>');
    expect(tokens(html)).toBeGreaterThan(20);
  });
  it("链接目标不参与乱码，远程图片不加载，HTML 和危险协议继续被禁用", () => {
    const html = render('[查看资料](https://example.com)\n\n![图片](https://example.com/a.png)\n\n<script>alert(1)</script>\n\n[危险](javascript:alert(1))');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("<img"); expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:'); expect(html).toContain("图片未自动加载");
    expect(html).toContain('aria-hidden="true"');
  });
});

