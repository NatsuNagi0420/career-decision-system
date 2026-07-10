from typing import Any

import anyio
import httpx

from app.main import app

DEFAULT_INTERNAL_TOKEN = "change-me"


def api_get(
    path: str,
    *,
    headers: dict[str, str] | None = None,
    internal_token: bool = True,
    **kwargs: Any,
) -> httpx.Response:
    return _request("GET", path, headers=headers, internal_token=internal_token, **kwargs)


def api_post(
    path: str,
    *,
    headers: dict[str, str] | None = None,
    internal_token: bool = True,
    **kwargs: Any,
) -> httpx.Response:
    return _request("POST", path, headers=headers, internal_token=internal_token, **kwargs)


def _request(
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None,
    internal_token: bool,
    **kwargs: Any,
) -> httpx.Response:
    async def run_request() -> httpx.Response:
        request_headers: dict[str, str] = {}
        if internal_token:
            request_headers["X-Internal-Token"] = DEFAULT_INTERNAL_TOKEN
        if headers:
            request_headers.update(headers)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=request_headers) as client:
            return await client.request(method, path, **kwargs)

    return anyio.run(run_request)
