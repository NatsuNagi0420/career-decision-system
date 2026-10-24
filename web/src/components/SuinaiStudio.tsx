/** 青穗集 · 独立角色试映室：全部状态为本地演示，不登录、不请求业务 API、不调用模型。 */
import { useState } from "react";
import { SPRITE_FPS, SPRITE_LOOP, SPRITE_PALETTE, SPRITE_POSES, SPRITE_FACES, SPRITE_WIDTH, SPRITE_HEIGHT, type Face, type SpriteMode, type SpritePose } from "../character/suinai";
import { pixelAssetStateFor, type SpriteSource } from "../character/suinaiAssets";
import { useReducedMotion } from "../character/preferences";
import { BrandMark } from "./Brand";
import { PixelIcon } from "./PixelIcon";
import { SuinaiSprite } from "./SuinaiSprite";

export function SuinaiStudio() {
  const [source, setSource] = useState<SpriteSource>("code");
  const [pose, setPose] = useState<SpritePose>("journal");
  const [face, setFace] = useState<Face | undefined>();
  const [mode, setMode] = useState<SpriteMode>("pixel");
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const reducedMotion = useReducedMotion();
  const autoplay = playing && !reducedMotion;
  const spec = SPRITE_POSES.find((item) => item.id === pose)!;
  const assetAvailable = source === "pixel-v04-reference" && pixelAssetStateFor(pose, face) !== null;
  return <main className="suinai-studio" data-motion={autoplay ? "on" : "off"}>
    <header className="suinai-studio__masthead"><BrandMark /><a href="?preview=live2d">Live2D 交互试映室 ↗</a><a href="/">返回成长桌面 ↗</a></header>
    <div className="suinai-studio__intro"><p className="desktop-eyebrow">A SMALL CHARACTER. A LITTLE MORE LIFE.</p><h1>穗奈，像素试映室<span>01</span></h1><p>先看画风和比例，再进入 v0.5 的分层绑定；当前中模只作视觉参考，不能直接代表最终动作素材。</p></div>
    <section className="suinai-studio__window" aria-label="穗奈像素与点阵预览">
      <div className="desktop-titlebar"><span><PixelIcon kind="wheat" size={16} />SUINAI / CHARACTER LAB</span><span>{SPRITE_WIDTH} × {SPRITE_HEIGHT}</span></div>
      <div className="suinai-studio__body">
        <div className="suinai-studio__preview" data-mode={mode}>
          <div className="suinai-studio__stamp"><span>{source === "pixel-v04-reference" ? "REFERENCE / V0.4" : "CODE-DRAWN / V0.3"}</span><span>{assetAvailable ? "中模参考对照" : "代码稿回退"}</span></div>
          <div className="suinai-studio__stage"><SuinaiSprite source={source} pose={pose} face={face} mode={mode} animated={autoplay} frame={autoplay ? undefined : frame} /></div>
          <div className="suinai-studio__caption"><span>{mode === "pixel" ? "PIXEL PORTRAIT" : "DOT MATRIX"}</span><span>{spec.name}{source === "pixel-v04-reference" && !assetAvailable ? " · 代码回退" : ""}</span></div>
        </div>
        <div className="suinai-studio__controls">
          <fieldset><legend>01 / 角色稿件</legend><div className="sprite-switch" role="group" aria-label="角色稿件"><button type="button" aria-pressed={source === "pixel-v04-reference"} onClick={() => { setSource("pixel-v04-reference"); setFrame(0); }}>中模参考 v0.4</button><button type="button" aria-pressed={source === "code"} onClick={() => { setSource("code"); setFrame(0); }}>代码稿 v0.3</button></div><small>中模目前只用于审美对照；动作绑定会按 v0.5 的分层锚点重新制作。</small></fieldset>
          <fieldset><legend>02 / 显示方式</legend><div className="sprite-switch" role="group" aria-label="显示方式"><button type="button" aria-pressed={mode === "pixel"} onClick={() => setMode("pixel")}>方块像素</button><button type="button" aria-pressed={mode === "dots"} onClick={() => setMode("dots")}>彩色点阵</button></div></fieldset>
          <fieldset><legend>03 / 试试不同动作</legend><div className="suinai-studio__poses" role="group" aria-label="角色动作">{SPRITE_POSES.map((item) => <button type="button" aria-pressed={pose === item.id} key={item.id} onClick={() => { setPose(item.id); setFace(undefined); setFrame(0); }}>{item.name}<span aria-hidden="true">{pose === item.id ? "●" : "○"}</span></button>)}</div><p className="suinai-studio__note" aria-live="polite">{spec.note}</p></fieldset>
          <fieldset><legend>04 / 眉眼与神态</legend><div className="suinai-studio__faces" role="group" aria-label="角色神态"><button type="button" aria-pressed={face === undefined} onClick={() => { setFace(undefined); setFrame(0); }}>跟随动作</button>{SPRITE_FACES.map((item) => <button type="button" key={item.id} aria-pressed={face === item.id} onClick={() => { setFace(item.id); setFrame(0); }}>{item.name}</button>)}</div></fieldset>
          <fieldset><legend>05 / 动画检查</legend><button type="button" className="btn btn--outline" aria-pressed={!autoplay} disabled={reducedMotion} onClick={() => { setPlaying((value) => !value); setFrame(0); }}>{reducedMotion ? "系统已关闭自动动画" : playing ? "暂停 · 检查静帧" : "播放动画"}</button><label className="suinai-studio__scrub" htmlFor="sprite-frame">逐帧查看 <output>{autoplay ? "播放中" : `${frame + 1} / ${SPRITE_LOOP}`}</output><input id="sprite-frame" type="range" min="0" max={SPRITE_LOOP - 1} value={frame} disabled={autoplay} onChange={(event) => setFrame(Number(event.target.value))} /></label><small>{reducedMotion ? "按系统设置保持静止，可拖动滑块检查每一帧。" : `${SPRITE_FPS} 帧/秒 · 切到后台自动暂停 · 支持减少动态效果`}</small></fieldset>
        </div>
      </div>
    </section>
    <section className="suinai-studio__footer" aria-label="角色设计说明"><div><h2>保留她的辨识度</h2><p>栗棕发、琥珀眼睛、银框眼镜和麦穗发夹。缩小头部占比，让肩、弯肘、手腕和手指也有表达的空间。</p></div><div><h2>一套状态，两份稿件</h2><div className="suinai-studio__palette" aria-label="角色固定色板">{SPRITE_PALETTE.slice(1).map((color) => <span key={color} style={{ backgroundColor: color }} />)}</div><p>v0.4 只用来验证脸、下巴、肩颈和陪伴感；真正的动作会按 v0.5 分层绑定重新制作。此处为本地试演，不会整理或保存资料；没有语音口型同步。</p></div></section>
  </main>;
}

