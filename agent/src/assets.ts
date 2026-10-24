/** 青穗集 · 公共视觉素材服务：统一只读目录、固定类型、路径边界与条件缓存，不公开用户资料。 */
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";

export const DEFAULT_ASSET_DIR = fileURLToPath(new URL("../../assets/web/", import.meta.url));
const NAMESPACES = new Set(["brand", "dialogs", "live2d", "projects"]);
const MIME: Record<string, string> = {
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".gif": "image/gif", ".ico": "image/x-icon", ".avif": "image/avif",
  ".json": "application/json; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".frag": "text/plain; charset=utf-8", ".vert": "text/plain; charset=utf-8",
  ".moc3": "application/octet-stream", ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8",
};
function inside(root: string, path: string) {
  const tail = relative(root, path);
  return tail !== ".." && !tail.startsWith("../") && !tail.startsWith("..\\") && !isAbsolute(tail);
}
export function registerWebAssets(app: FastifyInstance, directory = DEFAULT_ASSET_DIR) {
  const root = resolve(directory);
  app.route<{ Params: { "*": string } }>({
    method: ["GET", "HEAD"], url: "/api/assets/*",
    async handler(request, reply) {
    const name = request.params["*"];
    const parts = name.split("/");
    const type = MIME[extname(name).toLowerCase()];
    if (!NAMESPACES.has(parts[0]!) || !type || parts.some(part => !part || part.startsWith(".") || /[\\\x00-\x1f\x7f:]/.test(part)))
      throw new AppError(404, "素材不存在。", "asset_not_found");
    const target = resolve(root, ...parts);
    if (!inside(root, target)) throw new AppError(404, "素材不存在。", "asset_not_found");
    try {
      const [actualRoot, actual] = await Promise.all([realpath(root), realpath(target)]);
      if (!inside(actualRoot, actual)) throw new AppError(404, "素材不存在。", "asset_not_found");
      const info = await stat(actual);
      if (!info.isFile()) throw new AppError(404, "素材不存在。", "asset_not_found");
      const etag = 'W/"' + info.size.toString(16) + "-" + info.mtimeMs.toString(16) + '"';
      reply.header("Cache-Control", "public, max-age=0, must-revalidate")
        .header("ETag", etag).header("Last-Modified", info.mtime.toUTCString())
        .header("X-Content-Type-Options", "nosniff").type(type);
      if (extname(name).toLowerCase() === ".html" || extname(name).toLowerCase() === ".svg")
        reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      if (request.headers["if-none-match"]?.split(",").some(value => value.trim() === etag || value.trim() === "*"))
        return reply.code(304).send();
      reply.header("Content-Length", info.size);
      if (request.method === "HEAD") return reply.send();
      return reply.send(createReadStream(actual));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(404, "素材不存在。", "asset_not_found");
    }
    },
  });
}
