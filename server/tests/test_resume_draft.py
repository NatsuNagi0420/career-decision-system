"""The resume body is assembled from rows by code, so these tests are the guarantee.

The product promise this file defends is "数字一律取回原文，不补造". It holds here
because no text reaches the document except by being copied out of a row — so the tests
are not "did we prompt well enough", they are "does every line still point back".
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.resume import SECTIONS, assemble_resume
from app.capabilities.registry import CAPABILITIES
from app.db.domain import ActionPlan, DecisionProject, EvidenceItem, PlanTask, ProfileFact, TaskResult, UserProfile
from app.db.models import Artifact, Proposal, Step, User


def _user(session: Session, name: str) -> User:
    row = User(username=name, password_hash="x")
    session.add(row)
    session.flush()
    return row


def _project(session: Session, user: User) -> DecisionProject:
    project = DecisionProject(user_id=user.id, title="数据分析师还是后端")
    session.add(project)
    session.flush()
    return project


def test_a_blank_profile_still_lays_out_every_section_and_names_what_is_missing(session_factory) -> None:
    with session_factory() as session:
        user = _user(session, "resume-empty")
        project = _project(session, user)

        body = assemble_resume(session, user_id=user.id, project_id=project.id)

    assert [section["key"] for section in body["sections"]] == [section["key"] for section in SECTIONS]
    assert all(section["empty"] for section in body["sections"]), "空画像不该有任何一节被填上"
    # The point of keeping an empty section on the page is that it says why, in the
    # direction of an action — silence would read as "you have nothing".
    assert all(section["ask"] for section in body["sections"])
    assert body["line_count"] == 0
    assert body["completeness"] == f"0/{len(SECTIONS)} 节有内容，其余是还没问过你，不是「你没有」"


def test_every_line_points_at_the_row_it_was_copied_from(session_factory) -> None:
    with session_factory() as session:
        user = _user(session, "resume-full")
        project = _project(session, user)
        session.add(UserProfile(user_id=user.id, school="南方学院", major="信息管理与信息系统", graduation_year=2027, city_targets=["广州"]))

        fact = ProfileFact(user_id=user.id, dimension="skills", statement="会用 SQL 做数据清洗，课程项目里处理过 12 万行")
        evidence = EvidenceItem(
            user_id=user.id, project_id=project.id, kind="action_result",
            statement="和一位做数据分析的学长聊过", quote="他上午基本全在开会对数",
        )
        plan = ActionPlan(project_id=project.id, user_id=user.id, title="两周计划", weeks=2, generation_request_id="resume-test-req")
        session.add_all([fact, evidence, plan])
        session.flush()
        task = PlanTask(plan_id=plan.id, user_id=user.id, title="去问一个在职的人他的一天怎么过", expected_output="一段转述")
        session.add(task)
        session.flush()
        session.add(TaskResult(task_id=task.id, user_id=user.id, body="他说上午全在开会，下午才对数", request_id="resume-test-result"))
        session.commit()

    with session_factory() as session:
        body = assemble_resume(session, user_id=user.id, project_id=project.id)
        lines = [line for section in body["sections"] for line in section["lines"]]

        assert lines, "有料的画像不该拼出空简历"
        # Which columns each source table may be copied from. Anything not in this list
        # cannot appear on the resume, which is the whole point.
        fields = {
            "profile_facts": (ProfileFact, ("statement",)),
            "evidence_items": (EvidenceItem, ("statement", "quote")),
            "task_results": (TaskResult, ("body",)),
            "user_profiles": (UserProfile, ("school", "major", "graduation_year", "city_targets")),
        }
        for line in lines:
            table, row_id = line["ref"]["table"], line["ref"]["id"]
            assert table in fields, f"简历上出现了不认识来源的表 {table}"
            model, columns = fields[table]
            row = session.get(model, row_id)
            assert row is not None, f"指涉指不到行：{table} {row_id}"
            source = " ".join(str(getattr(row, column) or "") for column in columns)
            assert any(part and part in source for part in line["text"].replace("：", " ").split()), f"这一行不是从行里抄的：{line['text']}"

        by_key = {section["key"]: section for section in body["sections"]}
        assert not by_key["education"]["empty"] and not by_key["skills"]["empty"]
        # The handed-back account counts as experience whether or not it was archived.
        assert len(by_key["experience"]["lines"]) == 2
        assert by_key["evidence"]["empty"], "action_result 归经历，不该同时出现在外部事实一节"


def test_an_unconfirmed_fact_does_not_walk_onto_the_resume(session_factory) -> None:
    with session_factory() as session:
        user = _user(session, "resume-unconfirmed")
        project = _project(session, user)
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="精通 Python", confirmed=False))
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="用过一次 pandas", confirmed=True))
        session.commit()

    with session_factory() as session:
        body = assemble_resume(session, user_id=user.id, project_id=project.id)
    texts = [line["text"] for section in body["sections"] for line in section["lines"]]

    assert texts == ["用过一次 pandas"], "未确认的画像事实不能当简历内容"


def test_the_order_rule_follows_graduation_year_and_says_why(session_factory) -> None:
    with session_factory() as session:
        still = _user(session, "resume-still-in-school")
        gone = _user(session, "resume-already-graduated")
        project = _project(session, still)
        session.add(UserProfile(user_id=still.id, school="南方学院", graduation_year=2028))
        session.add(UserProfile(user_id=gone.id, school="南方学院", graduation_year=2020))
        session.commit()

    with session_factory() as session:
        before = assemble_resume(session, user_id=still.id, project_id=project.id)
        after = assemble_resume(session, user_id=gone.id, project_id=project.id)

    assert before["order"][0] == "education" and after["order"][0] == "experience"
    assert "2028" in before["order_reason"] and "2020" in after["order_reason"]
    # Same sections either way — the rule reorders, it never drops.
    assert sorted(before["order"]) == sorted(after["order"])


def test_the_text_people_copy_is_generated_here_not_in_the_browser(session_factory) -> None:
    with session_factory() as session:
        user = _user(session, "resume-copy")
        project = _project(session, user)
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="会用 SQL 做数据清洗", confirmed=True))
        session.commit()

    with session_factory() as session:
        body = assemble_resume(session, user_id=user.id, project_id=project.id)

    assert "## 技能与工具" in body["plain"]
    assert "- 会用 SQL 做数据清洗" in body["plain"]
    # An empty section must not vanish from the copied text either, or the copy reads
    # as a finished document.
    assert "（还没有依据）" in body["plain"]


def test_an_unclassified_fact_is_not_lost(session_factory) -> None:
    """Measured live: the model files under the payload's default `dimension="context"`,
    so a section whitelist keyed to education/skills/awards showed an empty resume while
    the person's approved sentences sat in the database unseen."""
    with session_factory() as session:
        user = _user(session, "resume-context")
        project = _project(session, user)
        session.add(ProfileFact(user_id=user.id, dimension="context", statement="在一家奶茶店做过六个月兼职", confirmed=True))
        session.commit()

    with session_factory() as session:
        body = assemble_resume(session, user_id=user.id, project_id=project.id)

    other = next(section for section in body["sections"] if section["key"] == "other")
    assert [line["text"] for line in other["lines"]] == ["在一家奶茶店做过六个月兼职"]
    assert other["lines"][0]["ref"] == {"table": "profile_facts", "id": other["lines"][0]["ref"]["id"]}
    assert "在一家奶茶店做过六个月兼职" in body["plain"]


async def test_an_unauthorised_run_still_lands_a_resume(session_factory, settings, tmp_path) -> None:
    """The whole graph, end to end, with no model available.

    `AI_NATIVE_ARCHITECTURE` §2 says an unauthorised run 只走确定性路径, and the login
    screen repeats it to the person. Until the deterministic route existed that promise
    was false in the only way that matters: the run died at `select_action` on a refused
    gateway call. The resume is the capability that can genuinely answer without a model
    — its body is assembled from rows — so it is the one that proves the route works,
    not merely that the gate refuses.
    """
    from tests.test_run_lifecycle import build_service

    with session_factory() as session:
        user = User(username="offline-resume", password_hash="x")
        session.add(user)
        session.flush()
        project = DecisionProject(user_id=user.id, title="数据分析师还是后端")
        session.add(project)
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="会用 SQL 做数据清洗", confirmed=True))
        session.commit()
        session.refresh(user)
        project_id = project.id

    async with build_service(settings, session_factory, [], tmp_path / "cp-offline.sqlite", capability_ids=("resume_build",)) as (service, _provider):
        run = service.create_run(user, "根据我现在的情况给我做一份简历", capability_id="resume_build", project_id=project_id)
        result = await service.start(run, allow_external_ai=False)

    assert result["interrupted"] is False, "a resume proposes nothing, so there is no gate to stop at"
    with session_factory() as session:
        artifact = session.scalars(select(Artifact).where(Artifact.run_id == run.id)).one()
        assert artifact.artifact_type == "ResumeDraft"
        # No model wrote it. `synthesis` is a canned note, so this flag cannot be
        # inferred from "did the state carry a digest" — that inference shipped once.
        assert artifact.generation_mode == "fallback", "an offline digest is not an LLM answer"
        assert artifact.is_provisional is True, "no evidence basis means the result must say 依据有限"
        texts = [line["text"] for section in artifact.content["resume"]["sections"] for line in section["lines"]]
        assert texts == ["会用 SQL 做数据清洗"], "the person's own confirmed fact must reach the paper with no model in the loop"
        assert session.scalars(select(Proposal).where(Proposal.run_id == run.id)).first() is None, "R1 writes nothing"
        assert session.scalars(select(Step).where(Step.run_id == run.id)).first() is None, "no model node may record a step it did not run"


def test_resume_build_declares_no_write_path() -> None:
    spec = next(capability for capability in CAPABILITIES if capability.id == "resume_build")

    # A resume writes nothing into the business tables, so there is nothing to confirm.
    # If someone later adds a "save to my resume library" proposal, it has to come back
    # here and raise the tier — the invariant in spec.py refuses proposal_types on R1.
    assert spec.status == "implemented"
    assert spec.risk_tier == "R1"
    assert spec.proposal_types == []
    assert spec.requires_approval is False
    assert spec.artifact_type == "ResumeDraft"
