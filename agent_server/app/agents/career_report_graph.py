import json
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.llm_fallback import log_llm_fallback
from app.config.settings import get_settings
from app.schemas.career_report import (
    CareerOption,
    CareerReportRequest,
    CareerReportResponse,
    SkillGapItem,
)
from app.services.llm_client import LlmClientError, llm_client


class CareerReportState(TypedDict, total=False):
    request: CareerReportRequest
    profile_tags: list[str]
    recommended_careers: list[CareerOption]
    skill_gaps: list[SkillGapItem]
    report: CareerReportResponse


def normalize_profile(state: CareerReportState) -> dict[str, Any]:
    request = state["request"]
    profile = request.profile
    tags = []
    if profile.major:
        tags.append(profile.major)
    if profile.target_role:
        tags.append(profile.target_role)
    tags.extend(profile.skills[:4])
    if request.assessment.mbti_type:
        tags.append(request.assessment.mbti_type)
    return {"profile_tags": tags or ["career explorer", "needs profile completion"]}


def candidate_skills(candidate) -> list[str]:
    values = candidate.core_skills or [candidate.direction, candidate.industry, "portfolio evidence"]
    return [value for value in values if value][:4]


def recommend_careers(state: CareerReportState) -> dict[str, Any]:
    request = state["request"]
    if request.job_candidates:
        careers = [
            CareerOption(
                title=candidate.title,
                match_score=max(0, min(candidate.match_score, 100)),
                reasons=[
                    *candidate.reasons[:2],
                    f"Real job sample from {candidate.company or 'the imported job corpus'}",
                    f"{candidate.location or 'Location open'} · {candidate.salary_range or 'Salary not disclosed'}",
                ],
                core_skills=candidate_skills(candidate),
                risks=[
                    "Use the job detail page to verify exact requirements.",
                    "Prepare project evidence before applying.",
                ],
            )
            for candidate in request.job_candidates[:5]
        ]
        return {"recommended_careers": careers}

    target = request.profile.target_role or "AI application engineer"
    skills = request.profile.skills or ["Python", "communication", "self-learning"]
    careers = [
        CareerOption(
            title=target,
            match_score=86,
            reasons=["Matches the current target direction", "Can reuse existing skill evidence"],
            core_skills=skills[:4],
            risks=["Need more project evidence", "Market expectations may require stronger portfolio"],
        ),
        CareerOption(
            title="Backend developer",
            match_score=78,
            reasons=["Clear engineering growth path", "Easy to show ability through projects"],
            core_skills=["Java", "Spring Boot", "SQL", "API design"],
            risks=["Needs systematic backend project practice"],
        ),
        CareerOption(
            title="Data analyst",
            match_score=72,
            reasons=["Good fit for structured thinking and career exploration data"],
            core_skills=["SQL", "Python", "statistics", "visualization"],
            risks=["Needs business case portfolio"],
        ),
    ]
    return {"recommended_careers": careers}


def analyze_skill_gap(state: CareerReportState) -> dict[str, Any]:
    gaps = [
        SkillGapItem(skill="Portfolio project", priority="high", suggestion="Build one end-to-end project with visible results."),
        SkillGapItem(skill="Interview storytelling", priority="medium", suggestion="Rewrite project experience with STAR structure."),
        SkillGapItem(skill="Domain research", priority="medium", suggestion="Compare 3 target roles and collect job descriptions."),
    ]
    return {"skill_gaps": gaps}


def compose_report(state: CareerReportState) -> dict[str, Any]:
    request = state["request"]
    target = request.profile.target_role or "AI application engineer"
    corpus_note = f"Based on {len(request.job_candidates)} real imported job candidates, " if request.job_candidates else ""
    summary = (
        f"{corpus_note}your current profile can start from {target}, "
        "but the next step is to turn skills into visible project evidence."
    )
    report = CareerReportResponse(
        summary=summary,
        profile_tags=state.get("profile_tags", []),
        strengths=request.assessment.strengths or ["Clear target awareness", "Willingness to improve"],
        risks=request.assessment.weaknesses or ["Profile evidence is still thin", "Target role needs validation"],
        recommended_careers=state.get("recommended_careers", []),
        skill_gaps=state.get("skill_gaps", []),
        next_actions=[
            "Complete the profile fields that are still empty.",
            "Pick one target role and upload 3 job descriptions for comparison.",
            "Start a 4-week portfolio project around the target role.",
        ],
    )
    return {"report": report}


def enhance_report_with_llm(state: CareerReportState) -> dict[str, Any]:
    settings = get_settings()
    if settings.llm_provider.lower() == "mock" or not state["request"].allow_external_model:
        return {}

    fallback = state["report"]
    try:
        content = llm_client.complete(
            system_prompt=career_report_system_prompt(),
            user_prompt=career_report_user_prompt(state["request"], fallback),
            settings=settings,
        )
        report = parse_llm_report(content, fallback)
    except (LlmClientError, ValueError, json.JSONDecodeError) as exc:
        log_llm_fallback("career_report", exc)
        return {"report": fallback}
    return {"report": report}


def career_report_system_prompt() -> str:
    return (
        "You are a career planning agent. Return only valid JSON matching this schema: "
        "{summary:string, profile_tags:string[], strengths:string[], risks:string[], "
        "recommended_careers:[{title:string, match_score:int, reasons:string[], core_skills:string[], risks:string[]}], "
        "skill_gaps:[{skill:string, priority:string, suggestion:string}], next_actions:string[], confidence:number}. "
        "Use concise, practical advice grounded in the supplied profile, assessment, and job candidates."
    )


def career_report_user_prompt(request: CareerReportRequest, fallback: CareerReportResponse) -> str:
    payload = {
        "profile": request.profile.model_dump(mode="json"),
        "assessment": request.assessment.model_dump(mode="json"),
        "job_candidates": [candidate.model_dump(mode="json") for candidate in request.job_candidates[:5]],
        "baseline_report": fallback.model_dump(mode="json"),
    }
    return json.dumps(payload, ensure_ascii=False)


def parse_llm_report(content: str, fallback: CareerReportResponse) -> CareerReportResponse:
    raw = extract_json_object(content)
    report = CareerReportResponse.model_validate(json.loads(raw))
    return normalize_report(report, fallback)


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


def normalize_report(report: CareerReportResponse, fallback: CareerReportResponse) -> CareerReportResponse:
    recommended = report.recommended_careers or fallback.recommended_careers
    normalized_careers = [
        career.model_copy(update={"match_score": max(0, min(career.match_score, 100))}) for career in recommended
    ]
    return report.model_copy(
        update={
            "profile_tags": report.profile_tags or fallback.profile_tags,
            "strengths": report.strengths or fallback.strengths,
            "risks": report.risks or fallback.risks,
            "recommended_careers": normalized_careers,
            "skill_gaps": report.skill_gaps or fallback.skill_gaps,
            "next_actions": report.next_actions or fallback.next_actions,
            "confidence": max(0, min(report.confidence, 1)),
        }
    )


def build_graph():
    graph = StateGraph(CareerReportState)
    graph.add_node("normalize_profile", normalize_profile)
    graph.add_node("recommend_careers", recommend_careers)
    graph.add_node("analyze_skill_gap", analyze_skill_gap)
    graph.add_node("compose_report", compose_report)
    graph.add_node("enhance_report_with_llm", enhance_report_with_llm)
    graph.set_entry_point("normalize_profile")
    graph.add_edge("normalize_profile", "recommend_careers")
    graph.add_edge("recommend_careers", "analyze_skill_gap")
    graph.add_edge("analyze_skill_gap", "compose_report")
    graph.add_edge("compose_report", "enhance_report_with_llm")
    graph.add_edge("enhance_report_with_llm", END)
    return graph.compile()


career_report_graph = build_graph()


def generate_career_report(request: CareerReportRequest) -> CareerReportResponse:
    result = career_report_graph.invoke({"request": request})
    return result["report"]
