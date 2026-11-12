/** 青穗集 · 学习呈现规则：章节续接、完成比例和受限视频地址，不读取第三方播放进度。 */
import type { LearningPath, LearningNode, LearningResource } from "../../../agent/src/learning-contract";
export const LEARNING_STATUS = { todo: "待开始", doing: "学习中", done: "已完成", skipped: "已跳过" };
export function learningProgress(path: LearningPath) {
  const completed = path.nodes.filter(node => node.status === "done").length;
  const skipped = path.nodes.filter(node => node.status === "skipped").length;
  return { completed, skipped, total: path.nodes.length, percent: path.nodes.length ? Math.round((completed + skipped) / path.nodes.length * 100) : 0 };
}
export function nodeReady(path: LearningPath, node: LearningNode) {
  return node.prerequisites.every(key => path.nodes.some(item => item.key === key && ["done", "skipped"].includes(item.status)));
}
export function nextLearningNode(path: LearningPath) {
  return path.nodes.find(node => node.status === "doing" && nodeReady(path, node)) ?? path.nodes.find(node => node.status === "todo" && nodeReady(path, node)) ?? path.nodes.at(-1);
}
export function learningPlayerUrl(resource: LearningResource) {
  return /^BV[0-9A-Za-z]{10}$/.test(resource.bvid) ? "https://player.bilibili.com/player.html?bvid=" + resource.bvid + "&page=1&autoplay=0&danmaku=0" : null;
}
