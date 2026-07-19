import json

from app.agents import coaching_graph
from app.config.settings import Settings
from app.schemas.coaching import ActionPlanPreviewRequest, DecisionCoachRequest
from app.services.llm_client import LlmClientError
from tests.test_coaching_contracts import project_payload


def decision_request() -> DecisionCoachRequest:
    return DecisionCoachRequest.model_validate(
        {
            "requestId": "decision-llm-001",
            "userId": "1",
            "focus": "不要泄露这段私密备注",
            "allowExternalModel": True,
            "project": project_payload(),
            "availableDirections": ["测试开发"],
        }
    )


def valid_llm_response() -> str:
    return json.dumps(
        {
            "confidence": 0.78,
            "conclusion": "Java 后端已有一条项目证据，但两个方向都还需要实践验证。",
            "evidenceBasis": [
                {"statement": "Java 后端已有课程 API 项目", "sourceRefs": ["project:course-api", "job:999999"]}
            ],
            "counterArguments": ["Java 后端的并发与部署证据不足"],
            "uncertainties": ["数据分析方向尚无完整项目"],
            "nextActions": [
                {
                    "actionType": "validate_assumption",
                    "title": "完成两个最小实践",
                    "rationale": "用同等时间比较真实体验",
                    "acceptanceCriteria": "两个方向各留下一个可展示成果",
                }
            ],
            "candidateSuggestions": [],
        },
        ensure_ascii=False,
    )


def test_decision_coach_uses_valid_llm_output(monkeypatch) -> None:
    monkeypatch.setattr(
        coaching_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(coaching_graph.llm_client, "complete", lambda **kwargs: valid_llm_response())

    response = coaching_graph.coach_decision(decision_request())

    assert response.generation_mode == "llm"
    assert response.model_name == "career-model"
    assert response.confidence == 0.78
    assert "Java 后端" in response.conclusion
    assert response.evidence_basis[0].source_refs == ["project:course-api"]


def test_decision_coach_does_not_call_external_model_without_consent(monkeypatch) -> None:
    monkeypatch.setattr(
        coaching_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai-compatible", llm_model="career-model", llm_api_key="secret"),
    )

    def unexpected_call(**kwargs):
        raise AssertionError("External model must not be called without consent.")

    monkeypatch.setattr(coaching_graph.llm_client, "complete", unexpected_call)
    request = decision_request().model_copy(update={"allow_external_model": False})

    response = coaching_graph.coach_decision(request)

    assert response.generation_mode == "fallback"
    assert response.model_name == "rule-decision-coach-v1"


def test_decision_coach_falls_back_on_provider_timeout(monkeypatch) -> None:
    def fail(**kwargs):
        raise LlmClientError("provider timeout")

    monkeypatch.setattr(
        coaching_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(coaching_graph.llm_client, "complete", fail)

    response = coaching_graph.coach_decision(decision_request())

    assert response.generation_mode == "fallback"
    assert response.model_name == "rule-decision-coach-v1"
    assert response.next_actions


def test_decision_coach_falls_back_on_invalid_json(monkeypatch) -> None:
    monkeypatch.setattr(
        coaching_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(coaching_graph.llm_client, "complete", lambda **kwargs: "not-json")

    response = coaching_graph.coach_decision(decision_request())

    assert response.generation_mode == "fallback"
    assert response.uncertainties


def test_fallback_log_does_not_include_private_focus(monkeypatch, caplog) -> None:
    def fail(**kwargs):
        raise LlmClientError("provider failed")

    monkeypatch.setattr(
        coaching_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(coaching_graph.llm_client, "complete", fail)

    with caplog.at_level("WARNING", logger="app.agents.llm_fallback"):
        coaching_graph.coach_decision(decision_request())

    assert "不要泄露这段私密备注" not in caplog.text
    assert "provider failed" not in caplog.text
    assert any(getattr(record, "workflow", None) == "decision_coach" for record in caplog.records)


def test_action_plan_preview_uses_llm_but_preserves_missing_week_sources(monkeypatch) -> None:
    task = {
        "title": "核对岗位要求",
        "taskType": "career_research",
        "content": "核对真实岗位。",
        "estimatedMinutes": 90,
        "acceptanceCriteria": "形成要求清单。",
        "rationale": "避免凭职位名称制定计划。",
        "capabilityGap": "要求尚未校准",
        "jobRequirement": "Spring Boot",
        "sourceRefs": ["job:801"],
    }
    baseline = {
        "generationMode": "fallback",
        "modelName": "rule-personalized-plan-v2",
        "confidence": 0.6,
        "overview": "规则计划",
        "evidenceBasis": [{"statement": "真实岗位要求", "sourceRefs": ["job:801"]}],
        "uncertainties": ["样本有限"],
        "weeks": [
            {"weekNo": 1, "goal": "校准", "tasks": [task]},
            {"weekNo": 2, "goal": "验证", "tasks": [{**task, "title": "完成能力样例"}]},
        ],
    }
    request = ActionPlanPreviewRequest.model_validate(
        {
            "requestId": "plan-preview-llm-1",
            "allowExternalModel": True,
            "targetRole": "Java 后端",
            "durationWeeks": 2,
            "startDate": "2026-07-13",
            "decisionContext": {"profile": {}, "project": {}, "jobDetails": [{"id": 801}]},
            "baseline": baseline,
        }
    )
    llm_response = {
        **baseline,
        "overview": "结合 Spring Boot 缺口生成的个性化计划",
        "weeks": [
            {"weekNo": 1, "goal": "校准岗位", "tasks": [{**task, "sourceRefs": []}]},
            # Deliberately omit week two; normalisation must restore the complete skeleton.
            {"weekNo": 1, "goal": "重复周次", "tasks": [task]},
        ],
    }
    monkeypatch.setattr(
        coaching_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(coaching_graph.llm_client, "complete", lambda **kwargs: json.dumps(llm_response, ensure_ascii=False))

    response = coaching_graph.preview_action_plan(request)

    assert response.generation_mode == "llm"
    assert response.model_name == "career-model"
    assert [week.week_no for week in response.weeks] == [1, 2]
    assert response.weeks[0].tasks[0].source_refs == ["job:801"]
