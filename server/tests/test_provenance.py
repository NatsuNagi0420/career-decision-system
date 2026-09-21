"""The prompt fingerprint a run is stamped with (目标五 的「Prompt 和 Capability 版本管理」).

These tests exist because a fingerprint that hashes the wrong string is worse than none:
it lets two different generations of prompts be compared as if they were the same one.
"""

from __future__ import annotations

import inspect
import re

from app.agent import graph as agent_graph
from app.agent import persona
from app.agent.provenance import (
    LENGTH,
    capability_fingerprint,
    capability_material,
    fingerprint_for,
    fingerprints,
)
from app.capabilities.registry import CAPABILITIES, get_capability, implemented_capabilities
from app.tools.domain import DOMAIN_TOOLS


def test_every_implemented_capability_has_a_distinct_stamp() -> None:
    stamps = {spec.id: capability_fingerprint(spec) for spec in implemented_capabilities()}
    assert all(re.fullmatch(rf"[0-9a-f]{{{LENGTH}}}", stamp) for stamp in stamps.values()), stamps
    assert len(set(stamps.values())) == len(stamps), "两个能力共用一个指纹，就等于没记"
    assert fingerprints()["compare_decide"] == stamps["compare_decide"]


def test_the_stamp_ignores_which_student_asked() -> None:
    """Same code must give the same stamp, or a delta means nothing."""
    material = capability_material(get_capability("candidate_source"))
    assert "用户目标：（占位）" in material
    assert fingerprint_for("candidate_source") == capability_fingerprint(get_capability("candidate_source"))
    assert fingerprint_for("不存在的能力") == ""
    assert fingerprint_for(None) == ""


def test_one_character_in_the_prompt_moves_the_stamp(monkeypatch) -> None:
    """The guard the whole feature rests on. P3-3 measured a citation jump caused by
    wording and by tool回执 shape; if either edit could leave the stamp where it was,
    the next baseline would be compared against the wrong generation."""
    spec = get_capability("compare_decide")
    before = capability_fingerprint(spec)

    tweaked = spec.model_copy(update={"synthesis_notes": spec.synthesis_notes + "。"})
    assert capability_fingerprint(tweaked) != before, "改了能力说明，指纹没动"

    explore = get_capability("direction_explore")
    before_explore = capability_fingerprint(explore)
    search_directions = next(tool for tool in DOMAIN_TOOLS if tool.name == "search_directions")
    monkeypatch.setattr(search_directions, "description", search_directions.description + "（改一个字）")
    assert capability_fingerprint(explore) != before_explore, "改了工具描述，指纹没动"
    assert "（改一个字）" in capability_material(explore)

    monkeypatch.setattr(persona, "SYSTEM_PROMPT", persona.SYSTEM_PROMPT + "\n多加一句。")
    assert capability_fingerprint(spec) != before, "改了人设口吻，指纹没动"


def test_the_hashed_prompt_is_the_prompt_that_gets_sent() -> None:
    """`provenance` hashes `synthesis_prompt`, so the drafting node has to build its
    prompt with that same function — otherwise the stamp describes a string nobody
    sends, which is how a version record becomes a fiction."""
    source = inspect.getsource(agent_graph.synthesize)
    assert "synthesis_prompt(" in source
    assert agent_graph.SYNTHESIS_RULES in capability_material(get_capability("weekly_review"))
    assert "evidence_basis 里的 quote" in capability_material(get_capability("weekly_review"))


def test_the_saved_report_row_carries_the_stamp() -> None:
    """`CaseResult.as_row()` lists its keys by hand, so a value that exists on the result
    and in the terminal printout can still be missing from the file — and the file is the
    only copy anybody reads a week later to ask what generation produced a number."""
    from evals.scoring import CaseResult

    row = CaseResult(
        case_id="c1", covers="profile_thin", capability="profile_diagnose", prompt_fingerprint="0f4a2b7c9d1e"
    ).as_row()
    assert row["prompt_fingerprint"] == "0f4a2b7c9d1e"


def test_a_capability_naming_an_unshipped_tool_is_still_stamped() -> None:
    """`validate.py` allows a planned capability to name a tool that has not shipped —
    that is what "planned" means. The stamp has to stay defined for it, and has to move
    when the tool finally lands, because that is one of the changes a baseline would
    otherwise blame on the wording."""
    planned = [spec for spec in CAPABILITIES if spec.status == "planned"]
    assert planned
    for spec in planned:
        assert capability_fingerprint(spec)

    shipped = get_capability("interview_prep")
    ghost = shipped.model_copy(update={"tools": [*shipped.tools, "not_built_yet"]})
    assert "（尚未实现）" in capability_material(ghost)
    assert capability_fingerprint(ghost) != capability_fingerprint(shipped)
