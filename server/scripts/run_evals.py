"""Run the fixed evaluation set and report 目标五's numbers.

Why this is a script and not a pytest file: it spends money and needs a key. The
free gates live in `scripts/verify.ps1`; this one is invoked on purpose.

  python -m scripts.run_evals --check                    # 只核对案例集，一次模型都不调
  python -m scripts.run_evals --offline --limit 5        # 假模型，只验机器本身转不转
  python -m scripts.run_evals --live                     # 真模型，出基线
  python -m scripts.run_evals --live --only compare_two_directions

`--offline` deliberately cannot pass the thresholds, and says so: a mocked model
proves the harness computes, nothing more. Only `--live` produces a number worth
comparing against a previous run.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.approvals import ApprovalRepository
from app.agent.checkpointer import open_checkpointer
from app.agent.events import EventLog
from app.agent.service import GraphRegistry, RunService
from app.capabilities.registry import implemented_capabilities
from app.config import OPENAI_COMPATIBLE_PROVIDERS, Settings, get_settings
from app.db.base import build_engine, ensure_database
from app.db.models import Approval, Artifact, Base, Event, Run
from app.llm.gateway import Gateway, GatewayError
from app.tools.base import ToolRegistry
from app.tools.domain import DOMAIN_TOOLS
from app.tools.readonly import READ_ONLY_TOOLS
from evals.cases import COVERAGE, EXTRA_COVERAGE, Case, load_cases, validate
from evals.scoring import CaseResult, business_row_counts, score_case, summarise, to_json
from evals.seed import ensure_catalogue, eval_db_url, seed_world, user_row

REPORT_DIR = Path("var")

#: Every counter `EvidenceScore` carries, so a re-score adds up the same columns the
#: live scorer does instead of drifting from it.
TIER_FIELDS = ("total", "verbatim", "insensitive", "recomposed", "too_short", "only_in_run", "only_in_payload", "unmatched", "unresolvable")

#: Redirect this report to a file on Windows and stdout becomes GBK: the metric lines are
#: Chinese and survive, but the ✗ in front of a red case is not in that codepage — so the
#: printer died exactly when there was something to report, after the JSON had been written.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def prepare(settings: Settings, *, live: bool) -> tuple[Settings, sessionmaker[Session]]:
    """A dedicated schema, the real catalogue, and a provider we can name out loud."""
    eval_settings = settings.model_copy(update={"db_url": eval_db_url(settings.db_url)})
    if not live:
        eval_settings = eval_settings.model_copy(update={"llm_provider": "mock", "llm_model": "mock-eval"})
    elif eval_settings.llm_provider.strip().lower() not in OPENAI_COMPATIBLE_PROVIDERS:
        raise SystemExit(f"--live 要求真实 provider，当前是 {eval_settings.llm_provider}；去掉 --live 只验机器")

    ensure_database(eval_settings.db_url)
    engine = build_engine(eval_settings.db_url)
    Base.metadata.create_all(engine)
    copied = ensure_catalogue(build_engine(settings.db_url), engine)
    print(f"评测库 {eval_settings.db_url.split('/')[-1].split('?')[0]} · 目录 {copied}")
    return eval_settings, sessionmaker(bind=engine, expire_on_commit=False)


async def run_case(
    service: RunService,
    session_factory: sessionmaker[Session],
    stamp: str,
    case: Case,
    *,
    timeout: float,
) -> CaseResult:
    """Mirror what the browser does: start, meet the gate, decide, let it finish.

    The decide step goes through `mark_approval_decided` + `resume` in the same order
    as the HTTP route, so the evaluation cannot drift from the product it scores.
    """
    world = seed_world(session_factory, case, tag=f"{stamp}-{case.id}")
    user = user_row(session_factory, world.user_id)
    with session_factory() as session:
        before = business_row_counts(session)

    run = service.create_run(user, case.goal, capability_id=case.capability, project_id=world.project_id)
    print(f"  · {case.id} [{case.capability}] run={run.id}", flush=True)

    try:
        await asyncio.wait_for(service.start(run, allow_external_ai=user.allows_external_ai), timeout=timeout)
        pending = _pending_approval(session_factory, run.id)
        if pending and case.decide != "none":
            service.mark_approval_decided(run.id, user, pending)
            await asyncio.wait_for(
                service.resume(
                    run,
                    decision={"approved": case.decide == "approve", "feedback": ""},
                    allow_external_ai=user.allows_external_ai,
                ),
                timeout=timeout,
            )
    except TimeoutError:
        print(f"  ! {case.id} 超时 {timeout:.0f}s，按当前账面评分")
    except GatewayError as exc:
        # A refused call is a result, not a crash: 没授权就该停在 background 阶段。
        print(f"  ! {case.id} 网关拒绝：{exc}")

    with session_factory() as session:
        fresh = session.get(Run, run.id)
        assert fresh is not None, "run 行不见了，评分无从谈起"
        result = score_case(session, case, run=fresh, world=world, before=before)
        result.prompt_fingerprint = _prompt_stamp(session, run.id)
        return result


def _prompt_stamp(session: Session, run_id: str) -> str:
    """Read the stamp off the run's own `run_started` frame rather than recomputing it
    from today's code. The question the field answers is "which generation produced
    *that* answer", and a value recomputed tomorrow cannot answer it for yesterday."""
    payload = session.scalar(
        select(Event.payload).where(Event.run_id == run_id, Event.kind == "run_started")
    ) or {}
    return str(payload.get("prompt_fingerprint") or "")


def _pending_approval(session_factory: sessionmaker[Session], run_id: str) -> str | None:
    with session_factory() as session:
        return session.scalar(
            select(Approval.id).where(Approval.run_id == run_id, Approval.status == "pending").order_by(Approval.created_at)
        )


def print_report(results: list[CaseResult], report: dict[str, Any], *, live: bool) -> None:
    print("\n════════ 指标 ════════")
    for name, value in report["metrics"].items():
        shown = "未测到" if value is None else value
        print(f"  {name:24} {shown!s:>8}   {report['metric_denominators'][name]}")
    print(f"  {'合计成本(峰时上限/USD)':22} {report['total_cost_usd_peak']}")
    stamps = sorted({item.prompt_fingerprint for item in results if item.prompt_fingerprint})
    print(
        f"  {'提示词指纹':22} "
        + ("、".join(stamps) if stamps else "这批 run 没有指纹（早于该字段，跨它比较只能当传闻）")
    )

    print("\n════════ 引用核对样本（前 8 条对不上的原句）════════")
    shown = 0
    for item in results:
        for line in (*item.evidence.samples, *item.diagnostics.samples):
            if shown >= 8:
                break
            print(f"  · {item.case_id}: {line}")
            shown += 1
    if shown == 0:
        print("  （每条引用都在读过的行里找到了）")

    print("\n════════ 每个能力 ════════")
    for capability, bucket in sorted(report["per_capability"].items()):
        print(
            f"  {capability:20} {bucket['cases']:>2} 例 / 过 {bucket['passed']:>2}"
            f" · 均步 {bucket['mean_steps']} · 均模型调用 {bucket['mean_model_calls']}"
            f" · 均 token {bucket['mean_tokens']} · 均成本 {bucket['mean_cost_usd_peak']}"
        )

    print("\n════════ 红掉的案例 ════════")
    failed = [item for item in results if not item.passed]
    for item in failed[:40]:
        print(f"  ✗ {item.case_id} [{item.covers}] {item.run_status} — {'；'.join(item.violations)}")
    if not failed:
        print("  （无）")

    print("\n════════ 门槛 ════════")
    breaches = report["threshold_breaches"]
    if breaches:
        for line in breaches:
            print(f"  FAIL  {line}")
    else:
        print("  PASS  全部达标")
    if not live:
        print("  注意：离线跑用的是假模型，上面这些数字只说明机器在转，不代表质量。")


def rescore(report_path: Path) -> int:
    """Recompute only the citation tiers of an existing report, from the rows it left behind.

    The matcher is code and code gets fixed, while the model's answers are already paid
    for: re-running 38 live cases to learn what a scorer change does would spend money
    and add variance to a number that should not have moved. The other six metrics are
    deliberately not reprinted — this path checks quotes, nothing else.
    """
    from app.capabilities.registry import get_capability
    from app.db.base import build_engine
    from evals.corpus import CellIndex, EvidenceScore, score_artifact
    from evals.scoring import _collected_refs, _read_texts
    from evals.seed import assert_eval_target, eval_db_url

    settings = get_settings()
    assert_eval_target(url := eval_db_url(settings.db_url))
    session = sessionmaker(bind=build_engine(url), expire_on_commit=False)()
    previous = json.loads(report_path.read_text(encoding="utf-8"))

    totals = EvidenceScore()
    buckets = totals.__class__
    per_capability: dict[str, EvidenceScore] = {}
    stamps: dict[str, set[str]] = {}
    unstamped = 0
    skipped = 0
    for row in previous["cases"]:
        run_id = str(row.get("run_id") or "")
        if not run_id:
            skipped += 1
            continue
        run = session.get(Run, run_id)
        if run is None:
            skipped += 1
            continue
        stamp = _prompt_stamp(session, run_id)
        if stamp:
            stamps.setdefault(run.capability_id, set()).add(stamp)
        else:
            unstamped += 1
        cells = CellIndex(session)
        payloads = [event.payload or {} for event in session.scalars(select(Event).where(Event.run_id == run_id))]
        run_refs = _collected_refs(payloads)
        read_texts = _read_texts(payloads)
        spec = get_capability(run.capability_id)
        score = per_capability.setdefault(run.capability_id, buckets())
        for artifact in session.scalars(select(Artifact).where(Artifact.run_id == run_id)):
            item = score_artifact(session, artifact, run_refs, read_texts, cells)
            if not spec.evidence_required:
                continue  # the 95% bar is about artifacts 目标二 requires evidence for
            for field_name in TIER_FIELDS:
                setattr(score, field_name, getattr(score, field_name) + getattr(item, field_name))
                setattr(totals, field_name, getattr(totals, field_name) + getattr(item, field_name))

    old = previous["metrics"].get("evidence_cited")
    print("════════ 只重算引用核对（未调用模型）════════")
    print(f"  原报告 {report_path.name} · evidence_cited = {old}")
    if skipped:
        print(f"  注意：{skipped} 例没有 run_id 或 run 已不在库里，没算进来")
    print(
        f"  可核对 {totals.valid}/{totals.verifiable} 条 = {totals.valid / totals.verifiable if totals.verifiable else 0:.3f}"
        f"（逐字 {totals.verbatim}、换标点 {totals.insensitive}、字段重拼 {totals.recomposed}、"
        f"读过的行里没有 {totals.unmatched}、表查不到 {totals.unresolvable}）"
    )
    print(f"  短到核对不了 {totals.too_short} 条不计入分母；其中 {totals.only_in_run} 条的出处没写进成果物自己的 source_refs")
    print("\n  每个能力的引用可核对率：")
    for capability, score in sorted(per_capability.items()):
        seen = "、".join(sorted(stamps.get(capability, {"（这批 run 没有指纹）"})))
        print(
            f"    {capability:18} {score.valid:>3}/{score.verifiable:<3} {score.ratio:.3f}"
            f" · 找不到 {score.unmatched} · 指纹 {seen}"
        )
    if unstamped:
        print(f"  注意：{unstamped} 例的 run 早于提示词指纹字段，它们的质量数字无法归因到某一版提示词。")
    return 0


async def main(args: argparse.Namespace) -> int:
    cases = load_cases()
    problems = validate(cases)
    print(f"案例 {len(cases)} 条 · 场景 {len(COVERAGE) + len(EXTRA_COVERAGE)} 类")
    for label, name in {**COVERAGE, **EXTRA_COVERAGE}.items():
        count = sum(1 for case in cases if case.covers == label)
        print(f"  {count:>2} × {name}")
    if problems:
        print("\n案例集本身有问题：")
        for line in problems:
            print(f"  FAIL  {line}")
        return 1
    if args.check:
        print("\nPASS  案例集自洽（未调用模型，未连数据库）")
        return 0

    selected = [case for case in cases if not args.only or case.id in set(args.only.split(","))]
    if args.limit:
        selected = selected[: args.limit]
    print(f"\n本轮跑 {len(selected)} 条，provider={'真模型' if args.live else '假模型'}")

    settings, session_factory = prepare(get_settings(), live=args.live)
    eval_settings = settings.model_copy(
        update={"checkpoint_path": f"./var/eval-checkpoints-{int(time.time())}.sqlite"}
    )
    events = EventLog(session_factory)
    approvals = ApprovalRepository(eval_settings)
    gateway = Gateway(settings=eval_settings)
    async with open_checkpointer(eval_settings) as checkpointer:
        graphs = GraphRegistry.build(
            capabilities=implemented_capabilities(),
            tools=ToolRegistry([*READ_ONLY_TOOLS, *DOMAIN_TOOLS]),
            session_factory=session_factory,
            gateway=gateway,
            events=events,
            approvals=approvals,
            settings=eval_settings,
            checkpointer=checkpointer,
        )
        service = RunService(session_factory=session_factory, graphs=graphs, events=events, approvals=approvals)
        stamp = datetime.now(UTC).strftime("%m%d-%H%M%S")
        results = []
        for case in selected:
            try:
                results.append(await run_case(service, session_factory, stamp, case, timeout=args.case_timeout))
            except Exception as exc:  # one broken case must not eat the remaining budget
                print(f"  ! {case.id} 崩了：{type(exc).__name__}: {exc}")
                raise

    report = summarise(results)
    report["prompt_fingerprints"] = sorted({item.prompt_fingerprint for item in results if item.prompt_fingerprint})
    report["provider"] = eval_settings.llm_provider
    report["model"] = eval_settings.llm_model
    report["live"] = args.live
    REPORT_DIR.mkdir(exist_ok=True)
    path = REPORT_DIR / f"eval-{stamp}{'-live' if args.live else ''}.json"
    path.write_text(to_json(report), encoding="utf-8")
    print_report(results, report, live=args.live)
    print(f"\n报告：{path}")
    return 1 if (args.live and report["threshold_breaches"]) else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="只核对案例集，不碰数据库也不花钱")
    parser.add_argument("--live", action="store_true", help="调真实云端模型（会花钱）")
    parser.add_argument("--offline", action="store_true", help="用假模型把机器转一遍，只验工具本身")
    parser.add_argument("--only", default="", help="逗号分隔的案例 id")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--case-timeout", type=float, default=420.0)
    parser.add_argument("--rescore", default="", metavar="REPORT.json", help="只重算已有报告的引用核对，不调模型也不花钱")
    parsed = parser.parse_args()
    if parsed.rescore:
        sys.exit(rescore(Path(parsed.rescore)))
    sys.exit(asyncio.run(main(parsed)))
