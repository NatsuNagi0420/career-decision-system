/** 青穗集 · 聊天加粗兼容：修复中文引号/多余空格造成的成对星号裸露，不改原文、代码或转义字符。 */
import type { Nodes, Parent, Root, RootContent, Text, PhrasingContent } from "mdast";

export function remarkChatEmphasis() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value ?? "");
    function repair(node: Text): PhrasingContent[] {
      const start = node.position?.start.offset;
      // 转义、实体或已被解析的标记不做猜测，确保粒子显字仍能对应原始位置。
      if (start === undefined || source.slice(start, node.position?.end.offset) !== node.value) return [node];
      const value = node.value;
      const point = (index: number) => {
        const lines = value.slice(0, index).split("\n");
        return { line: node.position!.start.line + lines.length - 1, column: lines.length === 1 ? node.position!.start.column + index : lines.at(-1)!.length + 1, offset: start + index };
      };
      const text = (from: number, to: number): Text => ({ type: "text", value: value.slice(from, to), position: { start: point(from), end: point(to) } });
      const output: PhrasingContent[] = [];
      const pattern = /(?<![\\*])\*\*([^*\n]+?)\*\*(?!\*)/gu;
      let cursor = 0;
      for (const match of value.matchAll(pattern)) {
        const body = match[1];
        // 只兼容中文/日文自然语言，避免把乘方表达式或孤立标记误当加粗。
        if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(body)) continue;
        const inner = match.index + 2;
        const left = body.length - body.trimStart().length;
        const right = body.trimEnd().length;
        if (cursor < match.index) output.push(text(cursor, match.index));
        if (left) output.push(text(inner, inner + left));
        output.push({ type: "strong", children: [text(inner + left, inner + right)], position: { start: point(match.index), end: point(match.index + match[0].length) } });
        if (right < body.length) output.push(text(inner + right, inner + body.length));
        cursor = match.index + match[0].length;
      }
      if (!output.length) return [node];
      if (cursor < value.length) output.push(text(cursor, value.length));
      return output;
    }
    function visit(node: Nodes) {
      if (["code", "inlineCode", "html", "strong", "emphasis"].includes(node.type) || !("children" in node)) return;
      const parent = node as Parent;
      parent.children = parent.children.flatMap<RootContent>(child => {
        if (child.type === "text") return repair(child);
        visit(child);
        return [child];
      });
    }
    visit(tree);
  };
}
