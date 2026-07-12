import json

from app.agents import career_report_graph
from app.config.settings import Settings
from app.schemas.career_report import CareerReportRequest
from app.services.llm_client import LlmClientError


def request_payload() -> CareerReportRequest:
    return CareerReportRequest.model_validate(
        {
            "request_id": "llm-career-report",
            "user_id": "user-001",
            "allow_external_model": True,
            "profile": {
                "name": "Alex",
                "major": "Computer Science",
                "target_role": "AI application engineer",
                "skills": ["Python", "FastAPI", "RAG"],
            },
            "assessment": {
                "mbti_type": "INTJ",
                "strengths": ["Structured thinking"],
            },
            "job_candidates": [
                {
                    "title": "AI application engineer",
                    "company": "Zhixing AI",
                    "location": "Shenzhen",
                    "match_score": 91,
                    "reasons": ["Role direction matches"],
                    "core_skills": ["Python", "RAG", "LLM"],
                }
            ],
        }
    )


def test_career_report_uses_llm_when_provider_is_enabled(monkeypatch):
    calls: list[tuple[str, str]] = []

    def fake_complete(system_prompt, user_prompt, settings, transport=None):
        calls.append((system_prompt, user_prompt))
        return json.dumps(
            {
                "summary": "LLM refined summary for AI application engineering.",
                "profile_tags": ["Computer Science", "AI application engineer", "INTJ"],
                "strengths": ["Structured thinking"],
                "risks": ["Portfolio evidence needs sharper metrics"],
                "recommended_careers": [
                    {
                        "title": "AI application engineer",
                        "match_score": 93,
                        "reasons": ["Real job candidates align with Python and RAG experience."],
                        "core_skills": ["Python", "RAG", "LLM"],
                        "risks": ["Prepare measurable project outcomes."],
                    }
                ],
                "skill_gaps": [
                    {
                        "skill": "Production LLM integration",
                        "priority": "high",
                        "suggestion": "Ship one OpenAI-compatible integration with tests.",
                    }
                ],
                "next_actions": ["Build a portfolio case around a real job description."],
                "confidence": 0.86,
            }
        )

    monkeypatch.setattr(
        career_report_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(career_report_graph.llm_client, "complete", fake_complete)

    report = career_report_graph.generate_career_report(request_payload())

    assert calls
    assert report.summary == "LLM refined summary for AI application engineering."
    assert report.recommended_careers[0].match_score == 93
    assert report.skill_gaps[0].skill == "Production LLM integration"


def test_career_report_falls_back_when_llm_fails(monkeypatch):
    def failing_complete(system_prompt, user_prompt, settings, transport=None):
        raise LlmClientError("provider unavailable")

    monkeypatch.setattr(
        career_report_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(career_report_graph.llm_client, "complete", failing_complete)

    report = career_report_graph.generate_career_report(request_payload())

    assert "real imported job candidates" in report.summary
    assert report.recommended_careers[0].title == "AI application engineer"
    assert report.recommended_careers[0].match_score == 91
