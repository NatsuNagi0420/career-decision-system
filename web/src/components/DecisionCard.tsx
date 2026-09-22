import { useState } from "react";
import { Ms } from "./Ms";
import { readableQuote } from "../state/readable";

interface Props {
  title: string;
  rationale: string;
  riskTier: string;
  criteria: string[];
  payload: Record<string, unknown>;
  onDecide: (approved: boolean, feedback: string) => void;
}

const KEY_LABEL: Record<string, string> = {
  name: "名称",
  statement: "陈述",
  title: "标题",
  body: "内容",
  question: "问题",
  project_id: "所属项目",
  direction: "方向",
  url: "链接",
  kind: "证据类型",
  quote: "引文",
  // The write replaces this draft line with the row's own text, so the card has to say
  // whose words end up stored — otherwise it reads as approval of the paraphrase.
  result_id: "引自你带回的原话（写入时一字不改）",
};

/**
 * The confirmation gate. It sits in the thread rather than in a side panel because
 * axiom three makes it the load-bearing part of the product: a decision that can be
 * missed is not a decision.
 */
export function DecisionCard({ title, rationale, riskTier, criteria, payload, onDecide }: Props) {
  const [feedback, setFeedback] = useState("");

  return (
    <section className="decision">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-sm)" }}>
        <span className="agenthead__logo" style={{ background: "var(--md-secondary-container)", color: "var(--md-on-secondary-container)" }}>
          <Ms g="how_to_reg" size={18} />
        </span>
        <span className="pill pill--warn">{riskTier} 级写入</span>
        <h3 className="decision__title">等你确认：{title}</h3>
      </div>

      {rationale ? <p className="section__body">{rationale}</p> : null}

      <dl>
        <dt>将写入</dt>
        <dd>
          <ul>
            {Object.entries(payload).map(([key, value]) => (
              <li key={key}>
                {KEY_LABEL[key] ?? key}：{describe(value)}
              </li>
            ))}
          </ul>
        </dd>
        {criteria.length ? (
          <>
            <dt>还不确定</dt>
            <dd>
              <ul>
                {criteria.map((entry, index) => (
                  <li key={index}>{entry}</li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
      </dl>

      <textarea placeholder="想改点什么？（可留空）" value={feedback} onChange={(event) => setFeedback(event.target.value)} />

      <div className="actions">
        <button className="btn btn--primary" onClick={() => onDecide(true, feedback)}>
          <Ms g="playlist_add_check" size={18} />
          <span>采纳并写入</span>
        </button>
        <button className="btn btn--soft" onClick={() => onDecide(false, feedback)}>
          <Ms g="close" size={18} />
          <span>拒绝</span>
        </button>
      </div>
    </section>
  );
}

function describe(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "（空）";
  }
  if (typeof value === "string") {
    return value.length > 220 ? `${value.slice(0, 220)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return readableQuote(JSON.stringify(value)).text;
}
