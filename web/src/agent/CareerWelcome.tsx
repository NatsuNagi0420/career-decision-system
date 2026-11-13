/** 青穗集 · 轻量对话起始页：一句邀请与三个可选话题，只填入需求，不替用户发送。 */
import { SUINAI_AVATAR_URL } from "../assets";
import { CAREER_STARTERS, CareerIcon } from "./CareerVisuals";
export function CareerWelcome({ onPrompt, connected, onConnect, canConfigure = true }: { onPrompt: (text: string) => void; connected: boolean; onConnect: () => void; canConfigure?: boolean }) {
  return <section className="career-welcome" aria-label="从认识自己开始">
    <div className="career-welcome__intro">
      <div className="career-welcome__portrait"><img src={SUINAI_AVATAR_URL} alt="穗奈" width={72} height={72} /><span>✦</span></div>
      <h2>今天，想从哪里开始？</h2>
      <p className="career-welcome__description">从一段经历、一个目标，或最近的困惑聊起。</p>
    </div>
    <div className="career-welcome__starters" aria-label="开始话题">
      {CAREER_STARTERS.map(item => <button key={item.id} type="button" onClick={() => onPrompt(item.prompt)}>
        <CareerIcon name={item.icon} size={23} /><span>{item.title}</span>
      </button>)}
    </div>
    {!connected && canConfigure && <button className="career-connect-button" type="button" onClick={onConnect}>连接模型，和穗奈聊聊 <span>↗</span></button>}
  </section>;
}
