/** 青穗集 · 会话公共操作：统一重命名、归档和永久删除，并等待服务端确认。 */
import { agentApi, type Conversation } from "./api";
import { invalidateOverview } from "./overview";
export async function conversationMenu(item: Conversation): Promise<boolean> {
  const actions = item.archived
    ? ["重命名", "恢复对话", "永久删除"]
    : ["重命名", "归档对话", "永久删除"];
  const index = await new Promise<number>((resolve) =>
    uni.showActionSheet({
      itemList: actions,
      success: (r) => resolve(r.tapIndex),
      fail: () => resolve(-1),
    }),
  );
  if (index < 0) return false;
  if (index === 0) {
    const title = await new Promise<string | null>((resolve) =>
      uni.showModal({
        title: "重命名对话",
        editable: true,
        content: item.title,
        placeholderText: "对话名称",
        success: (r) => resolve(r.confirm ? r.content?.trim() || null : null),
        fail: () => resolve(null),
      }),
    );
    if (!title) return false;
    await agentApi.updateConversation(item.id, { title: title.slice(0, 100) });
  }
  if (index === 1)
    await agentApi.updateConversation(item.id, { archived: !item.archived });
  if (index === 2) {
    const confirm = await new Promise<boolean>((resolve) =>
      uni.showModal({
        title: "永久删除这段对话？",
        content: "消息、运行记录和对话文件将删除，无法恢复。",
        confirmText: "永久删除",
        confirmColor: "#ad5266",
        success: (r) => resolve(r.confirm),
        fail: () => resolve(false),
      }),
    );
    if (!confirm) return false;
    await agentApi.deleteConversation(item.id);
  }
  invalidateOverview(item.id);
  return true;
}
export function openConversation(id: string) {
  uni.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(id)}` });
}
