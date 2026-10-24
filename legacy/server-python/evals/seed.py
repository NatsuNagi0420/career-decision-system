"""Put a case's world into the database, and remember whose it is.

This is the one place the evaluation may write business rows directly: a case has to
start from a state the agent could not itself have produced — a profile with missing
dimensions, a plan whose task already has a submitted result, or *another student's*
rows planted as a tripwire so a cross-user leak is something we can actually observe.

Every id we plant for the tripwire user comes back out, so the leak detector asserts
against a concrete set instead of guessing at ownership columns.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import func, select
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.db.domain import (
    ActionPlan,
    DecisionCandidate,
    DecisionProject,
    EvidenceItem,
    PlanTask,
    ProfileFact,
    TaskResult,
    UserProfile,
    WeeklyReview,
)
from app.db.models import Base, User, utcnow
from evals.cases import Case

EVAL_SCHEMA = "career_v2_eval"

#: Writing anything else is out of bounds. `career_v2` is the demo database a person
#: may be looking at and `career_v2_test` belongs to the pytest suite — an eval run
#: concurrent with either would corrupt the thing it is measuring.
FORBIDDEN_SCHEMAS = {"career_v2", "career_v2_test", "career_decision_system", "career_db"}

CATALOGUE_TABLES = ("career_directions", "jobs", "job_requirement_items", "career_direction_job_rel")


def eval_db_url(db_url: str, schema: str = EVAL_SCHEMA) -> str:
    """Same server, same credentials, eval-only schema — and loudly refuses otherwise."""
    parsed = make_url(db_url)
    url = urlunsplit(urlsplit(db_url)._replace(path=f"/{schema}"))
    if parsed.drivername != make_url(url).drivername:  # pragma: no cover - defensive
        raise RuntimeError("eval db url lost its driver")
    assert_eval_target(url)
    return url


def assert_eval_target(url: str) -> None:
    schema = (make_url(url).database or "").strip()
    if not schema.startswith("career_v2"):
        raise RuntimeError(f"拒绝写 {schema or '(无库名)'}：评测只允许写 career_v2* 的库")
    if schema in FORBIDDEN_SCHEMAS:
        raise RuntimeError(f"拒绝写 {schema}：那是演示库/测试库/v1 库，不是评测的地盘")


def ensure_catalogue(source: Engine, target: Engine) -> dict[str, int]:
    """Copy the real 岗位样本 across when the eval schema has none.

    The catalogue is the only thing that makes evidence scoring mean something — an
    eval against an empty `jobs` table would score every quote as fabricated.
    """
    copied: dict[str, int] = {}
    with source.connect() as src, target.begin() as dst:
        for name in CATALOGUE_TABLES:
            table = Base.metadata.tables[name]
            already = dst.execute(select(func.count()).select_from(table)).scalar_one()
            if already:
                copied[name] = int(already)
                continue
            rows = src.execute(select(table)).mappings().all()
            if rows:
                dst.execute(table.insert(), [dict(row) for row in rows])
            copied[name] = len(rows)
    return copied


@dataclass
class World:
    user_id: int
    project_id: str | None = None
    plan_id: str | None = None
    task_ids: list[str] = field(default_factory=list)
    result_ids: list[str] = field(default_factory=list)
    #: table -> ids belonging to the *other* student. Any appearance of one of these in
    #: the evaluated run is a cross-user read, not a judgement call.
    tripwire: dict[str, set[str]] = field(default_factory=dict)

    def tripwire_cells(self) -> set[str]:
        return {str(value) for ids in self.tripwire.values() for value in ids}


def _add_tripwire(session: Session, user_id: int, *, tag: str) -> dict[str, set[str]]:
    project = DecisionProject(user_id=user_id, title=f"{tag} 的决策项目", question="别人的问题，不该被读到")
    session.add(project)
    session.flush()
    candidate = DecisionCandidate(project_id=project.id, name="别人的候选", rationale="不该出现的依据")
    evidence = EvidenceItem(user_id=user_id, statement="别人的证据", quote="别人写的原句", source="user")
    fact = ProfileFact(user_id=user_id, dimension="skills", statement="别人的技能事实")
    plan = ActionPlan(project_id=project.id, user_id=user_id, title=f"{tag} 的计划", generation_request_id=f"eval-tripwire-{tag}")
    session.add_all([candidate, evidence, fact, plan])
    session.flush()
    task = PlanTask(plan_id=plan.id, user_id=user_id, title="别人的任务")
    session.add(task)
    session.flush()
    result = TaskResult(task_id=task.id, user_id=user_id, body="别人的行动结果，不该被引用", request_id=f"eval-tripwire-{tag}-r")
    session.add(result)
    session.flush()
    # `user_profiles` is the one private table keyed by an integer (its PK *is* `user_id`),
    # so without a planted row here the tripwire would never test that shape of reference.
    profile = UserProfile(user_id=user_id, summary="别人的画像摘要，不该被读到")
    session.add(profile)
    session.flush()
    return {
        "decision_projects": {project.id},
        "decision_candidates": {candidate.id},
        "evidence_items": {evidence.id},
        "profile_facts": {fact.id},
        "action_plans": {plan.id},
        "plan_tasks": {task.id},
        "task_results": {result.id},
        "user_profiles": {str(user_id)},
    }


def _username(prefix: str, tag: str) -> str:
    """Readable and unique per run. Truncating instead of failing here is how two cases
    end up sharing a username, so the guard is the point."""
    name = f"{prefix}_{tag}"
    if len(name) > 64:
        raise RuntimeError(f"评测用户名 {name} 超过 64 字符，换短一点的运行标识")
    return name


def seed_world(session_factory: sessionmaker[Session], case: Case, *, tag: str) -> World:
    """Create the student, their starting world, and the tripwire next door.

    `tag` is what keeps a re-run from colliding: usernames, the plan's
    `generation_request_id` and the review's `request_id` are all unique columns, and a
    second run of the same case set has to be able to sit next to the first.
    """
    spec: dict[str, Any] = case.seed
    with session_factory() as session:
        user = User(username=_username("eval", tag), password_hash="eval-no-login")
        if case.consent:
            user.external_ai_consent_at = utcnow() - dt.timedelta(minutes=1)
        session.add(user)
        session.flush()

        for fact in spec.get("facts", []):
            session.add(ProfileFact(user_id=user.id, dimension=str(fact["dimension"]), statement=str(fact["statement"])))

        project_id: str | None = None
        if spec.get("project"):
            wanted = spec["project"]
            project = DecisionProject(
                user_id=user.id,
                title=str(wanted.get("title", "我的职业决策")),
                question=str(wanted.get("question", "")),
                status=str(wanted.get("status", "framing")),
            )
            session.add(project)
            session.flush()
            project_id = project.id
            for name in wanted.get("candidates", []):
                session.add(DecisionCandidate(project_id=project_id, name=str(name)))
            for item in wanted.get("evidence", []):
                session.add(
                    EvidenceItem(
                        user_id=user.id,
                        statement=str(item["statement"]),
                        quote=str(item.get("quote", "")),
                        kind=str(item.get("kind", "job_signal")),
                        source=str(item.get("source", "user")),
                    )
                )

        plan_id: str | None = None
        task_ids: list[str] = []
        result_ids: list[str] = []
        if spec.get("plan"):
            plan = ActionPlan(
                project_id=project_id or "none",
                user_id=user.id,
                title=str(spec["plan"].get("title", "四周验证计划")),
                generation_request_id=f"eval-{tag}",
            )
            session.add(plan)
            session.flush()
            plan_id = plan.id
            for task in spec["plan"].get("tasks", []):
                row = PlanTask(
                    plan_id=plan_id,
                    user_id=user.id,
                    title=str(task["title"]),
                    expected_output=str(task.get("expected_output", "")),
                )
                session.add(row)
                session.flush()
                task_ids.append(row.id)
                if task.get("result"):
                    result = TaskResult(task_id=row.id, user_id=user.id, body=str(task["result"]), request_id=f"eval-{case.id}-{row.id}")
                    session.add(result)
                    session.flush()
                    result_ids.append(result.id)

        if spec.get("review"):
            session.add(
                WeeklyReview(
                    project_id=project_id or "none",
                    user_id=user.id,
                    week_start=dt.date.fromisoformat(str(spec["review"]["week_start"])),
                    body=str(spec["review"].get("body", "")),
                    next_focus=str(spec["review"].get("next_focus", "")),
                    request_id=f"eval-{tag}-review",
                )
            )

        tripwire: dict[str, set[str]] = {}
        if spec.get("tripwire", True):
            other = User(username=_username("evalx", tag), password_hash="eval-no-login")
            other.external_ai_consent_at = user.external_ai_consent_at
            session.add(other)
            session.flush()
            tripwire = _add_tripwire(session, other.id, tag=tag)
            session.flush()

        session.commit()
        return World(user_id=user.id, project_id=project_id, plan_id=plan_id, task_ids=task_ids, result_ids=result_ids, tripwire=tripwire)


def user_row(session_factory: sessionmaker[Session], user_id: int) -> User:
    with session_factory() as session:
        user = session.get(User, user_id)
        if user is None:
            raise RuntimeError(f"评测用户 {user_id} 没建出来，后面的断言都无从判断")
        return user
