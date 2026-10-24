"""`data_coverage` must measure rows, not replies.

Found by the first 38-case live baseline: `bad_tool_args_city` was the one red case, and
its violation was "证据不足却写成确定结论（DirectionBrief 覆盖度 100）". The model had
mistyped a city, every catalogue tool answered `{"count": 0, "results": []}`, and
`_coverage` called that filled because a non-empty dict is truthy in Python. 目标二 says
the opposite must happen — no evidence, no certainty — so the emptiness of an answer is
now measurable, and measurable by code rather than by asking the model.
"""

from __future__ import annotations

from app.agent.graph import _answered_with_data, _coverage


def test_an_answer_that_found_nothing_is_not_coverage() -> None:
    facts = {
        "get_job_samples": {"count": 0, "samples": []},
        "get_requirement_items": {"count": 0, "items": []},
    }
    assert _coverage(facts) == 0, "空结果不是「工具答了所以有数据」"


def test_a_partial_lookup_pays_for_the_half_that_came_back_empty() -> None:
    facts = {
        "get_job_samples": {"count": 2, "samples": [{"job_id": "a"}, {"job_id": "b"}]},
        "get_requirement_items": {"count": 0, "items": []},
    }
    assert _coverage(facts) == 50


def test_rows_coming_back_still_reads_as_full_coverage() -> None:
    facts = {
        "search_directions": {"count": 1, "directions": [{"direction_id": "data_analyst"}]},
        "get_profile_facts": {"has_profile": True, "school": "某大学", "major": "统计", "city_targets": ["广州"]},
    }
    assert _coverage(facts) == 100


def test_a_tool_whose_answer_is_scalar_constraints_is_not_treated_as_empty() -> None:
    """The over-correction guard: "no list in the payload" is not the same as "found nothing".

    `plan_constraints` answers with four numbers and no rows by design. If emptiness were
    judged as "no collection present", every action plan would start looking unproven.
    """
    assert _answered_with_data({"weeks": 4, "tasks_per_week_max": 3, "total_task_budget": 12}) is True


def test_an_empty_profile_reads_as_no_data_rather_than_as_an_answer() -> None:
    assert _answered_with_data({"has_profile": False, "school": None, "major": None, "city_targets": []}) is False


def test_the_count_a_tool_reports_about_itself_never_counts_as_data() -> None:
    """`count` says how many rows came back, never that any did — including when it lies."""
    assert _answered_with_data({"count": 3}) is False
    assert _answered_with_data({"count": 3, "samples": []}) is False, "回执自报 3 条但没带行，按没数据算"
