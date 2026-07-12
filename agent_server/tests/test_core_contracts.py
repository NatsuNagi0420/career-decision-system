from collections.abc import Mapping
from typing import Any

from tests.http_client import api_post


def assert_success_response(body: Mapping[str, Any]) -> Mapping[str, Any]:
    assert set(body) == {"code", "message", "data", "timestamp", "trace_id"}
    assert body["code"] == 0
    assert body["message"] == "success"
    assert isinstance(body["timestamp"], int)
    assert body["timestamp"] > 0
    assert body["trace_id"] is None or isinstance(body["trace_id"], str)
    assert isinstance(body["data"], dict)
    return body["data"]


def assert_non_empty_strings(values: list[str]) -> None:
    assert values
    assert all(isinstance(value, str) and value.strip() for value in values)


def test_career_report_contract_has_recommendations_and_next_actions():
    response = api_post(
        "/api/v1/career-reports/generate",
        json={
            "request_id": "contract-career-report",
            "user_id": "user-001",
            "profile": {
                "name": "Alex",
                "identity": "graduate",
                "major": "Computer Science",
                "target_role": "AI application engineer",
                "target_cities": ["Shanghai", "Hangzhou"],
                "skills": ["Python", "FastAPI", "SQL", "Prompt engineering"],
                "experiences": ["Built an AI career planning MVP"],
                "values": ["growth", "impact"],
            },
            "assessment": {
                "mbti_type": "ENTJ",
                "interests": ["AI products", "developer tools"],
                "strengths": ["Structured thinking", "Fast learning"],
                "weaknesses": ["Needs more interview practice"],
            },
        },
    )

    assert response.status_code == 200
    data = assert_success_response(response.json())
    assert set(data) == {
        "summary",
        "profile_tags",
        "strengths",
        "risks",
        "recommended_careers",
        "skill_gaps",
        "next_actions",
        "confidence",
    }
    assert "AI application engineer" in data["summary"]
    assert "Computer Science" in data["profile_tags"]
    assert "AI application engineer" in data["profile_tags"]
    assert_non_empty_strings(data["strengths"])
    assert_non_empty_strings(data["risks"])
    assert_non_empty_strings(data["next_actions"])
    assert isinstance(data["confidence"], float)
    assert 0 <= data["confidence"] <= 1

    careers = data["recommended_careers"]
    assert isinstance(careers, list)
    assert len(careers) >= 3
    first_career = careers[0]
    assert set(first_career) == {"title", "match_score", "reasons", "core_skills", "risks"}
    assert first_career["title"] == "AI application engineer"
    assert isinstance(first_career["match_score"], int)
    assert 0 <= first_career["match_score"] <= 100
    assert_non_empty_strings(first_career["reasons"])
    assert_non_empty_strings(first_career["core_skills"])
    assert_non_empty_strings(first_career["risks"])

    skill_gaps = data["skill_gaps"]
    assert isinstance(skill_gaps, list)
    assert skill_gaps
    assert set(skill_gaps[0]) == {"skill", "priority", "suggestion"}
    assert skill_gaps[0]["skill"].strip()
    assert skill_gaps[0]["priority"].strip()
    assert skill_gaps[0]["suggestion"].strip()


def test_career_report_uses_real_job_candidates_when_provided():
    response = api_post(
        "/api/v1/career-reports/generate",
        json={
            "request_id": "contract-career-report-with-jobs",
            "user_id": "user-001",
            "profile": {
                "name": "Alex",
                "target_role": "AI engineer",
                "skills": ["Python", "RAG"],
            },
            "assessment": {
                "mbti_type": "INTJ",
                "strengths": ["Structured thinking"],
            },
            "job_candidates": [
                {
                    "id": 1003,
                    "title": "AI application engineer",
                    "company": "Zhixing AI",
                    "location": "Shenzhen",
                    "direction": "AI application",
                    "salary_range": "22k-36k",
                    "industry": "Artificial intelligence",
                    "match_score": 91,
                    "reasons": ["Role direction matches", "Python appears in requirements"],
                    "core_skills": ["Python", "RAG", "LLM"],
                }
            ],
        },
    )

    assert response.status_code == 200
    data = assert_success_response(response.json())
    assert "real imported job candidates" in data["summary"]
    assert data["recommended_careers"][0]["title"] == "AI application engineer"
    assert data["recommended_careers"][0]["match_score"] == 91
    assert "Real job sample from Zhixing AI" in data["recommended_careers"][0]["reasons"]


def test_profile_contract_has_scores_tags_and_radar():
    response = api_post(
        "/api/v1/profiles/generate",
        json={
            "request_id": "contract-profile",
            "user_id": "user-001",
            "profile": {
                "name": "Alex",
                "identity": "graduate",
                "major": "Software Engineering",
                "target_role": "Backend developer",
                "skills": ["Python", "FastAPI", "SQL", "Docker"],
                "experiences": ["Built a REST API and deployed it"],
            },
            "assessment": {
                "mbti_type": "INTJ",
                "strengths": ["System design awareness", "Reliable execution"],
            },
        },
    )

    assert response.status_code == 200
    data = assert_success_response(response.json())
    assert set(data) == {
        "completeness_score",
        "competitiveness_stars",
        "tags",
        "radar",
        "strengths",
        "suggestions",
    }
    assert isinstance(data["completeness_score"], int)
    assert 0 <= data["completeness_score"] <= 100
    assert isinstance(data["competitiveness_stars"], int)
    assert 1 <= data["competitiveness_stars"] <= 5
    assert "Software Engineering" in data["tags"]
    assert "Backend developer" in data["tags"]
    assert "Python" in data["tags"]
    assert_non_empty_strings(data["strengths"])
    assert_non_empty_strings(data["suggestions"])

    radar = data["radar"]
    assert isinstance(radar, list)
    assert len(radar) >= 5
    for point in radar:
        assert set(point) == {"name", "value"}
        assert isinstance(point["name"], str) and point["name"].strip()
        assert isinstance(point["value"], int)
        assert 0 <= point["value"] <= 100


def test_chat_contract_returns_reply_intent_and_action():
    response = api_post(
        "/api/v1/chat/messages",
        json={
            "request_id": "contract-chat",
            "user_id": "user-001",
            "page": "resume",
            "message": "Please review my resume for a backend developer role.",
            "context": {"target_role": "Backend developer"},
        },
    )

    assert response.status_code == 200
    data = assert_success_response(response.json())
    assert set(data) == {
        "generationMode",
        "modelName",
        "confidence",
        "responseMode",
        "usedPersonalContext",
        "reply",
        "evidenceBasis",
        "uncertainties",
        "nextStep",
        "actions",
        "intent",
    }
    assert isinstance(data["reply"], str)
    assert data["generationMode"] == "fallback"
    assert data["responseMode"] == "coaching"
    assert data["usedPersonalContext"] is True
    assert 0 <= data["confidence"] <= 1
    assert data["evidenceBasis"]
    assert data["uncertainties"]
    assert data["nextStep"]
    assert data["intent"] == "resume_advice"

    actions = data["actions"]
    assert isinstance(actions, list)
    assert actions
    assert set(actions[0]) == {"label", "action"}
    assert actions[0]["label"].strip()
    assert actions[0]["action"] == "go:resume"


def test_direct_chat_contract_omits_coaching_content_and_personal_context():
    response = api_post(
        "/api/v1/chat/messages",
        json={
            "request_id": "contract-chat-identity",
            "user_id": "user-001",
            "page": "dashboard",
            "message": "你是什么模型？",
            "context": {"target_role": "Backend developer"},
        },
    )

    assert response.status_code == 200
    data = assert_success_response(response.json())
    assert data["intent"] == "model_identity"
    assert data["responseMode"] == "direct"
    assert data["usedPersonalContext"] is False
    assert data["evidenceBasis"] == []
    assert data["uncertainties"] == []
    assert data["nextStep"] is None
    assert data["actions"] == []


def test_resume_contract_has_scores_issues_and_improved_fragments():
    response = api_post(
        "/api/v1/resumes/analyze",
        json={
            "request_id": "contract-resume",
            "user_id": "user-001",
            "target_role": "Backend developer",
            "resume_text": (
                "Project: Built a FastAPI career service with SQL storage, reduced report generation latency by 30%, and shipped API tests."
            ),
        },
    )

    assert response.status_code == 200
    data = assert_success_response(response.json())
    assert set(data) == {
        "score",
        "ats_score",
        "keyword_match",
        "issues",
        "suggestions",
        "improved_fragments",
    }
    for score_field in ("score", "ats_score", "keyword_match"):
        assert isinstance(data[score_field], int)
        assert 0 <= data[score_field] <= 100
    assert data["score"] >= 78
    assert data["ats_score"] >= 70
    assert data["keyword_match"] >= 70
    assert_non_empty_strings(data["issues"])
    assert_non_empty_strings(data["suggestions"])
    assert_non_empty_strings(data["improved_fragments"])


def test_path_plan_contract_has_targeted_milestones_and_checkpoints():
    response = api_post(
        "/api/v1/path-plans/generate",
        json={
            "request_id": "contract-path-plan",
            "user_id": "user-001",
            "target_role": "Backend developer",
            "profile": {
                "name": "Alex",
                "major": "Software Engineering",
                "skills": ["Python", "FastAPI", "SQL"],
            },
        },
    )

    assert response.status_code == 200
    data = assert_success_response(response.json())
    assert set(data) == {"target_role", "overview", "milestones", "checkpoints"}
    assert data["target_role"] == "Backend developer"
    assert "Backend developer" in data["overview"]
    assert_non_empty_strings(data["checkpoints"])

    milestones = data["milestones"]
    assert isinstance(milestones, list)
    assert len(milestones) >= 3
    for milestone in milestones:
        assert set(milestone) == {"title", "duration", "tasks", "acceptance"}
        assert isinstance(milestone["title"], str) and milestone["title"].strip()
        assert isinstance(milestone["duration"], str) and milestone["duration"].strip()
        assert_non_empty_strings(milestone["tasks"])
        assert_non_empty_strings(milestone["acceptance"])
