/** 青穗集 · 求职桌面：个人主页、成果窗口和真实任务陪伴共享入口与数据。 */
import { useState } from "react";
import type { ArtifactEntry, Feed, SessionUser } from "../api/client";
import { DESKTOP_APPS, desktopArtifacts, type DesktopApp } from "../state/desktop";
import { ArtifactCard } from "./ArtifactCard";
import { PersonalHome } from "./PersonalHome";
import { PixelIcon } from "./PixelIcon";
import { SuinaiCompanion } from "./SuinaiCompanion";
import type { CompanionCue } from "../character/suinaiCompanion";
import { BrandMark } from "./Brand";

type Props = {
  active: DesktopApp; onSelect: (app: DesktopApp) => void; onPrepare: (goal: string) => void;
  artifacts: ArtifactEntry[]; companion: CompanionCue; motion: boolean; expanded: boolean;
  user: SessionUser | null; feed: Feed | null; onConsent: (value: boolean) => Promise<void>;
  onMotion: () => void; onSignOut: () => void;
  onHistory: () => void; historyOpen: boolean; projectId: string | null; onFiled: () => void; onReconnect?: () => void;
};
export function DesktopScene({ active, onSelect, onPrepare, artifacts, companion, motion, expanded, user, feed,
  onConsent, onMotion, onSignOut, onHistory, historyOpen, projectId, onFiled, onReconnect }: Props) {
  const spec = DESKTOP_APPS.find(entry => entry.id === active);
  const entries = desktopArtifacts(active, artifacts);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const entry = entries.find(item => item.id === selected[active]) ?? entries[0];
  return <>
    <header className="desktop-masthead no-print"><BrandMark /><span className="desktop-masthead__note">A LITTLE DESKTOP FOR YOUR NEXT CHAPTER.</span><span className="desktop-masthead__session"><i />我的成长桌面</span></header>
    <nav className="desktop-apps no-print" aria-label="求职桌面应用">
      <button className="desktop-app" data-on={active === "messages"} aria-current={active === "messages" ? "page" : undefined} onClick={() => onSelect("messages")} type="button"><span className="desktop-app__icon" data-kind="messages"><PixelIcon kind="messages" /></span><span>穗奈消息</span><small>MESSAGE</small></button>
      {DESKTOP_APPS.map(app => <button className="desktop-app" data-on={active === app.id} aria-current={active === app.id ? "page" : undefined} key={app.id} onClick={() => onSelect(app.id)} type="button"><span className="desktop-app__icon" data-kind={app.id}><PixelIcon kind={app.id} /></span><span>{app.name}</span><small>{app.file}</small></button>)}
    </nav>
    <SuinaiCompanion cue={companion} motion={motion} visible={!expanded} onReconnect={onReconnect} onMessages={() => {
      onSelect("messages"); requestAnimationFrame(() => document.getElementById("composer")?.focus());
    }} />
    <aside className="desktop-note no-print"><span className="desktop-note__pin" aria-hidden="true" /><p className="desktop-note__eyebrow">MY SMALL STEPS</p><h2>每一步，<br />都有迹可循。</h2><p>经历、方向和成果，<br />都收进自己的成长档案。</p><button type="button" onClick={() => onSelect("profile")}>打开个人主页 ↗</button></aside>
    {spec ? <section className="desktop-output" aria-label={spec.name}>
      <div className="desktop-titlebar no-print"><span><PixelIcon kind={spec.id} size={16} />{spec.name}<small> / {spec.file}</small></span><button type="button" className="desktop-close" aria-label="关闭成果窗口，返回穗奈消息" onClick={() => onSelect("messages")}>×</button></div>
      <div className={`desktop-output__body feed${active === "profile" ? " desktop-output__body--personal" : ""}`}>
        {active === "profile" ? <PersonalHome user={user} feed={feed} artifacts={artifacts} motion={motion} onPrepare={onPrepare}
          onSelect={onSelect} onConsent={onConsent} onMotion={onMotion} onSignOut={onSignOut} onSaved={onFiled} /> : <>
          <header className="desktop-output__intro no-print"><div><p className="desktop-eyebrow">YOUR CAREER, YOUR PACE.</p><h1>{spec.name}</h1><p>{spec.hint}</p></div><span className="desktop-filecount">{entries.length} 份已保存成果</span></header>
          {entries.length > 1 ? <div className="desktop-filelist no-print" aria-label="选择已保存成果">{entries.map((item, index) => <button data-on={item.id === entry?.id} type="button" key={item.id} onClick={() => setSelected(current => ({ ...current, [active]: item.id }))}>{item.title || `${spec.name} ${entries.length - index}`} · v{item.version}</button>)}</div> : null}
          {entry ? <ArtifactCard key={entry.id} artifact={entry} usage={null} steps={0} model={null} projectId={projectId} onFiled={onFiled} onAsk={onPrepare} onRunAction={onPrepare} />
            : <div className="desktop-empty"><PixelIcon kind={spec.id} size={64} /><h2>{`这里还没有${spec.name === "简历文件" ? "简历草稿" : spec.name === "岗位浏览器" ? "岗位对照结果" : "保存的内容"}`}</h2><p>{active === "jobs" ? "先补几条经历，再对照目录里的岗位要求。这里展示岗位目录的对照结果。" : active === "growth" ? "围绕目标岗位，把还需要补充的经历、知识和已收录练习理清楚。" : "用已确认的经历整理草稿，选择模板，然后打印或复制。"}</p><button type="button" className="btn btn--primary" onClick={() => onPrepare(spec.goal)}>{spec.title}<span aria-hidden="true"> →</span></button><small>打开对话后可编辑，发送前不会调用模型</small></div>}
          {entry ? <button type="button" className="btn btn--outline no-print" onClick={() => onPrepare(spec.goal)}>和穗奈继续整理 →</button> : null}
        </>}
      </div>
    </section> : null}
    <footer className="desktop-taskbar no-print">
      <button type="button" className="desktop-start" onClick={() => onSelect("messages")}><PixelIcon kind="wheat" size={23} /><span>青穗集</span></button>
      <span className="desktop-taskbar__divider" />
      <button className="desktop-task" data-on={active === "messages"} onClick={() => onSelect("messages")} type="button"><PixelIcon kind="messages" size={18} /><span>穗奈消息</span></button>
      {spec ? <button className="desktop-task" data-on="true" onClick={() => onSelect(spec.id)} type="button"><PixelIcon kind={spec.id} size={18} /><span>{spec.name}</span></button> : null}
      <button className="desktop-history" aria-expanded={historyOpen} onClick={onHistory} type="button">最近对话</button>
      <button type="button" className="desktop-taskbar__user" aria-label="打开个人主页" onClick={() => onSelect("profile")}><i />{user?.username || "我的桌面"}<span className="desktop-taskbar__tag">我的主页 ↗</span></button>
    </footer>
  </>;
}
