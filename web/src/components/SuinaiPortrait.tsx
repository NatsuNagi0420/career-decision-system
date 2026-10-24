/** 青穗集 · 角色主图入口：复用代码网格和展示偏好，原有 PNG/WebP 参考图保持不变。 */
import type { Face, SpriteMode, SpritePose } from "../character/suinai";
import { useSpriteMode } from "../character/preferences";
import { SuinaiSprite } from "./SuinaiSprite";
export function SuinaiPortrait({ face, className = "", mode, pose, animated = true }: { face?: Face; className?: string; mode?: SpriteMode; pose?: SpritePose; animated?: boolean }) {
  const [preference] = useSpriteMode();
  return <span className={`suinai-portrait ${className}`.trim()}><SuinaiSprite face={face} pose={pose} mode={mode ?? preference} animated={animated} /></span>;
}
