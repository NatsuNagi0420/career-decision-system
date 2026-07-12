import json

from app.agents import profile_graph
from app.config.settings import Settings
from app.schemas.profile import AssessmentSnapshot, CapabilityProfileRequest, UserProfile
from app.services.llm_client import LlmClientError


def request_payload() -> CapabilityProfileRequest:
    return CapabilityProfileRequest(
        request_id="llm-profile",
        user_id="user-001",
        allow_external_model=True,
        profile=UserProfile(
            identity="graduate",
            major="Software Engineering",
            target_role="Backend developer",
            skills=["Spring Boot", "SQL", "Redis", "Docker"],
            experiences=["Built a REST API and deployed it"],
        ),
        assessment=AssessmentSnapshot(
            mbti_type="INTJ",
            strengths=["System design awareness"],
            weaknesses=["Needs more interview practice"],
        ),
    )


def test_profile_uses_llm_when_provider_is_enabled(monkeypatch):
    calls: list[tuple[str, str]] = []

    def fake_complete(system_prompt, user_prompt, settings, transport=None):
        calls.append((system_prompt, user_prompt))
        return json.dumps(
            {
                "completeness_score": 88,
                "competitiveness_stars": 4,
                "tags": ["Backend developer", "Spring Boot", "SQL", "INTJ"],
                "radar": [
                    {"name": "Backend engineering", "value": 86},
                    {"name": "Project evidence", "value": 82},
                    {"name": "Interview readiness", "value": 70},
                ],
                "strengths": ["Backend target is clear", "Project evidence already exists"],
                "suggestions": ["Add deployment metrics", "Prepare two system design stories"],
            }
        )

    monkeypatch.setattr(
        profile_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(profile_graph.llm_client, "complete", fake_complete)

    response = profile_graph.generate_profile(request_payload())

    assert calls
    assert response.completeness_score == 88
    assert response.competitiveness_stars == 4
    assert "Spring Boot" in response.tags
    assert response.radar[0].name == "Backend engineering"
    assert response.suggestions[0] == "Add deployment metrics"


def test_profile_falls_back_when_llm_fails(monkeypatch):
    def failing_complete(system_prompt, user_prompt, settings, transport=None):
        raise LlmClientError("provider unavailable")

    monkeypatch.setattr(
        profile_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(profile_graph.llm_client, "complete", failing_complete)

    response = profile_graph.generate_profile(request_payload())

    assert response.completeness_score >= 80
    assert response.competitiveness_stars == 4
    assert "Software Engineering" in response.tags
    assert "System design awareness" in response.strengths


def test_profile_normalizes_weak_llm_output(monkeypatch):
    def weak_complete(system_prompt, user_prompt, settings, transport=None):
        return json.dumps(
            {
                "completeness_score": 150,
                "competitiveness_stars": 9,
                "tags": ["  ", "  Backend developer  "],
                "radar": [
                    {"name": "  ", "value": 80},
                    {"name": "  Technical skill  ", "value": -5},
                ],
                "strengths": [""],
                "suggestions": ["  Add metrics  "],
            }
        )

    monkeypatch.setattr(
        profile_graph,
        "get_settings",
        lambda: Settings(llm_provider="openai_compatible", llm_api_key="test-key", llm_model="career-model"),
    )
    monkeypatch.setattr(profile_graph.llm_client, "complete", weak_complete)

    response = profile_graph.generate_profile(request_payload())

    assert response.completeness_score == 100
    assert response.competitiveness_stars == 5
    assert response.tags == ["Backend developer"]
    assert response.radar[0].name == "Technical skill"
    assert response.radar[0].value == 0
    assert "System design awareness" in response.strengths
    assert response.suggestions == ["Add metrics"]
