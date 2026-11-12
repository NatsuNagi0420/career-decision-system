/** 青穗集 · 自定义 tabBar 与页面高亮联动：每个 tab 页 onShow 时调用一次。 */

const TAB_PATHS = [
  "/pages/home/index",
  "/pages/tasks/index",
  "/pages/growth/index",
  "/pages/mine/index",
];

export function syncTabBarHighlight(): void {
  // #ifdef MP-WEIXIN
  const pages = getCurrentPages();
  const page = pages[pages.length - 1] as unknown as
    | {
        route: string;
        getTabBar?: () => {
          data?: { current?: number };
          setData: (data: Record<string, unknown>) => void;
        } | null;
      }
    | undefined;
  if (!page?.getTabBar) return;
  const index = TAB_PATHS.indexOf("/" + page.route);
  if (index < 0) return;
  const tabBar = page.getTabBar();
  // tabBar 自身点击已同步过；这里兜底处理系统手势/分享卡片等进入路径。
  if (tabBar && tabBar.data?.current !== index)
    tabBar.setData({ current: index });
  // #endif
}
