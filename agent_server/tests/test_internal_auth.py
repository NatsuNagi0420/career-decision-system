from tests.http_client import api_get, api_post


def test_health_does_not_require_internal_token():
    response = api_get("/api/v1/health", headers={"X-Request-ID": "auth-health-001"}, internal_token=False)

    assert response.status_code == 200
    assert response.json()["code"] == 0
    assert response.headers["X-Trace-ID"] == "auth-health-001"


def test_business_endpoint_requires_internal_token():
    response = api_post(
        "/api/v1/chat/messages",
        headers={"X-Request-ID": "auth-missing-001"},
        internal_token=False,
        json={
            "request_id": "auth-missing-body",
            "user_id": "user-001",
            "page": "dashboard",
            "message": "Please review my plan.",
        },
    )

    assert response.status_code == 401
    body = response.json()
    assert body["code"] == 401
    assert body["message"] == "Unauthorized agent request"
    assert body["data"] is None
    assert body["trace_id"] == "auth-missing-001"
    assert response.headers["X-Trace-ID"] == "auth-missing-001"


def test_business_endpoint_rejects_wrong_internal_token():
    response = api_post(
        "/api/v1/chat/messages",
        headers={"X-Request-ID": "auth-wrong-001", "X-Internal-Token": "wrong-token"},
        json={
            "request_id": "auth-wrong-body",
            "user_id": "user-001",
            "page": "dashboard",
            "message": "Please review my plan.",
        },
    )

    assert response.status_code == 401
    assert response.json()["trace_id"] == "auth-wrong-001"


def test_business_endpoint_accepts_valid_internal_token():
    response = api_post(
        "/api/v1/chat/messages",
        json={
            "request_id": "auth-valid-001",
            "user_id": "user-001",
            "page": "dashboard",
            "message": "Please review my plan.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["trace_id"] == "auth-valid-001"
    assert response.headers["X-Trace-ID"] == "auth-valid-001"
