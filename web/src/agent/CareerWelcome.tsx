/** 青穗集 · 职业对话起始页：所有卡片只填入真实需求，不虚构画像、岗位或已完成的规划。 */
import { SUINAI_AVATAR_URL } from "../assets";
import { CAREER_STARTERS, CareerIcon } from "./CareerVisuals";
export function CareerWelcome({ onPrompt, connected, onConnect, canConfigure = true }: { onPrompt: (text: string) => void; connected: boolean; onConnect: () => void; canConfigure?: boolean }) {
  return <section className="career-welcome" aria-label="从认识自己开始">
    <div className="career-welcome__eyebrow"><span aria-hidden="true">+--</span> YOUR NEXT CHAPTER <span aria-hidden="true">--+</span></div>
    <div className="career-welcome__intro">
      <div className="career-welcome__portrait"><img src={SUINAI_AVATAR_URL} alt="穗奈" width={72} height={72} /><span>✦</span></div>
      <p className="career-welcome__hello">你好，我是穗奈。</p>
      <h1>聊聊现在，<br className="career-small-break" />找到更喜欢的未来。</h1>
      <p className="career-welcome__description">不用一下子想清楚。我们可以从你做过的事、<br />喜欢的事，和期待的生活开始。</p>
    </div>
    <div className="career-step-cards">
      {CAREER_STARTERS.map(item => <button key={item.id} className={"career-step-card career-step-card--" + item.id} type="button" onClick={() => onPrompt(item.prompt)}>
        <span className="ascii-card-spark" aria-hidden="true"><i>+</i><i>·</i><i>*</i></span><CareerIcon name={item.icon} size={72} /><span className="career-step-card__copy"><small><span className="ascii-card-bracket" aria-hidden="true">[ </span>{item.number}<span className="ascii-card-bracket" aria-hidden="true"> ]</span></small><strong>{item.title}</strong><span>{item.description}</span></span><span className="career-step-card__arrow" aria-hidden="true">↗</span>
      </button>)}
    </div>
    <p className="career-welcome__invitation"><CareerIcon name="star" size={20} />先说说：最近哪件事，让你最有成就感？</p>
    {!connected && canConfigure && <button className="career-connect-button" type="button" onClick={onConnect}>连接模型，和穗奈聊聊 <span>↗</span></button>}
  </section>;
}
