/** 青穗集 · 可选云端执行器：只认领 cloud 会话，用户模型请求仍经过官方计费服务。 */
import type { AgentContext } from "./http.js";
import type { HubRepository } from "./repository.js";
import { TaskExecutor, type WorkerClient } from "./executor.js";
export function startCloudExecutor(ctx: AgentContext, repo: HubRepository, maxConcurrent = 2) {
  const executor = new TaskExecutor(ctx); let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined; let job: Promise<void> | undefined;
  const poll = async () => {
    if (stopped) return;
    const owners = new Set([...repo.cloudOwners(), ...running]);
    for (const owner of owners) {
      const user = ctx.store.getUser(owner), key = "cloud:" + owner;
      if (!executor.busy(key) && running.size >= maxConcurrent) continue;
      const token = await ctx.accounts?.officialKey(user);
      if (!token) { executor.stop(key); running.delete(owner); continue; }
      try { await ctx.accounts!.user("Bearer " + token); }
      catch { executor.stop(key); running.delete(owner); continue; }
      const client: WorkerClient = {
        claim: async () => repo.claim(owner, null),
        control: async task => repo.control(owner, null, task.id, task.lease),
        bind: async (task, id) => { repo.control(owner, null, task.id, task.lease); ctx.store.db.prepare("UPDATE hub_sessions SET local_id=? WHERE id=?").run(id, task.session_id); },
        publish: async (task, value) => repo.publish(owner, null, task.id, { lease: task.lease, ...value }),
        download: async file => Buffer.from(repo.file(owner, file.id).content),
        upload: async (task, artifact, bytes) => repo.putFile(owner, task.session_id, artifact.name, bytes, "output", artifact.id),
      };
      try { await executor.tick(key, user, client); if (executor.busy(key)) running.add(owner); else running.delete(owner); }
      catch { executor.stop(key); running.delete(owner); /* 租约失效时停止执行；持久队列会保留中断状态。 */ }
    }
  };
  const running = new Set<number>();
  const loop = () => { job = poll().catch(() => {}).finally(() => { if (!stopped) { timer = setTimeout(loop, 1000); timer.unref(); } }); };
  loop();
  ctx.app.addHook("onClose", async () => { stopped = true; clearTimeout(timer); await job; await executor.close(); });
  return executor;
}
