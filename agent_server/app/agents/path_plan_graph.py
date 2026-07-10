import json
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.llm_fallback import log_llm_fallback
from app.config.settings import get_settings
from app.schemas.path_plan import Milestone, PathPlanRequest, PathPlanResponse
from app.services.llm_client import LlmClientError, llm_client


class PathPlanState(TypedDict, total=False):
    request: PathPlanRequest
    plan: PathPlanResponse


def build_baseline_path_plan(request: PathPlanRequest) -> PathPlanResponse:
    target = request.target_role.strip() or request.profile.target_role or "target role"
    focus_skill = request.profile.skills[0] if request.profile.skills else "core role skills"
    return PathPlanResponse(
        target_role=target,
        overview=f"A 12-week plan to validate and prepare for {target}.",
        milestones=[
            Milestone(
                title="Weeks 1-2: Position validation",
                duration="2 weeks",
                tasks=["Collect 10 job descriptions", "Extract common skill requirements", "Update profile gaps"],
                acceptance=["A ranked skill gap list is created"],
            ),
            Milestone(
                title="Weeks 3-8: Project evidence",
                duration="6 weeks",
                tasks=[
                    "Build one portfolio project",
                    f"Turn {focus_skill} into visible evidence",
                    "Prepare a 3-minute project demo",
                ],
                acceptance=["Project can be explained with problem, action, result, and tradeoffs"],
            ),
            Milestone(
                title="Weeks 9-12: Resume and interview",
                duration="4 weeks",
                tasks=["Rewrite resume", "Practice 20 interview questions", "Run two mock interviews"],
                acceptance=["Resume score reaches 85+"],
            ),
        ],
        checkpoints=["Week 2 review", "Week 8 project review", "Week 12 job readiness review"],
    )


def create_baseline_plan(state: PathPlanState) -> dict[str, Any]:
    return {"plan": build_baseline_path_plan(state["request"])}


def enhance_path_plan_with_llm(state: PathPlanState) -> dict[str, Any]:
    settings = get_settings()
    if settings.llm_provider.lower() == "mock":
        return {}

    fallback = state["plan"]
    try:
        content = llm_client.complete(
            system_prompt=path_plan_system_prompt(),
            user_prompt=path_plan_user_prompt(state["request"], fallback),
            settings=settings,
        )
        plan = parse_llm_path_plan(content, fallback)
    except (LlmClientError, ValueError, json.JSONDecodeError) as exc:
        log_llm_fallback("path_plan", exc)
        return {"plan": fallback}
    return {"plan": plan}


def path_plan_system_prompt() -> str:
    return (
        "You are a career path planning agent. Return only valid JSON matching this schema: "
        "{target_role:string, overview:string, milestones:[{title:string, duration:string, tasks:string[], acceptance:string[]}], "
        "checkpoints:string[]}. Build a concrete 8-12 week plan grounded in the supplied user profile. Do not include markdown."
    )


def path_plan_user_prompt(request: PathPlanRequest, fallback: PathPlanResponse) -> str:
    payload = {
        "target_role": request.target_role,
        "profile": request.profile.model_dump(mode="json"),
        "baseline_plan": fallback.model_dump(mode="json"),
    }
    return json.dumps(payload, ensure_ascii=False)


def parse_llm_path_plan(content: str, fallback: PathPlanResponse) -> PathPlanResponse:
    raw = extract_json_object(content)
    plan = PathPlanResponse.model_validate(json.loads(raw))
    return normalize_path_plan(plan, fallback)


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


def normalize_path_plan(plan: PathPlanResponse, fallback: PathPlanResponse) -> PathPlanResponse:
    milestones = [milestone for milestone in (normalize_milestone(item) for item in plan.milestones[:6]) if milestone]
    checkpoints = non_empty_strings(plan.checkpoints)[:8] or fallback.checkpoints
    return plan.model_copy(
        update={
            "target_role": first_non_empty(plan.target_role, fallback.target_role),
            "overview": first_non_empty(plan.overview, fallback.overview),
            "milestones": milestones or fallback.milestones,
            "checkpoints": checkpoints,
        }
    )


def normalize_milestone(milestone: Milestone) -> Milestone | None:
    tasks = non_empty_strings(milestone.tasks)[:8]
    acceptance = non_empty_strings(milestone.acceptance)[:5]
    title = milestone.title.strip()
    duration = milestone.duration.strip()
    if not title or not duration or not tasks or not acceptance:
        return None
    return milestone.model_copy(
        update={
            "title": title,
            "duration": duration,
            "tasks": tasks,
            "acceptance": acceptance,
        }
    )


def non_empty_strings(values: list[str]) -> list[str]:
    return [value.strip() for value in values if value.strip()]


def first_non_empty(value: str, fallback: str) -> str:
    return value.strip() or fallback


def build_graph():
    graph = StateGraph(PathPlanState)
    graph.add_node("create_baseline_plan", create_baseline_plan)
    graph.add_node("enhance_path_plan_with_llm", enhance_path_plan_with_llm)
    graph.set_entry_point("create_baseline_plan")
    graph.add_edge("create_baseline_plan", "enhance_path_plan_with_llm")
    graph.add_edge("enhance_path_plan_with_llm", END)
    return graph.compile()


path_plan_graph = build_graph()


def generate_path_plan(request: PathPlanRequest) -> PathPlanResponse:
    result = path_plan_graph.invoke({"request": request})
    return result["plan"]
