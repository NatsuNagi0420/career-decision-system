/** 青穗集 · B站教学搜索：仅读取公开元数据，不下载视频；失败时返回真实站内搜索入口。 */
import { createHash } from "node:crypto";
import { isRecord } from "./errors.js";
import type { LearningResource, LearningSearchResult } from "./learning-contract.js";

export function bilibiliSearchUrl(query: string) { return "https://search.bilibili.com/all?keyword=" + encodeURIComponent(query); }
export function cleanVideoText(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " })[entity] ?? " ").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}
export function parseBilibiliResults(value: unknown, query: string): LearningResource[] {
  if (!isRecord(value) || value.code !== 0 || !isRecord(value.data) || !Array.isArray(value.data.result)) return [];
  const seen = new Set<string>();
  return value.data.result.flatMap(item => {
    if (!isRecord(item) || typeof item.bvid !== "string" || !/^BV[0-9A-Za-z]{10}$/.test(item.bvid) || seen.has(item.bvid)) return [];
    const title = cleanVideoText(item.title);
    if (!title) return [];
    seen.add(item.bvid);
    return [{ id: createHash("sha256").update(item.bvid).digest("hex").slice(0, 32), bvid: item.bvid, title,
      author: cleanVideoText(item.author, 100), duration: cleanVideoText(item.duration, 30),
      url: "https://www.bilibili.com/video/" + item.bvid + "/", query, fetched_at: new Date().toISOString() }];
  }).slice(0, 6);
}
export async function searchBilibili(query: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<LearningSearchResult> {
  const base = { query, resources: [] as LearningResource[], search_url: bilibiliSearchUrl(query) };
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  try {
    const url = new URL("https://api.bilibili.com/x/web-interface/search/type");
    url.search = new URLSearchParams({ search_type: "video", keyword: query, page: "1", order: "totalrank" }).toString();
    const response = await fetcher(url, { signal: combined, redirect: "error", headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/", Accept: "application/json" } });
    if (!response.ok) throw new Error("search_unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("empty_response");
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1500000) throw new Error("response_too_large");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!isRecord(data) || data.code !== 0) throw new Error("search_unavailable");
    const resources = parseBilibiliResults(data, query);
    return { ...base, resources, status: resources.length ? "available" : "empty", message: resources.length ? "" : "暂未找到结果，可以换个关键词或打开B站搜索。" };
  } catch {
    signal?.throwIfAborted();
    return { ...base, status: "unavailable", message: "暂时无法读取B站结果，可以直接打开站内搜索。" };
  }
}
