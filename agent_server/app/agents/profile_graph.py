import json
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.llm_fallback import log_llm_fallback
from app.config.settings import get_settings
from app.schemas.profile import CapabilityProfileRequest, CapabilityProfileResponse, RadarPoint
from app.services.llm_client import LlmClientError, llm_client


class ProfileState(TypedDict, total=False):
    request: CapabilityProfileRequest
    response: CapabilityProfileResponse


def build_baseline_profile(request: CapabilityProfileRequest) -> CapabilityProfileResponse:
    profile = request.profile
    skills = profile.skills or []
    tags = [profile.major, profile.target_role, request.assessment.mbti_type]
    tags = [tag for tag in tags if tag]
    tags.extend(skills[:3])

    completeness = 40
    completeness += 10 if profile.major else 0
    completeness += 10 if profile.target_role else 0
    completeness += min(len(skills) * 5, 25)
    completeness += 10 if profile.experiences else 0

    return CapabilityProfileResponse(
        completeness_score=min(completeness, 95),
        competitiveness_stars=4 if len(skills) >= 4 else 3,
        tags=tags or ["profile-started"],
        radar=[
            RadarPoint(name="Technical skill", value=min(60 + len(skills) * 5, 90)),
            RadarPoint(name="Project evidence", value=72 if profile.experiences else 48),
            RadarPoint(name="Career clarity", value=84 if profile.target_role else 55),
            RadarPoint(name="Communication", value=68),
            RadarPoint(name="Learning momentum", value=82),
        ],
        strengths=request.assessment.strengths or ["Clear growth intention", "Profile is ready for first analysis"],
        suggestions=[
            "Add one measurable project result.",
            "Choose a target role and compare real job descriptions.",
            "Convert skill tags into portfolio evidence.",
        ],
    )


def create_baseline_profile(state: ProfileState) -> dict[str, Any]:
    return {"response": build_baseline_profile(state["request"])}


def enhance_profile_with_llm(state: ProfileState) -> dict[str, Any]:
    settings = get_settings()
    if settings.llm_provider.lower() == "mock":
        return {}

    fallback = state["response"]
    try:
        content = llm_client.complete(
            system_prompt=profile_system_prompt(),
            user_prompt=profile_user_prompt(state["request"], fallback),
            settings=settings,
        )
        response = parse_llm_profile(content, fallback)
    except (LlmClientError, ValueError, json.JSONDecodeError) as exc:
        log_llm_fallback("capability_profile", exc)
        return {"response": fallback}
    return {"response": response}


def profile_system_prompt() -> str:
    return (
        "You are a career capability profiling agent. Return only valid JSON matching this schema: "
        "{completeness_score:int, competitiveness_stars:int, tags:string[], "
        "radar:[{name:string, value:int}], strengths:string[], suggestions:string[]}. "
        "Scores must be practical: completeness_score 0-100, competitiveness_stars 1-5, radar values 0-100. "
        "Ground the result in the supplied profile and assessment. Do not include markdown."
    )


def profile_user_prompt(request: CapabilityProfileRequest, fallback: CapabilityProfileResponse) -> str:
    payload = {
        "profile": request.profile.model_dump(mode="json"),
        "assessment": request.assessment.model_dump(mode="json"),
        "baseline_profile": fallback.model_dump(mode="json"),
    }
    return json.dumps(payload, ensure_ascii=False)


def parse_llm_profile(content: str, fallback: CapabilityProfileResponse) -> CapabilityProfileResponse:
    raw = extract_json_object(content)
    response = CapabilityProfileResponse.model_validate(json.loads(raw))
    return normalize_profile(response, fallback)


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


def normalize_profile(
    response: CapabilityProfileResponse,
    fallback: CapabilityProfileResponse,
) -> CapabilityProfileResponse:
    radar = normalize_radar(response.radar) or fallback.radar
    return response.model_copy(
        update={
            "completeness_score": clamp(response.completeness_score, 0, 100),
            "competitiveness_stars": clamp(response.competitiveness_stars, 1, 5),
            "tags": non_empty_strings(response.tags)[:10] or fallback.tags,
            "radar": radar[:8],
            "strengths": non_empty_strings(response.strengths)[:8] or fallback.strengths,
            "suggestions": non_empty_strings(response.suggestions)[:8] or fallback.suggestions,
        }
    )


def normalize_radar(points: list[RadarPoint]) -> list[RadarPoint]:
    normalized = []
    for point in points:
        name = point.name.strip()
        if not name:
            continue
        normalized.append(RadarPoint(name=name, value=clamp(point.value, 0, 100)))
    return normalized


def non_empty_strings(values: list[str]) -> list[str]:
    return [value.strip() for value in values if value.strip()]


def clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))


def build_graph():
    graph = StateGraph(ProfileState)
    graph.add_node("create_baseline_profile", create_baseline_profile)
    graph.add_node("enhance_profile_with_llm", enhance_profile_with_llm)
    graph.set_entry_point("create_baseline_profile")
    graph.add_edge("create_baseline_profile", "enhance_profile_with_llm")
    graph.add_edge("enhance_profile_with_llm", END)
    return graph.compile()


profile_graph = build_graph()


def generate_profile(request: CapabilityProfileRequest) -> CapabilityProfileResponse:
    result = profile_graph.invoke({"request": request})
    return result["response"]
