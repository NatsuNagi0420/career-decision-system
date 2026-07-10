import json
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.llm_fallback import log_llm_fallback
from app.config.settings import get_settings
from app.schemas.chat import ChatAction, ChatRequest, ChatResponse
from app.services.llm_client import LlmClientError, llm_client

MAX_CHAT_MESSAGE_CHARS = 2000

ALLOWED_INTENTS = {
    "career_consultation",
    "resume_advice",
    "path_planning",
    "job_search",
    "profile_completion",
}
ACTION_LABELS = {
    "go:resume": "Go to resume analysis",
    "go:path-planning": "Generate path plan",
    "go:career-report": "Generate career report",
    "go:jobs": "Browse matched jobs",
    "go:profile": "Complete profile",
}
INTENT_ACTIONS = {
    "resume_advice": "go:resume",
    "path_planning": "go:path-planning",
    "job_search": "go:jobs",
    "profile_completion": "go:profile",
    "career_consultation": "go:career-report",
}


class ChatState(TypedDict, total=False):
    request: ChatRequest
    response: ChatResponse


def create_baseline_chat(state: ChatState) -> dict[str, Any]:
    request = state["request"]
    intent = infer_intent(request)
    return {"response": build_baseline_response(intent)}


def infer_intent(request: ChatRequest) -> str:
    message = request.message.strip()
    lowered = message.lower()
    if "\u7b80\u5386" in message or "resume" in lowered or "cv" in lowered:
        return "resume_advice"
    if "\u89c4\u5212" in message or "\u8ba1\u5212" in message or "path" in lowered or "plan" in lowered:
        return "path_planning"
    if "\u5c97\u4f4d" in message or "\u804c\u4f4d" in message or "job" in lowered:
        return "job_search"
    if "\u753b\u50cf" in message or "\u6863\u6848" in message or "profile" in lowered:
        return "profile_completion"
    return "career_consultation"


def build_baseline_response(intent: str) -> ChatResponse:
    action = default_action_for_intent(intent)
    return ChatResponse(
        intent=intent,
        reply=(
            "I can help you turn this into a concrete career decision. "
            "I will use your profile, assessment result, target role, and saved records to give a structured next step."
        ),
        actions=[action],
    )


def enhance_chat_with_llm(state: ChatState) -> dict[str, Any]:
    settings = get_settings()
    if settings.llm_provider.lower() == "mock":
        return {}

    fallback = state["response"]
    try:
        content = llm_client.complete(
            system_prompt=chat_system_prompt(),
            user_prompt=chat_user_prompt(state["request"], fallback),
            settings=settings,
        )
        response = parse_llm_chat(content, fallback)
    except (LlmClientError, ValueError, json.JSONDecodeError) as exc:
        log_llm_fallback("chat", exc)
        return {"response": fallback}
    return {"response": response}


def chat_system_prompt() -> str:
    return (
        "You are a career planning assistant inside a structured app. Return only valid JSON matching this schema: "
        "{reply:string, actions:[{label:string, action:string}], intent:string}. "
        "Allowed intents: career_consultation, resume_advice, path_planning, job_search, profile_completion. "
        "Allowed actions: go:resume, go:path-planning, go:career-report, go:jobs, go:profile. "
        "Keep the reply concise, concrete, and grounded in the current page/context. Do not include markdown."
    )


def chat_user_prompt(request: ChatRequest, fallback: ChatResponse) -> str:
    payload = {
        "page": request.page,
        "message": request.message.strip()[:MAX_CHAT_MESSAGE_CHARS],
        "context": request.context,
        "baseline_response": fallback.model_dump(mode="json"),
    }
    return json.dumps(payload, ensure_ascii=False)


def parse_llm_chat(content: str, fallback: ChatResponse) -> ChatResponse:
    raw = extract_json_object(content)
    response = ChatResponse.model_validate(json.loads(raw))
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
    intent = response.intent if response.intent in ALLOWED_INTENTS else fallback.intent
    actions = normalize_actions(response.actions) or fallback.actions
    return response.model_copy(
        update={
            "reply": response.reply.strip() or fallback.reply,
            "intent": intent,
            "actions": actions,
        }
    )


def normalize_actions(actions: list[ChatAction]) -> list[ChatAction]:
    normalized = []
    for action in actions[:3]:
        if action.action not in ACTION_LABELS:
            continue
        label = action.label.strip() or ACTION_LABELS[action.action]
        normalized.append(ChatAction(label=label, action=action.action))
    return normalized


def default_action_for_intent(intent: str) -> ChatAction:
    action = INTENT_ACTIONS.get(intent, "go:career-report")
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
