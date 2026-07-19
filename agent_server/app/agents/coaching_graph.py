import json
from collections.abc import Callable
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from pydantic import BaseModel

from app.agents.llm_fallback import log_llm_fallback
from app.config.settings import get_settings
from app.schemas.coaching import (
    ActionCoachRequest,
    ActionCoachResponse,
    ActionPlanPreviewRequest,
    ActionPlanPreviewResponse,
    CandidateAssessment,
    CandidateSuggestion,
    CoachingResponse,
    DecisionCoachRequest,
    DecisionCoachResponse,
    EvidenceBasis,
    JobComparisonRequest,
    JobComparisonResponse,
    SuggestedAction,
    TaskAdjustmentSuggestion,
    TaskSuggestion,
    WeeklyReviewCoachRequest,
    WeeklyReviewCoachResponse,
)
from app.services.llm_client import LlmClientError, llm_client


class CoachingState(TypedDict, total=False):
    request: BaseModel
    response: CoachingResponse


def _build_workflow(
    workflow_name: str,
    role_prompt: str,
    baseline_builder: Callable[[Any], CoachingResponse],
    response_type: type[CoachingResponse],
):
    def create_baseline(state: CoachingState) -> dict[str, CoachingResponse]:
        return {"response": baseline_builder(state["request"])}

    def enhance_with_llm(state: CoachingState) -> dict[str, CoachingResponse]:
        settings = get_settings()
        fallback = state["response"]
        if settings.llm_provider.lower() == "mock" or not getattr(state["request"], "allow_external_model", False):
            return {"response": fallback}
        try:
            content = llm_client.complete(
                system_prompt=_system_prompt(role_prompt, response_type),
                user_prompt=json.dumps(state["request"].model_dump(mode="json", by_alias=True), ensure_ascii=False),
                settings=settings,
            )
            parsed = response_type.model_validate(json.loads(_extract_json_object(content)))
            response = _normalize_response(parsed, fallback, state["request"]).model_copy(
                update={"generation_mode": "llm", "model_name": settings.llm_model}
            )
            return {"response": response}
        except (LlmClientError, ValueError, json.JSONDecodeError) as exc:
            log_llm_fallback(workflow_name, exc)
            return {"response": fallback}

    graph = StateGraph(CoachingState)
    graph.add_node("create_rule_baseline", create_baseline)
    graph.add_node("enhance_with_llm", enhance_with_llm)
    graph.set_entry_point("create_rule_baseline")
    graph.add_edge("create_rule_baseline", "enhance_with_llm")
    graph.add_edge("enhance_with_llm", END)
    return graph.compile()


def _system_prompt(role_prompt: str, response_type: type[BaseModel]) -> str:
    schema = json.dumps(response_type.model_json_schema(by_alias=True), ensure_ascii=False)
    return (
        f"{role_prompt} 你只能基于输入中给出的事实作答，不得虚构学校、企业、岗位或用户经历。"
        "同时给出支持依据、反对因素、不确定性和下一步验证动作。建议不能直接代表用户确认或修改业务数据。"
        "返回且只返回符合 JSON Schema 的 JSON，不要使用 Markdown。"
        f" JSON Schema: {schema}"
    )


def _extract_json_object(content: str) -> str:
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("LLM response does not contain a JSON object.")
    return text[start : end + 1]


def _normalize_response(response: CoachingResponse, fallback: CoachingResponse, request: BaseModel) -> CoachingResponse:
    allowed_refs = _allowed_source_refs(request, fallback)
    evidence_basis = []
    for item in response.evidence_basis:
        refs = [ref for ref in item.source_refs if ref in allowed_refs]
        if refs:
            evidence_basis.append(item.model_copy(update={"source_refs": refs}))
    updates: dict[str, object] = {
        "conclusion": response.conclusion.strip() or fallback.conclusion,
        "evidence_basis": evidence_basis or fallback.evidence_basis,
        "counter_arguments": _strings(response.counter_arguments) or fallback.counter_arguments,
        "uncertainties": _strings(response.uncertainties) or fallback.uncertainties,
        "next_actions": response.next_actions or fallback.next_actions,
    }
    if isinstance(response, DecisionCoachResponse) and isinstance(fallback, DecisionCoachResponse):
        updates["candidate_suggestions"] = response.candidate_suggestions[:3]
    elif isinstance(response, JobComparisonResponse) and isinstance(fallback, JobComparisonResponse):
        assessments = []
        for item in response.candidate_assessments:
            refs = [ref for ref in item.evidence_refs if ref in allowed_refs]
            assessments.append(item.model_copy(update={"evidence_refs": refs}))
        updates["candidate_assessments"] = assessments or fallback.candidate_assessments
    elif isinstance(response, ActionCoachResponse) and isinstance(fallback, ActionCoachResponse):
        updates["task_suggestions"] = response.task_suggestions or fallback.task_suggestions
    elif isinstance(response, WeeklyReviewCoachResponse) and isinstance(fallback, WeeklyReviewCoachResponse):
        updates["review_summary"] = response.review_summary.strip() or fallback.review_summary
        updates["adjustment_suggestions"] = response.adjustment_suggestions[:12]
    return response.model_copy(update=updates)


def _allowed_source_refs(request: BaseModel, fallback: CoachingResponse) -> set[str]:
    refs = {ref for item in fallback.evidence_basis for ref in item.source_refs}
    project = getattr(request, "project", None)
    if project is not None:
        refs.add(f"decision-project:{project.id}")
        for item in project.evidence:
            if item.id is not None:
                refs.add(f"project-evidence:{item.id}")
            if item.source_ref:
                refs.add(item.source_ref)
        for job in project.job_samples:
            if job.job_id is not None:
                refs.add(f"job:{job.job_id}")
    plan = getattr(request, "plan", None)
    if plan is not None:
        refs.add(f"action-plan:{plan.id}")
    review = getattr(request, "review", None)
    if review is not None:
        refs.add(f"weekly-review:{review.id}")
    context = getattr(request, "decision_context", None)
    if context is None:
        return refs
    refs.add("profile")
    for item in context.personal_evidence:
        if item.get("id") is not None:
            refs.add(f"personal-evidence:{item['id']}")
    for job in context.job_details:
        if _value(job, "id") is not None:
            refs.add(f"job:{_value(job, 'id')}")
    for resource, prefix in ((context.project, "decision-project"), (context.plan, "action-plan"), (context.review, "weekly-review")):
        if isinstance(resource, dict) and _value(resource, "id") is not None:
            refs.add(f"{prefix}:{_value(resource, 'id')}")
    return refs


def _strings(values: list[str]) -> list[str]:
    return [value.strip() for value in values if value.strip()]


def _value(values: dict[str, object], *keys: str):
    for key in keys:
        if key in values and values[key] is not None:
            return values[key]
    return None


def _text(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _context_basis(request: BaseModel) -> list[EvidenceBasis]:
    context = getattr(request, "decision_context", None)
    if context is None:
        return []
    basis: list[EvidenceBasis] = []
    profile = context.profile
    profile_parts = []
    for key, label in (("major", "专业"), ("targetRole", "档案目标"), ("weeklyAvailableMinutes", "每周可用分钟")):
        value = _value(profile, key, key[0].lower() + key[1:])
        if value not in (None, "", []):
            profile_parts.append(f"{label}：{value}")
    skills = _value(profile, "skills")
    if isinstance(skills, list) and skills:
        profile_parts.append("已有技能：" + "、".join(_text(item) for item in skills[:8] if _text(item)))
    if profile_parts:
        basis.append(EvidenceBasis(statement="；".join(profile_parts), source_refs=["profile"]))
    for item in context.personal_evidence[:5]:
        title = _text(_value(item, "title"))
        if not title:
            continue
        summary = _text(_value(item, "resultSummary", "result_summary", "description"))
        statement = title + (f"：{summary}" if summary else "")
        basis.append(
            EvidenceBasis(
                statement=statement[:1000],
                source_refs=[f"personal-evidence:{_value(item, 'id') or 'unknown'}"],
            )
        )
    for job in context.job_details[:6]:
        job_id = _value(job, "id") or "unknown"
        title = _text(_value(job, "title")) or "已保存岗位"
        requirements = _value(job, "requirements")
        requirement_text = ""
        if isinstance(requirements, list) and requirements:
            requirement_text = "；要求：" + "、".join(_text(item) for item in requirements[:3] if _text(item))
        basis.append(EvidenceBasis(statement=(f"岗位：{title}{requirement_text}")[:1000], source_refs=[f"job:{job_id}"]))
    return basis[:12]


def _job_requirements(request: BaseModel) -> list[tuple[str, str]]:
    context = getattr(request, "decision_context", None)
    if context is None:
        return []
    requirements: list[tuple[str, str]] = []
    seen: set[str] = set()
    for job in context.job_details:
        job_id = _value(job, "id") or "unknown"
        values = _value(job, "requirements")
        if not isinstance(values, list) or not values:
            values = _value(job, "tags")
        if not isinstance(values, list):
            continue
        for item in values:
            text = _text(item)
            key = text.lower()
            if text and key not in seen:
                seen.add(key)
                requirements.append((text, f"job:{job_id}"))
    return requirements[:20]


def _known_evidence_text(request: BaseModel) -> str:
    context = getattr(request, "decision_context", None)
    if context is None:
        return ""
    values: list[str] = []
    for key in ("skills", "certificates", "experiences"):
        items = _value(context.profile, key)
        if isinstance(items, list):
            values.extend(_text(item) for item in items)
    for item in context.personal_evidence:
        values.extend(_text(value) for value in item.values() if isinstance(value, str))
    return " ".join(values).lower()


def _missing_job_requirements(request: BaseModel) -> list[tuple[str, str]]:
    evidence = _known_evidence_text(request)
    evidence_terms = [term.strip("，。；、,.;:/") for term in evidence.split() if len(term.strip("，。；、,.;:/")) >= 2]
    missing = []
    for requirement, source_ref in _job_requirements(request):
        normalized = requirement.lower()
        supported = normalized in evidence or any(term in normalized for term in evidence_terms)
        if not evidence or not supported:
            missing.append((requirement, source_ref))
    return missing


def _basis_from_project(request: DecisionCoachRequest | JobComparisonRequest) -> list[EvidenceBasis]:
    project = request.project
    basis = [
        EvidenceBasis(
            statement=f"决策问题：{project.question}",
            source_refs=[f"decision-project:{project.id}"],
        )
    ]
    for item in project.evidence[:6]:
        detail = f"：{item.detail}" if item.detail else ""
        source = item.source_ref or f"project-evidence:{item.id or 'unknown'}"
        basis.append(EvidenceBasis(statement=f"{item.title}{detail}", source_refs=[source]))
    for sample in project.job_samples[:4]:
        company = f" · {sample.company}" if sample.company else ""
        basis.append(
            EvidenceBasis(
                statement=f"岗位样本：{sample.title}{company}",
                source_refs=[f"job:{sample.job_id or sample.id or 'unknown'}"],
            )
        )
    basis.extend(_context_basis(request))
    return basis[:20]


def build_decision_baseline(request: DecisionCoachRequest) -> DecisionCoachResponse:
    project = request.project
    existing_names = {item.name.strip().lower() for item in project.candidates}
    slots = max(0, min(2, 5 - len(project.candidates)))
    suggestions = [
        CandidateSuggestion(
            name=name,
            recommendation_reason="该方向来自当前职业目录，可作为补充候选进行同口径验证。",
            opposing_factors="尚未看到该方向与个人证据、现实约束之间的直接匹配。",
            uncertainties="缺少关联岗位样本以及用户对实际工作内容的反馈。",
            validation_actions=["阅读 3 个真实岗位并提取共同要求", "与当前候选按同一比较维度记录证据"],
        )
        for name in request.available_directions
        if name.strip() and name.strip().lower() not in existing_names
    ][:slots]
    candidate_count = len(project.candidates)
    evidence_count = len(project.evidence)
    job_count = len(project.job_samples)
    uncertainties = []
    if evidence_count == 0:
        uncertainties.append("当前没有项目证据，无法判断个人经历是否支持任一候选。")
    if job_count == 0:
        uncertainties.append("当前没有真实岗位样本，岗位需求和地域机会仍未验证。")
    if candidate_count < 2:
        uncertainties.append("候选不足 2 个，暂时无法形成有效比较。")
    if not uncertainties:
        uncertainties.append("现有证据仍可能受样本数量和发布时间影响，需要定期复查。")
    counter = [item.opposing_factors.strip() for item in project.candidates if item.opposing_factors and item.opposing_factors.strip()]
    if not counter:
        counter = ["当前记录的内容偏向支持理由，反对因素还没有被系统验证。"]
    actions = []
    if candidate_count < 2:
        actions.append(
            SuggestedAction(
                action_type="add_candidate",
                title="补足至少两个候选方向",
                rationale="没有替代选项时，确认目标容易变成对第一个想法的默认接受。",
                acceptance_criteria="项目中保留 2 至 5 个边界清楚的候选方向。",
            )
        )
    if evidence_count < 3:
        actions.append(
            SuggestedAction(
                action_type="collect_evidence",
                title="为每个候选补充一条个人证据",
                rationale="个人兴趣和已有经历需要用可回溯事实表达。",
                acceptance_criteria="每个候选至少有一条注明来源和可信度的证据。",
            )
        )
    if job_count < max(2, candidate_count):
        actions.append(
            SuggestedAction(
                action_type="validate_assumption",
                title="补充真实岗位样本",
                rationale="职业名称不能替代招聘市场中的实际职责和要求。",
                acceptance_criteria="每个候选至少加入一个真实岗位样本并记录观察。",
            )
        )
    if not actions:
        actions.append(
            SuggestedAction(
                action_type="compare_candidate",
                title="按统一标准完成候选比较",
                rationale="现有证据已经可以进入逐项比较，但结论仍由用户确认。",
                acceptance_criteria="每个候选在关键维度都有评价、依据、不确定性和验证动作。",
            )
        )
    confidence = min(0.72, 0.32 + candidate_count * 0.05 + evidence_count * 0.035 + job_count * 0.025)
    return DecisionCoachResponse(
        generation_mode="fallback",
        model_name="rule-decision-coach-v1",
        confidence=round(confidence, 2),
        conclusion=(
            f"当前项目有 {candidate_count} 个候选、{evidence_count} 条证据和 {job_count} 个岗位样本，建议先补最薄弱的证据环节再确认目标。"
        ),
        evidence_basis=_basis_from_project(request),
        counter_arguments=counter[:8],
        uncertainties=uncertainties,
        next_actions=actions,
        candidate_suggestions=suggestions,
    )


def build_comparison_baseline(request: JobComparisonRequest) -> JobComparisonResponse:
    project = request.project
    assessments: list[CandidateAssessment] = []
    for candidate in project.candidates:
        candidate_evidence = [item for item in project.evidence if item.candidate_id == candidate.id]
        samples = [item for item in project.job_samples if item.candidate_id == candidate.id]
        supporting = [item for item in candidate_evidence if item.stance == "support"]
        opposing = [item for item in candidate_evidence if item.stance == "oppose"]
        score = max(1, min(5, 3 + min(1, len(supporting)) - min(1, len(opposing)))) if candidate_evidence or samples else None
        refs = [f"project-evidence:{item.id}" for item in candidate_evidence if item.id]
        refs.extend(f"job:{item.job_id}" for item in samples if item.job_id)
        detailed_jobs = []
        if request.decision_context is not None:
            detailed_jobs = [
                job for job in request.decision_context.job_details if _value(job, "candidateId", "candidate_id") == candidate.id
            ]
        requirement_count = sum(
            len(values) for job in detailed_jobs if isinstance((values := _value(job, "requirements")), list)
        )
        requirement_note = f"，其中已提取 {requirement_count} 条结构化要求" if requirement_count else ""
        assessments.append(
            CandidateAssessment(
                candidate_id=candidate.id or 0,
                candidate_name=candidate.name,
                score=score,
                assessment=f"已关联 {len(candidate_evidence)} 条项目证据和 {len(samples)} 个真实岗位样本{requirement_note}。",
                evidence_refs=refs,
                opposing_factors=[item.title for item in opposing[:3]]
                or [candidate.opposing_factors or "反对证据不足，需要主动寻找不利信息。"],
                uncertainty=candidate.uncertainties or "岗位样本和个人实践反馈仍可能不足。",
                validation_action=(candidate.validation_actions[0] if candidate.validation_actions else "完成一次小型实践并记录结果。"),
            )
        )
    evidence_basis = _basis_from_project(request)
    return JobComparisonResponse(
        generation_mode="fallback",
        model_name="rule-job-comparison-v1",
        confidence=min(0.75, round(0.35 + len(project.evidence) * 0.04 + len(project.job_samples) * 0.03, 2)),
        conclusion="比较结果用于暴露取舍和信息缺口，不会自动替你确认主目标。",
        evidence_basis=evidence_basis,
        counter_arguments=["评分会压缩复杂信息，不能替代原始证据和现实约束。"],
        uncertainties=["岗位样本数量、地区和发布时间可能导致比较偏差。"],
        next_actions=[
            SuggestedAction(
                action_type="compare_candidate",
                title="逐项确认比较草稿",
                rationale="规则结果只能作为草稿，需要用户核对每个候选的事实依据。",
                acceptance_criteria="所有关键维度都保留依据、不确定性和下一步验证动作。",
            )
        ],
        candidate_assessments=assessments,
    )


def _all_tasks(request: ActionCoachRequest | WeeklyReviewCoachRequest):
    return [task for week in request.plan.weeks for task in week.tasks]


def build_action_baseline(request: ActionCoachRequest) -> ActionCoachResponse:
    plan = request.plan
    existing_titles = {task.title for task in _all_tasks(request)}
    missing_requirements = _missing_job_requirements(request)
    personalised: list[TaskSuggestion] = []
    for index, (requirement, source_ref) in enumerate(missing_requirements[:2]):
        week_no = min(max(1, index + 1), plan.duration_weeks)
        personalised.append(
            TaskSuggestion(
                week_no=week_no,
                title=f"验证岗位要求：{requirement[:42]}",
                task_type="skill_learning" if index == 0 else "project",
                content=f"围绕真实岗位反复出现的要求“{requirement}”完成一次学习或最小实践，并记录当前掌握程度。",
                estimated_minutes=120 if index == 0 else 180,
                acceptance_criteria="保留可检查的练习或成果，并写明该成果如何回应岗位要求。",
                rationale=f"该要求来自已保存岗位，当前档案和个人证据中尚未找到直接支持（{source_ref}）。",
            )
        )
    candidates = personalised + [
        TaskSuggestion(
            week_no=1,
            title="访谈一位目标方向从业者",
            task_type="networking",
            content=f"围绕 {plan.target_role} 的日常工作、入门门槛和常见误区准备 5 个问题并完成一次交流。",
            estimated_minutes=90,
            acceptance_criteria="留下访谈对象背景、5 个问答要点和一条修正后的职业判断。",
            rationale="真实从业者反馈可以补充岗位描述看不到的工作体验。",
        ),
        TaskSuggestion(
            week_no=min(2, plan.duration_weeks),
            title="完成一个最小岗位能力样例",
            task_type="project",
            content=f"选择 {plan.target_role} 岗位中重复出现的一项能力，产出一个边界清楚的微型成果。",
            estimated_minutes=180,
            acceptance_criteria="成果可被打开或演示，并包含问题、行动、结果和反思。",
            rationale="可展示成果比笼统的学习记录更能验证能力差距。",
        ),
        TaskSuggestion(
            week_no=plan.duration_weeks,
            title="用新证据复查职业目标",
            task_type="career_research",
            content="汇总岗位样本、实践成果和反馈，判断继续、调整或增加验证。",
            estimated_minutes=45,
            acceptance_criteria="写出继续或调整目标的结论、三条依据和一个仍未解决的问题。",
            rationale="计划服务于目标验证，最后必须回到职业判断本身。",
        ),
    ]
    suggestions = [item for item in candidates if item.title not in existing_titles][:3]
    if not suggestions:
        suggestions = [
            TaskSuggestion(
                week_no=1,
                title="补齐一个现有任务的成果证据",
                task_type="custom",
                content="选择当前计划中验收依据最薄弱的一项任务，补充可访问的成果、反馈或数据记录。",
                estimated_minutes=45,
                acceptance_criteria="至少一项现有任务新增成果说明或链接，并写明它支持或反对目标的原因。",
                rationale="默认验证任务已经齐全时，应提高证据质量，而不是继续添加重复任务。",
            )
        ]
    return ActionCoachResponse(
        generation_mode="fallback",
        model_name="rule-action-coach-v1",
        confidence=0.58,
        conclusion=f"围绕“{plan.target_role}”优先安排能产生岗位证据、实践成果和外部反馈的任务。",
        evidence_basis=([
            EvidenceBasis(statement=f"当前目标：{plan.target_role}", source_refs=[f"action-plan:{plan.id}"]),
            EvidenceBasis(statement=f"计划周期：{plan.duration_weeks} 周", source_refs=[f"action-plan:{plan.id}"]),
        ] + _context_basis(request))[:20],
        counter_arguments=["任务数量增加不等于验证质量提高，新增任务会占用既有计划时间。"],
        uncertainties=(
            ["结构化岗位要求样本仍然有限，任务优先级需要在新增岗位后复查。"]
            if _job_requirements(request)
            else ["当前上下文不包含完整岗位技能频次，任务仍需结合真实岗位样本调整。"]
        ),
        next_actions=[
            SuggestedAction(
                action_type="create_task",
                title="选择一条建议加入计划",
                rationale="先用一个小任务验证建议质量，避免一次性扩大计划。",
                acceptance_criteria="用户确认任务内容、周次、耗时和验收标准后再保存。",
            )
        ],
        task_suggestions=suggestions,
    )


def build_review_baseline(request: WeeklyReviewCoachRequest) -> WeeklyReviewCoachResponse:
    review = request.review
    week = next((item for item in request.plan.weeks if item.week_no == review.week_no), None)
    tasks = week.tasks if week else []
    completed = [task for task in tasks if task.status == "completed"]
    unfinished = [task for task in tasks if task.status in {"todo", "in_progress", "deferred"}]
    result_count = sum(len(task.results) for task in completed)
    adjustments = [
        TaskAdjustmentSuggestion(
            task_id=task.id,
            task_title=task.title,
            status="deferred",
            reason="本周尚未完成，先延期并在下周重新确认优先级。",
            deferred_days=7,
        )
        for task in unfinished[:3]
    ]
    evidence = [
        EvidenceBasis(
            statement=f"第 {review.week_no} 周完成 {len(completed)}/{len(tasks)} 个任务。",
            source_refs=[f"action-plan:{request.plan.id}:week:{review.week_no}"],
        )
    ]
    if review.evidence_summary:
        evidence.append(EvidenceBasis(statement=review.evidence_summary, source_refs=[f"weekly-review:{review.id}"]))
    evidence.extend(_context_basis(request))
    return WeeklyReviewCoachResponse(
        generation_mode="fallback",
        model_name="rule-weekly-review-v1",
        confidence=min(0.72, 0.4 + len(completed) * 0.05 + result_count * 0.04),
        conclusion=f"本周完成 {len(completed)} 个任务并留下 {result_count} 条成果记录，下一周应优先处理未完成任务的取舍。",
        evidence_basis=evidence[:20],
        counter_arguments=["完成率不能单独说明目标方向是否正确，成果质量和新信息同样重要。"],
        uncertainties=[review.difficulties or "尚未记录具体阻碍，无法判断未完成任务是时间问题还是方向问题。"],
        next_actions=[
            SuggestedAction(
                action_type="adjust_task" if adjustments else "review_target",
                title="核对下一周计划调整",
                rationale="调整应基于本周结果，并由用户逐项确认。",
                acceptance_criteria="每个延期或跳过项都有原因，批量修改前完成二次确认。",
            )
        ],
        review_summary=f"完成 {len(completed)}/{len(tasks)} 个任务；成果记录 {result_count} 条；待处理任务 {len(unfinished)} 个。",
        adjustment_suggestions=adjustments,
    )


decision_coach_graph = _build_workflow(
    "decision_coach",
    "你是面向大学生的职业决策教练，负责澄清问题、组织候选并识别证据缺口。",
    build_decision_baseline,
    DecisionCoachResponse,
)
job_comparison_graph = _build_workflow(
    "job_comparison",
    "你是职业岗位比较教练，负责对多个候选采用同一证据标准进行比较。",
    build_comparison_baseline,
    JobComparisonResponse,
)
action_coach_graph = _build_workflow(
    "action_coach",
    "你是职业行动教练，负责把验证目标拆成具体、可验收且时间可控的任务。",
    build_action_baseline,
    ActionCoachResponse,
)
weekly_review_graph = _build_workflow(
    "weekly_review",
    "你是每周复盘教练，负责根据完成情况、成果和阻碍提出可确认的计划调整建议。",
    build_review_baseline,
    WeeklyReviewCoachResponse,
)


def coach_decision(request: DecisionCoachRequest) -> DecisionCoachResponse:
    return decision_coach_graph.invoke({"request": request})["response"]


def compare_jobs(request: JobComparisonRequest) -> JobComparisonResponse:
    return job_comparison_graph.invoke({"request": request})["response"]


def coach_action(request: ActionCoachRequest) -> ActionCoachResponse:
    return action_coach_graph.invoke({"request": request})["response"]


def coach_weekly_review(request: WeeklyReviewCoachRequest) -> WeeklyReviewCoachResponse:
    return weekly_review_graph.invoke({"request": request})["response"]


def preview_action_plan(request: ActionPlanPreviewRequest) -> ActionPlanPreviewResponse:
    """Personalise a complete rule draft while preserving a reliable fallback."""

    fallback = ActionPlanPreviewResponse.model_validate(request.baseline)
    settings = get_settings()
    if settings.llm_provider.lower() == "mock" or not request.allow_external_model:
        return fallback
    try:
        content = llm_client.complete(
            system_prompt=_plan_preview_system_prompt(),
            user_prompt=json.dumps(request.model_dump(mode="json", by_alias=True), ensure_ascii=False),
            settings=settings,
        )
        parsed = ActionPlanPreviewResponse.model_validate(json.loads(_extract_json_object(content)))
        return _normalize_plan_preview(parsed, fallback, request.duration_weeks).model_copy(
            update={"generation_mode": "llm", "model_name": settings.llm_model}
        )
    except (LlmClientError, ValueError, json.JSONDecodeError) as exc:
        log_llm_fallback("action_plan_preview", exc)
        return fallback


def _plan_preview_system_prompt() -> str:
    schema = json.dumps(ActionPlanPreviewResponse.model_json_schema(by_alias=True), ensure_ascii=False)
    return (
        "你是职业行动计划设计器。输入包含后端可信解析的个人档案、个人证据、已确认目标、真实岗位职责与要求，"
        "以及一份完整的规则基线计划。你可以改写任务使其更贴合真实能力缺口，但必须保留所有周次，"
        "每周 1 至 4 个任务，任务总耗时不能明显超过 profile.weeklyAvailableMinutes。"
        "每个任务必须有具体动作、耗时、验收标准、形成该任务的理由、能力缺口、岗位要求和 sourceRefs。"
        "sourceRefs 只能使用输入中存在的 profile、personal-evidence:{id}、decision-project:{id}、job:{id}。"
        "不能虚构经历、岗位要求、公司信息或用户已完成的成果；信息不足时沿用规则基线并写入 uncertainties。"
        "建议只是待用户确认的草稿，不能声称已经保存或执行。只返回符合 JSON Schema 的 JSON，不要使用 Markdown。"
        f" JSON Schema: {schema}"
    )


def _normalize_plan_preview(
    response: ActionPlanPreviewResponse,
    fallback: ActionPlanPreviewResponse,
    duration_weeks: int,
) -> ActionPlanPreviewResponse:
    fallback_by_week = {week.week_no: week for week in fallback.weeks}
    response_by_week = {week.week_no: week for week in response.weeks if 1 <= week.week_no <= duration_weeks}
    weeks = []
    for week_no in range(1, duration_weeks + 1):
        baseline_week = fallback_by_week[week_no]
        proposed = response_by_week.get(week_no)
        if proposed is None:
            weeks.append(baseline_week)
            continue
        tasks = []
        for index, task in enumerate(proposed.tasks[:4]):
            fallback_task = baseline_week.tasks[min(index, len(baseline_week.tasks) - 1)]
            tasks.append(
                task.model_copy(
                    update={
                        "source_refs": task.source_refs or fallback_task.source_refs,
                        "capability_gap": task.capability_gap or fallback_task.capability_gap,
                        "job_requirement": task.job_requirement or fallback_task.job_requirement,
                    }
                )
            )
        weeks.append(proposed.model_copy(update={"tasks": tasks or baseline_week.tasks}))
    return response.model_copy(
        update={
            "overview": response.overview.strip() or fallback.overview,
            "evidence_basis": response.evidence_basis or fallback.evidence_basis,
            "uncertainties": _strings(response.uncertainties) or fallback.uncertainties,
            "weeks": weeks,
        }
    )
