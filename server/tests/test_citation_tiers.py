"""The citation ladder: verbatim → punctuation → re-joined fields → not in the row.

目标五's 95% is only worth having if the tiers between "copied exactly" and "made this
up" are counted separately. `_tier_of` is pure — it takes the cells of one row — so the
whole ladder is checkable without a database or a model call.
"""

from evals.corpus import _normalise, _tier_of

JOB = {
    "title": "前端开发",
    "company": "成都星野科技有限公司",
    "city": "成都",
    "salary_text": "2-3万",
    "description": "负责 Web 前端开发与性能优化。",
}


def tier(quote: str) -> str | None:
    return _tier_of(quote, _normalise(quote), JOB)


def test_a_word_for_copy_is_verbatim() -> None:
    assert tier("负责 Web 前端开发与性能优化。") == "verbatim"


def test_a_copy_with_only_its_punctuation_changed_is_insensitive() -> None:
    # Same sentence, one space shorter: still in the row, just not byte for byte.
    assert tier("负责Web前端开发与性能优化。") == "insensitive"


def test_fields_quoted_back_in_a_different_order_are_still_the_same_row() -> None:
    # The tool renders a job as `title｜company｜city｜salary`; the model re-joins the
    # pieces. Every fragment still has to be in this row, so this forgives formatting
    # and nothing else.
    assert tier("前端开发｜成都星野科技有限公司｜成都｜2-3万") == "recomposed"


def test_one_wrong_field_is_not_a_quote_but_a_claim() -> None:
    assert tier("前端开发｜上海｜2-3万") is None
    assert tier("后端开发｜成都星野科技有限公司｜成都｜2-3万") is None


def test_a_number_from_another_column_does_not_vouch_for_the_rest() -> None:
    # "2024" is nowhere in this row even though `_INSENSITIVE` keeps digits; the check is
    # membership, not a character-overlap similarity score.
    assert tier("前端开发｜2024 届｜2-3万") is None
    assert "2024" not in _normalise("\n".join(JOB.values()))
