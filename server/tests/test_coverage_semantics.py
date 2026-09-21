"""`data_coverage` is about evidence, not about whether the tools answered.

The first 38-case live baseline produced four artifacts that said "覆盖度 100" while the
comparison tool inside the same run reported `data_coverage: 0`. `is_provisional` — the
flag that tells a student "this is a tentative judgement" — is derived from that number,
so an unevidenced comparison was being shipped as a certain one. These two tests are the
difference between the tool's measurement winning and tool responsiveness winning.
"""

from app.agent.graph import _coverage


def test_a_tool_that_measured_its_own_coverage_outranks_tool_responsiveness() -> None:
    facts = {
        "compare_candidates": {"matrix": [], "data_coverage": 0, "missing_cells": ["产品经理 × SQL"]},
        "get_plan": {"plans": [{"id": "p1"}]},
        "search_jobs": {"jobs": [{"id": 12}]},
    }
    assert _coverage(facts) == 0


def test_tool_facts_are_nested_so_a_reported_coverage_still_counts() -> None:
    facts = {"compare_candidates": {"last_round": {"cells": []}, "round": {"data_coverage": 25}}}
    assert _coverage(facts) == 25


def test_reply_rates_still_define_coverage_when_no_tool_measured_one() -> None:
    # Two tools asked, one came back with nothing: half the ask, and nothing subtler
    # than that is what this number means when no tool has evidence of its own.
    assert _coverage({"search_jobs": {"jobs": [{"id": 1}]}, "get_profile": {}}) == 50
