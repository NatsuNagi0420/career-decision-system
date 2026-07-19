import json

import pytest

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
        allow_external_model=True,
    )


def test_chat_detects_chinese_resume_and_plan_intents(monkeypatch):
    monkeypatch.setattr(chat_graph, "get_settings", lambda: Settings(llm_provider="mock"))

    resume_response = chat_graph.answer_chat(request_payload("\u5e2e\u6211\u770b\u770b\u7b80\u5386"))
    plan_response = chat_graph.answer_chat(request_payload("\u5e2e\u6211\u5236\u5b9a\u8f6c\u7801\u89c4\u5212"))

    assert resume_response.intent == "resume_advice"
    assert resume_response.actions[0].action == "go:resume"
    assert plan_response.intent == "path_planning"
    assert plan_response.actions[0].action == "go:action-plans"


@pytest.mark.parametrize(
    ("message", "intent"),
    [
        ("你是谁，用的什么模型？", "model_identity"),
        ("你是基于哪个大模型？", "model_identity"),
        ("这个系统怎么用？", "product_help"),
        ("这个 AI 助手能做什么？", "product_help"),
        ("你好", "general_chat"),
    ],
)
def test_chat_direct_intents_do_not_use_coaching_structure(monkeypatch, message, intent):
    monkeypatch.setattr(chat_graph, "get_settings", lambda: Settings(llm_provider="mock"))

    response = chat_graph.answer_chat(request_payload(message))

    assert response.intent == intent
    assert response.response_mode == "direct"
    assert response.used_personal_context is False
    assert response.evidence_basis == []
    assert response.uncertainties == []
    assert response.next_step is None
    assert response.actions == []


def test_identity_reply_uses_suina_persona_without_unprompted_model_details(monkeypatch):
    monkeypatch.setattr(chat_graph, "get_settings", lambda: Settings(llm_provider="mock"))

    response = chat_graph.answer_chat(request_payload("你是谁？"))

    assert response.intent == "model_identity"
    assert "穗奈" in response.reply
    assert "青穗集" in response.reply
    assert "真实岗位" in response.reply
    assert "底层模型" not in response.reply


def test_model_question_keeps_suina_persona_and_explains_server_configuration(monkeypatch):
    monkeypatch.setattr(chat_graph, "get_settings", lambda: Settings(llm_provider="mock"))

    response = chat_graph.answer_chat(request_payload("你是谁，用的什么模型？"))

    assert "穗奈" in response.reply
    assert "服务端配置" in response.reply
    assert "不会猜测" in response.reply


def test_direct_llm_prompt_omits_personal_context(monkeypatch):
    prompts: list[tuple[str, str]] = []

    def fake_complete(system_prompt, user_prompt, settings, transport=None):
        prompts.append((system_prompt, user_prompt))
        return json.dumps({"reply": "我是系统中的 AI 助手。", "intent": "model_identity"})

    monkeypatch.setattr(
        chat_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(chat_graph.llm_client, "complete", fake_complete)
    request = request_payload("你是什么模型？")
    request.context = {
        "target_role": "private-target",
        "conversationHistory": [{"role": "user", "content": "private-history"}],
    }

    response = chat_graph.answer_chat(request)

    assert prompts
    system_prompt, user_prompt = prompts[0]
    assert "Suina (穗奈)" in system_prompt
    assert "Qing Sui Ji (青穗集)" in system_prompt
    assert "private-target" not in user_prompt
    assert "private-history" not in user_prompt
    assert '"context"' not in user_prompt
    assert response.generation_mode == "llm"
    assert response.response_mode == "direct"
    assert response.used_personal_context is False
    assert response.actions == []


def test_model_identity_falls_back_to_branded_reply_when_llm_drops_persona(monkeypatch):
    def fake_complete(system_prompt, user_prompt, settings, transport=None):
        return json.dumps({"reply": "我是系统中的 AI 助手。", "intent": "model_identity"})

    monkeypatch.setattr(
        chat_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(chat_graph.llm_client, "complete", fake_complete)

    response = chat_graph.answer_chat(request_payload("你是谁？"))

    assert response.generation_mode == "llm"
    assert "穗奈" in response.reply
    assert "青穗集" in response.reply


def test_coaching_llm_prompt_retains_personal_context(monkeypatch):
    prompts: list[str] = []

    def fake_complete(system_prompt, user_prompt, settings, transport=None):
        prompts.append(user_prompt)
        return json.dumps(
            {
                "reply": "先把后端项目改写为两条结果导向的简历要点。",
                "actions": [{"label": "查看简历分析", "action": "go:resume"}],
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

    assert prompts and "Backend developer" in prompts[0]
    assert response.response_mode == "coaching"
    assert response.used_personal_context is True
    assert response.evidence_basis
    assert response.uncertainties
    assert response.next_step
    assert response.actions


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
    assert response.generation_mode == "fallback"
    assert response.evidence_basis
    assert response.uncertainties
    assert response.next_step
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
    assert response.generation_mode == "fallback"
    assert response.actions[0].action == "go:resume"


def test_chat_rejects_internal_identifiers_from_llm_output(monkeypatch):
    def unsafe_complete(system_prompt, user_prompt, settings, transport=None):
        return json.dumps(
            {
                "reply": "dashboardStatus 为 new_user，建议先完成引导。",
                "evidenceBasis": [
                    {
                        "statement": "onboardingCompleted 为 false。",
                        "sourceRefs": ["dashboard"],
                    }
                ],
                "actions": [{"label": "返回工作台", "action": "go:dashboard"}],
                "intent": "career_consultation",
            }
        )

    monkeypatch.setattr(
        chat_graph,
        "get_settings",
        lambda: Settings(
            llm_provider="openai_compatible",
            llm_api_key="test-key",
            llm_model="career-model",
        ),
    )
    monkeypatch.setattr(chat_graph.llm_client, "complete", unsafe_complete)

    response = chat_graph.answer_chat(request_payload("我现在应该做什么？"))

    assert response.generation_mode == "fallback"
    assert "dashboardStatus" not in response.reply
    assert all("onboardingCompleted" not in item.statement for item in response.evidence_basis)
