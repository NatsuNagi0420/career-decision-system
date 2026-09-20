"""S1 spike: measure real tool-calling / structured-output behaviour of the configured
OpenAI-compatible model. Throwaway probe, not product code.

Never prints the API key. Run: agent_server/.venv/python.exe spikes/s1_model_capability.py
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ENV = dotenv_values(ROOT / "agent_server" / ".env")
BASE_URL = (ENV.get("LLM_BASE_URL") or "https://api.deepseek.com").rstrip("/")
MODEL = ENV.get("LLM_MODEL") or "deepseek-flash"
KEY = os.environ.get("LLM_API_KEY") or ENV.get("LLM_API_KEY") or ""

MAX_TOKENS = 700
TIMEOUT = 90.0
call_count = 0
usage_total = {"prompt": 0, "completion": 0, "cached": 0}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_user_profile",
            "description": "读取当前用户的职业画像事实。只需要查画像时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "fields": {
                        "type": "array",
                        "items": {"type": "string", "enum": ["values", "interests", "skills", "constraints"]},
                    }
                },
                "required": ["fields"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_candidates",
            "description": "列出某决策项目下的候选职业。参数 project_id 为整数。",
            "parameters": {
                "type": "object",
                "properties": {"project_id": {"type": "integer"}},
                "required": ["project_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_job_samples",
            "description": "取某候选职业的真实岗位样本。参数 candidate_id 整数，limit 整数 1-10。",
            "parameters": {
                "type": "object",
                "properties": {"candidate_id": {"type": "integer"}, "limit": {"type": "integer"}},
                "required": ["candidate_id", "limit"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_skill_evidence",
            "description": "取某项目下与主题相关的已收集证据。",
            "parameters": {
                "type": "object",
                "properties": {"project_id": {"type": "integer"}, "topic": {"type": "string"}},
                "required": ["project_id", "topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_candidates",
            "description": "按标准对比候选职业，返回结论。",
            "parameters": {
                "type": "object",
                "properties": {"project_id": {"type": "integer"}, "criteria": {"type": "array", "items": {"type": "string"}}},
                "required": ["project_id", "criteria"],
            },
        },
    },
]

TOOL_NAMES = {t["function"]["name"] for t in TOOLS}

# Fake tool backend: returns deterministic fixtures so we can tell whether the model
# actually passed the ids it was told about (grounding) vs invented them.
FIXTURES = {
    "get_user_profile": {"interests": ["数据", "写代码"], "values": ["稳定", "成长"], "skills": ["Python"], "constraints": ["必须留在广州"]},
    "list_candidates": [{"id": 77, "name": "数据分析师"}, {"id": 81, "name": "后端工程师"}, {"id": 93, "name": "产品经理"}],
    "get_job_samples": [{"title": "初级数据分析", "city": "广州", "salary": "9-13k"}],
    "get_skill_evidence": {"topic": "SQL", "found": False, "note": "该项目暂无 SQL 相关证据"},
    "compare_candidates": {"verdict": "后端工程师更匹配", "dataCoverage": 34},
}


def call(payload: dict[str, Any]) -> tuple[dict[str, Any], int]:
    global call_count
    call_count += 1
    t0 = time.time()
    r = httpx.post(
        f"{BASE_URL}/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    return r.json(), int((time.time() - t0) * 1000)


def record_usage(u: dict[str, Any] | None) -> None:
    if not u:
        return
    usage_total["prompt"] += u.get("prompt_tokens", 0)
    usage_total["completion"] += u.get("completion_tokens", 0)
    ptd = u.get("prompt_tokens_details") or {}
    usage_total["cached"] += ptd.get("cached_tokens", 0)


def validate_args(name: str, args: dict[str, Any]) -> list[str]:
    """Hand-rolled schema check: required keys + types + enum membership."""
    spec = next(t["function"]["parameters"] for t in TOOLS if t["function"]["name"] == name)
    errs: list[str] = []
    for req in spec.get("required", []):
        if req not in args:
            errs.append(f"missing:{req}")
    for key, val in args.items():
        prop = spec["properties"].get(key)
        if prop is None:
            errs.append(f"unknown:{key}")
            continue
        ptype = prop.get("type")
        if ptype == "integer" and not isinstance(val, int):
            errs.append(f"type:{key}")
        if ptype == "string" and not isinstance(val, str):
            errs.append(f"type:{key}")
        if ptype == "array":
            if not isinstance(val, list):
                errs.append(f"type:{key}")
            else:
                item_enum = (prop.get("items") or {}).get("enum")
                if item_enum and any(v not in item_enum for v in val):
                    errs.append(f"enum:{key}")
                str_enum = prop.get("enum")
                if str_enum and any(v not in str_enum for v in val):
                    errs.append(f"enum:{key}")
        if key == "limit" and isinstance(val, int) and not 1 <= val <= 10:
            errs.append("range:limit")
    return errs


def run_case(case_id: str, user_text: str, expect_tools: set[str], expect_final: bool) -> dict[str, Any]:
    messages = [
        {"role": "system", "content": "你是职业决策 Agent。只有需要信息时才调用工具；工具返回足够时直接给结论，不要重复调用同一工具。"},
        {"role": "user", "content": user_text},
    ]
    invoked: list[str] = []
    schema_errors: list[str] = []
    parallel_turns = 0
    rounds = 0
    final_text = ""
    max_rounds_hit = False

    while rounds < 6:
        rounds += 1
        payload = {
            "model": MODEL,
            "messages": messages,
            "tools": TOOLS,
            "tool_choice": "auto",
            "temperature": 0.2,
            "max_tokens": MAX_TOKENS,
        }
        try:
            data, _ = call(payload)
        except httpx.HTTPStatusError as exc:
            return {"case": case_id, "fatal": f"HTTP {exc.response.status_code}: {exc.response.text[:180]}"}
        choice = data["choices"][0]
        msg = choice["message"]
        record_usage(data.get("usage"))
        tcs = msg.get("tool_calls") or []
        if len(tcs) > 1:
            parallel_turns += 1
        if not tcs:
            final_text = (msg.get("content") or "").strip()
            break
        messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": tcs})
        for tc in tcs:
            name = tc["function"]["name"]
            invoked.append(name)
            raw = tc["function"].get("arguments") or "{}"
            try:
                args = json.loads(raw) if isinstance(raw, str) else raw
                if not isinstance(args, dict):
                    raise ValueError("args not object")
            except (ValueError, TypeError) as exc:
                schema_errors.append(f"json:{name}:{exc}")
                args = {}
            else:
                schema_errors.extend(validate_args(name, args))
            fixture = FIXTURES.get(name, {})
            messages.append({"role": "tool", "tool_call_id": tc.get("id", ""), "content": json.dumps(fixture, ensure_ascii=False)})
    else:
        max_rounds_hit = True

    return {
        "case": case_id,
        "rounds": rounds,
        "invoked": invoked,
        "expected_any_of": sorted(expect_tools),
        "hit_expectation": bool(expect_tools & set(invoked)) if expect_tools else not invoked,
        "schema_errors": schema_errors,
        "parallel_turns": parallel_turns,
        "final_present": bool(final_text) if expect_final else True,
        "max_rounds_hit": max_rounds_hit,
        "final_excerpt": final_text[:120],
    }


CASES = [
    ("c01_single_candidate", "项目 12 里现在有哪些候选职业？直接回答。", {"list_candidates"}, True),
    ("c02_two_step_chain", "帮我看看项目 12 的候选职业，并取第一名候选的真实岗位样本，告诉我广州有什么岗位。", {"list_candidates", "get_job_samples"}, True),
    ("c03_parallel_independent", "分别查一下：项目 12 有哪些候选职业，以及我的职业画像里的 interests 和 constraints。两件相互独立，请一起查。", {"list_candidates", "get_user_profile"}, True),
    ("c04_evidence_then_conclude", "项目 12 里关于 SQL 我有什么证据？如果没证据就直接说没有，不要编。", {"get_skill_evidence"}, True),
    ("c05_compare_with_criteria", "用『薪资』和『成长』两个标准对比项目 12 的候选职业，给我一个结论。", {"compare_candidates"}, True),
    ("c06_three_step_grounding", "项目 12 的候选里哪个更适合我？先看候选，再看我的画像约束，最后对比给出结论。", {"list_candidates", "get_user_profile", "compare_candidates"}, True),
    ("c07_no_tool_needed", "你好，简单说一下你能做什么，不需要查任何数据。", set(), True),
    ("c08_enum_discipline", "我的画像里 interests 和 values 分别是什么？注意 skills 和 constraints 不要查。", {"get_user_profile"}, True),
    ("c09_missing_param_ask", "帮我看看候选职业。", {"list_candidates"}, True),
    ("c10_overcall_trap", "项目 12 有哪些候选职业？只要名字列表，不要调用其它任何工具。", {"list_candidates"}, True),
]


def probe_json_mode() -> dict[str, Any]:
    out: dict[str, Any] = {}
    base = {
        "model": MODEL,
        "messages": [{"role": "user", "content": '给出一个候选职业评估。必须只输出 JSON，字段：candidate(string), score(integer 0-100), risks(array of string)。'}],
        "max_tokens": 300,
        "temperature": 0.2,
    }
    try:
        data, _ = call({**base, "response_format": {"type": "json_object"}})
        record_usage(data.get("usage"))
        txt = data["choices"][0]["message"]["content"] or ""
        try:
            parsed = json.loads(txt)
            out["json_object"] = {"ok": True, "keys": sorted(parsed.keys()) if isinstance(parsed, dict) else "not-object"}
        except ValueError:
            out["json_object"] = {"ok": False, "raw": txt[:120]}
    except httpx.HTTPStatusError as exc:
        out["json_object"] = {"ok": False, "http": exc.response.status_code, "detail": exc.response.text[:180]}

    schema = {
        "type": "object",
        "properties": {
            "candidate": {"type": "string"},
            "score": {"type": "integer", "minimum": 0, "maximum": 100},
            "risks": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["candidate", "score", "risks"],
        "additionalProperties": False,
    }
    try:
        data, _ = call({**base, "response_format": {"type": "json_schema", "json_schema": {"name": "eval", "schema": schema, "strict": True}}})
        record_usage(data.get("usage"))
        txt = data["choices"][0]["message"]["content"] or ""
        try:
            parsed = json.loads(txt)
            keys_ok = isinstance(parsed, dict) and set(parsed) == {"candidate", "score", "risks"}
            out["json_schema_strict"] = {"accepted": True, "schema_conformant": keys_ok, "keys": sorted(parsed) if isinstance(parsed, dict) else None}
        except ValueError:
            out["json_schema_strict"] = {"accepted": True, "schema_conformant": False, "raw": txt[:120]}
    except httpx.HTTPStatusError as exc:
        out["json_schema_strict"] = {"accepted": False, "http": exc.response.status_code, "detail": exc.response.text[:200]}
    return out


def probe_stream_and_tools() -> dict[str, Any]:
    """Does stream=true work, and do tool_calls arrive incrementally in deltas?"""
    try:
        with httpx.stream(
            "POST",
            f"{BASE_URL}/chat/completions",
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": "项目 12 有哪些候选职业？"}],
                "tools": TOOLS,
                "tool_choice": "auto",
                "stream": True,
                "max_tokens": 300,
            },
            headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            timeout=TIMEOUT,
        ) as r:
            r.raise_for_status()
            chunks = 0
            tool_delta_chunks = 0
            finish = None
            usage_seen = None
            for line in r.iter_lines():
                if not line.startswith("data:"):
                    continue
                body = line[5:].strip()
                if body == "[DONE]":
                    break
                try:
                    obj = json.loads(body)
                except ValueError:
                    continue
                chunks += 1
                if obj.get("usage"):
                    usage_seen = obj["usage"]
                for ch in obj.get("choices") or []:
                    if ch.get("finish_reason"):
                        finish = ch["finish_reason"]
                    delta = ch.get("delta") or {}
                    if delta.get("tool_calls") or delta.get("reasoning_content"):
                        tool_delta_chunks += 1
            return {"stream_ok": True, "chunks": chunks, "tool_or_reasoning_deltas": tool_delta_chunks, "finish_reason": finish, "usage_in_stream": usage_seen}
    except Exception as exc:  # noqa: BLE001 - spike wants the raw failure shape
        return {"stream_ok": False, "error": f"{type(exc).__name__}: {str(exc)[:200]}"}


def main() -> None:
    if not KEY:
        print("!! no LLM_API_KEY available; aborting without any network call")
        raise SystemExit(2)
    print(f"target host={BASE_URL.split('//', 1)[-1]}  model={MODEL}  key_len={len(KEY)} (key not printed)")

    results = [run_case(*c) for c in CASES]
    for res in results:
        print(json.dumps(res, ensure_ascii=False))

    print("--- probe: response_format ---")
    print(json.dumps(probe_json_mode(), ensure_ascii=False))
    print("--- probe: stream + tool deltas ---")
    print(json.dumps(probe_stream_and_tools(), ensure_ascii=False))

    total = len(results)
    fatal = [r for r in results if r.get("fatal")]
    structural = [r for r in results if not r.get("fatal") and r["schema_errors"]]
    hits = [r for r in results if not r.get("fatal") and r["hit_expectation"]]
    ran_away = [r for r in results if not r.get("fatal") and r["max_rounds_hit"]]
    nof = [r for r in results if not r.get("fatal") and not r["final_present"]]
    print("--- summary ---")
    print(json.dumps({
        "cases": total,
        "api_calls": call_count,
        "http_fatal": len(fatal),
        "expectation_hit": len(hits),
        "expectation_hit_rate": round(len(hits) / max(1, total - len(fatal)), 3),
        "cases_with_schema_errors": len(structural),
        "tool_call_structure_legality_rate": round((total - len(structural) - len(fatal)) / max(1, total - len(fatal)), 3),
        "ran_away_loop": len(ran_away),
        "missing_final": len(nof),
        "parallel_turns_total": sum(r.get("parallel_turns", 0) for r in results if not r.get("fatal")),
        "usage": usage_total,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
