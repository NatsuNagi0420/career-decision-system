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
    assert client.get("/api/v1/capabilities").status_code == 401


def test_duplicate_username_is_a_clear_conflict(client: TestClient) -> None:
    register(client, "dup")
    response = client.post("/api/v1/auth/register", json={"username": "dup", "password": "long-enough-1"})
    assert response.status_code == 400
    assert "taken" in response.json()["detail"]


def test_login_rejects_a_bad_password(client: TestClient) -> None:
    register(client, "keeper")
    response = client.post("/api/v1/auth/login", json={"username": "keeper", "password": "wrong-password"})
    assert response.status_code == 401


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
    }
    # Nothing the agent cannot actually finish may be advertised as live.
    assert "weekly_review" not in implemented and "resume_build" not in implemented


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
