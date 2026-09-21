"""Registry integrity gate. Run: python -m scripts.validate  (exit != 0 on failure)

Check (c) is the one that exists specifically because of v1: it declared eight
proposal types and shipped two executors, and nothing anywhere could notice.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

from app.agent.executors import EXECUTORS
from app.capabilities.registry import CAPABILITIES, ENTRY_CAPABILITIES, is_valid_obligation_target
from app.tools.domain import DOMAIN_TOOLS
from app.tools.readonly import READ_ONLY_TOOLS

#: The shell keeps its own copy of the frame vocabulary because it has to switch on
#: it, and a frame kind the reducer does not know is dropped in silence (`default:` in
#: its switch). Checking both lists against each other is the only way that drift
#: becomes a build failure instead of a missing line in the timeline.
SHELL_FRAMES = Path(__file__).resolve().parents[2] / "web" / "src" / "state" / "frames.ts"

#: A failed run says where it stopped by prefixing `run.error` with `<stage>: `, and the
#: shell turns that token into the label a person reads. An unlabelled stage is not a
#: crash — it is a failure the user sees as raw code, which is how "显示具体失败阶段"
#: quietly stops being true. So both lists are compared here.
SHELL_FAILURES = Path(__file__).resolve().parents[2] / "web" / "src" / "state" / "failure.ts"
STAGE_SOURCES = ("agent/graph.py", "agent/service.py")
#: The stages whose prefix is built somewhere other than a `fail()`/`run.error` line.
#: Naming them here means a refactor that breaks a pattern fails loudly instead of
#: shrinking the set and passing.
MANDATORY_STAGES = ("budget", "approval", "background", "restart")


def _frame_kind_drift() -> str:
    from app.agent.events import FRAME_KINDS

    if not SHELL_FRAMES.exists():
        return f"shell frame contract not found at {SHELL_FRAMES}"
    declared = re.search(r"export type FrameKind\s*=\s*(.*?);", SHELL_FRAMES.read_text(encoding="utf-8"), re.S)
    if declared is None:
        return "could not locate the FrameKind union in the shell reducer"
    kinds = set(re.findall(r'"([a-z_]+)"', declared.group(1)))
    if kinds != set(FRAME_KINDS):
        return f"only in shell={sorted(kinds - set(FRAME_KINDS))} only in server={sorted(set(FRAME_KINDS) - kinds)}"
    return ""


def _failure_stage_drift() -> str:
    """Compare the `<stage>: ` prefixes the server can write into `run.error` against the
    labels the shell turns them into."""
    if not SHELL_FAILURES.exists():
        return f"shell failure vocabulary not found at {SHELL_FAILURES}"
    labels = set(re.findall(r'^\s+([a-z_]+):\s*"', SHELL_FAILURES.read_text(encoding="utf-8"), re.M))

    server = Path(__file__).resolve().parents[1] / "app"
    written: set[str] = set()
    for relative in STAGE_SOURCES:
        text = (server / relative).read_text(encoding="utf-8")
        written.update(re.findall(r'fail\(deps, state,\s*f?"([a-z_]+): ', text))
        written.update(re.findall(r'run\.error = f?"([a-z_]+): ', text))
        written.update(re.findall(r'stage[^"\n]*"([a-z_]+)"', text))
        written.update(re.findall(r'return "tokens", \(\s*f?"([a-z_]+): ', text, re.S))
    lost = sorted(set(MANDATORY_STAGES) - written)
    if lost:
        return f"stage prefixes stopped being read out of the server (a pattern went stale): {lost}"
    unlabelled = sorted(written - labels)
    return f"unlabelled={unlabelled}" if unlabelled else ""


class Report:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.passed: list[str] = []

    def check(self, ok: bool, label: str, detail: str = "") -> None:
        (self.passed if ok else self.failures).append(f"{label}{': ' + detail if detail else ''}")


def validate() -> Report:
    report = Report()
    tool_names = {tool.name for tool in (*READ_ONLY_TOOLS, *DOMAIN_TOOLS)}
    ids = [spec.id for spec in CAPABILITIES]
    implemented = [spec for spec in CAPABILITIES if spec.status == "implemented"]

    report.check(len(ids) == len(set(ids)), "capability ids unique", f"{len(ids)} declared")

    known = set(ids)
    dangling = sorted({nxt for spec in CAPABILITIES for nxt in spec.next_capabilities if nxt not in known})
    report.check(not dangling, "next_capabilities resolve", f"dangling={dangling}")

    # Only implemented capabilities must have working wiring. A planned one is
    # allowed to name a tool that does not exist yet — that is what "planned" means.
    unknown_tools = sorted({name for spec in implemented for name in spec.tools if name not in tool_names})
    report.check(not unknown_tools, "implemented capabilities resolve their tools", f"unknown={unknown_tools}")

    missing_executors = sorted(
        {ptype for spec in implemented for ptype in spec.proposal_types if ptype not in EXECUTORS}
    )
    report.check(
        not missing_executors,
        "implemented capabilities have executors",
        f"proposal types with no executor={missing_executors}",
    )

    r3_proposals = sorted(spec.id for spec in CAPABILITIES if spec.risk_tier == "R3" and spec.proposal_types)
    report.check(not r3_proposals, "R3 capabilities declare no writes", f"offending={r3_proposals}")

    unapproved = sorted(spec.id for spec in CAPABILITIES if spec.risk_tier in {"R2", "R3"} and not spec.requires_approval)
    report.check(not unapproved, "R2/R3 always require approval", f"offending={unapproved}")

    thin_budget = sorted(spec.id for spec in CAPABILITIES if spec.max_tokens < 1500)
    report.check(not thin_budget, "max_tokens >= 1500 (reasoning-token floor)", f"offending={thin_budget}")

    orphan = sorted(
        spec.id
        for spec in implemented
        if spec.id not in ENTRY_CAPABILITIES and not any(spec.id in other.next_capabilities for other in CAPABILITIES)
    )
    report.check(not orphan, "implemented capabilities are reachable", f"orphans={orphan}")

    unknown_next = sorted(
        nxt
        for spec in implemented
        for nxt in spec.next_capabilities
        if nxt not in {other.id for other in CAPABILITIES}
    )
    report.check(not unknown_next, "implemented capabilities chain to known ids", f"unknown={unknown_next}")

    bad_proposal_tier = sorted(
        spec.id for spec in CAPABILITIES if spec.proposal_types and spec.risk_tier != "R2"
    )
    report.check(not bad_proposal_tier, "only R2 capabilities carry writes", f"offending={bad_proposal_tier}")

    # An obligation may only point at something runnable and student-visible, so a
    # chain whose every target fails that test silently degrades to "offer everything"
    # — the designed ordering is lost without any error. v1's whole failure mode was a
    # declared intent nothing could observe was unmet.
    promisable = {spec.id for spec in CAPABILITIES if is_valid_obligation_target(spec.id)}
    chain_leads_nowhere = sorted(
        spec.id
        for spec in CAPABILITIES
        if spec.status == "implemented"
        and not spec.internal
        and spec.next_capabilities
        and not (set(spec.next_capabilities) & promisable)
    )
    report.check(
        not chain_leads_nowhere,
        "capability chains lead somewhere promisable",
        f"dead ends={chain_leads_nowhere} (promisable={sorted(promisable)})",
    )

    drift = _frame_kind_drift()
    report.check(not drift, "frame kinds match the shell's reducer", drift)

    stage_drift = _failure_stage_drift()
    report.check(
        not stage_drift,
        "failure stages the server writes are all labelled by the shell",
        stage_drift,
    )

    from tests.support import sample_frames

    frames = sample_frames()
    from app.agent.events import FRAME_KINDS

    unexercised = sorted(set(FRAME_KINDS) - set(frames))
    report.check(
        not unexercised,
        "every frame kind has a serialisation sample",
        f"unexercised={unexercised}",
    )

    broken: list[str] = []
    for name, frame in frames.items():
        try:
            round_tripped = _frame_round_trip(frame)
        except Exception as exc:
            broken.append(f"{name}: {type(exc).__name__}: {exc}")
            continue
        if round_tripped != frame:
            broken.append(f"{name}: round-trip mismatch")
    report.check(not broken, "event frames survive JSON round trip", "; ".join(broken[:3]))

    return report


def _frame_round_trip(frame: Any) -> Any:
    from app.agent.events import FRAME_ADAPTER

    payload = frame.model_dump(mode="json")
    return FRAME_ADAPTER.validate_python(payload)


def main() -> int:
    report = validate()
    for line in report.passed:
        print(f"  PASS  {line}")
    for line in report.failures:
        print(f"  FAIL  {line}")
    print(f"\n{len(report.passed)} passed, {len(report.failures)} failed")
    return 1 if report.failures else 0


if __name__ == "__main__":
    sys.exit(main())
