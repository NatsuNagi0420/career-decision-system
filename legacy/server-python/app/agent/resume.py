"""青穗集 · 简历正文由代码从行里拼，不经过模型改写。

Deterministic resume assembly: the layout is code, the content is rows.

Why not the model: `resume_build` promises "数字一律取回原文，不补造", and the only way
to make that structurally true is to never let a resume line pass through something that
can paraphrase. Every line below is copied verbatim out of one row and carries that
row's own `{table, id}`, so a fabricated achievement is not merely caught — it has no
path onto the page. Note that `_fabricated_numbers` in `graph.py` never looks inside
`content["resume"]`; the guarantee here is structural, and the test in
`tests/test_resume_draft.py` is what holds it.

An empty section says so instead of being dropped. A resume that quietly omits the
three years the person never talked about would read as "this profile has no management
experience" — which is a claim about the market, not about what we have on file.

Section order follows the Chinese convention for someone still in school (education
first) and flips to experience-first once they have graduated. The rule is the one
MyOfferAgent documents in `src/lib/resume/render/shared.ts`: counting items is not a
proxy for seniority.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select

from app.agent.profile_fields import graduation_year_of
from app.db.domain import ActionPlan, EvidenceItem, PlanTask, ProfileFact, TaskResult, UserProfile
from app.db.models import utcnow

#: Longest line we print, and most lines per section. Truncation is announced, never silent.
MAX_TEXT = 600
MAX_LINES = 12

SECTIONS: tuple[dict[str, Any], ...] = (
    {
        "key": "education",
        "title": "教育背景",
        "dimensions": ["education", "school"],
        "ask": "补学校、专业和毕业年份",
    },
    {
        "key": "experience",
        "title": "实习与项目",
        "dimensions": ["experience", "project", "projects", "internship", "work"],
        "kinds": ["action_result", "internship", "project", "work"],
        "ask": "说一段实习或项目，确认后会进这一节",
    },
    {
        "key": "skills",
        "title": "技能与工具",
        "dimensions": ["skills", "tools"],
        "ask": "说你会的具体工具，而不是「学习能力强」",
    },
    {
        "key": "awards",
        "title": "证书与获奖",
        "dimensions": ["awards", "certificates", "honors"],
        "ask": "有证书或获奖就说一句，没有就留着空",
    },
    {
        "key": "evidence",
        "title": "了解到的外部事实",
        "kinds": ["job_signal", "interview", "conversation"],
        "ask": "如果你去核实过一个岗位，把要求原话告诉我",
    },
    # Measured live: the model files facts under the payload's default `context`, and one
    # run can only propose one fact, so a whitelist of dimensions would silently drop
    # almost everything a person actually said. Anything unclassified lands here rather
    # than vanishing — a resume that quietly loses an approved sentence is worse than one
    # that shows it under a dull heading.
    {"key": "other", "title": "其他你说过的事实", "dimensions": [], "ask": "想起什么就说一句，确认后会记下来"},
)

EDUCATION_FIRST = ("education", "experience", "skills", "awards", "evidence", "other")
EXPERIENCE_FIRST = ("experience", "education", "skills", "awards", "evidence", "other")


def _line(text: str, ref: dict[str, Any], quote: str = "") -> dict[str, Any]:
    text = " ".join(str(text).split())
    if len(text) > MAX_TEXT:
        text = f"{text[:MAX_TEXT]}…（原文更长，已截断）"
    return {"text": text, "ref": ref, "quote": " ".join((quote or "").split())}


def _order(graduation_year: int | None) -> tuple[tuple[str, ...], str]:
    """Which sequence, and why — the reason is printed so the person can overrule it."""
    if graduation_year and graduation_year < utcnow().year:
        return EXPERIENCE_FIRST, f"{graduation_year} 年已毕业，经历放在教育前面"
    if graduation_year:
        return EDUCATION_FIRST, f"还要到 {graduation_year} 年才毕业，教育放在最前"
    return EDUCATION_FIRST, "还不知道你哪年毕业，先按在校的顺序排"


def assemble_resume(session: Any, *, user_id: int, project_id: str | None, goal: str = "", **_: Any) -> dict[str, Any]:
    """Build the resume body from rows the person actually put in. Writes nothing."""
    lines: dict[str, list[dict[str, Any]]] = {section["key"]: [] for section in SECTIONS}

    # Every confirmed fact, not only the classified ones: `other` exists precisely to
    # catch the dimensions no section claims. Filtering by a whitelist here would put
    # that section back to empty and lose the sentence again.
    facts = list(
        session.scalars(
            select(ProfileFact)
            .where(ProfileFact.user_id == user_id, ProfileFact.confirmed.is_(True))
            .order_by(ProfileFact.created_at)
        )
    )
    for fact in facts:
        home = next((section["key"] for section in SECTIONS if fact.dimension in section.get("dimensions", [])), "other")
        lines[home].append(_line(fact.statement, {"table": "profile_facts", "id": fact.id}))

    profile = session.get(UserProfile, user_id)
    education_blob = " ".join(line["text"] for line in lines["education"])
    profile_lines: list[dict[str, Any]] = []
    if profile is not None:
        for text in (
            " ".join(part for part in (profile.school, profile.major) if part),
            f"{profile.graduation_year} 年毕业" if profile.graduation_year else "",
            f"意向城市：{'、'.join(profile.city_targets)}" if profile.city_targets else "",
        ):
            # Confirmed sentences are the source of truth. Structured columns only
            # fill a gap; repeating them next to the original sentence looks like two
            # educations.
            if text.strip() and text.strip() not in education_blob:
                profile_lines.append(_line(text, {"table": "user_profiles", "id": user_id}))
    lines["education"] = profile_lines + lines["education"]

    kinds = sorted({kind for section in SECTIONS for kind in section.get("kinds", [])})
    if kinds and project_id:
        rows = session.scalars(
            select(EvidenceItem)
            .where(EvidenceItem.project_id == project_id, EvidenceItem.kind.in_(kinds))
            .order_by(EvidenceItem.created_at)
        )
        for row in rows:
            for section in SECTIONS:
                if row.kind in section.get("kinds", []):
                    lines[section["key"]].append(_line(row.statement, {"table": "evidence_items", "id": row.id}, row.quote))

    if project_id:
        # What the person brought back counts as experience whether or not it was also
        # archived as evidence — it is the one source that cannot be model-authored.
        results = session.execute(
            select(TaskResult, PlanTask.title)
            .join(PlanTask, PlanTask.id == TaskResult.task_id)
            .join(ActionPlan, ActionPlan.id == PlanTask.plan_id)
            .where(ActionPlan.project_id == project_id, TaskResult.user_id == user_id)
            .order_by(TaskResult.created_at)
        )
        for result, task_title in results:
            lines["experience"].append(_line(f"{task_title}：{result.body}", {"table": "task_results", "id": result.id}))

    year = graduation_year_of(
        profile,
        [fact.statement for fact in facts if fact.dimension in {"education", "school"}]
        or [fact.statement for fact in facts],
    )
    sequence, reason = _order(year)
    by_key = {section["key"]: section for section in SECTIONS}
    sections: list[dict[str, Any]] = []
    for key in sequence:
        section = by_key[key]
        kept = lines[key][:MAX_LINES]
        sections.append(
            {
                "key": key,
                "title": section["title"],
                "lines": kept,
                "empty": not kept,
                "ask": "" if kept else section["ask"],
                "dropped": max(0, len(lines[key]) - MAX_LINES),
            }
        )

    filled = sum(1 for section in sections if not section["empty"])
    return {
        "sections": sections,
        "order": list(sequence),
        "order_reason": reason,
        "line_count": sum(len(section["lines"]) for section in sections),
        "filled_sections": filled,
        "section_count": len(sections),
        # Stated in the document itself: a resume built from three sentences must not
        # look like a finished resume.
        "completeness": f"{filled}/{len(sections)} 节有内容，其余是还没问过你，不是「你没有」",
        # Generated here, not in the browser, so what a person copies is byte-for-byte
        # what they were shown.
        "plain": _markdown(sections, reason),
        "improvements": _improvements(session, user_id=user_id, sections=sections, goal=goal),
    }



def _improvements(session: Any, *, user_id: int, sections: list[dict[str, Any]], goal: str) -> list[str]:
    from app.agent.jobseek import resume_improvements

    return resume_improvements(session, user_id=user_id, sections=sections, goal=goal)


def _markdown(sections: list[dict[str, Any]], reason: str) -> str:
    out = ["# 简历草稿", "", f"> {reason}"]
    for section in sections:
        out += ["", f"## {section['title']}"]
        if section["empty"]:
            out.append(f"- （还没有依据）{section['ask']}")
            continue
        out += [f"- {line['text']}" for line in section["lines"]]
        if section["dropped"]:
            out.append(f"- （另有 {section['dropped']} 条未列入）")
    return "\n".join(out) + "\n"


#: Capabilities whose artifact body is authored by code, not by the model.
#: `graph.persist_draft` looks here rather than branching on capability ids.
DETERMINISTIC_BODIES: dict[str, Any] = {"resume_build": assemble_resume}
