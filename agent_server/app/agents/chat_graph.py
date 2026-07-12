import json
import re
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.llm_fallback import log_llm_fallback
from app.config.settings import get_settings
from app.schemas.chat import ChatAction, ChatRequest, ChatResponse
from app.schemas.coaching import EvidenceBasis
from app.services.llm_client import LlmClientError, llm_client

MAX_CHAT_MESSAGE_CHARS = 2000

ALLOWED_INTENTS = {
    "model_identity",
    "product_help",
    "general_chat",
    "career_consultation",
    "resume_advice",
    "path_planning",
    "job_search",
    "profile_completion",
    "decision_coaching",
    "action_coaching",
    "weekly_review",
}
DIRECT_INTENTS = {"model_identity", "product_help", "general_chat"}
COACHING_INTENTS = ALLOWED_INTENTS - DIRECT_INTENTS
INTERNAL_IDENTIFIER_PATTERN = re.compile(r"\b(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b")
ACTION_LABELS = {
    "go:dashboard": "返回工作台",
    "go:resume": "查看简历分析",
    "go:action-plans": "查看行动计划",
    "go:history": "查看历史记录",
    "go:explore": "浏览职业与岗位",
    "go:profile": "完善个人档案",
    "go:decision-projects": "查看决策项目",
}
INTENT_ACTIONS = {
    "resume_advice": "go:resume",
    "path_planning": "go:action-plans",
    "action_coaching": "go:action-plans",
    "weekly_review": "go:action-plans",
    "job_search": "go:explore",
    "profile_completion": "go:profile",
    "decision_coaching": "go:decision-projects",
    "career_consultation": "go:dashboard",
}


class ChatState(TypedDict, total=False):
    request: ChatRequest
    response: ChatResponse


def create_baseline_chat(state: ChatState) -> dict[str, Any]:
    request = state["request"]
    intent = infer_intent(request)
    return {"response": build_baseline_response(request, intent)}


def infer_intent(request: ChatRequest) -> str:
    message = request.message.strip()
    lowered = message.lower()
    page = (request.page or "").lower()
    if any(
        marker in lowered
        for marker in (
            "你是谁",
            "你是什么模型",
            "你用的什么模型",
            "你用的是什么模型",
            "什么大模型",
            "哪个模型",
            "哪个大模型",
            "基于什么模型",
            "使用什么模型",
            "模型名称",
            "底层模型",
            "who are you",
            "what model",
            "which model",
            "model are you",
        )
    ):
        return "model_identity"
    if any(
        marker in lowered
        for marker in (
            "这个系统怎么用",
            "这个产品怎么用",
            "这个应用怎么用",
            "如何使用这个系统",
            "怎么使用这个系统",
            "使用帮助",
            "有哪些功能",
            "你能做什么",
            "你可以做什么",
            "你可以帮我做什么",
            "ai 助手能做什么",
            "ai助手能做什么",
            "助手能做什么",
            "怎么操作",
            "how do i use",
            "how to use",
            "what can you do",
            "product help",
        )
    ):
        return "product_help"
    if lowered in {"hi", "hello", "hey", "thanks", "thank you", "bye"} or any(
        marker in lowered for marker in ("你好", "您好", "嗨", "哈喽", "早上好", "晚上好", "谢谢", "感谢", "再见", "聊聊天", "讲个笑话")
    ):
        return "general_chat"
    if "weekly-review" in page or "复盘" in message:
        return "weekly_review"
    if "action-plan" in page or "行动" in message or "任务" in message:
        return "action_coaching"
    if "decision-project" in page or "候选" in message or "决策" in message or "选择" in message:
        return "decision_coaching"
    if "\u7b80\u5386" in message or "resume" in lowered or "cv" in lowered:
        return "resume_advice"
    if "\u89c4\u5212" in message or "\u8ba1\u5212" in message or "path" in lowered or "plan" in lowered:
        return "path_planning"
    if "\u5c97\u4f4d" in message or "\u804c\u4f4d" in message or "job" in lowered:
        return "job_search"
    if "\u753b\u50cf" in message or "\u6863\u6848" in message or "profile" in lowered:
        return "profile_completion"
    return "career_consultation"


def build_baseline_response(request: ChatRequest, intent: str) -> ChatResponse:
    if intent in DIRECT_INTENTS:
        return _build_direct_response(intent)

    action = default_action_for_intent(intent)
    page = request.page or "当前页面"
    context = request.context
    target = _context_text(context, "targetRole", "target_role", "primaryTarget")
    project = _context_text(context, "projectTitle", "project_title")
    subject = target or project or "当前职业问题"
    return ChatResponse(
        generation_mode="fallback",
        model_name="rule-context-mentor-v1",
        confidence=0.48 if target or project else 0.35,
        response_mode="coaching",
        used_personal_context=bool(context),
        intent=intent,
        reply=f"关于“{subject}”，先把当前判断和已有事实分开，再选择一个最小验证动作。",
        evidence_basis=[
            EvidenceBasis(statement=f"当前页面：{page}", source_refs=["page-context"]),
            EvidenceBasis(statement="用户提出了与当前页面相关的职业问题。", source_refs=["user-message"]),
        ],
        uncertainties=["当前对话上下文可能不包含完整项目证据和岗位样本。"],
        next_step=_next_step_for_intent(intent),
        actions=[action],
    )


def _build_direct_response(intent: str) -> ChatResponse:
    replies = {
        "model_identity": (
            "我是职业决策系统中的 AI 助手，负责回答产品使用和职业决策相关问题。"
            "具体底层模型由服务端配置决定；如果当前服务没有公开模型名称，我不会猜测。"
        ),
        "product_help": ("我可以说明系统功能和使用路径，也可以在职业决策问题中帮你梳理选项、证据与下一步。直接告诉我你想完成的操作即可。"),
        "general_chat": "你好，我是职业决策系统中的 AI 助手。你可以直接提问，也可以让我帮你梳理一个职业选择。",
    }
    confidence = {"model_identity": 0.95, "product_help": 0.85, "general_chat": 0.75}
    return ChatResponse(
        generation_mode="fallback",
        model_name="rule-direct-assistant-v1",
        confidence=confidence[intent],
        response_mode="direct",
        used_personal_context=False,
        intent=intent,
        reply=replies[intent],
        evidence_basis=[],
        uncertainties=[],
        next_step=None,
        actions=[],
    )


def _context_text(context: dict, *keys: str) -> str | None:
    for key in keys:
        value = context.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _next_step_for_intent(intent: str) -> str:
    return {
        "decision_coaching": "回到当前决策项目，补一条反对证据或一个验证动作。",
        "action_coaching": "选择一个本周任务，检查动作、耗时和验收标准是否具体。",
        "weekly_review": "记录本周成果与阻碍，再逐项确认下周任务调整。",
        "job_search": "为每个候选收集至少一个真实岗位样本。",
        "profile_completion": "补充当前困惑和每周可投入时间。",
        "resume_advice": "选择一段经历，用问题、行动和结果重写。",
        "path_planning": "先确认目标，再生成或检查行动计划。",
    }.get(intent, "回到工作台完成当前唯一的下一步。")


def enhance_chat_with_llm(state: ChatState) -> dict[str, Any]:
    settings = get_settings()
    if settings.llm_provider.lower() == "mock" or not state["request"].allow_external_model:
        return {}

    fallback = state["response"]
    try:
        content = llm_client.complete(
            system_prompt=chat_system_prompt(fallback.response_mode),
            user_prompt=chat_user_prompt(state["request"], fallback),
            settings=settings,
        )
        response = parse_llm_chat(content, fallback).model_copy(update={"generation_mode": "llm", "model_name": settings.llm_model})
    except (LlmClientError, ValueError, json.JSONDecodeError) as exc:
        log_llm_fallback("chat", exc)
        return {"response": fallback}
    return {"response": response}


def chat_system_prompt(response_mode: str = "coaching") -> str:
    if response_mode == "direct":
        return (
            "You are the AI assistant inside a career decision product. Answer the user's current question directly. "
            "Return only valid JSON with reply and intent. The intent must be one of model_identity, product_help, general_chat. "
            "Do not invent a model identity or claim access to personal data. Do not request evidence, uncertainty, a next step, "
            "or an app action unless the user explicitly asks for one. Do not include markdown."
        )
    return (
        "You are a contextual career mentor inside a structured app. Return only valid JSON with: "
        "generationMode, modelName, confidence, responseMode, usedPersonalContext, reply, evidenceBasis, "
        "uncertainties, nextStep, actions, intent. "
        "The reply is the conclusion. Evidence must cite only supplied context. Explicitly state uncertainty and one concrete next step. "
        f"Allowed intents: {sorted(COACHING_INTENTS)}. Allowed actions: {sorted(ACTION_LABELS)}. "
        "Use natural user-facing language only. Never expose raw JSON keys, enum values, IDs, status codes, "
        "or usernames unless the user explicitly asks. Never claim to have changed user data. Do not include markdown."
    )


def chat_user_prompt(request: ChatRequest, fallback: ChatResponse) -> str:
    payload: dict[str, Any] = {
        "message": request.message.strip()[:MAX_CHAT_MESSAGE_CHARS],
        "responseMode": fallback.response_mode,
        "intent": fallback.intent,
        "baselineResponse": fallback.model_dump(mode="json", by_alias=True),
    }
    if fallback.response_mode == "coaching":
        payload["page"] = request.page
        payload["context"] = request.context
    return json.dumps(payload, ensure_ascii=False)


def parse_llm_chat(content: str, fallback: ChatResponse) -> ChatResponse:
    raw = extract_json_object(content)
    response = ChatResponse.model_validate(json.loads(raw))
    if not response.reply.strip() or response.intent not in ALLOWED_INTENTS:
        raise ValueError("LLM chat response is missing a valid reply or intent.")
    response_mode = _response_mode_for_intent(response.intent)
    if response_mode != fallback.response_mode:
        raise ValueError("LLM chat response changed the server-selected response mode.")
    if _contains_internal_identifiers(response):
        raise ValueError("LLM chat response exposed internal identifiers.")
    if fallback.response_mode == "coaching" and not normalize_actions(response.actions):
        raise ValueError("LLM coaching response is missing a valid action.")
    return normalize_chat_response(response, fallback)


def extract_json_object(content: str) -> str:
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        raise ValueError("LLM response does not contain a JSON object.")
    return text[start : end + 1]


def normalize_chat_response(response: ChatResponse, fallback: ChatResponse) -> ChatResponse:
    intent = (
        response.intent
        if response.intent in ALLOWED_INTENTS and _response_mode_for_intent(response.intent) == fallback.response_mode
        else fallback.intent
    )
    if fallback.response_mode == "direct":
        return response.model_copy(
            update={
                "reply": response.reply.strip() or fallback.reply,
                "response_mode": "direct",
                "used_personal_context": False,
                "evidence_basis": [],
                "uncertainties": [],
                "next_step": None,
                "actions": [],
                "intent": intent,
            }
        )

    actions = normalize_actions(response.actions) or fallback.actions
    return response.model_copy(
        update={
            "reply": response.reply.strip() or fallback.reply,
            "response_mode": "coaching",
            "used_personal_context": fallback.used_personal_context,
            "evidence_basis": response.evidence_basis or fallback.evidence_basis,
            "uncertainties": [item.strip() for item in response.uncertainties if item.strip()] or fallback.uncertainties,
            "next_step": response.next_step.strip() if response.next_step and response.next_step.strip() else fallback.next_step,
            "intent": intent,
            "actions": actions,
        }
    )


def _response_mode_for_intent(intent: str) -> str:
    return "direct" if intent in DIRECT_INTENTS else "coaching"


def _contains_internal_identifiers(response: ChatResponse) -> bool:
    texts = [
        response.reply,
        *(item.statement for item in response.evidence_basis),
        *response.uncertainties,
        response.next_step or "",
    ]
    return any(INTERNAL_IDENTIFIER_PATTERN.search(text) for text in texts)


def normalize_actions(actions: list[ChatAction]) -> list[ChatAction]:
    normalized = []
    for action in actions[:3]:
        if action.action not in ACTION_LABELS:
            continue
        label = action.label.strip() or ACTION_LABELS[action.action]
        normalized.append(ChatAction(label=label, action=action.action))
    return normalized


def default_action_for_intent(intent: str) -> ChatAction:
    action = INTENT_ACTIONS.get(intent, "go:dashboard")
    return ChatAction(label=ACTION_LABELS[action], action=action)


def build_graph():
    graph = StateGraph(ChatState)
    graph.add_node("create_baseline_chat", create_baseline_chat)
    graph.add_node("enhance_chat_with_llm", enhance_chat_with_llm)
    graph.set_entry_point("create_baseline_chat")
    graph.add_edge("create_baseline_chat", "enhance_chat_with_llm")
    graph.add_edge("enhance_chat_with_llm", END)
    return graph.compile()


chat_graph = build_graph()


def answer_chat(request: ChatRequest) -> ChatResponse:
    result = chat_graph.invoke({"request": request})
    return result["response"]
