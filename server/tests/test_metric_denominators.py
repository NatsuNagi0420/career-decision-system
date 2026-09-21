"""A metric must not count a designed ending as a failure.

`structured_success` read 0.895 on the first 38-case baseline — below its 0.9 bar — while
nothing in that run actually broke: two cases end `cancelled` because the student rejected
the write, and two end `failed` because the account never granted external AI consent and
the run is *supposed* to stop there. A denominator that counts those as failures sends the
next investigation to a model problem that does not exist.
"""

from evals.scoring import CaseResult, summarise


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
