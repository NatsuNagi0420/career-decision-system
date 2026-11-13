/** 青穗集 · B站教学搜索与公开字幕：按需读取白名单资源，不下载视频或持久化字幕。 */
import { createHash } from "node:crypto";
import { isRecord } from "./errors.js";
import type { LearningCaption, LearningResource, LearningSearchResult, LearningSubtitleResult, LearningSubtitleTrack } from "./learning-contract.js";

export function bilibiliSearchUrl(query: string) { return "https://search.bilibili.com/all?keyword=" + encodeURIComponent(query); }
export function cleanVideoText(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " " })[entity] ?? " ").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}
function videoCover(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.startsWith("//") ? "https:" + value : value);
    return url.protocol === "https:" && url.hostname.endsWith(".hdslb.com") ? url.href : undefined;
  } catch { return undefined; }
}
export function parseBilibiliResults(value: unknown, query: string): LearningResource[] {
  if (!isRecord(value) || value.code !== 0 || !isRecord(value.data) || !Array.isArray(value.data.result)) return [];
  const groups = value.data.result;
  const rows = groups.flatMap(item =>
    isRecord(item) && item.result_type === "video" && Array.isArray(item.data) ? item.data :
      isRecord(item) && typeof item.bvid === "string" ? [item] : [],
  );
  const seen = new Set<string>();
  return rows.flatMap(item => {
    if (!isRecord(item) || typeof item.bvid !== "string" || !/^BV[0-9A-Za-z]{10}$/.test(item.bvid) || seen.has(item.bvid)) return [];
    const title = cleanVideoText(item.title);
    if (!title) return [];
    seen.add(item.bvid);
    return [{ id: createHash("sha256").update(item.bvid).digest("hex").slice(0, 32), bvid: item.bvid, title,
      author: cleanVideoText(item.author, 100), duration: cleanVideoText(item.duration, 30),
      ...(videoCover(item.pic ?? item.cover) ? { cover: videoCover(item.pic ?? item.cover)! } : {}),
      ...(typeof item.play === "number" && Number.isSafeInteger(item.play) && item.play >= 0 ? { views: item.play } : {}),
      ...(cleanVideoText(item.description ?? item.desc, 500) ? { description: cleanVideoText(item.description ?? item.desc, 500) } : {}),
      url: "https://www.bilibili.com/video/" + item.bvid + "/", query, fetched_at: new Date().toISOString() }];
  }).slice(0, 6);
}
export async function searchBilibili(query: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<LearningSearchResult> {
  const base = { query, resources: [] as LearningResource[], search_url: bilibiliSearchUrl(query) };
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  try {
    const url = new URL("https://api.bilibili.com/x/web-interface/search/all/v2");
    url.search = new URLSearchParams({ keyword: query, page: "1" }).toString();
    const response = await fetcher(url, { signal: combined, redirect: "error", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36", Referer: "https://search.bilibili.com/", Accept: "application/json, text/plain, */*" } });
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
    if (!resources.length) throw new Error("search_empty_response");
    return { ...base, resources, status: resources.length ? "available" : "empty", message: resources.length ? "" : "暂未找到结果，可以换个关键词或打开B站搜索。" };
  } catch {
    signal?.throwIfAborted();
    return { ...base, status: "unavailable", message: "暂时无法读取B站结果，可以直接打开站内搜索。" };
  }
}

async function readJson(response: Response, limit = 2_000_000): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty_response");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("response_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function safeSubtitleUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.startsWith("//") ? "https:" + value : value);
    return url.protocol === "https:" && (url.hostname.endsWith(".hdslb.com") || url.hostname === "subtitle.bilibili.com") ? url.href : null;
  } catch { return null; }
}

export function parseBilibiliCaptions(value: unknown): LearningCaption[] {
  if (!isRecord(value) || !Array.isArray(value.body)) return [];
  return value.body.slice(0, 12000).flatMap(item => {
    if (!isRecord(item) || typeof item.from !== "number" || typeof item.to !== "number" || !Number.isFinite(item.from) || !Number.isFinite(item.to) || item.from < 0 || item.to <= item.from) return [];
    const text = cleanVideoText(item.content, 1200);
    return text ? [{ start: item.from, end: item.to, text }] : [];
  });
}

// B站 player/WBI 字幕接口使用 nav 返回的图片 key 和固定置换表生成签名。
const WBI_MIXIN_ORDER = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];

function wbiMixinKey(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.wbi_img)) return null;
  const imageKey = (url: unknown) => typeof url === "string" ? url.match(/\/([A-Za-z0-9]+)\.png(?:\?.*)?$/)?.[1] ?? null : null;
  const img = imageKey(value.data.wbi_img.img_url), sub = imageKey(value.data.wbi_img.sub_url);
  if (!img || !sub) return null;
  const raw = img + sub;
  return WBI_MIXIN_ORDER.map(index => raw[index] ?? "").join("").slice(0, 32);
}

function signedWbiUrl(path: string, values: Record<string, string>, mixinKey: string) {
  const query = Object.keys(values).sort().map(key => key + "=" + encodeURIComponent(values[key].replace(/[!'()*]/g, ""))).join("&");
  const signature = createHash("md5").update(query + mixinKey).digest("hex");
  return "https://api.bilibili.com" + path + "?" + query + "&w_rid=" + signature;
}

export async function readBilibiliSubtitles(bvid: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<LearningSubtitleResult> {
  const result = (status: LearningSubtitleResult["status"], message: string, tracks: LearningSubtitleTrack[] = []): LearningSubtitleResult => ({ status, message, tracks });
  if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) return result("unavailable", "视频编号无效。");
  const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/132.0.0.0 Safari/537.36", Referer: "https://www.bilibili.com/video/" + bvid + "/", Accept: "application/json, text/plain, */*" };
  const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
  try {
    const viewUrl = new URL("https://api.bilibili.com/x/web-interface/view");
    viewUrl.searchParams.set("bvid", bvid);
    const viewResponse = await fetcher(viewUrl, { signal: combined, redirect: "error", headers });
    if (!viewResponse.ok) throw new Error("video_unavailable");
    const view: unknown = await readJson(viewResponse, 500_000);
    if (!isRecord(view) || view.code !== 0 || !isRecord(view.data) || typeof view.data.cid !== "number" || typeof view.data.aid !== "number") throw new Error("video_unavailable");
    const navResponse = await fetcher("https://api.bilibili.com/x/web-interface/nav", { signal: combined, redirect: "error", headers });
    if (!navResponse.ok) throw new Error("wbi_unavailable");
    const mixinKey = wbiMixinKey(await readJson(navResponse, 500_000));
    if (!mixinKey) throw new Error("wbi_unavailable");
    const wts = String(Math.floor(Date.now() / 1000));
    const playerUrl = signedWbiUrl("/x/player/wbi/v2", { aid: String(view.data.aid), cid: String(view.data.cid), wts }, mixinKey);
    const playerResponse = await fetcher(playerUrl, { signal: combined, redirect: "error", headers });
    if (!playerResponse.ok) throw new Error("subtitle_unavailable");
    const player: unknown = await readJson(playerResponse, 500_000);
    if (!isRecord(player) || player.code !== 0 || !isRecord(player.data)) throw new Error("subtitle_unavailable");
    const tracks = isRecord(player.data.subtitle) && Array.isArray(player.data.subtitle.subtitles) ? player.data.subtitle.subtitles : [];
    const captions: LearningSubtitleTrack[] = []; let loginRequired = player.data.need_login_subtitle === true, blocked = false;
    for (const track of tracks.slice(0, 4)) {
      if (!isRecord(track)) continue;
      const url = safeSubtitleUrl(track.subtitle_url);
      if (!url) continue;
      const response = await fetcher(url, { signal: combined, redirect: "error", headers });
      if (response.status === 401) { loginRequired = true; continue; }
      if (response.status === 403) { blocked = true; continue; }
      if (!response.ok) continue;
      const data: unknown = await readJson(response, 2_000_000);
      const items = parseBilibiliCaptions(data);
      if (items.length) captions.push({ language: cleanVideoText(track.lan, 40), label: cleanVideoText(track.lan_doc, 80) || "字幕", captions: items });
    }
    if (captions.length) return result("available", "", captions);
    if (loginRequired) return result("login_required", "这条视频有 B 站 AI 字幕，但 B 站要求登录后才能读取。当前不会读取或保存你的 B 站登录信息。");
    if (blocked) return result("unavailable", "B 站暂时拒绝读取字幕，可以在 B 站播放器中查看。");
    return result("no_subtitles", "这条视频暂时没有可读取的字幕。");
  } catch {
    signal?.throwIfAborted();
    return result("unavailable", "字幕暂时无法读取，可以在 B 站播放器中查看。");
  }
}
