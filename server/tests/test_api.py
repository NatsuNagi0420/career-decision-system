from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.capabilities.registry import CAPABILITIES
from app.config import Settings
from app.db.models import Run, User
from app.main import create_app


@pytest.fixture
def client(settings: Settings, engine) -> TestClient:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def register(client: TestClient, username: str = "student", *, consent: bool = False) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "long-enough-1", "external_ai_consent": consent},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_health_reports_readiness(client: TestClient) -> None:
    body = client.get("/healthz").json()
    assert body["ok"] is True and body["issues"] == []


def test_unauthenticated_requests_are_rejected(client: TestClient) -> None:
    anonymous = client.get("/api/v1/capabilities")
    assert anonymous.status_code == 401
    assert "登录" in anonymous.json()["detail"]


def test_duplicate_username_is_a_clear_conflict(client: TestClient) -> None:
    register(client, "dup")
    response = client.post("/api/v1/auth/register", json={"username": "dup", "password": "long-enough-1"})
    assert response.status_code == 400
    assert "已经被注册" in response.json()["detail"]


def test_login_rejects_a_bad_password(client: TestClient) -> None:
    register(client, "keeper")
    response = client.post("/api/v1/auth/login", json={"username": "keeper", "password": "wrong-password"})
    assert response.status_code == 401
    assert "密码" in response.json()["detail"]


def test_capabilities_expose_what_is_actually_wired(client: TestClient) -> None:
    """The picker holds exactly the capabilities a student can ask for and the agent can
    finish — no self-test plumbing, and nothing still marked planned."""
    body = client.get("/api/v1/capabilities", headers=register(client)).json()
    listed = {item["id"] for item in body}
    assert listed == {spec.id for spec in CAPABILITIES if not spec.internal}
    assert "skeleton_probe" not in listed

    implemented = {item["id"] for item in body if item["status"] == "implemented"}
    assert implemented == {
        "profile_diagnose",
        "direction_explore",
        "decision_frame",
        "candidate_source",
        "evidence_collect",
        "compare_decide",
        "action_plan",
        "weekly_review",
    }
    # Nothing the agent cannot actually finish may be advertised as live.
    assert "resume_build" not in implemented


def test_consent_can_be_granted_and_revoked(client: TestClient) -> None:
    headers = register(client, "granter")
    assert client.get("/api/v1/capabilities", headers=headers).status_code == 200
    granted = client.post("/api/v1/auth/ai-consent", json={"granted": True}, headers=headers).json()
    assert granted["external_ai_consent"] is True
    revoked = client.post("/api/v1/auth/ai-consent", json={"granted": False}, headers=headers).json()
    assert revoked["external_ai_consent"] is False


def test_one_user_cannot_read_another_users_run(client: TestClient, session_factory: sessionmaker[Session]) -> None:
    owner_headers = register(client, "ownerone")
    intruder_headers = register(client, "intruder")
    with session_factory() as session:
        owner = session.scalar(select(User).where(User.username == "ownerone"))
        run = Run(thread_id="t-other", user_id=owner.id, goal="别人的目标", capability_id="skeleton_probe", status="created")
        session.add(run)
        session.commit()
        run_id = run.id
    assert client.get(f"/api/v1/runs/{run_id}", headers=intruder_headers).status_code == 404
    assert client.get(f"/api/v1/runs/{run_id}", headers=owner_headers).status_code == 200


def test_a_form_error_comes_back_as_a_sentence(client: TestClient) -> None:
    """A 422 is the most-likely-to-be-seen message in the API, and pydantic's default body
    is an English structure dump. The status stays; only the prose changes."""
    short = client.post("/api/v1/auth/register", json={"username": "p46", "password": "abc"})
    assert short.status_code == 422
    assert short.json()["detail"] == "密码：至少 8 个字符"

    missing = client.post("/api/v1/auth/register", json={"username": "p46"})
    assert missing.status_code == 422 and missing.json()["detail"] == "密码：不能不填"


def test_a_field_the_label_table_does_not_know_still_reads_in_chinese(client: TestClient) -> None:
    """Unknown field names keep their own name — the sentence has to point somewhere the
    person can find on the form — but the reason never comes back as pydantic English."""
    odd = client.get(
        "/api/v1/runs/00000000000000000000000000000000/events",
        params={"after_seq": "not-a-number"},
        headers=register(client, "p46odd"),
    )
    assert odd.status_code == 422
    detail = odd.json()["detail"]
    assert "整数" in detail and "after_seq" in detail


def test_the_404_for_another_users_run_is_word_for_word_the_missing_one(
    client: TestClient, session_factory: sessionmaker[Session]
) -> None:
    """Rewording a rejection must not turn it into an existence oracle.

    The two answers are compared against each other rather than against a string, so any
    future rewording keeps the property by construction.
    """
    register(client, "vault")
    intruder_headers = register(client, "peeker")
    with session_factory() as session:
        owner = session.scalar(select(User).where(User.username == "vault"))
        run = Run(thread_id="t-vault", user_id=owner.id, goal="她的目标", capability_id="skeleton_probe", status="created")
        session.add(run)
        session.commit()
        theirs = run.id

    intruding = client.get(f"/api/v1/runs/{theirs}", headers=intruder_headers)
    absent = client.get(f"/api/v1/runs/{'0' * 32}", headers=intruder_headers)
    assert intruding.status_code == absent.status_code == 404
    assert intruding.json()["detail"] == absent.json()["detail"]
