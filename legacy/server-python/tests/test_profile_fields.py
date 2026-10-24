"""青穗集 · 画像句子解析：只填空，不编造，不覆盖已有结构化字段。"""

from __future__ import annotations

from types import SimpleNamespace

from app.agent.profile_fields import apply_statement, cities_from, graduation_year_from, major_from, school_from


def test_parses_the_smoke_education_sentence() -> None:
    text = "测试大学计算机专业，2027 年毕业。"
    assert graduation_year_from(text) == 2027
    assert school_from(text) == "测试大学"
    assert major_from(text) == "计算机"


def test_parses_city_without_inventing_a_second_one() -> None:
    assert cities_from("目标城市广州，不接受夜班。") == ["广州"]
    assert cities_from("没有说过城市") == []


def test_apply_fills_empty_columns_only() -> None:
    profile = SimpleNamespace(graduation_year=None, school=None, major=None, city_targets=[])
    changed = apply_statement(
        profile,
        dimension="education",
        statement="南方学院 信息管理与信息系统专业，2027 年毕业",
    )
    assert changed["graduation_year"] == 2027
    assert profile.school == "南方学院"
    apply_statement(profile, dimension="education", statement="别的大学软件工程专业，2026 年毕业")
    assert profile.graduation_year == 2027
    assert profile.school == "南方学院"
