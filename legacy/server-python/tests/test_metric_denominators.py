"""A metric must not count a designed ending as a failure.

`structured_success` read 0.895 on the first 38-case baseline — below its 0.9 bar — while
nothing in that run actually broke: two cases end `cancelled` because the student rejected
the write, and two end `failed` because the account never granted external AI consent and
the run is *supposed* to stop there. A denominator that counts those as failures sends the
next investigation to a model problem that does not exist.
"""

from evals.scoring import THRESHOLDS, CaseResult, summarise


def result(case_id: str, *, status: str, expects_completion: bool = True) -> CaseResult:
    item = CaseResult(case_id=case_id, covers="two_direction_compare", capability="compare_decide")
    item.run_status = status
    item.expects_completion = expects_completion
    return item


def test_a_deliberate_cancellation_is_not_a_generation_failure() -> None:
    results = [
        result("compare_two", status="completed"),
        result("compare_three", status="completed"),
        result("reject_profile_fact", status="cancelled", expects_completion=False),
        result("no_consent_frame", status="failed", expects_completion=False),
    ]
    report = summarise(results)
    assert report["metrics"]["structured_success"] == 1.0, report["metrics"]
    assert "2 例的终局本来就是取消或拒绝" in report["metric_denominators"]["structured_success"]


def test_a_run_that_should_have_finished_but_didnt_still_fails_the_bar() -> None:
    # The exclusion must not become an excuse machine: a genuinely stuck run still counts.
    results = [result("a", status="completed"), result("b", status="running")]
    report = summarise(results)
    assert report["metrics"]["structured_success"] == 0.5, report["metrics"]


def reads(case_id: str, *, tool_frames: int, empty: int) -> CaseResult:
    item = result(case_id, status="completed")
    item.tool_frames = tool_frames
    item.empty_tool_frames = empty
    return item


def test_reading_the_catalogue_and_getting_nothing_is_its_own_number() -> None:
    """§38's red case had no metric at all: every catalogue tool answered `count: 0` and
    the only trace of that was a human re-reading the report."""

    report = summarise([reads("bad_tool_args_city", tool_frames=2, empty=1), reads("compare_two", tool_frames=2, empty=0)])

    assert report["metrics"]["empty_result_reads"] == 0.25, report["metrics"]
    assert "1/4 次工具回答没有带回任何业务行" in report["metric_denominators"]["empty_result_reads"]


def test_measured_empty_is_not_the_same_as_not_measured() -> None:
    """0.0 with reads behind it is a fact; None with no frames is the absence of one.
    Collapsing them is how a gate ends up reporting full marks for measuring nothing."""

    measured = summarise([reads("a", tool_frames=3, empty=0)])
    unmeasured = summarise([reads("b", tool_frames=0, empty=0)])

    assert measured["metrics"]["empty_result_reads"] == 0.0
    assert unmeasured["metrics"]["empty_result_reads"] is None
    assert "没有工具回执可数" in unmeasured["metric_denominators"]["empty_result_reads"]
    # Report-only: it must never be able to turn the gate red on its own.
    assert "empty_result_reads" not in THRESHOLDS
