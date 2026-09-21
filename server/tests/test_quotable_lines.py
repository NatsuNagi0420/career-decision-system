"""Catalog rows must ship one spelling the model can copy.

§33 measured the alternative: these tools returned only separate fields, so the model
stitched them into its own template (`后端开发｜技术研发：…常用技能：…`), and that sentence
exists nowhere in the data — a faithful-looking quote scored as having no source. The
remedy is a copy target on the tool side, not a looser checker, so the last test pins
the strictness down as well.
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.db.domain import CareerDirection, Job
from app.tools.domain import GetJobSamples, SearchDirections
from evals.corpus import check_quote
from tests.support import call_tool


@pytest.fixture
def rows(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        session.add(
            CareerDirection(
                code="backend_eng",
                name="后端开发",
                category="技术研发",
                summary="设计和实现服务端业务、接口、数据与稳定性能力。",
                common_skills=["编程基础", "数据库", "网络与系统设计"],
            )
        )
        session.add(
            Job(
                title="前端开发",
                company="成都星野科技有限公司",
                city="成都",
                salary_text="2-3万",
                experience_level="3-5年",
                description="负责页面与组件实现。",
                quality_score=80,
            )
        )
        session.commit()


def _direction(session_factory: sessionmaker[Session]) -> dict:
    result = call_tool(SearchDirections(), session_factory, user_id=0, arguments={"query": "后端"})
    return result.payload["directions"][0]


def test_a_direction_row_ships_the_one_line_worth_copying(session_factory: sessionmaker[Session], rows: None) -> None:
    entry = _direction(session_factory)
    body = call_tool(SearchDirections(), session_factory, user_id=0, arguments={"query": "后端"}).content(9000)
    assert entry["line"] in body, "模型只看得见 content() 那段文本，line 不在里面就没得抄"

    with session_factory() as session:
        check = check_quote(
            session, [{"table": "career_directions", "id": entry["direction_id"]}], entry["line"], read_texts=[body]
        )
    assert check.cited, f"照抄工具给的那一行必须算有出处，实际判成 {check.tier}"
    assert check.found_in == "payload", (
        f"出处只能来自工具回执正文（这一行不是任何一列的原值），实际 found_in={check.found_in}"
    )


def test_a_posting_row_ships_a_line_in_the_same_shape(session_factory: sessionmaker[Session], rows: None) -> None:
    result = call_tool(GetJobSamples(), session_factory, user_id=0, arguments={"keyword": "前端"})
    entry = result.payload["samples"][0]
    assert entry["line"] == "前端开发｜成都星野科技有限公司｜成都｜2-3万｜3-5年"
    assert entry["line"] in result.content(9000)


def test_a_sentence_the_model_stitched_itself_is_still_no_source(
    session_factory: sessionmaker[Session], rows: None
) -> None:
    """The failure we fixed, kept red on purpose: glue words are not in the data."""
    entry = _direction(session_factory)
    stitched = (
        f"{entry['name']}｜{entry['category']}：{entry['summary']}"
        f"常用技能：{'、'.join(entry['common_skills'])}。"
    )
    assert stitched != entry["line"], "这条要测的是模型自己拼的那句，别拿工具渲染的行冒充它"

    with session_factory() as session:
        check = check_quote(session, [{"table": "career_directions", "id": entry["direction_id"]}], stitched)
    assert check.tier == "unmatched", (
        "「常用技能」这几个字在任何一列里都不存在，放它过就是把标准改成能过"
    )
