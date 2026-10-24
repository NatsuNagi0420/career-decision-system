"""The case contract for the fixed evaluation set.

`cases.json` is data, and data rots quietly: a typo in an expectation key makes a
case assert nothing, a renamed tool makes it pass for the wrong reason. So the
loader rejects those instead of reading around them — the same trick that
`MANDATORY_STAGES` plays for the failure-stage table in `scripts/validate.py`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.capabilities.registry import get_capability
from app.tools.domain import DOMAIN_TOOLS
from app.tools.readonly import READ_ONLY_TOOLS

CASES_PATH = Path(__file__).resolve().parent / "cases.json"

#: The twelve scenarios 目标五 names. Each must be covered by at least one case, and
#: the count is asserted, not assumed — an eval set that quietly stops covering one
#: of them is worse than no eval set, because it reads as coverage.
COVERAGE: dict[str, str] = {
    "profile_insufficient": "画像信息不足",
    "two_direction_compare": "两个职业方向比较",
    "multi_candidate_generate": "多个候选职业生成",
    "job_sample_query": "岗位样本查询",
    "evidence_missing": "证据不足",
    "fact_vs_requirement_conflict": "用户事实与岗位要求冲突",
    "action_plan_generate": "行动计划生成",
    "user_rejects_proposal": "用户拒绝提案",
    "bad_tool_arguments": "模型工具参数错误",
    "unauthorized_tool_attempt": "模型试图调用未授权工具",
    "invalid_proposal": "模型生成无效 Proposal",
    "no_external_ai_consent": "用户没有授予外部 AI 权限",
}

#: Plus the two the closed loop itself needs, which 目标一 demands and 目标五 does not
#: list: submitting a task result and running a weekly review.
EXTRA_COVERAGE: dict[str, str] = {
    "task_result_submission": "行动结果提交并归档为证据",
    "weekly_review_cycle": "周复盘并生成下一周期",
}

MIN_CASES = 30

#: Every expectation a case is allowed to assert. An unknown key is a bug in the case,
#: not an optional feature, so `validate` fails the build over it.
EXPECT_KEYS: frozenset[str] = frozenset(
    {
        "run_status",
        "artifact_type",
        "min_evidence_quotes",
        "must_be_provisional",
        "must_not_be_provisional",
        "min_uncertainties",
        "tools_any_of",
        "tools_none_of",
        "proposal_type",
        "proposal_status",
        "must_reach_approval",
        "conclusion_requires",
        "conclusion_forbids",
        "error_stage",
        "must_write_no_rows",
    }
)

DECIDE_VALUES = {"approve", "reject", "none"}
KNOWN_TOOLS = {tool.name for tool in (*READ_ONLY_TOOLS, *DOMAIN_TOOLS)}


@dataclass(frozen=True)
class Case:
    id: str
    covers: str
    capability: str
    goal: str
    rationale: str
    consent: bool
    decide: str
    seed: dict[str, Any]
    expect: dict[str, Any]


def load_cases(path: Path = CASES_PATH) -> list[Case]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    cases: list[Case] = []
    for entry in raw:
        cases.append(
            Case(
                id=str(entry["id"]),
                covers=str(entry["covers"]),
                capability=str(entry["capability"]),
                goal=str(entry["goal"]),
                rationale=str(entry.get("rationale", "")),
                consent=bool(entry.get("consent", True)),
                decide=str(entry.get("decide", "approve")),
                seed=dict(entry.get("seed") or {}),
                expect=dict(entry.get("expect") or {}),
            )
        )
    return cases


def validate(cases: list[Case]) -> list[str]:
    """Every way this case set can be quietly broken, as human-readable complaints."""
    problems: list[str] = []

    seen: set[str] = set()
    for case in cases:
        if case.id in seen:
            problems.append(f"重复案例 id：{case.id}")
        seen.add(case.id)

        slug = case.id.replace("_", "")
        if len(case.id) > 40 or not slug.isascii() or not slug.isalnum():
            problems.append(f"{case.id}：id 要短、只用字母数字和下划线")
        if not case.goal.strip():
            problems.append(f"{case.id}：没有 goal，跑起来没有任何输入")
        if not case.rationale.strip():
            problems.append(f"{case.id}：没有 rationale，半年后没人知道这条为什么在")
        if case.covers not in COVERAGE and case.covers not in EXTRA_COVERAGE:
            problems.append(f"{case.id}：covers={case.covers} 不在已知场景里")
        if case.decide not in DECIDE_VALUES:
            problems.append(f"{case.id}：decide={case.decide} 只允许 {sorted(DECIDE_VALUES)}")
        try:
            spec = get_capability(case.capability)
        except Exception as exc:  # a typo'd id must not read as "no capability declared"
            problems.append(f"{case.id}：capability={case.capability} 查不到（{exc}）")
            spec = None
        if spec is not None and (spec.status != "implemented" or spec.internal):
            problems.append(f"{case.id}：capability={case.capability} 是 {spec.status}/internal，不能当评测目标")

        unknown_keys = sorted(set(case.expect) - EXPECT_KEYS)
        if unknown_keys:
            problems.append(f"{case.id}：expect 里有不认识的键 {unknown_keys}（写错的断言等于没有断言）")
        if not case.expect:
            problems.append(f"{case.id}：expect 为空，这条只会证明进程没崩")
        for key in ("tools_any_of", "tools_none_of"):
            missing = sorted({name for name in case.expect.get(key, []) if name not in KNOWN_TOOLS})
            if missing:
                problems.append(f"{case.id}：expect.{key} 里有不存在的工具 {missing}")

    if len(cases) < MIN_CASES:
        problems.append(f"案例只有 {len(cases)} 条，低于要求的 {MIN_CASES} 条")

    covered = {case.covers for case in cases}
    untested = sorted(set(COVERAGE) - covered)
    if untested:
        problems.append(f"目标五点名的场景没人覆盖：{[COVERAGE[label] for label in untested]}")
    return problems
