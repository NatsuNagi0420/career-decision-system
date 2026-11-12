/** 青穗集 · 任务入口：跨 tab 传递一次性筛选，按登录账号隔离。 */
import { getToken } from "./api";
export type TaskTab = "active" | "attention" | "ended";
let selection: { owner: string | null; tab: TaskTab } | null = null;
export function openTaskList(tab: TaskTab = "active") {
  selection = { owner: getToken(), tab };
  uni.switchTab({ url: "/pages/tasks/index" });
}
export function consumeTaskTab(): TaskTab | null {
  const result = selection?.owner === getToken() ? selection.tab : null;
  selection = null;
  return result;
}
