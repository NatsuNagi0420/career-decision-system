/** 青穗集 · 公共素材接口回归：真实文件读取、缓存、类型与目录边界，不使用用户资料。 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import { DEFAULT_ASSET_DIR, registerWebAssets } from "../src/assets.js";
import { AppError } from "../src/errors.js";
import { temporary } from "./helpers.js";

test("公共网页素材只读服务", async t => {
  const dir = await temporary("web-assets");
  const root = join(dir, "public");
  await mkdir(join(root, "brand"), { recursive: true });
  await mkdir(join(root, "dialogs"), { recursive: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=", "base64");
  await writeFile(join(root, "brand", "sample.png"), png);
  await writeFile(join(root, "dialogs", "window.webp"), Buffer.from("RIFFfixtureWEBP"));
  await writeFile(join(root, "brand", "private.sqlite"), "not a public format");
  await writeFile(join(dir, "private.png"), "must not leave the asset directory");
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof AppError ? error.status : 500).send({ code: error instanceof AppError ? error.code : "unexpected" }));
  registerWebAssets(app, root);
  t.after(() => app.close());

  await t.test("PNG 与 WebP 保留真实内容、正确 MIME 与只读缓存头", async () => {
    const response = await app.inject("/api/assets/brand/sample.png");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.rawPayload, png);
    assert.equal(response.headers["content-type"], "image/png");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["cache-control"], "public, max-age=0, must-revalidate");
    assert.equal(Number(response.headers["content-length"]), png.length);
    const webp = await app.inject("/api/assets/dialogs/window.webp");
    assert.equal(webp.statusCode, 200);
    assert.equal(webp.headers["content-type"], "image/webp");
  });

  await t.test("ETag 条件请求返回无正文的 304，HEAD 不发送文件内容", async () => {
    const first = await app.inject("/api/assets/brand/sample.png");
    const etag = String(first.headers.etag);
    assert.match(etag, /^W\/".+"$/);
    for (const value of [etag, '"other", ' + etag, "*"]) {
      const response = await app.inject({ url: "/api/assets/brand/sample.png", headers: { "if-none-match": value } });
      assert.equal(response.statusCode, 304);
      assert.equal(response.body, "");
    }
    const head = await app.inject({ method: "HEAD", url: "/api/assets/brand/sample.png" });
    assert.equal(head.statusCode, 200);
    assert.equal(head.body, "");
    assert.equal(Number(head.headers["content-length"]), png.length);
  });

  await t.test("缺失、隐藏文件、非法类型和路径穿越都不公开", async () => {
    for (const url of [
      "/api/assets/brand/missing.png", "/api/assets/brand/private.sqlite",
      "/api/assets/uploads/sample.png", "/api/assets/brand/.hidden.png",
      "/api/assets/brand/%2e%2e/%2e%2e/private.png",
      "/api/assets/brand/..%5c..%5cprivate.png", "/api/assets/brand/C%3a/private.png",
      "/api/assets/brand//sample.png", "/api/assets/brand/sample.png%00",
    ]) {
      const response = await app.inject({ url });
      assert.equal(response.statusCode, 404, url);
      assert.ok(!response.body.includes("must not leave"), url);
    }
    assert.equal((await app.inject({ method: "POST", url: "/api/assets/brand/sample.png" })).statusCode, 404);
  });

  await t.test("不能通过目录链接读取公共目录外的文件", async () => {
    await symlink(dir, join(root, "brand", "outside"), process.platform === "win32" ? "junction" : "dir");
    const response = await app.inject("/api/assets/brand/outside/private.png");
    assert.equal(response.statusCode, 404);
  });
});

test("默认素材目录在源码与生产构建中均指向项目 assets/web", async t => {
  const app = Fastify();
  registerWebAssets(app);
  t.after(() => app.close());
  assert.match(DEFAULT_ASSET_DIR.replaceAll("\\", "/"), /\/assets\/web\/?$/);
  for (const [file, mime] of [
    ["brand/suinai-avatar/suinai-avatar.png", "image/png"],
    ["dialogs/warning-window.webp", "image/webp"],
    ["projects/qingsuiji-boot/scene-1/lottie.json", "application/json"],
    ["projects/qingsuiji-boot/scene-1/poster.svg", "image/svg+xml"],
    ["live2d/core/live2dcubismcore.min.js", "text/javascript"],
  ]) {
    const response = await app.inject("/api/assets/" + file);
    assert.equal(response.statusCode, 200, file);
    assert.ok(String(response.headers["content-type"]).startsWith(mime!), file);
    if (file!.endsWith(".svg")) assert.match(String(response.headers["content-security-policy"]), /sandbox/);
  }
});
