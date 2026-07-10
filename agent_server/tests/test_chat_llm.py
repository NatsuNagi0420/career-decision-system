import json

from app.agents import chat_graph
from app.config.settings import Settings
from app.schemas.chat import ChatRequest
from app.services.llm_client import LlmClientError


def request_payload(message: str = "Please review my resume for a backend developer role.") -> ChatRequest:
    return ChatRequest(
        request_id="llm-chat",
        user_id="user-001",
        page="dashboard",
        message=message,
        context={"target_role": "Backend developer"},
    )


def test_chat_detects_chinese_resume_and_plan_intents(monkeypatch):
    monkeypatch.setattr(chat_graph, "get_settings", lambda: Settings(llm_provider="mock"))

    resume_response = chat_graph.answer_chat(request_payload("\u5e2e\u6211\u770b\u770b\u7b80\u5386"))
    plan_response = chat_graph.answer_chat(request_payload("\u5e2e\u6211\u5236\u5b9a\u8f6c\u7801\u89c4\u5212"))

    assert resume_response.intent == "resume_advice"
    assert resume_response.actions[0].action == "go:resume"
    assert plan_response.intent == "path_planning"
    assert plan_response.actions[0].action == "go:path-planning"


def test_chat_uses_llm_when_provider_is_enabled(monkeypatch):
    calls: list[tuple[str, str]] = []

    def fake_complete(system_prompt, user_prompt, settings, transport=None):
        calls.append((system_prompt, user_prompt))
        return json.dumps(
            {
                "reply": "Your next step is to convert the backend project into two resume bullets and one interview story.",
                "actions": [{"label": "Open resume analysis", "action": "go:resume"}],
                "intent": "resume_advice",
            }
        )

    monkeypatch.setattr(
        chat_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(chat_graph.llm_client, "complete", fake_complete)

    response = chat_graph.answer_chat(request_payload())

    assert calls
    assert response.intent == "resume_advice"
    assert "backend project" in response.reply
    assert response.actions[0].action == "go:resume"


def test_chat_falls_back_when_llm_fails(monkeypatch):
    def failing_complete(system_prompt, user_prompt, settings, transport=None):
        raise LlmClientError("provider unavailable")

    monkeypatch.setattr(
        chat_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(chat_graph.llm_client, "complete", failing_complete)

    response = chat_graph.answer_chat(request_payload())

    assert response.intent == "resume_advice"
    assert "career decision" in response.reply
    assert response.actions[0].action == "go:resume"


def test_chat_filters_invalid_llm_actions(monkeypatch):
    def weak_complete(system_prompt, user_prompt, settings, transport=None):
        return json.dumps(
            {
                "reply": "   ",
                "actions": [{"label": "Unsafe", "action": "external:http://example.test"}],
                "intent": "unknown_intent",
            }
        )

    monkeypatch.setattr(
        chat_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(chat_graph.llm_client, "complete", weak_complete)

    response = chat_graph.answer_chat(request_payload())

    assert response.intent == "resume_advice"
    assert "career decision" in response.reply
    assert response.actions[0].action == "go:resume"
