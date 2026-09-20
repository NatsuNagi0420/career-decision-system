from __future__ import annotations

from app.capabilities.spec import CapabilitySpec

#: Capabilities the shell can start a run from directly. Everything else has to be
#: reachable through a next_capabilities chain, which scripts/validate.py enforces.
ENTRY_CAPABILITIES = ("skeleton_probe", "profile_diagnose", "direction_explore", "decision_frame", "compare_decide")

#: Ten decision/execution domains plus `skeleton_probe`, which exists to prove the
#: plumbing end to end and is not a domain.
CAPABILITIES: tuple[CapabilitySpec, ...] = (
    CapabilitySpec(
        id="skeleton_probe",
        domain="system",
        name="骨架自检",
        description="确认 run/step/event/artifact/proposal/approval、工具回路、确认门与 SSE 重放全部打通。",
        status="implemented",
        internal=True,
        required_context=["user"],
        tools=["get_run_history", "get_artifact"],
        artifact_type="RunDigest",
        proposal_types=["create_note"],
        risk_tier="R2",
        requires_approval=True,
        thinking="on",
    ),
    CapabilitySpec(
        id="profile_diagnose",
        domain="profile",
        name="画像诊断",
        description="读画像、算数据覆盖率、列出还缺哪条线索，并提议补一条事实。",
        status="implemented",
        required_context=["user"],
        tools=["get_profile"],
        artifact_type="ProfileGapReport",
        proposal_types=["record_profile_fact"],
        risk_tier="R2",
        requires_approval=True,
        thinking="off",
        next_capabilities=["direction_explore"],
    ),
    CapabilitySpec(
        id="direction_explore",
        domain="explore",
        name="方向与岗位认知",
        description="检索职业方向目录并取真实岗位样本与逐字要求条目，回答“这个方向实际在做什么”。",
        status="implemented",
        required_context=["user"],
        tools=["search_directions", "get_direction_detail", "get_job_samples", "get_requirement_items"],
        artifact_type="DirectionBrief",
        risk_tier="R1",
        evidence_required=True,
        thinking="on",
        next_capabilities=["candidate_source"],
    ),
    CapabilitySpec(
        id="decision_frame",
        domain="decide",
        name="决策问题框定",
        description="把一个模糊纠结整理成可比较的决策项目与标准。",
        status="implemented",
        required_context=["user"],
        tools=["get_profile", "search_directions"],
        artifact_type="DecisionFrame",
        proposal_types=["create_decision_project"],
        risk_tier="R2",
        requires_approval=True,
        thinking="on",
        next_capabilities=["candidate_source"],
    ),
    CapabilitySpec(
        id="candidate_source",
        domain="decide",
        name="候选职业生成",
        description="为决策项目补候选职业，每个候选都要有目录或岗位依据。",
        status="implemented",
        required_context=["user", "project"],
        tools=["search_directions", "list_candidates", "get_job_samples"],
        artifact_type="CandidateList",
        proposal_types=["add_candidate"],
        risk_tier="R2",
        requires_approval=True,
        evidence_required=True,
        thinking="on",
        next_capabilities=["evidence_collect"],
    ),
    CapabilitySpec(
        id="evidence_collect",
        domain="evidence",
        name="证据收集与归档",
        description="针对不确定项设计验证动作，并把带逐字引文的证据归档进项目。",
        status="implemented",
        required_context=["user", "project"],
        tools=["get_evidence", "list_candidates", "get_job_samples", "get_requirement_items"],
        artifact_type="EvidencePlan",
        proposal_types=["collect_evidence"],
        risk_tier="R2",
        requires_approval=True,
        evidence_required=True,
        thinking="off",
        next_capabilities=["compare_decide"],
    ),
    CapabilitySpec(
        id="compare_decide",
        domain="decide",
        name="多标准比较",
        description="按标准做确定性打分并给出反方论证；只出矩阵，绝不替用户确认目标。",
        status="implemented",
        required_context=["user", "project"],
        tools=["list_candidates", "get_evidence", "compare_candidates"],
        artifact_type="ComparisonMatrix",
        risk_tier="R1",
        evidence_required=True,
        thinking="on",
        next_capabilities=["action_plan"],
    ),
    CapabilitySpec(
        id="action_plan",
        domain="act",
        name="行动计划与任务",
        description="把验证问题排进周任务，按证据缺口控制任务量。",
        status="implemented",
        required_context=["user", "project"],
        tools=["get_plan", "estimate_load", "list_candidates"],
        artifact_type="ActionPlanDraft",
        proposal_types=["create_job_search_task"],
        risk_tier="R2",
        requires_approval=True,
        thinking="on",
        # weekly_review is still planned, so it was the only declared target and every
        # promise from this capability was silently dropped. After acting, the real
        # next steps are to bring back evidence and re-compare with it.
        next_capabilities=["evidence_collect", "compare_decide", "weekly_review"],
    ),
    CapabilitySpec(
        id="weekly_review",
        domain="act",
        name="周复盘",
        description="汇总本周成果与置信度趋势，产出复盘草稿。提交复盘属终局动作，只能人做。",
        status="planned",
        required_context=["user", "project"],
        tools=["get_plan", "get_evidence"],
        artifact_type="WeeklyReviewDraft",
        risk_tier="R3",
        requires_approval=True,
        thinking="on",
    ),
    CapabilitySpec(
        id="resume_build",
        domain="resume",
        name="简历生成与优化",
        description="基于画像与证据起草简历，数字一律取回原文，不补造。",
        status="planned",
        required_context=["user", "project"],
        tools=["get_profile", "get_evidence"],
        artifact_type="ResumeDraft",
        proposal_types=["create_resume_draft"],
        risk_tier="R2",
        requires_approval=True,
        evidence_required=True,
        thinking="on",
    ),
    CapabilitySpec(
        id="interview_prep",
        domain="interview",
        name="面试准备",
        description="按目标岗位组织行为面试素材与追问应对，素材必须能回指证据。",
        status="planned",
        required_context=["user", "project"],
        tools=["get_evidence", "get_requirement_items"],
        artifact_type="InterviewKit",
        risk_tier="R1",
        evidence_required=True,
        thinking="on",
    ),
)

_BY_ID = {spec.id: spec for spec in CAPABILITIES}


def get_capability(capability_id: str) -> CapabilitySpec:
    try:
        return _BY_ID[capability_id]
    except KeyError as exc:
        raise KeyError(f"unknown capability: {capability_id}") from exc


def implemented_capabilities() -> list[CapabilitySpec]:
    return [spec for spec in CAPABILITIES if spec.status == "implemented"]


def visible_capabilities() -> list[CapabilitySpec]:
    """What the shell may offer a student. Self-probes are plumbing, not a request."""
    return [spec for spec in CAPABILITIES if not spec.internal]


def is_valid_obligation_target(capability_id: str) -> bool:
    """Code owns the boundary. A promise may only point at a capability that exists,
    is implemented, and is not internal diagnostics — '骨架自检' is not a next step in
    anyone's career. A model that invents an id costs one dropped row, never a failed
    run, because a bad promise is not worth destroying the answer over."""
    spec = _BY_ID.get(capability_id)
    return bool(spec and spec.status == "implemented" and not spec.internal)


def artifact_types() -> set[str]:
    return {spec.artifact_type for spec in CAPABILITIES if spec.artifact_type}


def proposal_types() -> set[str]:
    return {ptype for spec in CAPABILITIES for ptype in spec.proposal_types}
