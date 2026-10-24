/** 青穗集 · 全站微交互入口：同步用户/系统动效偏好，统一管理涟漪及卸载清理。 */
import { useEffect } from "react";
import { installButtonRipples } from "./buttonRipples";
import { useUiMotion } from "./uiMotion";
import "./ui-micro-interactions.css";

export function UiMicroInteractions() {
  const { playing } = useUiMotion();
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-ui-motion");
    root.dataset.uiMotion = playing ? "on" : "off";
    const dispose = playing ? installButtonRipples(document) : undefined;
    return () => {
      dispose?.();
      if (previous === null) root.removeAttribute("data-ui-motion");
      else root.setAttribute("data-ui-motion", previous);
    };
  }, [playing]);
  return null;
}
