import json

from app.agents import resume_graph
from app.config.settings import Settings
from app.schemas.resume import ResumeAnalysisRequest
from app.services.llm_client import LlmClientError
from app.trace_context import reset_trace_id, set_trace_id


def request_payload() -> ResumeAnalysisRequest:
    return ResumeAnalysisRequest(
        request_id="llm-resume",
        user_id="user-001",
        target_role="Backend developer",
        resume_text=(
            "Project: Built a FastAPI career service with SQL storage, "
            "reduced report generation latency by 30%, and shipped API tests."
        ),
        allow_external_model=True,
    )


def test_resume_analysis_uses_llm_when_provider_is_enabled(monkeypatch):
    calls: list[tuple[str, str]] = []

    def fake_complete(system_prompt, user_prompt, settings, transport=None):
        calls.append((system_prompt, user_prompt))
        return json.dumps(
            {
                "score": 89,
                "ats_score": 86,
                "keyword_match": 83,
                "issues": ["Backend impact is present but architecture context can be clearer."],
                "suggestions": ["Add API scale, data volume, and deployment details."],
                "improved_fragments": [
                    "Built a FastAPI career service with SQL persistence, API tests, and 30% lower report latency."
                ],
            }
        )

    monkeypatch.setattr(
        resume_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(resume_graph.llm_client, "complete", fake_complete)

    analysis = resume_graph.analyze_resume(request_payload())

    assert calls
    assert analysis.score == 89
    assert analysis.ats_score == 86
    assert analysis.keyword_match == 83
    assert analysis.improved_fragments[0].startswith("Built a FastAPI career service")


def test_resume_analysis_falls_back_when_llm_fails(monkeypatch):
    def failing_complete(system_prompt, user_prompt, settings, transport=None):
        raise LlmClientError("provider unavailable")

    monkeypatch.setattr(
        resume_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(resume_graph.llm_client, "complete", failing_complete)

    analysis = resume_graph.analyze_resume(request_payload())

    assert analysis.score >= 78
    assert analysis.ats_score >= 70
    assert "Project experience needs clearer business context." in analysis.issues


def test_resume_llm_fallback_is_logged_without_private_resume_text(monkeypatch, caplog):
    payload = request_payload()

    def failing_complete(system_prompt, user_prompt, settings, transport=None):
        raise LlmClientError("provider unavailable")

    monkeypatch.setattr(
        resume_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(resume_graph.llm_client, "complete", failing_complete)

    token = set_trace_id("trace-resume-fallback")
    try:
        with caplog.at_level("WARNING", logger="app.agents.llm_fallback"):
            analysis = resume_graph.analyze_resume(payload)
    finally:
        reset_trace_id(token)

    fallback_records = [record for record in caplog.records if record.name == "app.agents.llm_fallback"]
    assert fallback_records
    record = fallback_records[-1]
    assert record.workflow == "resume_analysis"
    assert record.trace_id == "trace-resume-fallback"
    assert record.error_type == "LlmClientError"
    assert analysis.score >= 78
    assert payload.resume_text not in caplog.text
    assert "FastAPI career service" not in caplog.text


def test_resume_baseline_detects_chinese_project_keyword(monkeypatch):
    monkeypatch.setattr(resume_graph, "get_settings", lambda: Settings(llm_provider="mock"))

    analysis = resume_graph.analyze_resume(
        ResumeAnalysisRequest(
            request_id="cn-resume",
            user_id="user-001",
            target_role="Backend developer",
            resume_text="\u9879\u76ee: built a Spring Boot recommendation API with 12 endpoints.",
        )
    )

    assert analysis.score >= 78
