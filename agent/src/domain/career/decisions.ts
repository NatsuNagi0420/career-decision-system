/** 青穗集 · 职业判断领域服务：引用验证、按事件触发、持久化、过期检查与用户确认共用一个入口。 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { Store, id, now } from "../../store.js";
import { CareerWorkspace, careerFingerprint, careerSources } from "../../career.js";
import { Profiles } from "../../profiles.js";
import { AppError, invariant } from "../../errors.js";
import { DECISION_TEMPLATE_VERSION, DECISION_POLICY_VERSION, PROFILE_KEYS, candidateFactSchema, followUpCandidateSchema,
  decisionTaskSchema, type CareerDecisionView, type CareerFactCandidate,
  type DecisionResult, type DecisionTask, type JobAssessment, type ResumeEvidenceReview } from "../../career-decision-contract.js";
import { validateCareerDecision } from "../../career-decision-validation.js";
import { resumeFields, patchResumeFields } from "../../resume-fields.js";
import { resumeProposalInput, resumePatchInput, type ResumeWorkspace } from "../../resume.js";
import type { Profile, Run, ToolCall, User } from "../../types.js";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// 主模型的单条字段错误不应丢掉整轮有效原话；进入 Jev 的任务契约仍做严格校验。
export const conversationEvidenceSchema = z.object({
  facts: z.array(z.unknown()).max(8).default([]).transform(items => items.flatMap(item => {
    const normalized = item && typeof item === "object" && !Array.isArray(item)
      ? { ...item, ...("field" in item && ["plan", "learning_plan"].includes(String(item.field)) ? { field: "goal" } : {}) }
      : item;
    const parsed = candidateFactSchema.safeParse(normalized);
    return parsed.success ? [parsed.data] : [];
  })),
  followups: z.array(z.unknown()).max(3).default([]).transform(items => items.flatMap(item => {
    const parsed = followUpCandidateSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  })),
});
const LABELS: Record<string,string> = { supported: "有经历支持", partial: "还需要补充细节", unsupported: "这句话还缺依据", unchecked: "等待校准" };
type RecordRow = { id: string; basis: string; data: string; created_at: string; conversation_id: string };
interface DecisionScope { user: User; profile: Profile; conversationId: string; runId: string | null; signal: AbortSignal; messageId?: string }
export class CareerDecisions {
  constructor(readonly store: Store, readonly career: CareerWorkspace, readonly resume: ResumeWorkspace, readonly profiles: Profiles,
    readonly event: (cid: string, runId: string | null, kind: string, data: Record<string, unknown>) => unknown) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS career_evidence_facts(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,status TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS career_evidence_by_user ON career_evidence_facts(user_id,status);
      CREATE TABLE IF NOT EXISTS career_decision_runs(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,kind TEXT NOT NULL,cache_key TEXT NOT NULL,basis TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS career_decisions_by_user ON career_decision_runs(user_id,created_at);
      CREATE TABLE IF NOT EXISTS career_decision_activity(conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS career_resume_reviews(user_id INTEGER PRIMARY KEY REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,data TEXT NOT NULL);`);
    career.decisionView = (userId, cid) => this.view(userId, cid);
  }
  private sourceValid(userId: number, cid: string, evidence: { source_id: string; quote: string }) {
    const source = evidence.source_id.startsWith("message.")
      ? this.store.messages(cid).find(message => message.role === "user" && message.id === evidence.source_id.slice(8))?.content
      : careerSources(this.career.get(userId)).find(item => item.id === evidence.source_id && item.kind !== "job_sample")?.text;
    return Boolean(source && source.includes(evidence.quote));
  }
  private candidates(userId: number): CareerFactCandidate[] {
    return this.store.db.prepare("SELECT data FROM career_evidence_facts WHERE user_id=? AND status='pending' ORDER BY rowid DESC LIMIT 40").all(userId).map(row => {
      const fact = JSON.parse(row.data as string) as CareerFactCandidate;
      fact.stale = !fact.evidence.every(evidence => this.sourceValid(userId, fact.conversation_id, evidence));
      fact.confirmable = !fact.stale && !fact.conflict && fact.support === "supported" && fact.category !== "unknown" &&
        (!["education", "experience", "skills"].includes(fact.field) || fact.category === "actual");
      return fact;
    });
  }
  private basis(userId: number) {
    const state = this.career.get(userId);
    return hash({ profile: careerFingerprint(state), skills: state.skills ?? [], facts: this.candidates(userId).filter(f => !f.stale).map(f => ({ id: f.id, text: f.text, support: f.support, category: f.category, conflict: f.conflict })).sort((a,b)=>a.id.localeCompare(b.id)) });
  }
  view(userId: number, conversationId?: string): CareerDecisionView {
    this.store.getUser(userId);
    const basis = this.basis(userId), jobs = new Map<string,JobAssessment>();
    const rows = this.store.db.prepare("SELECT id,basis,data,created_at,conversation_id FROM career_decision_runs WHERE user_id=? AND kind IN ('job_match','turn_review') ORDER BY rowid DESC LIMIT 80").all(userId) as unknown as RecordRow[];
    let followUp: CareerDecisionView["follow_up"] = null, followUpRead = false;
    const latestMessage = conversationId ? this.store.messages(conversationId).filter(message => message.role === "user").at(-1) : undefined;
    for (const row of rows) {
      const result = JSON.parse(row.data) as DecisionResult;
      for (const job of result.jobs) if (!jobs.has(job.id)) jobs.set(job.id, { ...job, updated_at: row.created_at, stale: row.basis !== basis });
      if (!followUpRead && row.basis === basis && (!conversationId || row.conversation_id === conversationId) && (!latestMessage || latestMessage.created_at <= row.created_at)) { followUpRead = true; if (result.follow_up) followUp = { ...result.follow_up, conversation_id: row.conversation_id, updated_at: row.created_at }; }
    }
    const activity = conversationId
      ? this.store.db.prepare("SELECT data FROM career_decision_activity WHERE user_id=? AND conversation_id=?").get(userId, conversationId)
      : this.store.db.prepare("SELECT data FROM career_decision_activity WHERE user_id=? ORDER BY json_extract(data,'$.updated_at') DESC LIMIT 1").get(userId);
    return { facts: this.candidates(userId).filter(f => !f.stale).slice(0,12), jobs: [...jobs.values()], follow_up: followUp,
      activity: activity ? JSON.parse(activity.data as string) : null };
  }
  private activity(scope: DecisionScope, phase: NonNullable<CareerDecisionView["activity"]>["phase"], message: string) {
    const activity = { phase, conversation_id: scope.conversationId, updated_at: now(), message };
    this.store.db.prepare("INSERT INTO career_decision_activity VALUES(?,?,?) ON CONFLICT(conversation_id) DO UPDATE SET data=excluded.data").run(scope.conversationId, scope.user.id, JSON.stringify(activity));
    this.event(scope.conversationId, scope.runId, "career.decision", { activity });
  }
  reading(user: User, profile: Profile, cid: string) {
    if (profile.mode !== "official") return;
    this.activity({ user, profile, conversationId: cid, runId: null, signal: new AbortController().signal }, "reading", "正在整理刚聊到的经历");
  }
  interrupted(user: User, profile: Profile, cid: string, aborted: boolean) {
    if (profile.mode === "official") this.activity({ user, profile, conversationId: cid, runId: null, signal: new AbortController().signal }, aborted ? "ready" : "unavailable", aborted ? "本轮整理已停止，聊天可以继续" : "这轮整理暂未完成，聊天可以继续");
  }
  private valid(scope: DecisionScope, basis?: string) {
    scope.signal.throwIfAborted();
    const conversation = this.store.conversation(scope.user.id, scope.conversationId);
    invariant(!conversation.archived && this.store.getUser(scope.user.id).external_ai_consent, 409, "对话或授权已变化，旧判断已丢弃。", "decision_stale");
    if (scope.messageId) invariant(!this.store.activeRun(scope.conversationId) && this.store.messages(scope.conversationId).filter(m => m.role === "user").at(-1)?.id === scope.messageId,
      409, "对话已经继续，旧判断已丢弃。", "decision_stale");
    if (scope.runId) invariant(!this.store.run(scope.user.id, scope.runId).superseded_by && !["cancelled", "interrupted"].includes(this.store.run(scope.user.id, scope.runId).status), 409, "运行已结束或被替换。", "decision_stale");
    if (basis) invariant(this.basis(scope.user.id) === basis, 409, "职业资料已更新，旧判断已丢弃。", "decision_stale");
  }
  private async request(scope: DecisionScope, task: DecisionTask) {
    if (scope.profile.mode !== "official") return null;
    this.valid(scope);
    const basis = this.basis(scope.user.id), cacheKey = hash({ task, template: DECISION_TEMPLATE_VERSION, policy: DECISION_POLICY_VERSION, basis });
    const cached = this.store.db.prepare("SELECT data FROM career_decision_runs WHERE user_id=? AND conversation_id=? AND cache_key=? AND created_at>? ORDER BY rowid DESC LIMIT 1")
      .get(scope.user.id, scope.conversationId, cacheKey, new Date(Date.now()-15*60*1000).toISOString());
    if (cached) return validateCareerDecision(task, JSON.parse(cached.data as string));
    const result = await this.profiles.decide(scope.user, scope.profile, decisionTaskSchema.parse(task), scope.signal);
    this.valid(scope, basis);
    if (!result) return null;
    const safe = this.profiles.secrets.redactValue(result) as DecisionResult;
    this.store.db.prepare("INSERT INTO career_decision_runs VALUES(?,?,?,?,?,?,?,?)").run(id(), scope.user.id, scope.conversationId, task.kind, cacheKey, basis, now(), JSON.stringify(safe));
    this.event(scope.conversationId, scope.runId, "career.judged", { kind: task.kind, questions: result.question_count, duration_ms: result.duration_ms });
    return safe;
  }
  async observe(user: User, profile: Profile, cid: string, messageId: string, input: unknown, signal: AbortSignal) {
    if (profile.mode !== "official") return;
    const scope: DecisionScope = { user, profile, conversationId: cid, runId: null, signal, messageId };
    const parsed = conversationEvidenceSchema.parse(input);
    // 一个坏引用不会使其余真实引文丢失；来源只取本用户当前分支，不接受助手转述。
    const facts = parsed.facts.map(fact => ({ ...fact, evidence: fact.evidence.map(evidence => ({
      ...evidence,
      source_id: /^[a-f0-9-]{36}$/.test(evidence.source_id) ? "message." + evidence.source_id : evidence.source_id,
    })) })).filter(fact => fact.evidence.every(e => this.sourceValid(user.id,cid,e))).map(fact => ({ ...fact, id: hash({ user: user.id, field: fact.field, evidence: fact.evidence }).slice(0,40) }));
    if (facts.length < parsed.facts.length) this.event(cid, null, "career.evidence.rejected", { submitted: parsed.facts.length, retained: facts.length });
    const followups = parsed.followups.filter(f => !/手机号|电话号码|身份证|家庭住址/.test(f.question));
    if (!facts.length && !followups.length) { this.activity(scope, parsed.facts.length ? "unavailable" : "ready", parsed.facts.length ? "原话暂未核对完整，线索还没有写入档案" : "本轮没有新增职业材料"); return; }
    const state = this.career.get(user.id);
    const previous = Object.fromEntries(PROFILE_KEYS.map(key => [key,state.profile[key]]));
    let result: DecisionResult | null = null;
    this.activity(scope,"judging","正在校准经历与计划");
    try { result = await this.request(scope,{ kind: "turn_review", facts, previous, followups }); }
    catch (error) { if (signal.aborted || error instanceof AppError && error.code === "decision_stale") throw error; }
    this.valid(scope);
    for (const fact of facts) {
      const judged = result?.facts.find(item => item.id === fact.id);
      const record: CareerFactCandidate = { ...fact, conversation_id: cid, created_at: now(), status: "pending", category: judged?.category ?? "unknown",
        support: judged?.support ?? "unchecked", conflict: judged?.conflict ?? false, confirmable: false, stale: false };
      this.store.db.prepare("INSERT INTO career_evidence_facts VALUES(?,?,?,'pending',?) ON CONFLICT(id) DO UPDATE SET data=CASE WHEN status='pending' THEN excluded.data ELSE data END")
        .run(fact.id,user.id,cid,JSON.stringify(record));
    }
    // 本轮新增候选后，让同一轮追问绑定新材料指纹，而不是旧画像。
    if (result) this.store.db.prepare("UPDATE career_decision_runs SET basis=? WHERE user_id=? AND conversation_id=? AND kind='turn_review' AND rowid=(SELECT MAX(rowid) FROM career_decision_runs WHERE user_id=? AND conversation_id=? AND kind='turn_review')")
      .run(this.basis(user.id),user.id,cid,user.id,cid);
    this.event(cid,null,"career.updated", { added_facts: facts.length });
    if (!result) { this.activity(scope,"unavailable","经历已保留，本轮校准尚未完成"); return; }
    const jobIds = this.recentJobIds(user.id,cid);
    if (jobIds.length && facts.length) await this.assessJobs(scope,jobIds);
    else this.activity(scope,"ready", facts.length ? "刚聊到的经历已整理" : "找到一个值得继续了解的问题");
  }
  resolve(user: User, factId: string, action: "confirm" | "dismiss") {
    const fact = this.candidates(user.id).find(item => item.id === factId);
    invariant(fact,404,"这条经历已处理或不存在。", "fact_missing");
    invariant(!fact.stale,409,"原消息已经修改，请先重新整理。", "decision_stale");
    return this.store.transaction(() => {
      if (action === "confirm") {
        invariant(fact.confirmable,409,"这条记录仍需补充依据，请在对话中说明。", "fact_needs_evidence");
        // 显式点击确认才能写画像；程序保留其他字段，计划永不写为已掌握技能。
        const state = this.career.get(user.id), { confirmed_at: _confirmed, ...profile } = state.profile;
        const target = fact.category === "plan" ? "goal" : fact.field;
        const limit = { goal:400, education:2000,experience:6000,skills:2000,preferences:2000,weekly_hours:120 }[target];
        const current = profile[target];
        const next = current.includes(fact.text) ? current : [current,fact.text].filter(Boolean).join("\n");
        invariant(next.length <= limit,400,"这一字段已有较多记录，请先在画像里整理后再确认。");
        // CareerWorkspace.change 自带事务，因此在当前事务中做等价的单次原子版本更新。
        state.profile = { ...profile, [target]: next, confirmed_at: now() }; state.context_version++; state.revision++; state.updated_at=now();
        this.store.db.prepare("INSERT INTO career_workspaces(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data").run(user.id,JSON.stringify(state));
      }
      fact.status = action === "confirm" ? "confirmed" : "dismissed";
      this.store.db.prepare("UPDATE career_evidence_facts SET status=?,data=? WHERE user_id=? AND id=?").run(fact.status,JSON.stringify(fact),user.id,fact.id);
      return { cid: fact.conversation_id };
    });
  }
  private personal(userId: number): Extract<DecisionTask,{kind:"job_match"}>["personal"] {
    const confirmed = careerSources(this.career.get(userId)).filter(source => source.kind !== "job_sample" && !["profile.goal","profile.preferences","profile.weekly_hours"].includes(source.id))
      .map(source => ({ id:source.id,text:source.text.slice(0,2200),kind:source.kind === "user_result" ? "result" as const : "confirmed" as const }));
    const pending = this.candidates(userId).filter(f => !f.stale && !f.conflict && f.category === "actual" && f.support !== "unsupported" && f.support !== "unchecked")
      .map(f => ({ id:"candidate."+f.id,text:f.evidence.map(e => e.quote).join("\n").slice(0,2200),kind:"self_report" as const }));
    return [...confirmed,...pending].slice(0,20);
  }
  private recentJobIds(userId: number, cid: string) {
    const row = this.store.db.prepare("SELECT data FROM career_decision_runs WHERE user_id=? AND conversation_id=? AND kind='job_match' ORDER BY rowid DESC LIMIT 1").get(userId,cid);
    return row ? (JSON.parse(row.data as string) as DecisionResult).jobs.map(j=>j.id).slice(0,3) : [];
  }
  async assessJobs(scope: DecisionScope, ids: string[]): Promise<JobAssessment[]> {
    if (scope.profile.mode !== "official") return [];
    const jobs = [...new Set(ids)].slice(0,3).flatMap(jobId => {
      let job: { title:string; description:string; city:string; education:string|null; experience_level:string|null; work_type:string };
      try { job = this.career.catalogue.readJobSample({id:jobId}).sample; } catch { return []; }
      const heading = /(?:任职要求|任职资格|岗位要求|Qualifications|Requirements)[：:\s]*/i.exec(job.description);
      const section = heading ? job.description.slice(heading.index+heading[0].length) : job.description;
      const clauses = section.split(/(?<=[。；;])|\r?\n/).map(s=>s.trim()).filter(s=>s.length>=6 && s.length<=1000);
      const relevant = clauses.filter(s=>/熟悉|掌握|能力|经验|学历|专业|本科|硕士|负责|要求|knowledge|experience|skill|degree|proficien/i.test(s));
      const requirements = [...new Set(relevant.length ? relevant : clauses)].slice(0,4).map((text,i)=>({ id:"r"+i,text,importance:/优先|加分|preferred|bonus/i.test(text)?"preferred" as const:"essential" as const }));
      return requirements.length ? [{id:jobId,title:job.title,conditions:{city:job.city,education:job.education??"",experience_level:job.experience_level??"",work_type:job.work_type},requirements}] : [];
    });
    if (!jobs.length) return [];
    this.activity(scope,"matching","正在对照岗位要求");
    try {
      const state=this.career.get(scope.user.id), result=await this.request(scope,{kind:"job_match", personal:this.personal(scope.user.id),preferences:state.profile.preferences,jobs});
      this.valid(scope);
      this.activity(scope,result?"ready":"unavailable",result?"岗位依据已更新":"本轮对照尚未完成");
      this.event(scope.conversationId,scope.runId,"career.updated",{ job_ids:jobs.map(j=>j.id) });
      return result?.jobs.map(job=>({...job,updated_at:now(),stale:false}))??[];
    } catch (error) {
      if (scope.signal.aborted || error instanceof AppError && error.code === "decision_stale") throw error;
      this.activity(scope,"unavailable","岗位仍可查看，本轮对照尚未完成"); return [];
    }
  }
  async forRun(run: Run, ids: string[], signal: AbortSignal) {
    return this.assessJobs({ user:this.store.getUser(run.user_id),profile:this.store.profile(run.user_id,run.profile_id),conversationId:run.conversation_id,runId:run.id,signal },ids);
  }
  resumeReview(userId: number): ResumeEvidenceReview | undefined {
    const row=this.store.db.prepare("SELECT fingerprint,data FROM career_resume_reviews WHERE user_id=?").get(userId);
    if (!row) return;
    const review=JSON.parse(row.data as string) as ResumeEvidenceReview;
    const state=this.resume.get(userId);
    return {...review, stale:row.fingerprint!==hash({body:state.body,facts:state.facts})};
  }
  async reviewResume(run: Run, call: ToolCall, signal: AbortSignal) {
    const profile=this.store.profile(run.user_id,run.profile_id);
    if (profile.mode!=="official") return;
    const state=this.resume.get(run.user_id), raw:unknown=JSON.parse(call.arguments);
    let fields: {id:string;text:string;fact_ids:string[]}[]=[], candidateBody=state.body;
    if (call.name==="propose_resume_update") {
      const parsed=resumeProposalInput.parse(raw);
      if(parsed.data.kind!=="rewrite") return;
      candidateBody=parsed.data.body;
      fields=resumeFields(state.header, parsed.data.body).map(field=>({id:field.id,text:field.text,fact_ids:field.fact_ids}));
    } else if (call.name==="propose_resume_patch") {
      const parsed=resumePatchInput.parse(raw), current=state.body?resumeFields(state.header, state.body):[];
      if (state.body) candidateBody=patchResumeFields(state.header,state.body,parsed.changes).body;
      fields=parsed.changes.map(change=>({id:change.field_id,text:change.text,fact_ids:current.find(f=>f.id===change.field_id)?.fact_ids??[]}));
    }
    if(!fields.length) return;
    const scope:DecisionScope={user:this.store.getUser(run.user_id),profile,conversationId:run.conversation_id,runId:run.id,signal};
    const claims=fields.filter(f=>f.text.trim() && !f.id.startsWith("header.")).map(field=>({id:field.id,text:field.text.slice(0,2200),evidence:field.fact_ids.flatMap(fid=>{const fact=state.facts.find(f=>f.id===fid);return fact?[{source_id:fact.id,quote:fact.detail.slice(0,2200)}]:[];})}));
    if(!claims.length)return;
    const issues:ResumeEvidenceReview["issues"]=[];
    let checked=0;
    // 有界批处理；未覆盖字段明确显示，不能把部分检查标记为全文通过。
    for(let offset=0;offset<Math.min(claims.length,60);offset+=20){
      const batch=claims.slice(offset,offset+20);
      try {
        const result=await this.request(scope,{kind:"resume_guard",claims:batch});
        invariant(this.resume.get(run.user_id).revision===state.revision,409,"简历材料已经更新，旧检查已丢弃。","decision_stale");
        if(!result)break;
        checked+=batch.length;
        issues.push(...result.claims.filter(c=>c.status!=="supported").map(c=>({field_id:c.id,text:claims.find(f=>f.id===c.id)?.text??"",reason:c.status==="exceeds"?"表述可能超出已有经历，请核对职责、数字与熟练程度。":c.status==="conflict"?"这句话与已有经历不一致。":"这句话还缺少明确依据。"})));
      }catch(error){if(signal.aborted||error instanceof AppError&&error.code==="decision_stale")throw error;break;}
    }
    const review:ResumeEvidenceReview={status:!checked?"unavailable":issues.length?"needs_review":checked<claims.length?"partial":"checked",scope:call.name==="propose_resume_patch"?"changes":"document",checked_count:checked,total_count:claims.length,updated_at:now(),issues,stale:false};
    return { review, revision:state.revision, fingerprint:hash({body:candidateBody,facts:state.facts}) };
  }
  saveResumeReview(run: Run, review: ResumeEvidenceReview, fingerprint?: string) {
    const state=this.resume.get(run.user_id);
    this.store.db.prepare("INSERT INTO career_resume_reviews VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET conversation_id=excluded.conversation_id,fingerprint=excluded.fingerprint,data=excluded.data")
      .run(run.user_id,run.conversation_id,fingerprint ?? hash({body:state.body,facts:state.facts}),JSON.stringify(review));
    this.event(run.conversation_id,run.id,"resume.review",{review});
  }
  context(userId: number, conversationId?: string) {
    const view=this.view(userId, conversationId);
    return { facts:view.facts.map(f=>({id:f.id,field:f.field,text:f.text,category:f.category,status:f.support,conflict:f.conflict,evidence:f.evidence})),jobs:view.jobs,follow_up:view.follow_up,
      rules:"以上是带出处的候选和材料判断，不是已确认能力。计划不能写成已有技能；材料不足不等于不会。一次只追问一个关键未知项，结合用户最新话题决定是否继续，不强行推进。" };
  }
  describe(fact: CareerFactCandidate) { return fact.conflict?"与旧资料需要核对":LABELS[fact.support]; }
}
