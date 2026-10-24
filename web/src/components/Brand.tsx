/** 青穗集 · 品牌与聊天头像：同一套代码像素形象，头像默认静止以免打断消息阅读。 */
import { PixelIcon } from "./PixelIcon";
import { SuinaiSprite } from "./SuinaiSprite";
import { useSpriteMode } from "../character/preferences";
import type { Face } from "../character/suinai";
export type { Face } from "../character/suinai";

export function SuinaiFace({ face, size = 40 }: { face: Face; size?: number }) {
  const [mode] = useSpriteMode();
  return <span className="agenthead__logo" style={{ width: size, height: size }}><SuinaiSprite face={face} mode={mode} animated={false} avatar /></span>;
}

export function BrandMark() {
  return (
    <div className="brand__mark">
      <span className="brand__symbol"><PixelIcon kind="wheat" size={25} /></span>
      <span className="brand__type">青穗集<small>CAREER DESKTOP</small></span>
    </div>
  );
}
