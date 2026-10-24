"""青穗集 · 求职主路径：对照岗位、缺口、题库都必须来自目录与收录，不能编。"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session, sessionmaker

from app.agent.jobseek import assemble_job_match, assemble_learning_path, build_pack
from app.db.domain import CareerDirection, DirectionJobLink, Job, JobRequirementItem, ProfileFact
from app.db.models import User, utcnow
from app.tools.domain import GetJobseekPack
from tests.support import call_tool


def _user(session: Session, name: str) -> User:
    row = User(username=name, password_hash="x")
    session.add(row)
    session.flush()
    return row


def _catalogue(session: Session, tag: str, *, dated: bool = False, extra: Job | None = None) -> dict[str, int]:
    slug = tag.replace("-", "_")[:40]
    analyst = CareerDirection(
        code=f"da_{slug}",
        name="数据分析师",
        category="数据",
        summary="用 SQL 和报表支持业务决策",
        common_skills=["SQL", "Excel"],
        growth_path=["先把 SQL 练熟", "再做一个能讲清楚的项目"],
    )
    backend = CareerDirection(
        code=f"be_{slug}",
        name="后端工程师",
        category="研发",
        summary="写服务",
        common_skills=["Java"],
        growth_path=["先把接口写稳"],
    )
    session.add_all([analyst, backend])
    session.flush()
    now = utcnow()
    jobs = [
        Job(
            title="初级数据分析师",
            company="A 公司",
            city="广州",
            salary_text="9-13k",
            description="负责取数与看板",
            quality_score=90,
            captured_at=now if dated else None,
            expires_at=(now + timedelta(days=30)) if dated else None,
        ),
        Job(
            title="数据分析师",
            company="B 公司",
            city="上海",
            salary_text="15-20k",
            description="指标体系建设",
            quality_score=80,
            captured_at=now if dated else None,
            expires_at=(now + timedelta(days=30)) if dated else None,
        ),
        Job(
            title="后端开发工程师",
            company="C 公司",
            city="广州",
            salary_text="12-18k",
            description="服务端开发",
            quality_score=70,
            captured_at=now if dated else None,
            expires_at=(now + timedelta(days=30)) if dated else None,
        ),
    ]
    if extra is not None:
        jobs.append(extra)
    session.add_all(jobs)
    session.flush()
    session.add_all(
        [
            JobRequirementItem(job_id=jobs[0].id, original_text="熟练使用 SQL 完成多表关联取数", sort_order=1),
            JobRequirementItem(job_id=jobs[0].id, item_type="prefer", original_text="有 BI 看板经验者优先", sort_order=2),
            JobRequirementItem(job_id=jobs[1].id, original_text="本科及以上学历，统计学相关", sort_order=1),
            JobRequirementItem(job_id=jobs[2].id, original_text="熟悉 Java 并发与分布式事务", sort_order=1),
            DirectionJobLink(direction_id=analyst.id, job_id=jobs[0].id),
            DirectionJobLink(direction_id=analyst.id, job_id=jobs[1].id),
            DirectionJobLink(direction_id=backend.id, job_id=jobs[2].id),
        ]
    )
    session.flush()
    return {"analyst": analyst.id, "sql_job": jobs[0].id, "java_job": jobs[2].id}


def test_undated_jobs_are_reference_only(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user = _user(session, "jobseek-ref")
        _catalogue(session, user.username, dated=False)
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="课程里会用 SQL 取数", confirmed=True))
        session.commit()
        user_id = user.id

    with session_factory() as session:
        pack = assemble_job_match(session, user_id=user_id, project_id=None, goal="按经历对照岗位")
        assert pack["jobs"], pack
        assert pack["reference_only"] is True
        assert pack["jobs"][0]["title"] == "初级数据分析师"
        assert pack["jobs"][0]["matched_count"] >= 1
        assert "SQL" in pack["jobs"][0]["matched"]
        assert "现在还在招" in pack["conclusion"]
        assert all(job["reference_only"] for job in pack["jobs"])
        assert pack["evidence_basis"]
        assert any("SQL" in (item["quote"] or "") for item in pack["evidence_basis"])


def test_dated_jobs_are_not_reference_samples(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user = _user(session, "jobseek-dated")
        _catalogue(session, user.username, dated=True)
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="会用 SQL 和 Excel", confirmed=True))
        session.commit()
        user_id = user.id

    with session_factory() as session:
        pack = build_pack(session, user_id=user_id, goal="适合我的岗位")
        assert pack["reference_only"] is False
        assert pack["jobs"]
        assert pack["jobs"][0]["reference_only"] is False
        assert "参考岗位" not in pack["conclusion"]


def test_sql_profile_ranks_data_analyst(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user = _user(session, "jobseek-sql")
        ids = _catalogue(session, user.username, dated=False)
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="熟练使用 SQL", confirmed=True))
        session.commit()
        user_id = user.id
        sql_job = ids["sql_job"]

    with session_factory() as session:
        pack = assemble_job_match(session, user_id=user_id, project_id=None)
        assert pack["jobs"][0]["job_id"] == sql_job
        assert pack["jobs"][0]["title"] == "初级数据分析师"


def test_unknown_skill_is_practice_missing_not_invented(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user = _user(session, "jobseek-docker")
        ids = _catalogue(session, user.username, dated=False)
        session.add(
            JobRequirementItem(job_id=ids["sql_job"], original_text="熟悉 Docker 部署", sort_order=3)
        )
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="课程里会用 SQL", confirmed=True))
        session.commit()
        user_id = user.id
        job_id = ids["sql_job"]

    with session_factory() as session:
        pack = assemble_learning_path(session, user_id=user_id, project_id=None, goal=f"对照岗位 job_id={job_id} 看我还缺什么")
        assert pack["focus"]["job_id"] == job_id
        assert "Docker" in pack["practice_missing"]
        assert all(item["skill"] != "Docker" for item in pack["practice"])
        assert any("SQL" in (row["text"] or "") for row in pack["have"])
        assert any("Docker" in (row["text"] or "") for row in pack["missing"])
        assert pack["next_steps"]
        assert "先把 SQL 练熟" in pack["next_steps"]


def test_empty_profile_does_not_invent_recommendations(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user = _user(session, "jobseek-empty")
        _catalogue(session, user.username, dated=False)
        session.commit()
        user_id = user.id

    with session_factory() as session:
        pack = assemble_job_match(session, user_id=user_id, project_id=None, goal="帮我看看")
        assert pack["jobs"] == []
        assert "不能叫做推荐" in pack["conclusion"]


def test_get_jobseek_pack_tool_returns_quotes(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        user = _user(session, "jobseek-tool")
        _catalogue(session, user.username, dated=False)
        session.add(ProfileFact(user_id=user.id, dimension="skills", statement="会用 SQL", confirmed=True))
        session.commit()
        user_id = user.id

    result = call_tool(GetJobseekPack(), session_factory, user_id=user_id, arguments={"goal": "适合我的岗位"})
    assert result.ok, result.error
    assert result.payload["jobs"]
    assert result.payload["reference_only"] is True
    assert result.payload["lines"]
    assert result.source_refs
