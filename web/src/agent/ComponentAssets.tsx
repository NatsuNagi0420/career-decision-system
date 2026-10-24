/** 青穗集 · 六组件素材图标：全部使用统一后端地址，图形装饰不承载业务文字。 */
import { assetUrl } from "../assets";
export const COMPONENT_ICONS = ["bookmark-star", "close", "more", "open-arrow", "company", "location", "employment", "skill-react", "skill-api", "skill-container", "source-document", "compare", "caution", "task-list", "recommendation", "confirm-check", "edit-record", "next-arrow", "career-compass"] as const;
export function ComponentIcon({ name, size = 20 }: { name: typeof COMPONENT_ICONS[number]; size?: number }) {
  return <img className="component-pixel-icon" src={assetUrl("brand/career-components/" + name + ".png")} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
