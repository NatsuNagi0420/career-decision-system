/** 青穗集 · 职业判断结果校验：问题必须完整对应当前材料，缺失结果不能默认通过。 */
import { DECISION_POLICY_VERSION, DECISION_TEMPLATE_VERSION, decisionResultSchema, type DecisionTask } from "./career-decision-contract.js";
import { invariant } from "./errors.js";
export function validateCareerDecision(task: DecisionTask, raw: unknown) {
  const result = decisionResultSchema.parse(raw);
  const sameIds = (actual: { id: string }[], expected: { id: string }[]) => actual.length === expected.length && new Set(actual.map(x=>x.id)).size === actual.length && actual.every(x=>expected.some(y=>y.id===x.id));
  invariant(result.kind === task.kind && result.template_version === DECISION_TEMPLATE_VERSION && result.policy_version === DECISION_POLICY_VERSION,
    502, "职业判断版本或任务不一致。", "decision_invalid_response");
  invariant(task.kind === "turn_review" ? sameIds(result.facts,task.facts) : task.kind === "resume_guard" ? sameIds(result.claims,task.claims) && result.claims.every(claim => { const source = task.claims.find(item => item.id === claim.id)!; return source.evidence.length > 0 || claim.status === "unknown"; }) : sameIds(result.jobs,task.jobs) && result.jobs.every(job=>{
    const source=task.jobs.find(item=>item.id===job.id)!;
    return job.checks.length===source.requirements.length && job.checks.every((check,i)=>check.requirement===source.requirements[i].text && check.evidence.every(e=>task.personal.some(p=>p.id===e.source_id&&p.text===e.quote&&p.kind!=="plan")));
  }), 502, "职业判断缺少当前材料的完整结果。", "decision_invalid_response");
  if(task.kind==="turn_review" && result.follow_up) invariant(task.followups.some(q=>q.id===result.follow_up!.id&&q.question===result.follow_up!.question),502,"追问与当前材料不一致。","decision_invalid_response");
  return result;
}
