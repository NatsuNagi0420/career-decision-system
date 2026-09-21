"""The artifact must name the rows its quotes came from, not just the tools it called.

目标二's first acceptance line is "所有要求证据的 Artifact 都包含来源引用". Measured before this
test existed, `artifact.source_refs` held exactly two kinds of entry — the run id and the
tool names (`graph.py:628`) — so a quoted job requirement was only traceable by replaying
the run's durable events. §34 counted that gap: 44 of 70 quotes in one rerun lived in the
payload text (`only_in_payload`) rather than in the artifact's own references.

Attribution is code's job here on purpose: if the model named the row, a row it never read
could be cited.
"""

from __future__ import annotations

from app.agent.graph import _attribute_quotes


def test_a_quote_binds_the_rows_the_tool_that_answered_it_read() -> None:
    row = {"job_id": "7", "title": "数据分析师", "line": "数据分析师｜B 公司｜广州｜10-15k"}
    facts = {"get_job_samples": {"count": 1, "samples": [row]}}
    traced = {"get_job_samples": [{"table": "jobs", "id": "7"}]}
    quotes = {"要看市场": "数据分析师｜B 公司｜广州｜10-15k"}
    claims, refs = _attribute_quotes(quotes, facts, traced)

    assert claims == {"要看市场": ["get_job_samples"]}, "出处由代码从模型看到过的回执里认出来"
    assert refs == [{"table": "jobs", "id": "7"}], "成果物自己就带着被引过的那一行"


def test_punctuation_and_width_do_not_break_a_bind() -> None:
    """The model may copy a sentence with its own separators; that is 换标点, not a lie."""
    facts = {"get_requirement_items": {"count": 1, "items": [{"item_id": "3", "original_text": "熟悉 SQL、Python"}]}}
    traced = {"get_requirement_items": [{"table": "job_requirement_items", "id": "3"}]}
    _, refs = _attribute_quotes({"要求": "熟悉 SQL, Ｐｙｔｈｏｎ"}, facts, traced)

    assert refs == [{"table": "job_requirement_items", "id": "3"}]


def test_a_quote_no_tool_answered_with_binds_nothing() -> None:
    """The honest answer to "where did this come from" is silence, not a plausible table."""
    facts = {"get_job_samples": {"count": 1, "samples": [{"title": "数据分析师"}]}}
    traced = {"get_job_samples": [{"table": "jobs", "id": "7"}]}
    claims, refs = _attribute_quotes({"编的": "深圳 数据分析 应届可投"}, facts, traced)

    assert claims == {} and refs == []


def test_a_failed_tool_call_never_lends_its_rows_to_a_quote() -> None:
    """`traced` is built from `tool_trace` rows where `ok` is true, so an errored call's
    refs are already absent — this pins the shape the caller relies on."""
    facts = {"get_job_samples": {"count": 1, "samples": [{"title": "数据分析师"}]}}
    claims, refs = _attribute_quotes({"要看": "数据分析师"}, facts, traced={"get_job_samples": []})

    assert claims == {"要看": ["get_job_samples"]}, "答过内容的工具仍然算出处，只是它没给行指针"
    assert refs == []
