/** 青穗集 · 简历参数流读取：只读取已经到达的 JSON 值；纸面可展示已收到的文本前缀，标识字段必须完整，不执行模型代码。 */
interface PartialValue { value?: unknown; end: number; complete: boolean }
export function readPartialResumeJson(input: string, previewText = false): unknown {
  if (!input || input.length > 256_000) return null;
  const space = (index: number) => { while (/\s/.test(input[index] ?? "") && index < input.length) index++; return index; };
  function read(index: number, depth: number, path: Array<string | number> = []): PartialValue {
    if (depth > 24) throw new SyntaxError("JSON too deep");
    index = space(index);
    const char = input[index];
    if (char === undefined) return { end: index, complete: false };
    if (char === '"') {
      for (let end = index + 1; end < input.length; end++) {
        if (input[end] === "\\") { end++; continue; }
        if (input[end] === '"') return { value: JSON.parse(input.slice(index, end + 1)), end: end + 1, complete: true };
      }
      // 只允许可见文本的真实前缀。请求 ID、事实 ID、kind 等控制字段不补全。
      const field = path.at(-1), parent = path.at(-2);
      if (previewText && (["text", "title", "subtitle", "period"].includes(String(field)) || parent === "bullets")) {
        let end = input.length;
        const tail = input.slice(index + 1);
        const dangling = /\\(?:u[0-9a-fA-F]{0,3})?$/.exec(tail);
        if (dangling) end = index + 1 + dangling.index;
        try {
          let value: string = JSON.parse(input.slice(index, end) + '"');
          if (/[\uD800-\uDBFF]$/.test(value)) value = value.slice(0, -1);
          return { value, end: input.length, complete: false };
        } catch { throw new SyntaxError("Invalid JSON string escape"); }
      }
      return { end: input.length, complete: false };
    }
    if (char === "{" || char === "[") {
      const object: Record<string, unknown> = Object.create(null);
      const array: unknown[] = [];
      const value = char === "{" ? object : array;
      const close = char === "{" ? "}" : "]";
      index = space(index + 1);
      if (input[index] === close) return { value, end: index + 1, complete: true };
      while (index < input.length) {
        let key = "";
        if (char === "{") {
          if (input[index] !== '"') throw new SyntaxError("Expected key");
          const name = read(index, depth + 1);
          if (!name.complete) return { value, end: name.end, complete: false };
          key = String(name.value);
          index = space(name.end);
          if (index === input.length) return { value, end: index, complete: false };
          if (input[index] !== ":") throw new SyntaxError("Expected colon");
          index++;
        }
        const child = read(index, depth + 1, [...path, char === "{" ? key : array.length]);
        if (child.value !== undefined) { if (char === "{") object[key] = child.value; else array.push(child.value); }
        if (!child.complete) return { value, end: child.end, complete: false };
        index = space(child.end);
        if (input[index] === close) return { value, end: index + 1, complete: true };
        if (index === input.length) return { value, end: index, complete: false };
        if (input[index] !== ",") throw new SyntaxError("Expected comma");
        index = space(index + 1);
        if (input[index] === close) throw new SyntaxError("Trailing comma");
      }
      return { value, end: index, complete: false };
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=[\s,}\]]|$)/.exec(input.slice(index));
    if (literal) return { value: JSON.parse(literal[0]), end: index + literal[0].length, complete: true };
    if (/^(?:t|tr|tru|f|fa|fal|fals|n|nu|nul|-)$/.test(input.slice(index))) return { end: input.length, complete: false };
    throw new SyntaxError("Invalid JSON token");
  }
  try {
    const parsed = read(0, 0);
    return parsed.complete && input.slice(parsed.end).trim() ? null : parsed.value ?? null;
  } catch { return null; }
}
