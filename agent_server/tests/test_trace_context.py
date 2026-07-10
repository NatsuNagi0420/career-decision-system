from tests.http_client import api_get, api_post


def test_business_request_id_becomes_trace_id():
    response = api_post(
        "/api/v1/chat/messages",
        json={
            "request_id": "trace-chat-001",
            "user_id": "user-001",
            "page": "dashboard",
            "message": "Please review my resume.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["trace_id"] == "trace-chat-001"
    assert response.headers["X-Trace-ID"] == "trace-chat-001"


def test_header_request_id_is_used_when_body_request_id_is_absent():
    response = api_get("/api/v1/health", headers={"X-Request-ID": "trace-health-001"}, internal_token=False)

    assert response.status_code == 200
    body = response.json()
    assert body["trace_id"] == "trace-health-001"
    assert response.headers["X-Trace-ID"] == "trace-health-001"


def test_validation_error_uses_envelope_and_trace_header():
    response = api_post(
        "/api/v1/resumes/analyze",
        headers={"X-Request-ID": "trace-invalid-001"},
        json={"request_id": "invalid-resume"},
    )

    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"code", "message", "data", "timestamp", "trace_id"}
    assert body["code"] == 422
    assert body["message"] == "Validation failed"
    assert body["data"] is None
    assert body["trace_id"] == "trace-invalid-001"
    assert response.headers["X-Trace-ID"] == "trace-invalid-001"
