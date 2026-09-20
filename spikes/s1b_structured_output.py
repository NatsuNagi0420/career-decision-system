"""S1 follow-up: the json_object probe came back with EMPTY content. Distinguish
"json_object unsupported" from "max_tokens exhausted by reasoning tokens".

Never prints the API key.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ENV = dotenv_values(ROOT / "agent_server" / ".env")
BASE = (ENV.get("LLM_BASE_URL") or "https://api.deepseek.com").rstrip("/")
MODEL = ENV.get("LLM_MODEL") or "deepseek-flash"
KEY = ENV.get("LLM_API_KEY") or ""

SCHEMA_HINT = '只输出 JSON，字段：candidate(string), score(integer 0-100), risks(array of string)。'


def one(label: str, extra: dict[str, Any], content: str) -> dict[str, Any]:
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.2,
        **extra,
    }
    r = httpx.post(
        f"{BASE}/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        timeout=120.0,
    )
    if r.status_code != 200:
        return {"probe": label, "http": r.status_code, "detail": r.text[:200]}
    data = r.json()
    ch = data["choices"][0]
    msg = ch["message"]
    reasoning = msg.get("reasoning_content")
    body = msg.get("content")
    out: dict[str, Any] = {
        "probe": label,
        "finish_reason": ch.get("finish_reason"),
        "content_len": len(body or ""),
        "reasoning_len": len(reasoning or "") if reasoning else 0,
        "usage": data.get("usage"),
    }
    if body:
        try:
            parsed = json.loads(body)
            out["json_parses"] = True
            out["keys"] = sorted(parsed) if isinstance(parsed, dict) else type(parsed).__name__
        except ValueError:
            out["json_parses"] = False
            out["raw_head"] = body[:100]
    return out


def main() -> None:
    if not KEY:
        print("!! no key; aborting")
        raise SystemExit(2)
    probes = [
        # reproduce the original failure shape
        ("json_object_maxtokens300", {"response_format": {"type": "json_object"}, "max_tokens": 300}, SCHEMA_HINT),
        # same but with room for reasoning
        ("json_object_maxtokens2000", {"response_format": {"type": "json_object"}, "max_tokens": 2000}, SCHEMA_HINT),
        # plain text mode, small budget: is empty content a budget artifact in general?
        ("no_response_format_maxtokens300", {"max_tokens": 300}, SCHEMA_HINT),
        # does the model obey the schema without any response_format at all?
        ("prompt_only_strict_hint", {"max_tokens": 2000}, SCHEMA_HINT + " 不要输出任何 JSON 之外的字符。"),
        # does thinking disabled change it? (probe a DeepSeek-style switch)
        ("json_object_no_thinking", {"response_format": {"type": "json_object"}, "max_tokens": 2000, "thinking": {"type": "disabled"}}, SCHEMA_HINT),
    ]
    for label, extra, content in probes:
        try:
            print(json.dumps(one(label, extra, content), ensure_ascii=False))
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"probe": label, "error": f"{type(exc).__name__}: {str(exc)[:200]}"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
