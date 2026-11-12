/** 青穗集 · 页面动效：四个主页显示时短距离错开卡片，去重重复 show，不隐藏页面或等待导航。 */
import { ref } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";

const tabRoutes = new Set(["pages/home/index", "pages/tasks/index", "pages/growth/index", "pages/mine/index"]);

export function usePageMotion() {
  const pageMotionClass = ref("");
  let entered = false;
  let visible = false;
  let alternate = false;
  onShow(() => {
    if (visible) return;
    visible = true;
    const pages = getCurrentPages();
    const route = pages[pages.length - 1]?.route ?? "";
    if (tabRoutes.has(route)) {
      // 两个名字交替，无需强制重排或等待下一帧；H5 重建和原生缓存返回均可播放。
      alternate = !alternate;
      pageMotionClass.value = alternate ? "qs-tab-arrive-a" : "qs-tab-arrive-b";
    } else if (!entered) {
      pageMotionClass.value = "qs-page-arrive";
    }
    entered = true;
  });
  onHide(() => { visible = false; pageMotionClass.value = ""; });
  return pageMotionClass;
}
