/** 青穗集 · 会话总览：账号隔离、短时复用和批量发布快照，完整扫描后才报告无待办。 */
import { shallowReactive } from "vue";
import {
  agentApi,
  getToken,
  hubApi,
  type AgentSnapshot,
  type Conversation,
  type HubDevice,
} from "./api";
import { activeStatus, errorText, tasksFromSnapshot } from "./workspace";
export const overview = shallowReactive({
  sessions: [] as Conversation[],
  devices: [] as HubDevice[],
  snapshots: {} as Record<string, AgentSnapshot>,
  loaded: 0,
  scanned: 0,
  total: 0,
  busy: false,
  ready: false,
  complete: false,
  devicesReady: false,
  error: "",
  partialError: "",
  deviceError: "",
});
let owner: string | null = null;
let generation = 0;
let inFlight: Promise<void> | null = null;
const timestamps = new Map<string, number>();
let refreshedAt = 0,
  invalidation = 0;
const RECENT_WINDOW = 5000;

export function invalidateOverview(sessionId?: string) {
  refreshedAt = 0;
  invalidation++;
  if (sessionId) timestamps.delete(sessionId);
  else timestamps.clear();
}
export function ensureOverviewAccount() {
  const token = getToken();
  if (token === owner) return;
  owner = token;
  generation++;
  inFlight = null;
  Object.assign(overview, {
    sessions: [],
    devices: [],
    snapshots: {},
    loaded: 0,
    scanned: 0,
    total: 0,
    busy: false,
    ready: false,
    complete: false,
    devicesReady: false,
    error: "",
    partialError: "",
    deviceError: "",
  });
  timestamps.clear();
  refreshedAt = 0;
}
export function loadOverview(
  reuseRecent = false,
  force = false,
): Promise<void> {
  ensureOverviewAccount();
  if (inFlight) return inFlight;
  if (!owner) return Promise.resolve();
  if (
    reuseRecent &&
    !force &&
    refreshedAt > 0 &&
    Date.now() - refreshedAt < RECENT_WINDOW &&
    overview.complete &&
    overview.devicesReady &&
    !overview.error
  )
    return Promise.resolve();
  const currentOwner = owner,
    currentGeneration = generation,
    currentInvalidation = invalidation;
  const current = () =>
    getToken() === currentOwner && generation === currentGeneration;
  overview.busy = true;
  overview.complete = false;
  overview.scanned = 0;
  overview.loaded = 0;
  overview.error = "";
  overview.partialError = "";
  // 设备失败不阻断任务扫描；两类结果各自保留真实错误状态。
  const devicesJob = hubApi
    .devices()
    .then((devices) => {
      if (!current()) return;
      overview.devices = devices;
      overview.devicesReady = true;
      overview.deviceError = "";
    })
    .catch((error) => {
      if (!current()) return;
      overview.devicesReady = false;
      overview.deviceError = errorText(error);
    });
  const job = (async () => {
    try {
      const sessions = await agentApi.conversations();
      if (!current()) return;
      // 未变的列表保留引用；只代理总览顶层，避免把整段聊天历史变成响应式对象。
      if (JSON.stringify(overview.sessions) !== JSON.stringify(sessions))
        overview.sessions = sessions;
      overview.total = sessions.length;
      const nextSnapshots = { ...overview.snapshots };
      const ids = new Set(sessions.map((s) => s.id));
      let snapshotsChanged = false;
      for (const id of Object.keys(nextSnapshots))
        if (!ids.has(id)) {
          delete nextSnapshots[id];
          snapshotsChanged = true;
          timestamps.delete(id);
        }
      let index = 0,
        failures = 0,
        loaded = 0,
        scanned = 0,
        publishedAt = Date.now();
      function publish(final = false) {
        if (!current() || (!final && Date.now() - publishedAt < 100)) return;
        if (snapshotsChanged) {
          overview.snapshots = { ...nextSnapshots };
          snapshotsChanged = false;
        }
        overview.loaded = loaded;
        overview.scanned = scanned;
        publishedAt = Date.now();
      }
      async function worker() {
        while (index < sessions.length && current()) {
          const session = sessions[index++];
          const existing = nextSnapshots[session.id];
          const active =
            existing &&
            tasksFromSnapshot(existing).some((t) => activeStatus(t.status));
          const age = Date.now() - (timestamps.get(session.id) || 0);
          try {
            if (
              force ||
              !existing ||
              existing.conversation.updated_at !== session.updated_at ||
              age >= (active ? 2500 : 30000)
            ) {
              const snapshot = await agentApi.snapshot(session.id);
              if (!current()) return;
              nextSnapshots[session.id] = snapshot;
              snapshotsChanged = true;
              if (currentInvalidation === invalidation)
                timestamps.set(session.id, Date.now());
            }
            if (current()) loaded++;
          } catch {
            if (current()) failures++;
          } finally {
            if (current()) {
              scanned++;
              publish();
            }
          }
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      if (!current()) return;
      publish(true);
      overview.ready = true;
      overview.complete = failures === 0;
      refreshedAt =
        failures === 0 && currentInvalidation === invalidation ? Date.now() : 0;
      if (failures)
        overview.partialError =
          failures + " 段对话未同步成功，当前列表可能不完整。";
    } catch (error) {
      if (current()) overview.error = errorText(error);
    } finally {
      await devicesJob;
      if (current()) {
        overview.busy = false;
        inFlight = null;
      }
    }
  })();
  inFlight = job;
  return job;
}
