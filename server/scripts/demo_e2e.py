"""End-to-end demo against a running server and the real model.

Drives the same HTTP surface the browser uses — register, consent, start a run,
follow the SSE stream, decide on the pending proposal, then read back what
actually landed. It costs real model calls on purpose: a mocked "demo" would
prove nothing about whether this feels like an agent.

  python -m uvicorn app.main:app --port 8100      # first
  python -m scripts.demo_e2e --capability direction_explore
  python -m scripts.demo_e2e --chain         # decision_frame -> approve -> candidate_source
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time

import httpx

BASE = os.environ.get("DEMO_BASE_URL", "http://127.0.0.1:8100")

GOALS = {
    "direction_explore": "数据分析师这个方向实际每天在做什么？广州的入门岗要求是什么？",
    "decision_frame": "我在广州读计算机，纠结毕业后做数据分析还是后端开发，帮我把这个问题整理成可比较的决策项目",
    "candidate_source": "根据我的情况，这个项目里应该考虑哪些候选职业？每个都要有目录或岗位依据",
    "profile_diagnose": "你看看我的职业画像还缺什么线索",
    "skeleton_probe": "把我现在最该做的一件事整理成一条笔记",
}


def log(label: str, payload: object = "") -> None:
    print(f"  · {label}" + (f": {payload}" if payload != "" else ""), flush=True)


async def read_stream(
    client: httpx.AsyncClient,
    run_id: str,
    headers: dict[str, str],
    *,
    seconds: int,
    after_seq: int = -1,
) -> tuple[list[dict], bool]:
    """Frames until the run pauses for approval, ends, or the window closes.

    Reconnecting without a cursor replays the whole run from seq 0, which is the
    contract, not a bug — so the caller has to say where it stopped.
    """
    frames: list[dict] = []
    paused = False
    try:
        async with client.stream(
            "GET",
            f"{BASE}/api/v1/runs/{run_id}/events?after_seq={after_seq}",
            headers=headers,
            timeout=seconds,
        ) as response:
            if response.status_code != 200:
                await response.aread()
                raise RuntimeError(f"event stream HTTP {response.status_code}: {response.text[:200]}")
            buffer = ""
            async for chunk in response.aiter_text():
                buffer += chunk
                while "\n\n" in buffer:
                    block, buffer = buffer.split("\n\n", 1)
                    data = "".join(line[5:].strip() for line in block.split("\n") if line.startswith("data:"))
                    if not data:
                        continue
                    frame = json.loads(data)
                    frames.append(frame)
                    narrate(frame)
                    paused = frame["kind"] == "approval_required" or paused
                    if frame["kind"] in {"run_completed", "run_failed"}:
                        return frames, False
    except httpx.ReadTimeout:
        log("stream", "读取窗口结束")
    return frames, paused


def narrate(frame: dict) -> None:
    kind = frame["kind"]
    if kind == "tool_call":
        refs = frame.get("source_refs") or []
        log("tool", f"{frame.get('name')} → {len(refs)} 条来源{'（已裁剪）' if frame.get('truncated') else ''}")
    elif kind == "artifact_created":
        log("artifact", f"{frame.get('artifact_type')} 覆盖度={frame.get('data_coverage')} 依据不足={frame.get('is_provisional')}")
    elif kind == "proposal_created":
        log("proposal", f"[{frame.get('risk_tier')}] {frame.get('title')}")
    elif kind == "usage_recorded":
        log(
            "usage",
            f"prompt={frame.get('prompt')} completion={frame.get('completion')} "
            f"思考={frame.get('reasoning')} 缓存={frame.get('cached')}",
        )
    elif kind == "approval_required":
        log("awaiting approval", frame.get("approval_id"))
    elif kind in {"run_completed", "run_failed"}:
        log(kind, frame.get("status") or frame.get("error"))


def persisted_seqs(frames: list[dict]) -> list[int]:
    """Only durable events carry a seq. The transient delta channel is rendered, not
    replayed, so it must not enter the resume cursor or the continuity check."""
    return [frame["seq"] for frame in frames if "seq" in frame]


class Demo:
    def __init__(self, client: httpx.AsyncClient, headers: dict[str, str]) -> None:
        self.client = client
        self.headers = headers

    async def run(
        self,
        capability: str,
        *,
        goal: str | None = None,
        project_id: str | None = None,
        approve: bool = True,
    ) -> dict[str, object]:
        created = await self.client.post(
            f"{BASE}/api/v1/runs",
            headers=self.headers,
            json={"goal": goal or GOALS[capability], "capability_id": capability, "project_id": project_id},
        )
        created.raise_for_status()
        run_id = created.json()["run_id"]
        log("run", f"{capability} → {run_id}")

        frames, paused = await read_stream(self.client, run_id, self.headers, seconds=240)
        if paused and approve:
            approval = next(frame for frame in reversed(frames) if frame["kind"] == "approval_required")
            decided = await self.client.post(
                f"{BASE}/api/v1/runs/{run_id}/approvals/{approval['approval_id']}/decision",
                headers=self.headers,
                json={"approved": True, "feedback": ""},
            )
            decided.raise_for_status()
            log("decision", "采纳")
            resume_from = max(persisted_seqs(frames))
            more, _ = await read_stream(self.client, run_id, self.headers, seconds=120, after_seq=resume_from)
            frames.extend(more)

        snapshot = (await self.client.get(f"{BASE}/api/v1/runs/{run_id}", headers=self.headers)).json()
        return self.summarise(capability, frames, snapshot)

    def summarise(self, capability: str, frames: list[dict], snapshot: dict) -> dict[str, object]:
        run = snapshot["run"]
        kinds = [frame["kind"] for frame in frames]
        produced_project = None
        print("\n结果")
        log("status", run["status"])
        log("usage", run["usage"])
        if run.get("error"):
            log("error", run["error"])
        for artifact in snapshot["artifacts"]:
            conclusion = str((artifact["content"] or {}).get("conclusion", ""))
            log("artifact", f"{artifact['artifact_type']} · {artifact['status']} · 覆盖 {artifact['data_coverage']}%")
            if conclusion:
                log("conclusion", conclusion[:200])
            for claim, quote in list((artifact.get("evidence_quotes") or {}).items())[:2]:
                log("quote", f"{claim[:40]} → “{quote[:70]}”")
        for proposal in snapshot["proposals"]:
            outcome = json.dumps(proposal["result"], ensure_ascii=False) if proposal["result"] else (proposal["error"] or "")
            log("proposal", f"{proposal['proposal_type']} {proposal['status']} → {outcome[:120]}")
            if proposal["proposal_type"] == "create_decision_project" and proposal["result"]:
                produced_project = proposal["result"].get("project_id")

        # The gate appears exactly when a proposal survived payload validation. An
        # R1 capability proposes nothing, and an unsupported one never reaches a human.
        expects_gate = any(proposal["status"] != "unsupported" for proposal in snapshot["proposals"])
        checks = {
            "工具真的取数（A4）": "tool_call" in kinds,
            "产出成果物（A6 前置）": "artifact_created" in kinds,
            "确认门按写入等级出现（A5 前置）": ("approval_required" in kinds) == expects_gate,
            "有终态事件且 seq 连续": (kinds[-1] in {"run_completed", "run_failed"} if kinds else False)
            and persisted_seqs(frames) == list(range(len(persisted_seqs(frames)))),
        }
        print("\n验收")
        for name, ok in checks.items():
            print(f"  {'PASS' if ok else 'FAIL'}  {name}  [{capability}]")
        return {"ok": all(checks.values()), "project_id": produced_project, "status": run["status"]}


async def authenticate(client: httpx.AsyncClient) -> tuple[Demo, str]:
    username = f"demo_{int(time.time()) % 100000}"
    registered = await client.post(
        f"{BASE}/api/v1/auth/register",
        json={"username": username, "password": "demo-password-1", "external_ai_consent": True},
    )
    registered.raise_for_status()
    session = registered.json()
    log("user", f"{username} (id={session['user']['id']}，已授权外部模型)")
    return Demo(client, {"Authorization": f"Bearer {session['token']}"}), username


async def main(capability: str, chain: bool, decide: bool) -> int:
    async with httpx.AsyncClient(timeout=90.0) as client:
        demo, _ = await authenticate(client)
        tiers = {item["id"]: item["risk_tier"] for item in (await client.get(f"{BASE}/api/v1/capabilities", headers=demo.headers)).json()}
        log("capabilities", f"{len(tiers)} 个声明 / {sum(1 for _ in tiers.values())} 个可查询")

        if not chain:
            result = await demo.run(capability, approve=decide)
            return 0 if result["ok"] else 2

        first = await demo.run("decision_frame")
        project_id = first.get("project_id")
        if not project_id:
            print("链式演示需要 decision_frame 先建成项目")
            return 2
        print()
        second = await demo.run("candidate_source", project_id=str(project_id))
        return 0 if first["ok"] and second["ok"] else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capability", default="direction_explore")
    parser.add_argument("--chain", action="store_true", help="decision_frame 建项目后接 candidate_source")
    parser.add_argument("--no-decide", action="store_true", help="停在确认门，不采纳")
    args = parser.parse_args()
    try:
        sys.exit(asyncio.run(main(args.capability, args.chain, not args.no_decide)))
    except httpx.HTTPStatusError as error:
        print("HTTP error:", error.response.status_code, error.response.text[:300])
        sys.exit(1)
