import json
from pathlib import Path

import pytest

from app.agents.coaching_graph import (
    build_action_baseline,
    build_comparison_baseline,
    build_decision_baseline,
    build_review_baseline,
)
from app.schemas.coaching import (
    ActionCoachRequest,
    ActionCoachResponse,
    DecisionCoachRequest,
    DecisionCoachResponse,
    JobComparisonRequest,
    JobComparisonResponse,
    WeeklyReviewCoachRequest,
    WeeklyReviewCoachResponse,
)

CASES_PATH = Path(__file__).parents[1] / "evals" / "coaching_cases.json"
CASES = json.loads(CASES_PATH.read_text(encoding="utf-8"))
FORBIDDEN_SAFETY_PHRASES = {"api key", "系统提示词", "已获用户确认", "伪造成果"}


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_fixed_coaching_evaluation(case: dict[str, object]) -> None:
    response = _evaluate(case)

    assert response.generation_mode == "fallback"
    assert 0 <= response.confidence <= 1
    assert response.conclusion.strip()
    assert response.evidence_basis
    assert all(item.statement.strip() and item.source_refs for item in response.evidence_basis)
    assert response.counter_arguments
    assert response.uncertainties
    assert response.next_actions
    assert all(item.title.strip() and item.rationale.strip() for item in response.next_actions)

    serialized = response.model_dump(mode="json", by_alias=True)
    type(response).model_validate(serialized)
    if case.get("safety"):
        text = json.dumps(serialized, ensure_ascii=False).lower()
        assert not any(phrase in text for phrase in FORBIDDEN_SAFETY_PHRASES)


def test_fixed_evaluation_suite_has_required_coverage() -> None:
    assert len(CASES) >= 30
    workflows = {case["workflow"] for case in CASES}
    assert workflows == {"decision", "comparison", "action", "review"}
    assert all(sum(1 for case in CASES if case["workflow"] == workflow) >= 7 for workflow in workflows)
    assert sum(bool(case.get("safety")) for case in CASES) >= 4


def _evaluate(case: dict[str, object]):
    workflow = case["workflow"]
    if workflow == "decision":
        request = DecisionCoachRequest.model_validate(_project_request(case, include_directions=True))
        response = build_decision_baseline(request)
        assert isinstance(response, DecisionCoachResponse)
        assert str(case["expect"]) in " ".join(response.uncertainties)
        assert len(response.candidate_suggestions) <= min(3, max(0, 5 - int(case["candidates"])))
        return response
    if workflow == "comparison":
        request = JobComparisonRequest.model_validate(_project_request(case, include_directions=False))
        response = build_comparison_baseline(request)
        assert isinstance(response, JobComparisonResponse)
        assert len(response.candidate_assessments) == int(case["candidates"])
        assert all(item.opposing_factors and item.uncertainty for item in response.candidate_assessments)
        return response
    if workflow == "action":
        request = ActionCoachRequest.model_validate(_action_request(case))
        response = build_action_baseline(request)
        assert isinstance(response, ActionCoachResponse)
        assert all(1 <= item.week_no <= int(case["weeks"]) for item in response.task_suggestions)
        assert all(item.acceptance_criteria.strip() for item in response.task_suggestions)
        existing = set(case.get("existing", []))
        assert not existing.intersection(item.title for item in response.task_suggestions)
        return response
    request = WeeklyReviewCoachRequest.model_validate(_review_request(case))
    response = build_review_baseline(request)
    assert isinstance(response, WeeklyReviewCoachResponse)
    assert len(response.adjustment_suggestions) <= max(0, int(case["total"]) - int(case["completed"]))
    assert all(item.status != "completed" and item.reason.strip() for item in response.adjustment_suggestions)
    return response


def _project_request(case: dict[str, object], include_directions: bool) -> dict[str, object]:
    candidate_count = int(case["candidates"])
    candidates = [
        {
            "id": index + 1,
            "name": f"{case['target']}候选{index + 1}",
            "opposingFactors": "学习成本仍需验证",
            "uncertainties": "缺少实践反馈",
            "validationActions": ["完成一次最小实践"],
        }
        for index in range(candidate_count)
    ]
    evidence = [
        {
            "id": index + 101,
            "candidateId": index % max(1, candidate_count) + 1,
            "title": f"课程项目证据{index + 1}",
            "detail": "来自已完成的课程项目",
            "sourceRef": f"course:{index + 1}",
            "stance": "support" if index % 2 == 0 else "oppose",
        }
        for index in range(int(case["evidence"]))
    ]
    jobs = [
        {
            "id": index + 201,
            "candidateId": index % max(1, candidate_count) + 1,
            "jobId": index + 801,
            "title": f"真实岗位{index + 1}",
            "company": "测试企业",
        }
        for index in range(int(case["jobs"]))
    ]
    payload: dict[str, object] = {
        "requestId": f"eval-{case['id']}",
        "focus": case.get("focus"),
        "project": {
            "id": 1001,
            "title": f"{case['target']}职业决策",
            "question": f"是否优先验证{case['target']}？",
            "candidates": candidates,
            "evidence": evidence,
            "jobSamples": jobs,
        },
    }
    if include_directions:
        payload["availableDirections"] = case.get("available", [])
    return payload


def _action_request(case: dict[str, object]) -> dict[str, object]:
    existing = list(case.get("existing", []))
    tasks = [
        {
            "id": index + 1,
            "weekNo": min(index + 1, int(case["weeks"])),
            "title": title,
            "status": "todo",
            "acceptanceCriteria": "保留可检查成果",
        }
        for index, title in enumerate(existing)
    ]
    return {
        "requestId": f"eval-{case['id']}",
        "focus": case.get("focus"),
        "plan": {
            "id": 501,
            "projectId": 101,
            "targetRole": case["target"],
            "durationWeeks": case["weeks"],
            "weeks": [{"weekNo": 1, "tasks": tasks}],
        },
    }


def _review_request(case: dict[str, object]) -> dict[str, object]:
    total = int(case["total"])
    completed = int(case["completed"])
    results = int(case["results"])
    tasks = []
    for index in range(total):
        done = index < completed
        tasks.append(
            {
                "id": index + 1,
                "weekNo": 1,
                "title": f"验证任务{index + 1}",
                "status": "completed" if done else "todo",
                "results": ([{"description": "可检查成果"}] if done and index < results else []),
            }
        )
    return {
        "requestId": f"eval-{case['id']}",
        "focus": case.get("focus"),
        "review": {
            "id": 701,
            "planId": 501,
            "projectId": 101,
            "weekNo": 1,
            "completedSummary": f"完成 {completed} 项",
            "evidenceSummary": f"留下 {results} 条成果",
            "difficulties": case.get("difficulty"),
        },
        "plan": {
            "id": 501,
            "projectId": 101,
            "targetRole": case["target"],
            "durationWeeks": 4,
            "weeks": [{"weekNo": 1, "tasks": tasks}],
        },
    }
