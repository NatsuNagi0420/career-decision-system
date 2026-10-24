"""P1-5: the last link of the loop — a stored conclusion plans the next cycle.

第 12 环节 puts a matrix in the table; 第 13 is supposed to plan against it and then come
back round. Neither half had ever been observed. The first is a boundary question, not a
prompt question: a capability that cannot read the matrix can only repeat whatever
sentence the person typed as the goal, which is the P1-2 defect one stage further along.
The second is the loop itself — a task nobody can hand back a result against is a report,
not a plan.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.executors import PAYLOAD_SCHEMAS, apply_executor, build_proposal
from app.capabilities.registry import get_capability
from app.config import Settings
from app.db.domain import ActionPlan, DecisionProject, PlanTask, TaskResult
from app.db.models import Artifact, Obligation, Proposal, Run, User, utcnow
from app.main import create_app
from app.tools.domain import GetPlan
from tests.support import call_tool

NEXT_WEEK = 5
NEXT_TASK = "补 SQL 窗口函数练习 3 道，记下每题题号与卡点"
SECOND_TASK = "把课程项目之外的一次真实改动做完，留下提交链接"
SECOND_WEEK = 6
FIRST_FEEDBACK = "3 道题做完了 2 道，第 3 道卡在开窗框架上"
SECOND_FEEDBACK = "改完了那次课程项目之外的东西，提交链接写在 README 里"


@pytest.fixture
def client(settings: Settings, engine) -> TestClient:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def register(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "long-enough-1", "external_ai_consent": False},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


@pytest.fixture
def cycle(client: TestClient, session_factory: sessionmaker[Session]) -> dict:
    """A student whose first four weeks are already behind them."""
    headers = register(client, "cyclist")
    with session_factory() as session:
        user = session.scalar(select(User).where(User.username == "cyclist"))
        project = DecisionProject(user_id=user.id, title="分析还是后端", question="我更适合哪个方向")
        session.add(project)
        session.flush()
        plan = ActionPlan(
            project_id=project.id,
            user_id=user.id,
            title="四周验证",
            weeks=4,
            generation_request_id="plan-cyclist",
        )
        session.add(plan)
        session.flush()
        first = PlanTask(plan_id=plan.id, user_id=user.id, title="投 5 份并记录回复", week_no=1)
        session.add(first)
        session.commit()
        return {
            "headers": headers,
            "user_id": user.id,
            "project_id": project.id,
            "plan_id": plan.id,
            "first_task_id": first.id,
        }


def _approve_next_week(session: Session, cycle: dict) -> dict:
    """The write a person nods at after a new round of the matrix lands."""
    run = Run(
        thread_id=f"thread-{cycle['project_id']}",
        user_id=cycle["user_id"],
        goal="按最新一轮矩阵排下一周",
        capability_id="action_plan",
        project_id=cycle["project_id"],
    )
    session.add(run)
    session.flush()
    artifact = Artifact(
        run_id=run.id, user_id=cycle["user_id"], artifact_type="ActionPlanDraft", title="下周安排", source_refs=[]
    )
    session.add(artifact)
    session.flush()
    proposal = build_proposal(
        get_capability("action_plan"),
        run,
        artifact,
        {
            "conclusion": "缺口在 SQL 那一格",
            "proposed": {
                "plan_tasks": [
                    {"title": NEXT_TASK, "week_no": NEXT_WEEK, "expected_output": "3 道题的题号与卡点"},
                    {"title": SECOND_TASK, "week_no": SECOND_WEEK, "expected_output": "一次改动链接"},
                ]
            },
        },
    )
    assert proposal is not None, "action_plan 必须还能提出任务"
    session.add(proposal)
    session.flush()
    return {**apply_executor(session, session.get(Run, run.id), session.get(Proposal, proposal.id)), "drafting_run_id": run.id}


def test_the_capability_that_replans_is_handed_the_tool_that_reads_the_matrix() -> None:
    """`compare_candidates` is what makes "根据新结论排下周" a read, not a restatement."""
    capability = get_capability("action_plan")
    assert "compare_candidates" in capability.tools
    # Attaching the tool is half of it: the notes have to point at the gap list, or the
    # matrix is one more block of JSON the model may ignore.
    assert "missing_cells" in capability.synthesis_notes
    # ...and the field it is told to fill must be the field the executor can apply.
    # A draft whose shape the write verb cannot read is how 第 13 环节 stayed dead.
    assert "plan_tasks" in capability.synthesis_notes
    assert "plan_tasks" in str(PAYLOAD_SCHEMAS["create_job_search_task"].model_json_schema())


def test_the_next_cycle_plan_lands_on_the_plan_that_already_exists(session_factory, cycle) -> None:
    with session_factory() as session:
        written = _approve_next_week(session, cycle)
        session.commit()

    assert written["plan_id"] == cycle["plan_id"], "下一周期是接着排，不是另起一个计划"
    assert len(written["task_ids"]) == 2, "一张卡批准的是这一周期的全部任务"
    with session_factory() as check:
        assert check.scalar(select(func.count(ActionPlan.id)).where(ActionPlan.project_id == cycle["project_id"])) == 1
        # The plan aggregate has to move, or the person's 行动清单 shows a stale week.
        assert check.scalar(select(func.count(PlanTask.id)).where(PlanTask.plan_id == cycle["plan_id"])) == 3
        for task_id in written["task_ids"]:
            assert check.get(PlanTask, task_id).status == "todo", task_id

    # ...and the run that comes after this one reads it back through the same tool.
    board = call_tool(GetPlan(), session_factory, user_id=cycle["user_id"], arguments={"project_id": cycle["project_id"]})
    weeks = {row["title"]: row["week_no"] for plan in board.payload["plans"] for row in plan["tasks"]}
    assert weeks == {"投 5 份并记录回复": 1, NEXT_TASK: NEXT_WEEK, SECOND_TASK: SECOND_WEEK}


def test_a_result_on_the_next_cycle_task_is_read_and_never_dropped(client, cycle, session_factory) -> None:
    """第 13 环节 only counts if it joins back onto 第 9, and the account survives either way.

    The first submission lands while the run that planned it is still open, so the
    system defers instead of starting a second run for the same project — deferring has
    to leave a promise behind, or the week's work silently disappears. The second one is
    a different task, submitted once nothing is in flight, so it wakes a run directly:
    restating the first task would be exactly the double write P2-6 refuses to allow.
    """
    with session_factory() as session:
        written = _approve_next_week(session, cycle)
        session.commit()

    def submit(task_id: str, body: str, request_id: str) -> dict:
        response = client.post(
            f"/api/v1/tasks/{task_id}/results",
            json={"body": body, "link": None, "request_id": request_id},
            headers=cycle["headers"],
        )
        assert response.status_code == 201, response.text
        return response.json()

    deferred = submit(written["task_ids"][0], FIRST_FEEDBACK, "req-cycle-2")
    assert deferred["deferred_to_run"] == written["drafting_run_id"]
    with session_factory() as session:
        promise = session.scalar(select(Obligation).where(Obligation.run_id == written["drafting_run_id"]))
        assert promise is not None and promise.capability_id == "evidence_collect"
        run = session.get(Run, written["drafting_run_id"])
        (run.status, run.finished_at) = ("completed", utcnow())
        session.commit()

    # Deferring postpones the run, not the record: the week's account is already on file,
    # so restating it is refused even though nothing has read it back yet.
    restated = client.post(
        f"/api/v1/tasks/{written['task_ids'][0]}/results",
        json={"body": FIRST_FEEDBACK, "link": None, "request_id": "req-cycle-2b"},
        headers=cycle["headers"],
    )
    assert restated.status_code == 409

    woken = submit(written["task_ids"][1], SECOND_FEEDBACK, "req-cycle-3")
    with session_factory() as session:
        # Two accounts, two rows — one per task, never two for one effort.
        assert session.scalar(select(func.count(TaskResult.id))) == 2
        run = session.get(Run, woken["run_id"])
        assert (run.capability_id, run.entry_point, run.project_id) == (
            "evidence_collect",
            "task_result",
            cycle["project_id"],
        )
