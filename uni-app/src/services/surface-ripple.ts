/** 青穗集 · 背景触点：收集至多两个点阵波源，触摸去重并在页面退出时回收。 */
import { onUnmounted, shallowRef } from "vue";
import { onHide } from "@dcloudio/uni-app";
import { DOT_WAVE_LIFETIME, type DotWave } from "./dot-field";

interface SurfacePoint { clientX?: number; clientY?: number }
interface SurfaceEvent extends SurfacePoint {
  type?: string;
  touches?: ArrayLike<SurfacePoint>;
  changedTouches?: ArrayLike<SurfacePoint>;
}
export interface SurfaceRipple extends DotWave { id: number }

export function useSurfaceRipple() {
  const surfaceRipples = shallowRef<SurfaceRipple[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let sequence = 0;
  let lastTouch = -Infinity;
  function clear() {
    timers.forEach(timer => clearTimeout(timer));
    timers.clear();
    surfaceRipples.value = [];
    lastTouch = -Infinity;
  }
  function startSurfaceRipple(input: unknown) {
    if (!input || typeof input !== "object") return;
    const event = input as SurfaceEvent;
    if (event.touches && event.touches.length > 1) return;
    if (event.type === "touchstart") lastTouch = Date.now();
    else if (Date.now() - lastTouch < 800) return;
    const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
    if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return;
    let y = point.clientY!;
    // #ifdef H5
    // uni H5 的归一化触点扣除了顶栏，固定点阵需要恢复浏览器可视区坐标。
    y += uni.getWindowInfo().windowTop || 0;
    // #endif
    const ripple = { id: ++sequence, x: point.clientX!, y, startedAt: Date.now() };
    const retained = surfaceRipples.value.slice(-1);
    for (const old of surfaceRipples.value.slice(0, -1)) {
      clearTimeout(timers.get(old.id));
      timers.delete(old.id);
    }
    surfaceRipples.value = [...retained, ripple];
    timers.set(ripple.id, setTimeout(() => {
      surfaceRipples.value = surfaceRipples.value.filter(item => item.id !== ripple.id);
      timers.delete(ripple.id);
    }, DOT_WAVE_LIFETIME));
  }
  onHide(clear);
  onUnmounted(clear);
  return { surfaceRipples, startSurfaceRipple };
}
