"""Domain tools and executors against a real database.

These exist to prove A4 (a tool returns something the caller never handed in) and
to pin the write paths: a candidate lands in its project, evidence keeps its
verbatim quote, and an agent-supplied profile fact arrives unconfirmed.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.executors import apply_executor, build_proposal, payload_error
from app.capabilities.registry import get_capability
from app.db.domain import (
    ActionPlan,
    CareerDirection,
    ComparisonCriterion,
    DecisionCandidate,
    DecisionProject,
    DirectionJobLink,
    EvidenceItem,
    Job,
    JobRequirementItem,
    PlanTask,
    ProfileFact,
    UserProfile,
)
from app.db.models import Artifact, Note, Proposal, Run, User, new_id
from app.tools.base import ToolResult
from app.tools.domain import (
    CompareCandidates,
    EstimateLoad,
    GetEvidence,
    GetJobSamples,
    GetPlan,
    GetProfile,
    GetRequirementItems,
    ListCandidates,
    SearchDirections,
)
from tests.support import call_tool


@pytest.fixture
def student(session_factory: sessionmaker[Session]) -> User:
    with session_factory() as session:
        user = User(username="student", password_hash="x")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def other_user(session_factory: sessionmaker[Session]) -> User:
    with session_factory() as session:
        user = User(username="nosy", password_hash="x")
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@pytest.fixture
def catalogue(session_factory: sessionmaker[Session]) -> int:
    """Two directions, three real postings with verbatim requirement lines."""
    with session_factory() as session:
        analyst = CareerDirection(
            code="data_analyst",
            name="数据分析师",
            category="数据",
            summary="用 SQL 和报表支持业务决策",
            common_skills=["SQL", "Excel", "指标体系"],
            typical_work=["取数", "搭看板"],
            industry_tags=["电商"],
        )
        backend = CareerDirection(
            code="backend_eng", name="后端工程师", category="研发", summary="写服务", common_skills=["Java", "分布式"]
        )
        session.add_all([analyst, backend])
        session.flush()

        jobs = [
            Job(title="初级数据分析师", company="A 公司", city="广州", salary_text="9-13k", salary_min=9, salary_max=13,
                description="负责取数与看板", quality_score=90),
            Job(title="数据分析师", company="B 公司", city="上海", salary_text="15-20k", salary_min=15, salary_max=20,
                description="指标体系建设", quality_score=80),
            Job(title="后端开发工程师", company="C 公司", city="广州", salary_text="12-18k", description="服务端开发", quality_score=70),
        ]
        session.add_all(jobs)
        session.flush()
        session.add_all(
            [
                JobRequirementItem(job_id=jobs[0].id, original_text="熟练使用 SQL 完成多表关联取数", sort_order=1),
                JobRequirementItem(job_id=jobs[0].id, item_type="prefer", original_text="有 BI 看板经验者优先", sort_order=2),
                JobRequirementItem(job_id=jobs[1].id, original_text="本科及以上学历，统计学相关", sort_order=1),
                JobRequirementItem(job_id=jobs[2].id, original_text="熟悉 Java 并发与分布式事务", sort_order=1),
            ]
        )
        session.add_all(
            [
                DirectionJobLink(direction_id=analyst.id, job_id=jobs[0].id),
                DirectionJobLink(direction_id=analyst.id, job_id=jobs[1].id),
            ]
        )
        session.commit()
        return analyst.id


def _project(
    session_factory: sessionmaker[Session],
    user_id: int,
    *,
    candidates: dict[str, str] | None = None,
    evidence: list[tuple[str, str]] | None = None,
) -> str:
    candidates = candidates or {}
    evidence = evidence or []
    with session_factory() as session:
        project = DecisionProject(user_id=user_id, title="广州还是上海", question="数据分析与后端选哪个", status="comparing")
        session.add(project)
        session.flush()
        for name, note in candidates.items():
            session.add(DecisionCandidate(project_id=project.id, name=name, rationale=note))
        for statement, quote in evidence:
            session.add(EvidenceItem(user_id=user_id, project_id=project.id, statement=statement, quote=quote, source="user"))
        session.add_all(
            [
                ComparisonCriterion(project_id=project.id, name="薪资", sort_order=1),
                ComparisonCriterion(project_id=project.id, name="SQL", sort_order=2),
            ]
        )
        session.commit()
        return project.id


def test_search_directions_returns_rows_never_supplied_by_the_caller(session_factory, student, catalogue) -> None:
    result = call_tool(SearchDirections(), session_factory, user_id=student.id, arguments={"query": "SQL"})
    assert result.ok, result.error
    names = [row["name"] for row in result.payload["directions"]]
    assert "数据分析师" in names and "后端工程师" not in names
    assert result.source_refs, "must cite where the rows came from"


def test_job_samples_filter_by_direction_and_city(session_factory, student, catalogue) -> None:
    result = call_tool(
        GetJobSamples(), session_factory, user_id=student.id, arguments={"direction_id": catalogue, "city": "广州", "limit": 5}
    )
    assert result.ok
    cities = {row["city"] for row in result.payload["samples"]}
    assert cities == {"广州"}
    assert result.payload["samples"][0]["salary_text"] == "9-13k"


def test_requirement_items_come_back_verbatim(session_factory, student, catalogue) -> None:
    samples = call_tool(GetJobSamples(), session_factory, user_id=student.id, arguments={"keyword": "数据分析师", "limit": 2})
    job_id = samples.payload["samples"][0]["job_id"]
    result = call_tool(GetRequirementItems(), session_factory, user_id=student.id, arguments={"job_id": job_id})
    texts = [item["original_text"] for item in result.payload["items"]]
    assert any(text == "熟练使用 SQL 完成多表关联取数" for text in texts), "quote must not be paraphrased"
    assert all("extractor" in item for item in result.payload["items"])


def test_get_profile_reports_coverage_honestly(session_factory, student) -> None:
    empty = call_tool(GetProfile(), session_factory, user_id=student.id, arguments={})
    assert empty.payload["has_profile"] is False and empty.payload["data_coverage"] == 0

    with session_factory() as session:
        fact = ProfileFact(user_id=student.id, dimension="constraints", statement="必须留在珠三角")
        session.add(fact)
        session.commit()
    filled = call_tool(GetProfile(), session_factory, user_id=student.id, arguments={"dimensions": ["constraints"]})
    assert filled.payload["data_coverage"] == 100
    assert filled.payload["facts"]["constraints"] == ["必须留在珠三角"]


def test_get_profile_reads_graduation_year_out_of_an_education_fact(session_factory, student) -> None:
    with session_factory() as session:
        session.add(
            ProfileFact(
                user_id=student.id,
                dimension="education",
                statement="测试大学计算机专业，2027 年毕业。",
                confirmed=True,
            )
        )
        session.commit()
    payload = call_tool(GetProfile(), session_factory, user_id=student.id, arguments={}).payload
    assert payload["graduation_year"] == 2027
    assert "测试大学计算机专业，2027 年毕业。" in payload["facts"]["education"]


def test_compare_candidates_scores_from_evidence_not_opinion(session_factory, student, catalogue) -> None:
    project_id = _project(
        session_factory,
        student.id,
        candidates={"数据分析师": "会 SQL", "后端工程师": "没写过项目"},
        evidence=[
            ("广州数据分析岗起薪 9-13k", "熟练使用 SQL 完成多表关联取数"),
            ("岗位普遍要求 SQL", "有 BI 看板经验者优先"),
        ],
    )
    result = call_tool(CompareCandidates(), session_factory, user_id=student.id, arguments={"project_id": project_id})
    payload = result.payload
    assert payload["criteria"] == ["薪资", "SQL"]
    assert payload["data_coverage"] > 0
    assert payload["rule"].startswith("score")
    analyst = next(row for row in payload["matrix"] if row["name"] == "数据分析师")
    sql_cell = next(cell for cell in analyst["cells"] if cell["criterion"] == "SQL")
    assert sql_cell["verdict"] == "supported"
    assert any("SQL" in quote for quote in sql_cell["quotes"])
    assert sql_cell["evidence_ids"], "every score must be traceable to stored evidence"


def test_compare_flags_missing_cells_as_missing(session_factory, student, catalogue) -> None:
    project_id = _project(session_factory, student.id, candidates={"精算师": "不了解", "后端工程师": "不了解"})
    result = call_tool(CompareCandidates(), session_factory, user_id=student.id, arguments={"project_id": project_id})
    assert result.payload["missing_cells"], "an unevidenced comparison must be reported, not scored"
    assert all(cell["verdict"] == "missing" for row in result.payload["matrix"] for cell in row["cells"])


def test_domain_tools_refuse_another_users_project(session_factory, student, other_user, catalogue) -> None:
    project_id = _project(session_factory, student.id, candidates={"数据分析师": "x"})
    for tool in (ListCandidates(), GetEvidence(), CompareCandidates(), EstimateLoad(), GetPlan()):
        result = call_tool(tool, session_factory, user_id=other_user.id, arguments={"project_id": project_id})
        assert isinstance(result, ToolResult) and not result.ok, f"{tool.name} leaked another user's project"


def test_get_plan_shows_tasks_and_target(session_factory, student, catalogue) -> None:
    project_id = _project(session_factory, student.id, candidates={"数据分析师": "x"})
    with session_factory() as session:
        plan = ActionPlan(project_id=project_id, user_id=student.id, title="验证四周", weeks=4, generation_request_id="req-plan")
        session.add(plan)
        session.flush()
        session.add(PlanTask(plan_id=plan.id, user_id=student.id, title="找两条 JD", week_no=1, expected_output="两条逐字要求"))
        session.commit()
    result = call_tool(GetPlan(), session_factory, user_id=student.id, arguments={"project_id": project_id})
    assert result.payload["plans"][0]["tasks"][0]["title"] == "找两条 JD"


def _run_and_artifact(session_factory: sessionmaker[Session], user: User, project_id: str) -> tuple[Run, Artifact]:
    with session_factory() as session:
        run = Run(
            thread_id=new_id(),
            user_id=user.id,
            goal="定候选",
            capability_id="candidate_source",
            project_id=project_id,
            risk_tier="R2",
        )
        session.add(run)
        session.flush()
        artifact = Artifact(
            run_id=run.id,
            user_id=user.id,
            artifact_type="CandidateList",
            title="t",
            source_refs=[{"table": "decision_projects", "id": project_id}],
        )
        session.add(artifact)
        session.commit()
        return run, artifact


def test_add_candidate_executor_writes_into_the_project_and_bumps_its_version(session_factory, student, catalogue) -> None:
    project_id = _project(session_factory, student.id, candidates={"后端工程师": "旧"})
    capability = get_capability("candidate_source")
    run, artifact = _run_and_artifact(session_factory, student, project_id)
    synthesis = {
        "conclusion": "补一个候选",
        "next_actions": [],
        "proposed": {"name": "数据分析师", "rationale": "两条广州 JD", "direction_id": catalogue},
    }

    proposal = build_proposal(capability, run, artifact, synthesis)
    assert proposal is not None and proposal.status == "pending"

    with session_factory() as session:
        stored_run = session.get(Run, run.id)
        session.add(proposal)
        session.flush()
        result = apply_executor(session, stored_run, session.get(Proposal, proposal.id))
        stored_project = session.get(DecisionProject, project_id)
        assert result["candidate_id"]
        assert stored_project.version >= 1, "touching a child must advance the aggregate version"
        names = set(session.scalars(select(DecisionCandidate.name).where(DecisionCandidate.project_id == project_id)))
        assert names == {"后端工程师", "数据分析师"}


def test_stale_project_write_collides_instead_of_merging(session_factory, student, catalogue) -> None:
    """The reason the aggregate version exists: a device holding a stale copy of a
    decision project must collide loudly instead of overwriting. v1 returned 409
    for exactly this; v2 gets it from SQLAlchemy's version_id_col rather than a
    hand-written WHERE clause that someone forgets.

    Two *simultaneous* writers are serialised by InnoDB row locks; this covers the
    sequential case, which is the one that silently loses edits."""
    from sqlalchemy.orm.exc import StaleDataError

    project_id = _project(session_factory, student.id, candidates={"数据分析师": "x"})
    first = session_factory()
    second = session_factory()
    try:
        stale_copy = second.get(DecisionProject, project_id)
        live = first.get(DecisionProject, project_id)
        live.touch()
        first.commit()

        stale_copy.touch()
        with pytest.raises(StaleDataError):
            second.flush()
    finally:
        first.close()
        second.close()


def test_replaying_the_same_proposal_does_not_duplicate_evidence(session_factory, student, catalogue) -> None:
    project_id = _project(session_factory, student.id, candidates={"数据分析师": "x"})
    capability = get_capability("evidence_collect")
    run, artifact = _run_and_artifact(session_factory, student, project_id)
    synthesis = {
        "conclusion": "归档",
        "proposed": {"statement": "广州岗位普遍要求 SQL", "quote": "熟练使用 SQL 完成多表关联取数", "candidate_name": "数据分析师"},
    }
    proposal = build_proposal(capability, run, artifact, synthesis)
    assert proposal is not None

    with session_factory() as first:
        first.add(proposal)
        first.flush()
        first_result = apply_executor(first, run, first.get(Proposal, proposal.id))
        first.commit()
    with session_factory() as second:
        again = apply_executor(second, run, second.get(Proposal, proposal.id))
        second.commit()

    assert again.get("idempotent") is True
    assert again["evidence_id"] == first_result["evidence_id"]
    with session_factory() as check:
        assert len(list(check.scalars(select(EvidenceItem).where(EvidenceItem.project_id == project_id)))) == 1


def test_one_card_files_several_profile_facts_at_once(session_factory, student) -> None:
    """A person states six things in one sentence; that must cost one approval, not six.

    The card is the gate, so the gate has to show every row it writes — the count in the
    title is the only hint a person gets that one click files more than one line.
    """
    capability = get_capability("profile_diagnose")
    project_id = _project(session_factory, student.id, candidates={"数据分析师": "x"})
    run, artifact = _run_and_artifact(session_factory, student, project_id)
    proposal = build_proposal(
        capability,
        run,
        artifact,
        {
            "conclusion": "记三条",
            "proposed": {
                "facts": [
                    {"dimension": "education", "statement": "南方学院 信息管理与信息系统，2027 年毕业"},
                    {"dimension": "skills", "statement": "会用 SQL 和 pandas 做数据清洗"},
                    {"dimension": "awards", "statement": "拿过校级数学建模二等奖"},
                ]
            },
        },
    )
    assert proposal is not None
    assert "等 3 条" in proposal.title, "一张卡写三行，卡片标题必须说清写几行"
    with session_factory() as session:
        session.add(proposal)
        session.flush()
        result = apply_executor(session, run, session.get(Proposal, proposal.id))
        assert len(result["fact_ids"]) == 3
        facts = [session.get(ProfileFact, fact_id) for fact_id in result["fact_ids"]]
        assert [fact.dimension for fact in facts] == ["education", "skills", "awards"]
        # The card carrying these exact statements was already approved by a human —
        # that is the only way this executor runs. It used to write `confirmed=False`,
        # and since nothing else ever flips the column, the resume (which asks for
        # confirmed facts) could never see a single one. That was the bug.
        assert all(fact.confirmed is True for fact in facts), "an approved write is a confirmed fact"
        assert all(fact.source == "agent" for fact in facts)
        profile = session.get(UserProfile, student.id)
        assert profile is not None
        assert profile.graduation_year == 2027
        assert profile.school == "南方学院"
        assert profile.major == "信息管理与信息系统"

        # Re-approving the same draft must not double-file it.
        again = apply_executor(session, run, session.get(Proposal, proposal.id))
        assert again["added"] == 0 and len(again["already_present"]) == 3


def test_a_fact_list_over_the_card_limit_is_refused_not_truncated(session_factory, student) -> None:
    capability = get_capability("profile_diagnose")
    project_id = _project(session_factory, student.id, candidates={"数据分析师": "x"})
    run, artifact = _run_and_artifact(session_factory, student, project_id)
    proposal = build_proposal(
        capability,
        run,
        artifact,
        {"conclusion": "记一堆", "proposed": {"facts": [{"dimension": "context", "statement": f"第 {i} 条"} for i in range(13)]}},
    )
    # A card a person cannot read is not a card they can agree to: the overflow has to
    # surface as an unsupported proposal, never as a silently shortened write.
    assert proposal is not None and proposal.status == "unsupported"


def test_missing_payload_field_is_flagged_unsupported_not_guessed(session_factory, student, catalogue) -> None:
    capability = get_capability("candidate_source")
    run, artifact = _run_and_artifact(session_factory, student, _project(session_factory, student.id, candidates={"a": "x"}))
    proposal = build_proposal(capability, run, artifact, {"conclusion": "想加候选但没说加谁", "next_actions": []})
    assert proposal is not None
    assert proposal.status == "unsupported"
    assert "name" in (proposal.error or "")


def test_payload_error_reports_schema_reasons() -> None:
    assert payload_error("collect_evidence", {"statement": "短"}) is not None
    assert payload_error("collect_evidence", {"statement": "一条够长的证据陈述", "quote": "原文"}) is None
    missing_schema = payload_error("nope", {})
    assert missing_schema is not None and "no payload schema" in missing_schema


def test_create_job_search_task_creates_a_plan_when_the_project_has_none(session_factory, student, catalogue) -> None:
    project_id = _project(session_factory, student.id, candidates={"数据分析师": "x"})
    capability = get_capability("action_plan")
    run, artifact = _run_and_artifact(session_factory, student, project_id)
    proposal = build_proposal(
        capability,
        run,
        artifact,
        {
            "conclusion": "排任务",
            "proposed": {
                "plan_tasks": [
                    {"title": "约一位在职分析师聊 30 分钟", "week_no": 2, "expected_output": "对方真实的一天"},
                    {"title": "补一条后端方向的真实改动证据", "week_no": 3, "expected_output": "一次可交付的改动链接"},
                ]
            },
        },
    )
    assert proposal is not None
    # One card, one plan: the title has to say how much the approval writes.
    assert proposal.title.endswith("等 2 条"), proposal.title
    with session_factory() as session:
        session.add(proposal)
        session.flush()
        result = apply_executor(session, session.get(Run, run.id), session.get(Proposal, proposal.id))
        session.commit()
    assert len(result["task_ids"]) == 2 and result["plan_id"]
    with session_factory() as check:
        weeks = [check.get(PlanTask, task_id).week_no for task_id in result["task_ids"]]
        assert weeks == [2, 3]


def test_create_note_path_still_works_for_the_probe_capability(session_factory, student) -> None:
    capability = get_capability("skeleton_probe")
    with session_factory() as session:
        run = Run(thread_id=new_id(), user_id=student.id, goal="探针", capability_id="skeleton_probe", risk_tier="R2")
        session.add(run)
        session.flush()
        artifact = Artifact(run_id=run.id, user_id=student.id, artifact_type="RunDigest", title="t")
        session.add(artifact)
        session.commit()
        proposal = build_proposal(capability, run, artifact, {"conclusion": "c", "next_actions": ["去查两条 JD"]})
        assert proposal is not None
        session.add(proposal)
        session.flush()
        result = apply_executor(session, run, session.get(Proposal, proposal.id))
        session.commit()
        assert session.get(Note, result["note_id"]).body == "去查两条 JD"
