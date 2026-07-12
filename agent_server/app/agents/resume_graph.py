import json

from app.agents.llm_fallback import log_llm_fallback
from app.config.settings import get_settings
from app.schemas.resume import ResumeAnalysisRequest, ResumeAnalysisResponse
from app.services.llm_client import LlmClientError, llm_client

MAX_RESUME_PROMPT_CHARS = 6000


def analyze_resume(request: ResumeAnalysisRequest) -> ResumeAnalysisResponse:
    baseline = build_baseline_resume_analysis(request)
    return enhance_resume_with_llm(request, baseline)


def build_baseline_resume_analysis(request: ResumeAnalysisRequest) -> ResumeAnalysisResponse:
    text = request.resume_text.strip()
    has_project = "\u9879\u76ee" in text or "project" in text.lower()
    has_metrics = any(char.isdigit() for char in text)
    score = 78 if has_project else 64
    if has_metrics:
        score += 6

    return ResumeAnalysisResponse(
        score=min(score, 92),
        ats_score=74 if request.target_role else 66,
        keyword_match=72 if request.target_role else 58,
        issues=[
            "Project experience needs clearer business context.",
            "Skill keywords should be tied to evidence.",
        ],
        suggestions=[
            "Use STAR structure for each project.",
            "Add measurable outcomes where possible.",
            "Create a role-specific version for the target position.",
        ],
        improved_fragments=[
            "Built a career planning module with profile collection, assessment, and report generation.",
        ],
    )


def enhance_resume_with_llm(request: ResumeAnalysisRequest, fallback: ResumeAnalysisResponse) -> ResumeAnalysisResponse:
    settings = get_settings()
    if settings.llm_provider.lower() == "mock" or not request.allow_external_model:
        return fallback

    try:
        content = llm_client.complete(
            system_prompt=resume_system_prompt(),
            user_prompt=resume_user_prompt(request, fallback),
            settings=settings,
        )
        return parse_llm_resume_analysis(content, fallback)
    except (LlmClientError, ValueError, json.JSONDecodeError) as exc:
        log_llm_fallback("resume_analysis", exc)
        return fallback


def resume_system_prompt() -> str:
    return (
        "You are a resume analysis agent. Return only valid JSON matching this schema: "
        "{score:int, ats_score:int, keyword_match:int, issues:string[], suggestions:string[], improved_fragments:string[]}. "
        "Scores must be 0-100. Give practical, role-specific advice. Do not include markdown."
    )


def resume_user_prompt(request: ResumeAnalysisRequest, fallback: ResumeAnalysisResponse) -> str:
    payload = {
        "target_role": request.target_role,
        "resume_text": request.resume_text.strip()[:MAX_RESUME_PROMPT_CHARS],
        "baseline_analysis": fallback.model_dump(mode="json"),
    }
    return json.dumps(payload, ensure_ascii=False)


def parse_llm_resume_analysis(content: str, fallback: ResumeAnalysisResponse) -> ResumeAnalysisResponse:
    raw = extract_json_object(content)
    analysis = ResumeAnalysisResponse.model_validate(json.loads(raw))
    return normalize_resume_analysis(analysis, fallback)


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


def normalize_resume_analysis(
    analysis: ResumeAnalysisResponse,
    fallback: ResumeAnalysisResponse,
) -> ResumeAnalysisResponse:
    return analysis.model_copy(
        update={
            "score": clamp_score(analysis.score),
            "ats_score": clamp_score(analysis.ats_score),
            "keyword_match": clamp_score(analysis.keyword_match),
            "issues": analysis.issues or fallback.issues,
            "suggestions": analysis.suggestions or fallback.suggestions,
            "improved_fragments": analysis.improved_fragments or fallback.improved_fragments,
        }
    )


def clamp_score(value: int) -> int:
    return max(0, min(value, 100))
