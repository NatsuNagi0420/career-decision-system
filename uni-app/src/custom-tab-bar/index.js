/** 青穗集 · 原生底栏：快速滑移、轻回弹与点击位置涟漪，触摸反馈不延迟导航。 */
// 所有页面共享同一次导航锁，避免两个 tabBar 实例交错发起切页。
let pendingRoute = "";
let visibleIndex = -1;
Component({
  data: {
    current: 0,
    previous: 0,
    motion: false,
    animate: false,
    ripples: {},
    tabs: [
      {
        path: "/pages/home/index",
        text: "首页",
        icon: "/static/assets/tabbar/home.png",
      },
      {
        path: "/pages/tasks/index",
        text: "任务",
        icon: "/static/assets/prototype/nav-tasks.png",
      },
      {
        path: "/pages/growth/index",
        text: "成长",
        icon: "/static/assets/prototype/nav-growth.png",
      },
      {
        path: "/pages/mine/index",
        text: "我的",
        icon: "/static/assets/prototype/nav-profile.png",
      },
    ],
  },
  lifetimes: {
    attached() {
      this.syncRoute();
    },
  },
  pageLifetimes: {
    show() {
      this.syncRoute();
    },
  },
  methods: {
    press(event) {
      const index = Number(event.currentTarget.dataset.index);
      if (!this.data.tabs[index]) return;
      const point = event.touches?.[0] ?? event.changedTouches?.[0];
      const target = event.currentTarget;
      const x = point && Number.isFinite(target.offsetLeft) ? Math.round(point.pageX - target.offsetLeft) + "px" : "50%";
      const y = point && Number.isFinite(target.offsetTop) ? Math.round(point.pageY - target.offsetTop) + "px" : "50%";
      const wave = this.data.ripples[index]?.includes("tab-wave-a") ? "tab-wave-b" : "tab-wave-a";
      this.setData({ ["ripples." + index]: `--ripple-x:${x};--ripple-y:${y};--ripple-wave:${wave};` });
    },
    syncRoute() {
      const pages = getCurrentPages();
      const route = "/" + pages[pages.length - 1]?.route;
      const current = this.data.tabs.findIndex((tab) => tab.path === route);
      if (current < 0) return;
      // 微信为每个 tab 页保留独立底栏，起点必须取实际离开的页面。
      if (visibleIndex >= 0 && visibleIndex !== current) {
        this.setData({
          current,
          previous: visibleIndex,
          motion: !this.data.motion,
          animate: true,
        });
      } else if (current !== this.data.current) {
        this.setData({ current, previous: current, animate: false });
      }
      visibleIndex = current;
    },
    switchTo(event) {
      const index = Number(event.currentTarget.dataset.index);
      const tab = this.data.tabs[index];
      if (!tab || pendingRoute) return;
      const pages = getCurrentPages();
      const route = "/" + pages[pages.length - 1]?.route;
      if (tab.path === route) {
        this.syncRoute();
        return;
      }
      pendingRoute = tab.path;
      this.switching = true;
      // 不提前高亮：由目标页的 show/onShow 在实际进入后同步。
      wx.switchTab({
        url: tab.path,
        fail: () => this.syncRoute(),
        complete: () => {
          pendingRoute = "";
          this.switching = false;
        },
      });
    },
  },
});
