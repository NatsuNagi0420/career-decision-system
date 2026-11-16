/** 青穗集 · 外部资料：只接受网页链接，小程序复制后外部打开，网页端直接打开。 */
export function openExternalLink(url: string) {
  if (!/^https?:\/\//i.test(url)) { uni.showToast({ title: "这个链接暂不可用", icon: "none" }); return; }
  // #ifdef H5
  window.open(url, "_blank", "noopener,noreferrer");
  return;
  // #endif
  // #ifndef H5
  uni.setClipboardData({ data: url, success: () => uni.showToast({ title: "链接已复制，可在浏览器打开", icon: "none" }) });
  // #endif
}
