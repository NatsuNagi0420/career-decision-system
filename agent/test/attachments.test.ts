/** 青穗集 · 图片附件和项目资料回归：验证消息归属、当前轮多模态发送与目录路径。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, reply, ScriptedModel } from "./helpers.js";

test("当前消息的图片附件会持久化，并只作为当前轮图片交给模型", async (t) => {
  const model = new ScriptedModel((request) => {
    const current = request.messages.at(-1)!;
    assert.equal(current.content, "请描述这张图");
    assert.deepEqual(current.images, [{ url: "data:image/png;base64,iVBORw0KGgo=" }]);
    return reply("我看到了图片。");
  });
  const f = await fixture(t, { model });
  const artifact = await f.workspace.import(
    f.conversation.id,
    "pasted.png",
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
  );
  f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "请描述这张图",
    crypto.randomUUID(),
    { attachment_ids: [artifact.id] },
  );
  await f.runtime.waitIdle();
  assert.equal(f.store.messages(f.conversation.id)[0].attachments?.[0].artifact_id, artifact.id);
  assert.equal(f.store.runs(f.conversation.id)[0].attachment_ids?.[0], artifact.id);
});
