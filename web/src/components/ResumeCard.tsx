/** 青穗集 · 简历编辑与投递预览：像素工具栏、可填写联系信息、独立打印正文和明确的缺项提示。 */
import { useState } from "react";
import { rise } from "../state/motion";
import {
  FORMAT_FIELDS,
  TEMPLATES,
  byId,
  clampField,
  formatLabel,
  formatVars,
  loadOverrides,
  loadTemplateId,
  orderedSections,
  resolveFormat,
  saveOverrides,
  saveTemplateId,
  type Format,
  type FormatKey,
} from "../state/resumeTemplates";
import { Ms } from "./Ms";

interface Line {
  text: string;
  ref?: { table?: string; id?: string };
  quote?: string;
}

interface Section {
  key: string;
  title: string;
  lines: Line[];
  empty: boolean;
  ask: string;
  dropped?: number;
}

export interface ResumeBody {
  sections?: Section[];
  completeness?: string;
  order_reason?: string;
  plain?: string;
  improvements?: string[];
}

/**
 * The ResumeDraft: a paper you can take away, not a panel you read here.
 *
 * It renders and re-orders; it does not compose. `app/agent/resume.py` decided that
 * every line is a copy of one database row, and the row id behind a line is
 * deliberately never printed — a resume is read by a person, not audited by one.
 *
 * The toolbar is `.no-print`, and the sheet keeps the same typography on screen and on
 * paper, so what a person approves visually is what comes out of 打印.
 */
export function ResumeCard({ resume, onAsk }: { resume: ResumeBody; onAsk?: (goal: string) => void }) {
  const [templateId, setTemplateId] = useState(loadTemplateId);
  const [overrides, setOverrides] = useState<Format>(loadOverrides);
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [copied, setCopied] = useState<"idle" | "done" | "manual">("idle");

  const template = byId(templateId);
  const format = resolveFormat(template, overrides);
  const sections = orderedSections(template, Array.isArray(resume.sections) ? resume.sections : []);
  const exportText = sections.length ? [
    `# ${contact.name || "个人简历"}`,
    [contact.phone, contact.email].filter(Boolean).join(" · "),
    ...sections.filter(section => !section.empty).map(section => `## ${section.title}\n${section.lines.map(line => `- ${line.text}${line.quote ? `\n  “${line.quote}”` : ""}`).join("\n")}`),
  ].filter(Boolean).join("\n\n") : resume.plain ?? "";

  const pick = (id: string) => {
    setTemplateId(id);
    saveTemplateId(id);
  };
  const nudge = (key: FormatKey, value: number) => {
    const next = { ...overrides, [key]: clampField(key, value) };
    setOverrides(next);
    saveOverrides(next);
  };

  const copy = async () => {
    const text = exportText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      // Clipboard permission is routinely denied; the text is still theirs, so show it
      // rather than reporting a failure with no way out.
      setCopied("manual");
    }
  };

  const print = () => {
    // "另存为 PDF" takes the document title as the default filename, so it is worth
    // setting for the duration of the print and putting back afterwards.
    const previous = document.title;
    document.title = "简历草稿-青穗集";
    window.print();
    document.title = previous;
  };

  return (
    <div className="stack">
      <div className="resume-bar no-print card-in" style={rise(0)}>
        <div className="resume-bar__row">
          {TEMPLATES.map((entry) => (
            <button
              key={entry.id}
              className="seg__btn"
              data-on={entry.id === template.id}
              onClick={() => pick(entry.id)}
              title={entry.note}
            >
              {entry.name}
            </button>
          ))}
        </div>
        <div className="resume-bar__row">
          {(Object.keys(FORMAT_FIELDS) as FormatKey[]).map((key) => (
            <label className="resume-bar__field" key={key}>
              <span>{formatLabel(key, format)}</span>
              <input
                type="range"
                min={FORMAT_FIELDS[key].min}
                max={FORMAT_FIELDS[key].max}
                step={FORMAT_FIELDS[key].step}
                value={format[key] ?? FORMAT_FIELDS[key].min}
                onChange={(event) => nudge(key, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
        <div className="resume-bar__contacts">
          {([["name", "姓名"], ["phone", "手机"], ["email", "邮箱"]] as const).map(([key, title]) => <label key={key}>{title}
            <input aria-label={`简历${title}`} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
              maxLength={key === "name" ? 60 : 160} placeholder={`填写${title}`} value={contact[key]}
              onChange={event => setContact(current => ({ ...current, [key]: event.target.value }))} />
          </label>)}
        </div>
        <p className="muted t-label-sm">联系信息仅用于当前预览与打印，离开此简历后需重新填写。</p>
        <div className="resume-bar__row">
          <button className="fieldbtn fieldbtn--wide" onClick={print} title="打印或另存为 PDF">
            <Ms g="print" size={16} />
            <span>打印</span>
          </button>
          <button className="fieldbtn fieldbtn--wide" onClick={() => void copy()} title="复制成 Markdown 文本">
            <Ms g="content_copy" size={16} />
            <span>复制文本</span>
          </button>
          {copied === "done" ? <span className="muted t-label-sm">已复制，粘进邮件或在线简历编辑器都行</span> : null}
        </div>
        {copied === "manual" ? (
          <details className="resume-bar__fallback">
            <summary>浏览器不让复制，这段可以手选</summary>
            <pre className="mono">{exportText}</pre>
          </details>
        ) : null}
      </div>

      <aside className="resume-context no-print">
        <p>投递预览 · 正文使用正式文档字体，下面的缺项提示不会打印。</p>
        {resume.order_reason ? <p>{resume.order_reason}</p> : null}
        {resume.completeness ? <p>{resume.completeness}</p> : null}
        {!contact.name || (!contact.phone && !contact.email) ? <p>打印前请补充姓名及至少一种联系方式。</p> : null}
      </aside>
      <div className="resume-sheet card-in" style={{ ...formatVars(format), ...rise(1) }}>
        <header className="resume-sheet__head">
          <h2 className="resume-sheet__name">{contact.name || "个人简历"}</h2>
          {contact.phone || contact.email ? <p className="resume-sheet__contact">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</p> : null}
        </header>

        {sections.map((section) => (
          <section className={`resume-sheet__section${section.empty ? " no-print" : ""}`} key={section.key}>
            <h3>{section.title}</h3>
            {section.empty ? (
              <p className="resume-sheet__empty">
                <span>{section.ask || "这部分还没有已确认的内容。"}</span>
                {section.ask && onAsk ? (
                  <button className="linkbtn" onClick={() => onAsk(`${section.title}：${section.ask}`)}>
                    和穗奈补充这一节
                  </button>
                ) : null}
              </p>
            ) : (
              <ul>
                {section.lines.map((line, position) => (
                  <li key={`${section.key}-${position}`}>
                    {line.text}
                    {line.quote ? <span className="resume-sheet__quote">“{line.quote}”</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {section.dropped ? <p className="faint t-label-sm">{`另有 ${section.dropped} 条未列入这一页`}</p> : null}
          </section>
        ))}
      </div>

      {Array.isArray(resume.improvements) && resume.improvements.length ? (
        <section className="jobseek jobseek--gaps no-print card-in" style={rise(2)}>
          <p className="jobseek__kicker">还能补的</p>
          <ul className="jobseek__quotes">
            {resume.improvements.map((item, index) => (
              <li key={`imp-${index}`}>
                {item}
                {onAsk ? (
                  <button className="linkbtn" type="button" onClick={() => onAsk(item)}>
                    让她问我这句
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
