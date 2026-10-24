/** 青穗集 · 文件引用规则：链接必须对应已登记版本，禁止模型编造地址或使用任意本机路径。 */
import type { AgentFile } from "./types";
export function latestFiles(files: AgentFile[]) {
  const ordered = [...files].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.version - a.version);
  return ordered.filter((file, index) => ordered.findIndex(item => item.path === file.path) === index);
}
export function isArtifactReference(href: string) {
  return /^(artifact:|sandbox:|file:|(?:\.\/)?(?:outputs|inputs)\/|\/api\/v1\/agent\/artifacts\/)/i.test(href);
}
export function resolveArtifactLink(href: string | undefined, files: AgentFile[], runId?: string | null): AgentFile | undefined {
  if (!href) return;
  const direct = href.match(/^artifact:(?:\/\/)?([a-f\d-]{36})(?:[#?].*)?$/i)
    ?? href.match(/^\/api\/v1\/agent\/artifacts\/([a-f\d-]{36})(?:\/(?:preview|download|content))?(?:[#?].*)?$/i);
  if (direct) return files.find(file => file.id === direct[1]?.toLowerCase());
  let path: string;
  try { path = decodeURIComponent(href.split(/[?#]/)[0]!); } catch { return; }
  const sandbox = path.startsWith("sandbox:/mnt/data/");
  path = path.replace(/^sandbox:\/mnt\/data\//, "").replace(/^\.\//, "");
  if (path.includes("\\") || path.split("/").some(part => part === ".." || part === ".")) return;
  const matches = latestFiles(files.filter(file => file.path === path || (sandbox && !path.includes("/") && file.name === path)));
  if (runId) {
    const current = latestFiles(files.filter(file => file.run_id === runId && (file.path === path || (sandbox && !path.includes("/") && file.name === path))));
    if (current.length === 1) return current[0];
  }
  if ((path.startsWith("outputs/") || path.startsWith("inputs/") || sandbox) && matches.length === 1) return matches[0];
}
export function unlinkedFiles(content: string, files: AgentFile[]) {
  const linked = new Set([...content.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)].map(match => resolveArtifactLink(match[1], files)?.id).filter(Boolean));
  return latestFiles(files).filter(file => !linked.has(file.id));
}
export function formatFileSize(bytes: number) { return bytes < 1024 ? bytes + " B" : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + " KB" : (bytes / (1024 * 1024)).toFixed(1) + " MB"; }
export function canOpenLocally(name: string) { return /\.(txt|md|markdown|csv|json|yaml|yml|log|pdf|png|jpe?g|webp|gif|avif|docx|xlsx|pptx|zip)$/i.test(name); }
export function parseCsv(text: string, limit = 200) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length && rows.length < limit; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === "," && !quoted) { if (row.length < 40) row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i++; if (row.length < 40) row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if ((cell || row.length) && rows.length < limit) { if (row.length < 40) row.push(cell); rows.push(row); }
  return rows;
}
