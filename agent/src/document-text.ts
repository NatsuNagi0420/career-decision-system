/** 青穗集 · PDF／DOCX 正文提取：独立线程、资源边界与原文缓存，不执行文档脚本或使用 OCR。 */
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import { AppError, invariant } from "./errors.js";

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 200_000;
export const isTextDocument = (name: string) => [".pdf", ".docx"].includes(extname(name).toLowerCase());
export interface DocumentText { text: string; format: "pdf" | "docx"; pages?: number; }
const cache = new Map<string, DocumentText>();
let workers = 0;

function validateDocx(bytes: Buffer) {
  invariant(bytes.readUInt32LE(0) === 0x04034b50, 415, "文件不是有效的 DOCX，请从 Word 重新另存为 .docx。", "document_format");
  let end = bytes.length - 22;
  const min = Math.max(0, bytes.length - 65_557);
  while (end >= min && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  invariant(end >= min, 415, "DOCX 文件不完整，请重新导出。", "document_format");
  const count = bytes.readUInt16LE(end + 10), start = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12);
  invariant(bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0 && count > 0 && count <= 2048 && start + size === end && end + 22 + bytes.readUInt16LE(end + 20) === bytes.length && bytes.readUInt16LE(end + 8) === count, 415, "DOCX 内部结构不受支持。", "document_format");
  let cursor = start, total = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    invariant(cursor + 46 <= start + size && bytes.readUInt32LE(cursor) === 0x02014b50, 415, "DOCX 文件结构损坏。", "document_format");
    total += bytes.readUInt32LE(cursor + 24);
    invariant(total <= 24 * 1024 * 1024, 413, "DOCX 解压后过大，请精简文档再上传。", "document_limit");
    const flags = bytes.readUInt16LE(cursor + 8), length = bytes.readUInt16LE(cursor + 28);
    const method = bytes.readUInt16LE(cursor + 10), local = bytes.readUInt32LE(cursor + 42);
    invariant([0, 8].includes(method) && local + 30 <= start && bytes.readUInt32LE(local) === 0x04034b50, 415, "DOCX 内部压缩结构无效。", "document_format");
    invariant(bytes.readUInt16LE(local + 6) === flags && bytes.readUInt16LE(local + 8) === method, 415, "DOCX 压缩条目信息不一致。", "document_format");
    const localLength = bytes.readUInt16LE(local + 26), dataStart = local + 30 + localLength + bytes.readUInt16LE(local + 28);
    invariant(dataStart + bytes.readUInt32LE(cursor + 20) <= start && (flags & 8 || bytes.readUInt32LE(local + 22) === bytes.readUInt32LE(cursor + 24)), 415, "DOCX 压缩内容损坏。", "document_format");
    invariant(localLength === length && bytes.subarray(local + 30, local + 30 + localLength).equals(bytes.subarray(cursor + 46, cursor + 46 + length)), 415, "DOCX 压缩条目名称不一致。", "document_format");
    const next = cursor + 46 + length + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
    invariant(next <= start + size && !(flags & 1), 415, "暂不支持加密或损坏的 DOCX，请上传未加密版本。", "document_encrypted");
    const name = bytes.subarray(cursor + 46, cursor + 46 + length).toString("utf8");
    invariant(!names.has(name) && !name.includes("..") && !name.startsWith("/"), 415, "DOCX 文件结构不安全。", "document_format");
    names.add(name); cursor = next;
  }
  invariant(names.has("[Content_Types].xml") && names.has("word/document.xml") && !names.has("word/vbaProject.bin"), 415, "请上传标准 DOCX 文档，不支持带宏的 Word 文件。", "document_format");
}

// 使用可解析的包 URL，而非工作目录或额外脚本文件，兼容云端和安装包发布。
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const bytes = Buffer.from(workerData.bytes);
  let text = '', pages;
  if (workerData.format === 'pdf') {
    const { getDocumentProxy } = await import(workerData.pdfModule);
    const pdf = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, useSystemFonts: false, disableFontFace: true, maxImageSize: 16777216, verbosity: 0 });
    try {
      pages = pdf.numPages;
      if (pages > 40) throw Object.assign(new Error(), { code: 'document_limit' });
      for (let n = 1; n <= pages; n++) {
        const page = await pdf.getPage(n), content = await page.getTextContent();
        text += content.items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n\n';
        if (text.length > workerData.maxCharacters) throw Object.assign(new Error(), { code: 'document_limit' });
        page.cleanup();
      }
    } finally { await pdf.loadingTask.destroy(); }
  } else {
    const module = await import(workerData.wordModule);
    const result = await (module.default || module).extractRawText({ buffer: bytes });
    text = result.value;
  }
  parentPort.postMessage({ text, pages });
})().catch(error => parentPort.postMessage({ error: error.code === 'document_limit' ? 'document_limit' : error.name === 'PasswordException' ? 'document_encrypted' : 'document_format' }));
`;

export async function extractDocumentText(name: string, bytes: Buffer): Promise<DocumentText> {
  const format = extname(name).toLowerCase().slice(1) as DocumentText["format"];
  invariant(isTextDocument(name) && bytes.length >= 22 && bytes.length <= MAX_DOCUMENT_BYTES, 413, "PDF／DOCX 不能为空且不能超过 4 MB。", "document_limit");
  if (format === "pdf") invariant(bytes.subarray(0, 5).toString() === "%PDF-", 415, "文件内容不是 PDF，请重新导出。", "document_format");
  else validateDocx(bytes);
  const key = format + createHash("sha256").update(bytes).digest("hex");
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return cached; }
  invariant(workers < 2, 429, "正在读取其他文档，请稍后重新导入。", "document_busy");
  workers++;
  try {
    const value = await new Promise<{ text: string; pages?: number }>((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, execArgv: [], stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 192 }, workerData: { bytes, format, maxCharacters: MAX_TEXT_CHARACTERS, pdfModule: import.meta.resolve("unpdf"), wordModule: import.meta.resolve("mammoth") } });
      worker.stdout.resume(); worker.stderr.resume();
      const finish = () => { clearTimeout(timer); void worker.terminate(); };
      const timer = setTimeout(() => { finish(); reject(new AppError(408, "文档读取时间过长，请精简后重试。", "document_timeout")); }, 15_000);
      worker.once("message", value => {
        finish();
        if (value.error) {
          const messages: Record<string, string> = { document_limit: "文档超过 40 页或正文过长，请拆分后上传。", document_encrypted: "文档已加密，请上传解除密码保护的版本。", document_format: "文档无法读取，请重新导出为文字版 PDF 或 DOCX。" };
          reject(new AppError(422, messages[value.error] ?? messages.document_format, value.error));
        } else resolve(value);
      });
      worker.once("error", () => { finish(); reject(new AppError(422, "文档读取失败，请重新导出或精简后上传。", "document_format")); });
      worker.once("exit", code => { if (code !== 0) { clearTimeout(timer); reject(new AppError(422, "文档读取已停止，请精简后重试。", "document_format")); } });
    });
    const text = value.text.replace(/\u0000/g, "").trim();
    invariant(/[\p{L}\p{N}]/u.test(text), 422, "没有提取到正文，可能是扫描件或纯图片文档。请上传可选中文字的 PDF 或 DOCX；暂未启用 OCR。", "document_no_text");
    invariant(text.length <= MAX_TEXT_CHARACTERS, 413, "文档正文过长，请拆分后上传。", "document_limit");
    const result = { text, format, ...(value.pages ? { pages: value.pages } : {}) };
    cache.set(key, result);
    while (cache.size > 8) cache.delete(cache.keys().next().value!);
    return result;
  } finally { workers--; }
}
