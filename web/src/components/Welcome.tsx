/** 青穗集 · 游戏桌面的第一封消息：明确任务入口，只预填问题，由用户决定是否发送。 */
import { DESKTOP_APPS } from "../state/desktop";
import { PixelIcon } from "./PixelIcon";
import { rise } from "../state/motion";
export const WELCOME_ACTIONS = DESKTOP_APPS;
export function Welcome({ lead, onStart, onHome }: { lead: string; onStart: (goal: string) => void; onHome?: () => void }) {
  return <section className="welcome">
    <header className="welcome__hero">
      <p className="welcome__kicker"><span aria-hidden="true">✦</span> A LITTLE NOTE FROM SUINAI</p>
      <h1>你好，我是穗奈<span className="welcome__spark" aria-hidden="true">＊</span></h1>
      <p className="welcome__lead">{lead}</p>
    </header>
    <div className="welcome__taskhead"><span>今天，从哪一小步开始？</span><small>CHOOSE YOUR NEXT STEP</small></div>
    <div className="welcome__actions">
      {WELCOME_ACTIONS.map((action, index) => <button type="button" className="welcome__card card-in" data-kind={action.id} style={rise(index)} key={action.id} onClick={() => onStart(action.goal)}>
        <span className="welcome__icon"><PixelIcon kind={action.id} size={28} /></span>
        <span className="welcome__copy"><span className="welcome__title">{action.title}{index === 0 ? <em>推荐从这里开始</em> : null}</span><span className="welcome__hint">{action.hint}</span></span>
        <span className="welcome__index" aria-hidden="true">↗</span>
      </button>)}
    </div>
    <p className="welcome__foot"><span aria-hidden="true">✧</span> 不用一次想清楚。也可以直接在下面和我说。{onHome ? <button type="button" onClick={onHome}>打开个人主页 ↗</button> : null}</p>
  </section>;
}
