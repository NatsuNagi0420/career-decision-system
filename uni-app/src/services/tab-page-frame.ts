/** 青穗集 · Tab 首帧保护：原生静态占位先显示，视图提交完成后直接切换为正文。 */
import { getCurrentInstance, onMounted, ref } from "vue";
import { onReady } from "@dcloudio/uni-app";

export function useTabPageFrame() {
  const ready = ref(false);
  const instance = getCurrentInstance();
  const reveal = () => { ready.value = true; };
  onMounted(() => {
    // 小程序的实例 $nextTick 会等待 setData 回调，不能用网络完成时间代替视图就绪。
    if (instance?.proxy) void instance.proxy.$nextTick(reveal);
    else reveal();
  });
  onReady(reveal);
  // 缓存页再次显示时不重置，避免每次切页都重新遮住已有内容。
  return ready;
}
