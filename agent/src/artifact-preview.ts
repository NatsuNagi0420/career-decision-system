/** 青穗集 · 文件预览分类：只预览核验后的文件版本，二进制不冒充文本，网页不执行脚本。 */
import { extname } from "node:path";
export type PreviewKind = "markdown" | "text" | "json" | "csv" | "html" | "image" | "pdf" | "unsupported";
const TEXT = new Set([".txt", ".log", ".yaml", ".yml", ".ts", ".tsx", ".js", ".jsx", ".css", ".xml", ".svg", ".py", ".sql", ".sh", ".ps1"]);
export function describePreview(name: string, bytes: Buffer) {
  const ext = extname(name).toLowerCase();
  let kind: PreviewKind = "unsupported", mime = "application/octet-stream", content = "", truncated = false;
  if (ext === ".png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) { kind = "image"; mime = "image/png"; }
  else if ([".jpg", ".jpeg"].includes(ext) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) { kind = "image"; mime = "image/jpeg"; }
  else if (ext === ".gif" && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))) { kind = "image"; mime = "image/gif"; }
  else if (ext === ".webp" && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP") { kind = "image"; mime = "image/webp"; }
  else if (ext === ".pdf" && bytes.subarray(0, 5).toString() === "%PDF-") { kind = "pdf"; mime = "application/pdf"; }
  else if ([".md", ".markdown", ".json", ".csv", ".html", ".htm"].includes(ext) || TEXT.has(ext)) {
    try {
      if (!bytes.includes(0)) {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        kind = [".md", ".markdown"].includes(ext) ? "markdown" : ext === ".json" ? "json" : ext === ".csv" ? "csv" : [".html", ".htm"].includes(ext) ? "html" : "text";
        content = text.slice(0, 120000); truncated = text.length > content.length; mime = "text/plain; charset=utf-8";
      }
    } catch { /* 非 UTF-8 文件保留下载入口，不展示乱码。 */ }
  }
  return { preview_kind: kind, mime, content, truncated };
}
