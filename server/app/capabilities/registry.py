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
        # Measured live: without this the model filed one 200-character sentence under
        # the default `context`, so every downstream consumer that reads a specific
        # dimension (the resume reads education / skills / awards) got nothing.
        synthesis_notes=(
            "proposed.facts 是一个列表：本人这一句里说了几件事，就分几条记，一条一件事，"
            "不要把学校、技能、获奖塞进同一句。每条的 dimension 只能取 education、skills、"
            "awards、constraints、interests、values、context 之一；statement 用一句人话复述"
            "本人说过的内容，数字与名称照他原话，不要补造。一次确认卡会一次写入这些条，"
            "所以宁可少列，也不要列进他没说的话。"
        ),
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
        synthesis_notes=(
            "每个候选都要有一句出处：evidence_basis 的 quote 整行照抄 search_directions / "
            "get_job_samples / list_candidates 返回的 line 字段，"
            "不要把 name、category、summary 自己拼成一句（拼出来的话数据里没有）。"
            "没有 line 可引的候选写进 uncertainties，不要补描述。"
        ),
        next_capabilities=["evidence_collect"],
    ),
    CapabilitySpec(
        id="evidence_collect",
        domain="evidence",
        name="证据收集与归档",
        description="针对不确定项设计验证动作，并把带逐字引文的证据归档进项目。",
        status="implemented",
        required_context=["user", "project"],
        # `get_plan` is here because of the wake-up path: submitting a task result starts
        # an evidence_collect run whose whole job is that account, and without the tool
        # that returns it the run reads only JDs, finds nothing to cite, and proposes
        # nothing — the loop stops at the submission.
        tools=["get_evidence", "get_plan", "list_candidates", "get_job_samples", "get_requirement_items"],
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
        description="按标准做确定性打分并给出反方论证；矩阵落表要人批准，绝不替用户确认目标。",
        status="implemented",
        required_context=["user", "project"],
        tools=["list_candidates", "get_evidence", "compare_candidates", "get_reviews"],
        artifact_type="ComparisonMatrix",
        proposal_types=["record_comparison"],
        risk_tier="R2",
        requires_approval=True,
        evidence_required=True,
        thinking="on",
        # Measured twice on the real model, both with thinking on: one run reasoned to
        # 875 tokens and produced a full matrix, another exhausted 4000 and emitted no
        # content at all. The ceiling is a correctness setting for a judgement
        # capability — the empty-retry path that makes this deterministic is a P2 item.
        max_tokens=6000,
        synthesis_notes=(
            "标准要落表：proposed.criteria 给这次判断用的标准名，尽量沿用上一轮的同一批"
            "（last_round 里能看到上一版用的什么）。proposed.cells 只写有反方证据的格子，"
            "每格用 candidate_id + criterion（照 compare_candidates 返回的原样），"
            "opposes 填 evidence_ids 里的证据 id，note 不超过 40 字。"
            "没有反方证据就整个 cells 留空——矩阵本身由程序按存量证据算，"
            "你不要给分、不要改判、不要复述整张表。"
            "如果这轮结论和上一版不同，在 conclusion 里点名是哪条新证据让它变的。\n"
            "evidence_basis 的 quote 从 matrix.cells[].quotes 或 get_evidence 的 quote 里"
            "整条照抄；转述库里的状态（例如「source = user，rationale 为空」）不是证据。"
        ),
        # The resume hangs off the decision, not off the plan: "which direction" is what
        # a resume is for, and it is settled here rather than in action_plan.
        next_capabilities=["action_plan", "resume_build"],
    ),
    CapabilitySpec(
        id="action_plan",
        domain="act",
        name="行动计划与任务",
        description="把验证问题排进周任务，按证据缺口控制任务量。",
        status="implemented",
        required_context=["user", "project"],
        # compare_candidates is the reason this capability can re-plan instead of repeat:
        # the next week exists to fill the cells that came back 缺证据, and `last_round`
        # says which cells those are. Without it the new conclusion could only be copied
        # out of whatever the person typed in the goal sentence.
        tools=["get_plan", "estimate_load", "list_candidates", "get_reviews", "compare_candidates"],
        artifact_type="ActionPlanDraft",
        proposal_types=["create_job_search_task"],
        risk_tier="R2",
        requires_approval=True,
        thinking="on",
        # Measured live on 2026-09-20, two different failures at one capability: at the
        # 2000 default `synthesize` came back as truncated JSON ("Unterminated string ...
        # column 4244"), and at 3500 it exhausted the budget on reasoning and emitted no
        # content at all. Same shape as compare_decide's history, so the ceiling is a
        # correctness setting here, not a cost knob; the deterministic fix (retry the
        # empty/truncated call with a bigger budget) is a P2 item.
        max_tokens=6000,
        synthesis_notes=(
            "任务要对着证据缺口排：先看 compare_candidates 的 missing_cells 和 last_round，"
            "要落的字段是 proposed.plan_tasks（一个数组，一条一项；卡片一次批准整个计划）。"
            "每条任务写清它想补哪一格（criterion + 候选方向），期望产出要能变成一条证据。"
            "不要给分数已经够 2 的格子再加任务，也不要把任务写成「深入了解」这类无法交回的话。"
            "任务量由 estimate_load 的每周额度控制，超了就说明哪几格这周不验证，照实写出来。"
            "已经交回过的任务不要重复排：get_plan 里能看到状态。"
        ),
        # After acting, the loop needs the evidence back and then the verdict recomputed.
        next_capabilities=["evidence_collect", "compare_decide", "weekly_review"],
    ),
    CapabilitySpec(
        id="weekly_review",
        domain="act",
        name="周复盘",
        description="汇总本周成果与置信度趋势，产出复盘草稿。提交复盘属终局动作，只能人做。",
        status="implemented",
        required_context=["user", "project"],
        # `get_reviews` is for the trend: a week review that cannot see last week's
        # cannot say whether confidence went up or down, it can only assert.
        tools=["get_plan", "get_evidence", "get_reviews"],
        artifact_type="WeeklyReviewDraft",
        risk_tier="R3",
        requires_approval=True,
        thinking="on",
        # Measured on the real model: the first review run died at `synthesize` with
        # "model exhausted max_tokens on reasoning without emitting content" — a week
        # review reasons over every task in the plan, and the spec floor of 1500 (and
        # the 2000 default) is spent before any content arrives. Reasoning tokens are
        # billed out of this budget, so a judgement capability that must weigh a whole
        # week needs room, not a disabled thinking mode.
        max_tokens=4000,
        synthesis_notes=(
            "这是周复盘，不是进展汇报：逐项对本周任务「说了要做什么 / 实际交回了什么」，"
            "没交回的照实说没交回，不要把任务标题当完成情况。"
            "confidence_trend 只能填 up / flat / down 之一，并给出理由，理由里要指出是"
            "哪一条本周交回的记录或哪条证据让它变了；没有依据就填 flat 并说明证据不足。"
            "next_focus 写下一周最该验证的一件事，要能被一个任务完成。"
            "复盘正文属终局写入，只能由人在界面上确认后落库，所以不要提出 proposed 提案。"
        ),
        # A review that ends the loop is a report; this one exists so the conclusion
        # gets recomputed with the week's evidence and the next week gets planned.
        next_capabilities=["compare_decide", "action_plan"],
    ),
    CapabilitySpec(
        id="resume_build",
        domain="resume",
        name="简历生成与优化",
        # The body is assembled from rows by app/agent/resume.py, not written by the
        # model — which is what makes "数字一律取回原文" a property of the code rather
        # than a instruction the model may ignore.
        description="基于画像与证据起草简历，数字一律取回原文，不补造。",
        status="implemented",
        required_context=["user", "project"],
        tools=["get_profile", "get_evidence"],
        artifact_type="ResumeDraft",
        # No proposal: a resume drafts nothing into the business tables, so there is
        # nothing to confirm. Declaring one would also force R2 by the spec invariants.
        risk_tier="R1",
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
