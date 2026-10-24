/** 青穗集 · 角色组件契约：语义状态与画布规格同源，头像不混入半身动作。 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SuinaiSprite } from "./SuinaiSprite";
import { SPRITE_AVATAR, SPRITE_HEIGHT, SPRITE_SCALE, SPRITE_WIDTH } from "../character/suinai";

describe("sprite component semantics", () => {
  it("selects an appropriate expression when only a pose is given", () => {
    const html=renderToStaticMarkup(createElement(SuinaiSprite,{pose:"write"}));
    expect(html).toContain('data-pose="write"');
    expect(html).toContain('data-face="think"');
    expect(html).toContain(`width="${SPRITE_WIDTH*SPRITE_SCALE}"`);
    expect(html).toContain(`height="${SPRITE_HEIGHT*SPRITE_SCALE}"`);
  });
  it("allows explicit expressions without changing the selected hand gesture", () => {
    const html=renderToStaticMarkup(createElement(SuinaiSprite,{pose:"listen",face:"worry",frame:0}));
    expect(html).toContain('data-pose="listen"');
    expect(html).toContain('data-face="worry"');
    expect(html).toContain('data-frame="0"');
    expect(html).toContain("专注倾听 · 关切");
  });
  it("keeps hands out of the avatar source while retaining the requested expression", () => {
    const html=renderToStaticMarkup(createElement(SuinaiSprite,{pose:"listen",avatar:true}));
    expect(html).toContain('data-pose="journal"');
    expect(html).toContain('data-face="listen"');
    expect(html).toContain(`width="${SPRITE_AVATAR.width*SPRITE_SCALE}"`);
    expect(html).toContain(`height="${SPRITE_AVATAR.height*SPRITE_SCALE}"`);
  });
});
