import json

from app.agents import path_plan_graph
from app.config.settings import Settings
from app.schemas.path_plan import PathPlanRequest
from app.schemas.profile import UserProfile
from app.services.llm_client import LlmClientError


def request_payload() -> PathPlanRequest:
    return PathPlanRequest(
        request_id="llm-path",
        user_id="user-001",
        target_role="Backend developer",
        allow_external_model=True,
        profile=UserProfile(
            major="Software Engineering",
            skills=["Spring Boot", "SQL", "Redis"],
            experiences=["Built a REST API project"],
        ),
    )


def test_path_plan_uses_llm_when_provider_is_enabled(monkeypatch):
    calls: list[tuple[str, str]] = []

    def fake_complete(system_prompt, user_prompt, settings, transport=None):
        calls.append((system_prompt, user_prompt))
        return json.dumps(
            {
                "target_role": "Backend developer",
                "overview": "A focused 10-week backend plan with API, database, and interview evidence.",
                "milestones": [
                    {
                        "title": "Weeks 1-2: Backend gap audit",
                        "duration": "2 weeks",
                        "tasks": ["Analyze 8 backend job posts", "Map Spring Boot and SQL gaps"],
                        "acceptance": ["A prioritized backend skill backlog is ready"],
                    },
                    {
                        "title": "Weeks 3-7: API project delivery",
                        "duration": "5 weeks",
                        "tasks": ["Build auth APIs", "Add SQL persistence", "Write integration tests"],
                        "acceptance": ["Project is demoable with tests and README"],
                    },
                    {
                        "title": "Weeks 8-10: Interview conversion",
                        "duration": "3 weeks",
                        "tasks": ["Rewrite resume bullets", "Practice system design stories"],
                        "acceptance": ["Resume and interview stories match the target role"],
                    },
                ],
                "checkpoints": ["Week 2 gap review", "Week 7 project review", "Week 10 readiness review"],
            }
        )

    monkeypatch.setattr(
        path_plan_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(path_plan_graph.llm_client, "complete", fake_complete)

    plan = path_plan_graph.generate_path_plan(request_payload())

    assert calls
    assert plan.target_role == "Backend developer"
    assert "focused 10-week" in plan.overview
    assert plan.milestones[0].title == "Weeks 1-2: Backend gap audit"
    assert plan.checkpoints == ["Week 2 gap review", "Week 7 project review", "Week 10 readiness review"]


def test_path_plan_falls_back_when_llm_fails(monkeypatch):
    def failing_complete(system_prompt, user_prompt, settings, transport=None):
        raise LlmClientError("provider unavailable")

    monkeypatch.setattr(
        path_plan_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(path_plan_graph.llm_client, "complete", failing_complete)

    plan = path_plan_graph.generate_path_plan(request_payload())

    assert plan.target_role == "Backend developer"
    assert "12-week plan" in plan.overview
    assert len(plan.milestones) >= 3
    assert "Week 12 job readiness review" in plan.checkpoints


def test_path_plan_normalizes_weak_llm_output(monkeypatch):
    def weak_complete(system_prompt, user_prompt, settings, transport=None):
        return json.dumps(
            {
                "target_role": "   ",
                "overview": "   ",
                "milestones": [
                    {
                        "title": "  Weeks 1-2: Clean milestone  ",
                        "duration": "  2 weeks  ",
                        "tasks": ["  Task A  ", ""],
                        "acceptance": ["  Acceptance A  "],
                    }
                ],
                "checkpoints": ["  Checkpoint A  ", ""],
            }
        )

    monkeypatch.setattr(
        path_plan_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(path_plan_graph.llm_client, "complete", weak_complete)

    plan = path_plan_graph.generate_path_plan(request_payload())

    assert plan.target_role == "Backend developer"
    assert "12-week plan" in plan.overview
    assert plan.milestones[0].title == "Weeks 1-2: Clean milestone"
    assert plan.milestones[0].tasks == ["Task A"]
    assert plan.checkpoints == ["Checkpoint A"]
