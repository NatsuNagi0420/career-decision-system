/** 青穗集 · 对照岗位 / 缺口与练习：给人看的卡片，不展示百分比和调试词。 */
import { rise } from "../state/motion";
import { Ms } from "./Ms";

interface Quote {
  text?: string;
  id?: number | string;
}

interface JobCard {
  job_id?: number;
  title?: string;
  company?: string;
  city?: string;
  salary_text?: string;
  matched?: string[];
  matched_count?: number;
  reference_only?: boolean;
  direction?: string;
  growth_path?: string[];
  quotes?: Quote[];
}

interface GapRow {
  text?: string;
  id?: number | string;
  matched?: string[];
}

interface PracticeItem {
  skill?: string;
  prompt?: string;
  hint?: string;
}

export interface JobMatchBody {
  conclusion?: string;
  reference_only?: boolean;
  jobs?: JobCard[];
  next_actions?: string[];
}

export interface LearningPathBody {
  conclusion?: string;
  focus?: JobCard | null;
  have?: GapRow[];
  missing?: GapRow[];
  next_steps?: string[];
  practice?: PracticeItem[];
  practice_missing?: string[];
}

function texts(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter((entry) => entry.trim()) : [];
}

export function JobMatchCard({
  pack,
  onRunAction,
}: {
  pack: JobMatchBody;
  onRunAction?: (goal: string) => void;
}) {
  const jobs = Array.isArray(pack.jobs) ? pack.jobs : [];
  return (
    <div className="stack">
      <section className="jobseek card-in" style={rise(0)}>
        <p className="jobseek__kicker">对照岗位</p>
        <h2 className="jobseek__title">{pack.conclusion || "还没有能对照的岗位。"}</h2>
        {pack.reference_only && jobs.length ? (
          <p className="jobseek__banner">这些是目录里的参考样本，没有采集日期，不能当成现在还在招。</p>
        ) : null}
        {jobs.length ? null : <p className="muted">先补几条你确认过的经历，对照才会有名单。</p>}
      </section>
      {jobs.map((job, index) => (
        <article className="jobseek__job card-in" style={rise(index + 1)} key={String(job.job_id ?? index)}>
          <div className="jobseek__jobhead">
            <div>
              <h3>{job.title || "未命名岗位"}</h3>
              <p className="muted">
                {[job.company, job.city, job.salary_text].filter(Boolean).join(" · ")}
              </p>
            </div>
            {job.reference_only ? <span className="tag tag--tertiary">参考样本</span> : <span className="tag tag--primary">目录岗位</span>}
          </div>
          <p className="jobseek__match">
            {job.matched_count
              ? `对上 ${job.matched_count} 个词${texts(job.matched).length ? `：${texts(job.matched).filter((item) => item !== "城市").join("、")}` : ""}`
              : "还没有对上的技能词"}
          </p>
          <ul className="jobseek__quotes">
            {(job.quotes ?? []).slice(0, 3).map((quote, position) => (
              <li key={`${job.job_id}-q${position}`}>「{quote.text}」</li>
            ))}
          </ul>
          {onRunAction && job.job_id ? (
            <div className="jobseek__actions">
              <button
                className="fieldbtn"
                type="button"
                onClick={() => onRunAction(`对照岗位 job_id=${job.job_id} 看我还缺什么、有没有题库和练习`)}
              >
                <Ms g="route" size={16} />
                <span>看缺口和练习</span>
              </button>
              <button
                className="fieldbtn"
                type="button"
                onClick={() => onRunAction("按已确认的经历写一份简历")}
              >
                <Ms g="article" size={16} />
                <span>写简历</span>
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function LearningPathCard({
  pack,
  onRunAction,
  onAsk,
}: {
  pack: LearningPathBody;
  onRunAction?: (goal: string) => void;
  onAsk?: (goal: string) => void;
}) {
  const have = Array.isArray(pack.have) ? pack.have : [];
  const missing = Array.isArray(pack.missing) ? pack.missing : [];
  const practice = Array.isArray(pack.practice) ? pack.practice : [];
  const missingSkills = texts(pack.practice_missing);
  const steps = texts(pack.next_steps);
  return (
    <div className="stack">
      <section className="jobseek card-in" style={rise(0)}>
        <p className="jobseek__kicker">缺口和练习</p>
        <h2 className="jobseek__title">{pack.conclusion || "还没有可对照的岗位缺口。"}</h2>
        {pack.focus?.title ? <p className="muted">{`对照「${pack.focus.title}」`}</p> : null}
      </section>
      <div className="jobseek__split">
        <section className="jobseek__col card-in" style={rise(1)}>
          <h3>已经能对上</h3>
          {have.length ? (
            <ul className="jobseek__quotes">
              {have.map((row, index) => (
                <li key={`have-${index}`}>「{row.text}」</li>
              ))}
            </ul>
          ) : (
            <p className="muted">还没有对上的原话。</p>
          )}
        </section>
        <section className="jobseek__col card-in" style={rise(2)}>
          <h3>还缺</h3>
          {missing.length ? (
            <ul className="jobseek__quotes">
              {missing.map((row, index) => (
                <li key={`miss-${index}`}>
                  「{row.text}」
                  {onAsk && row.text ? (
                    <button className="linkbtn" type="button" onClick={() => onAsk(`补一条能对应这句原话的经历：${row.text}`)}>
                      补这条
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">对照的岗位原话都能对上，或还没有岗位可对照。</p>
          )}
        </section>
      </div>
      {steps.length ? (
        <section className="jobseek__col card-in" style={rise(3)}>
          <h3>接下来几件事</h3>
          <ol className="jobseek__steps">
            {steps.map((step, index) => (
              <li key={`step-${index}`}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}
      <section className="jobseek__col card-in" style={rise(4)}>
        <h3>题库</h3>
        {practice.length ? (
          <ul className="jobseek__practice">
            {practice.map((item, index) => (
              <li key={`q-${index}`}>
                <span className="tag tag--primary">{item.skill}</span>
                <p>{item.prompt}</p>
                {item.hint ? (
                  <details>
                    <summary>看提示</summary>
                    <p className="muted">{item.hint}</p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">题库还没有收录对应练习，不会现场编题。</p>
        )}
        {missingSkills.length ? (
          <p className="jobseek__banner">{`这些技能暂无收录：${missingSkills.join("、")}`}</p>
        ) : null}
      </section>
      {onRunAction ? (
        <div className="jobseek__actions card-in" style={rise(5)}>
          <button className="fieldbtn" type="button" onClick={() => onRunAction("按已确认的经历写一份简历")}>
            <Ms g="article" size={16} />
            <span>写简历</span>
          </button>
          <button className="fieldbtn" type="button" onClick={() => onRunAction("先补我的经历，缺哪条会明说")}>
            <Ms g="person_search" size={16} />
            <span>再补经历</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
