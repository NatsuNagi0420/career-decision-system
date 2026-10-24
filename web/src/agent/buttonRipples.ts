/** 青穗集 · 按钮涟漪：事件委托覆盖动态按钮与弹窗；只装饰，不拦截业务、焦点或默认行为。 */
export const RIPPLE_DURATION = 620;
const MAX_PER_BUTTON = 3;
const MAX_TOTAL = 24;
const HOST = "ui-ripple-host";
const EXCLUDED = '[inert], [aria-disabled="true"], [data-ui-ripple="off"], .workspace-detail-backdrop';

interface RippleRect { left: number; top: number; width: number; height: number }
interface Point { x: number; y: number }
/** 将视口点击映射为按钮局部坐标；缩放按钮仍从真实点击点扩散，键盘激活从中心扩散。 */
export function rippleGeometry(rect: RippleRect, width: number, height: number, point?: Point) {
  if (![rect.left, rect.top, rect.width, rect.height, width, height].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) return null;
  const x = point ? Math.max(0, Math.min(width, (point.x - rect.left) * width / rect.width)) : width / 2;
  const y = point ? Math.max(0, Math.min(height, (point.y - rect.top) * height / rect.height)) : height / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, diameter: Math.ceil(2 * Math.hypot(Math.max(x, width - x), Math.max(y, height - y))) };
}
export function isRippleActivation(event: { type: string; button?: number; isPrimary?: boolean; detail?: number }) {
  return event.type === "pointerdown" ? event.button === 0 && event.isPrimary !== false
    : event.type === "click" && event.detail === 0;
}

interface RippleHost { layer: HTMLSpanElement; positioned: boolean; waves: Set<Wave> }
interface Wave { element: HTMLSpanElement; timer: ReturnType<typeof setTimeout>; finish: () => void }
export function installButtonRipples(doc: Document): () => void {
  const hosts = new Map<HTMLElement, RippleHost>();
  const waves = new Set<Wave>();
  const clear = () => { for (const wave of [...waves]) wave.finish(); };
  const activate = (event: PointerEvent | MouseEvent) => {
    if (!isRippleActivation(event) || doc.visibilityState === "hidden" || !(event.target instanceof Element)) return;
    const host = event.target.closest<HTMLElement>('button, [role="button"]');
    if (!host || !host.isConnected || host.matches(":disabled") || host.closest(EXCLUDED)) return;
    const view = doc.defaultView;
    if (!view) return;
    const rect = host.getBoundingClientRect();
    const geometry = rippleGeometry(rect, host.offsetWidth, host.offsetHeight,
      event.type === "pointerdown" ? { x: event.clientX, y: event.clientY } : undefined);
    if (!geometry) return;
    while (waves.size >= MAX_TOTAL) waves.values().next().value?.finish();
    let state = hosts.get(host);
    // 同一按钮连续点击不堆叠无限装饰节点，也不保留已经被 React 替换的图层。
    if (state && !state.layer.isConnected) {
      for (const wave of [...state.waves]) wave.finish();
      state = undefined;
    }
    if (!state) {
      const layer = doc.createElement("span");
      layer.className = "ui-ripple-layer";
      layer.setAttribute("aria-hidden", "true");
      const positioned = view.getComputedStyle(host).position === "static" && !host.classList.contains(HOST);
      if (positioned) host.classList.add(HOST);
      host.append(layer);
      state = { layer, positioned, waves: new Set() };
      hosts.set(host, state);
    }
    while (state.waves.size >= MAX_PER_BUTTON) state.waves.values().next().value?.finish();
    const element = doc.createElement("span");
    element.className = "ui-ripple-wave";
    element.style.setProperty("--ripple-x", `${geometry.x}px`);
    element.style.setProperty("--ripple-y", `${geometry.y}px`);
    element.style.setProperty("--ripple-size", `${geometry.diameter}px`);
    element.style.setProperty("--ripple-duration", `${RIPPLE_DURATION}ms`);
    const current = state;
    const timer = setTimeout(() => wave.finish(), RIPPLE_DURATION + 80);
    const wave: Wave = { element, timer, finish: () => {
      if (!waves.has(wave)) return;
      clearTimeout(wave.timer);
      element.removeEventListener("animationend", wave.finish);
      element.remove();
      waves.delete(wave);
      current.waves.delete(wave);
      if (current.waves.size === 0) {
        current.layer.remove();
        if (current.positioned) host.classList.remove(HOST);
        hosts.delete(host);
      }
    } };
    element.addEventListener("animationend", wave.finish);
    current.waves.add(wave);
    waves.add(wave);
    current.layer.append(element);
  };
  const visibility = () => { if (doc.visibilityState === "hidden") clear(); };
  // 捕获阶段仅添加装饰，不消费事件；键盘 click 的 detail=0，鼠标 click 不重复触发。
  doc.addEventListener("pointerdown", activate, { capture: true, passive: true });
  doc.addEventListener("click", activate, { capture: true, passive: true });
  doc.addEventListener("visibilitychange", visibility);
  return () => {
    doc.removeEventListener("pointerdown", activate, true);
    doc.removeEventListener("click", activate, true);
    doc.removeEventListener("visibilitychange", visibility);
    clear();
  };
}
