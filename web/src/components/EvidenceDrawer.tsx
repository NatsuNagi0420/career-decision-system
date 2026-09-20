import type { ArtifactEntry } from "../api/client";
import { Ms } from "./Ms";
import { readableQuote } from "../state/readable";

interface Props {
  open: boolean;
  artifact: ArtifactEntry | null;
  onClose: () => void;
}

interface EvidenceLine {
  claim: string;
  quote?: string;
  source?: string;
}

/**
 * Every sentence the answer is standing on, in one place. The claims and quotes are
 * already in the artifact — this drawer is a reader over them, not a second opinion,
 * which is why it can open instantly and offline.
 */
export function EvidenceDrawer({ open, artifact, onClose }: Props) {
  const lines = Array.isArray((artifact?.content as Record<string, unknown> | undefined)?.evidence_basis)
    ? (((artifact?.content as Record<string, unknown>).evidence_basis ?? []) as EvidenceLine[])
    : [];

  return (
    <>
      {open ? <button aria-label="关闭证据核验" className="scrim" onClick={onClose} /> : null}
      <aside className={`drawer${open ? " drawer--open" : ""}`} aria-hidden={!open}>
        <div className="drawer__head">
          <div className="panel__title">
            <Ms g="fact_check" size={20} />
            <span>{`${lines.length} 份证据原文核验`}</span>
          </div>
          <button className="minibtn" onClick={onClose} title="收起">
            <Ms g="close" size={20} />
          </button>
        </div>
        <div className="drawer__body">
          {lines.length ? null : <p className="empty">这一轮还没有可核验的原句。</p>}
          {lines.map((line, index) => {
            const quote = readableQuote(line.quote ?? "");
            return (
              <div className="drawer__row" key={index}>
                <span className="drawer__claim">{`${String(index + 1).padStart(2, "0")} · ${line.claim}`}</span>
                {quote.text ? <p className="drawer__quote">「{quote.text}」</p> : null}
                <span className="drawer__src">
                  <Ms g="source" size={14} />
                  <span>{line.source || "工具返回"}</span>
                </span>
                {quote.raw ? (
                  <pre className="mono" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
                    {quote.raw}
                  </pre>
                ) : null}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
