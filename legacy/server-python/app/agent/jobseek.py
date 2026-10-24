"""青穗集 · 求职主路径的确定性计算：对照岗位、缺口、练习题，不让模型编名单。

人要的是：画像 → 对得上哪些岗 → 还差什么 / 有没有题可练 → 再写简历。
岗位名单和题库必须来自目录与本文件收录，模型只能写旁白。没有采集日期的岗
只能当参考样本，不能当成「现在还在招」。题库没收录的技能就说没有，不现场编题。
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.agent.profile_fields import graduation_year_of
from app.db.catalogue import is_legacy, retrieval_ready_jobs, student_main_jobs
from app.db.domain import CareerDirection, DirectionJobLink, Job, JobRequirementItem, ProfileFact, UserProfile

# Tokens we know how to look for in a sentence. Anything else stays in the raw
# statement and is not treated as a skill we can match.
SKILL_LEXICON: tuple[str, ...] = (
    "Python",
    "Java",
    "SQL",
    "MySQL",
    "Excel",
    "Linux",
    "Git",
    "Docker",
    "Go",
    "C++",
    "JavaScript",
    "React",
    "Vue",
    "Redis",
    "Spring",
    "Hive",
    "Spark",
    "Tableau",
    "PowerBI",
    "BI",
    "数据分析",
    "机器学习",
    "后端",
    "前端",
    "测试",
)

# Small, original practice items. This is a real bank of a few cards, not a
# generated exam dump. A skill with no row here is reported as 暂无收录.
PRACTICE_BANK: tuple[dict[str, str], ...] = (
    {"skill": "SQL", "prompt": "INNER JOIN 和 LEFT JOIN，没匹配上的左表行还在不在？", "hint": "INNER 丢掉，LEFT 还在，右表字段是空。"},
    {"skill": "SQL", "prompt": "已经 GROUP BY 了，还想过滤「每个组的行数 > 10」，用 WHERE 还是 HAVING？", "hint": "WHERE 在分组前，HAVING 在分组后。"},
    {"skill": "SQL", "prompt": "COUNT(*) 和 COUNT(列名) 碰到 NULL 时差在哪？", "hint": "COUNT(*) 计行，COUNT(列) 不计 NULL。"},
    {"skill": "Python", "prompt": "list 和 tuple 最关键的一条差别是什么？", "hint": "list 可变，tuple 不可变。"},
    {"skill": "Python", "prompt": "字典用什么当键通常是安全的？list 行不行？", "hint": "键要可哈希；list 不行，tuple/str 可以。"},
    {"skill": "Python", "prompt": "`is` 和 `==` 比的不是同一件事。各比什么？", "hint": "`is` 比是不是同一个对象，`==` 比值。"},
    {"skill": "Java", "prompt": "ArrayList 和 LinkedList 更适合按下标随机读的是哪个？", "hint": "ArrayList 连续内存，按下标更快。"},
    {"skill": "Java", "prompt": "HashMap 的键如果可变，最常见的坑是什么？", "hint": "改了键的内容后，可能再也找不到这条。"},
    {"skill": "Git", "prompt": "还没 commit 的改动，想丢弃工作区修改，用哪条命令？", "hint": "git checkout -- 文件 或 git restore。"},
    {"skill": "Git", "prompt": "commit 之后、还没 push，想改上一条说明，常用哪条？", "hint": "git commit --amend。已 push 的历史不要乱改。"},
    {"skill": "Excel", "prompt": "VLOOKUP 找不到时常见返回什么？想显示空白该怎么包一层？", "hint": "返回 #N/A，用 IFNA 包住。"},
    {"skill": "数据分析", "prompt": "平均数被极端值拉歪时，还该看哪个集中趋势？", "hint": "中位数更稳。"},
)

MAX_JOBS = 3
MAX_QUOTES_PER_JOB = 3
MAX_PACK_JOBS = 40
JOB_ID_RE = re.compile(r"job_id\s*=\s*(\d+)")


def tokens_from(text: str) -> list[str]:
    blob = text or ""
    folded = blob.casefold()
    found: list[str] = []
    for token in SKILL_LEXICON:
        if token.casefold() in folded and token not in found:
            found.append(token)
    return found


def job_id_in_goal(goal: str) -> int | None:
    match = JOB_ID_RE.search(goal or "")
    return int(match.group(1)) if match else None


def profile_tokens(session: Any, user_id: int, extra: str = "") -> dict[str, Any]:
    profile = session.get(UserProfile, user_id)
    facts = list(
        session.scalars(
            select(ProfileFact).where(ProfileFact.user_id == user_id, ProfileFact.confirmed.is_(True))
        )
    )
    blob = " ".join(
        [
            extra,
            (profile.school or "") if profile else "",
            (profile.major or "") if profile else "",
            *[fact.statement for fact in facts],
        ]
    )
    skills = tokens_from(blob)
    cities = list(profile.city_targets or []) if profile else []
    year = graduation_year_of(profile, [fact.statement for fact in facts if fact.dimension == "education"])
    return {
        "skills": skills,
        "cities": cities,
        "facts": facts,
        "profile": profile,
        "graduation_year": year,
        "fact_count": len(facts),
        "blob": blob,
    }


def practice_for(skills: list[str]) -> list[dict[str, Any]]:
    wanted = {item.casefold() for item in skills}
    return [{**item, "found": True} for item in PRACTICE_BANK if item["skill"].casefold() in wanted]


def _job_haystack(job: Job) -> str:
    parts = [job.title or "", job.company or "", job.city or "", job.description or ""]
    for item in job.requirement_items or []:
        parts.append(item.original_text or "")
    return " ".join(parts)


def _quote_hits(job: Job, skills: list[str]) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for item in job.requirement_items or []:
        text = item.original_text or ""
        matched = [token for token in skills if token.casefold() in text.casefold()]
        if skills and not matched:
            continue
        if not text:
            continue
        hits.append(
            {
                "claim": f"{job.title} 的要求原话",
                "quote": text,
                "source": "岗位要求条目",
                "item_id": item.id,
                "matched": matched,
            }
        )
        if len(hits) >= MAX_QUOTES_PER_JOB:
            break
    if not hits:
        for item in (job.requirement_items or [])[:1]:
            if not item.original_text:
                continue
            hits.append(
                {
                    "claim": f"{job.title} 的要求原话",
                    "quote": item.original_text,
                    "source": "岗位要求条目",
                    "item_id": item.id,
                    "matched": [],
                }
            )
    return hits


def _score(job: Job, skills: list[str], cities: list[str], goal_tokens: list[str]) -> tuple[int, list[str]]:
    hay = _job_haystack(job).casefold()
    hit: list[str] = []
    for token in [*skills, *goal_tokens]:
        if token.casefold() in hay and token not in hit:
            hit.append(token)
    score = len(hit) * 10 + int(job.quality_score or 0)
    if cities and job.city and any(city in (job.city or "") for city in cities):
        score += 5
        if "城市" not in hit:
            hit.append("城市")
    return score, hit


def _fetch_jobs(session: Any, base, tokens: list[str]) -> list[Job]:
    stmt = base.options(selectinload(Job.requirement_items)).order_by(Job.quality_score.desc(), Job.id)
    if tokens:
        likes = []
        for token in tokens:
            pattern = f"%{token}%"
            likes.extend(
                [
                    Job.title.like(pattern),
                    Job.description.like(pattern),
                    Job.company.like(pattern),
                    JobRequirementItem.original_text.like(pattern),
                ]
            )
        filtered = (
            stmt.outerjoin(JobRequirementItem, JobRequirementItem.job_id == Job.id)
            .where(or_(*likes))
            .distinct()
            .limit(MAX_PACK_JOBS)
        )
        rows = list(session.scalars(filtered).unique())
        if rows:
            return rows
    return list(session.scalars(stmt.limit(MAX_PACK_JOBS)))


def _load_jobs(session: Any, tokens: list[str]) -> tuple[list[Job], bool]:
    """Student-main first. If that set is empty, fall back and mark reference-only."""
    main = _fetch_jobs(session, student_main_jobs(), tokens)
    if main:
        return main, False
    fallback = _fetch_jobs(session, retrieval_ready_jobs(), tokens)
    return fallback, True


def _directions_for(session: Any, jobs: list[Job]) -> dict[int, CareerDirection]:
    if not jobs:
        return {}
    rows = list(
        session.execute(
            select(DirectionJobLink.job_id, CareerDirection)
            .join(CareerDirection, CareerDirection.id == DirectionJobLink.direction_id)
            .where(DirectionJobLink.job_id.in_([job.id for job in jobs]))
        )
    )
    mapping: dict[int, CareerDirection] = {}
    for job_id, direction in rows:
        mapping.setdefault(int(job_id), direction)
    return mapping


def _empty_pack(*, conclusion: str, next_steps: list[str], fact_count: int, skills: list[str], cities: list[str]) -> dict[str, Any]:
    return {
        "conclusion": conclusion,
        "reference_only": False,
        "skills": skills,
        "cities": cities,
        "fact_count": fact_count,
        "jobs": [],
        "focus": None,
        "have": [],
        "missing": [],
        "next_steps": next_steps,
        "practice": [],
        "practice_missing": [],
        "evidence_basis": [],
        "uncertainties": [],
        "next_actions": next_steps[:2],
    }


def build_pack(session: Any, *, user_id: int, goal: str = "", job_id: int | None = None) -> dict[str, Any]:
    profile = profile_tokens(session, user_id, extra=goal)
    goal_tokens = tokens_from(goal)
    if not profile["fact_count"] and not profile["skills"] and not goal_tokens:
        return _empty_pack(
            conclusion="还没有可对照的经历，不能叫做推荐。先补几条你确认过的事实。",
            next_steps=["先补学校、技能或一段项目", "按已确认的经历写一份简历"],
            fact_count=0,
            skills=[],
            cities=profile["cities"],
        )

    tokens = list(dict.fromkeys([*profile["skills"], *goal_tokens]))
    jobs, reference_only = _load_jobs(session, tokens)
    if job_id is not None:
        pinned = session.get(Job, job_id)
        if pinned is not None and pinned.status == "active":
            session.refresh(pinned, attribute_names=["requirement_items"])
            jobs = [pinned, *[job for job in jobs if job.id != pinned.id]]

    ranked: list[tuple[int, list[str], Job]] = []
    for job in jobs:
        score, hit = _score(job, profile["skills"], profile["cities"], goal_tokens)
        ranked.append((score, hit, job))
    ranked.sort(key=lambda row: (-row[0], row[2].id))
    top = ranked[:MAX_JOBS]
    directions = _directions_for(session, [row[2] for row in top])

    cards: list[dict[str, Any]] = []
    evidence: list[dict[str, Any]] = []
    for _score_value, hit, job in top:
        quotes = _quote_hits(job, profile["skills"] or goal_tokens)
        direction = directions.get(job.id)
        card = {
            "job_id": job.id,
            "title": job.title,
            "company": job.company or "",
            "city": job.city or "",
            "salary_text": job.salary_text or "",
            "matched": hit,
            "matched_count": len([item for item in hit if item != "城市"]),
            "reference_only": reference_only or is_legacy(job),
            "direction": direction.name if direction else "",
            "growth_path": list(direction.growth_path or []) if direction else [],
            "quotes": [{"text": item["quote"], "id": item["item_id"]} for item in quotes],
        }
        cards.append(card)
        for item in quotes:
            evidence.append({"claim": item["claim"], "quote": item["quote"], "source": item["source"]})

    focus = cards[0] if cards else None
    missing: list[dict[str, Any]] = []
    have: list[dict[str, Any]] = []
    if focus:
        pinned_job = next(job for _, __, job in top if job.id == focus["job_id"])
        skills = profile["skills"]
        for item in pinned_job.requirement_items or []:
            text = item.original_text or ""
            if not text:
                continue
            matched = [token for token in skills if token.casefold() in text.casefold()]
            row = {"text": text, "id": item.id, "matched": matched}
            (have if matched else missing).append(row)

    missing_skills: list[str] = []
    for row in missing:
        missing_skills.extend(tokens_from(row["text"]))
    missing_skills = list(dict.fromkeys(missing_skills))
    practice_skills = missing_skills or profile["skills"] or goal_tokens
    bank = practice_for(practice_skills)
    uncovered = [skill for skill in practice_skills if skill.casefold() not in {row["skill"].casefold() for row in bank}]

    if not cards:
        conclusion = "目录里现在没有能引用的岗位样本，所以没有岗位名单。"
    elif reference_only:
        conclusion = f"对上了 {len(cards)} 个参考岗位。这些行没有采集日期，不能当成现在还在招的推荐。"
    else:
        conclusion = f"按你已确认的经历，对上了 {len(cards)} 个岗位，依据是岗位要求原话。"

    next_steps: list[str] = []
    if focus:
        next_steps.extend([str(item) for item in focus.get("growth_path") or []][:2])
    for row in missing[:3]:
        next_steps.append(f"补一条能对应这句原话的经历：{row['text']}")
    if not next_steps:
        next_steps.append("先补学校、技能或一段项目，对照才会从「参考」变成「对得上」。")

    uncertainties: list[str] = []
    if reference_only and cards:
        uncertainties.append("岗位行没有采集日期，不能当成当前市场仍在招。")
    if uncovered:
        uncertainties.append("题库没有收录这些技能，不会现场编题。")

    return {
        "conclusion": conclusion,
        "reference_only": reference_only,
        "skills": profile["skills"],
        "cities": profile["cities"],
        "fact_count": profile["fact_count"],
        "jobs": cards,
        "focus": focus,
        "have": have[:6],
        "missing": missing[:8],
        "next_steps": next_steps[:4],
        "practice": bank,
        "practice_missing": uncovered,
        "evidence_basis": evidence[:8],
        "uncertainties": uncertainties,
    }


def assemble_job_match(session: Any, *, user_id: int, project_id: str | None = None, goal: str = "", **_: Any) -> dict[str, Any]:
    pack = build_pack(session, user_id=user_id, goal=goal, job_id=job_id_in_goal(goal))
    if pack["jobs"]:
        pack["next_actions"] = [
            "对照其中一个岗位，看我还缺什么、有没有练习题",
            "按已确认的经历写一份简历",
        ]
    else:
        pack["next_actions"] = list(pack.get("next_steps") or ["先补学校、技能或一段项目"])[:2]
    return pack


def assemble_learning_path(session: Any, *, user_id: int, project_id: str | None = None, goal: str = "", **_: Any) -> dict[str, Any]:
    pack = build_pack(session, user_id=user_id, goal=goal, job_id=job_id_in_goal(goal))
    if pack["focus"]:
        title = pack["focus"]["title"]
        pack["conclusion"] = (
            f"对照「{title}」：已有 {len(pack['have'])} 条原话能对上，还缺 {len(pack['missing'])} 条。"
            + (" 题库只列出已收录的练习。" if pack["practice"] else " 题库还没有收录对应练习。")
        )
    pack["next_actions"] = ["按已确认的经历写一份简历", "再补一条能对上缺口原话的经历"]
    return pack


def resume_improvements(session: Any, *, user_id: int, sections: list[dict[str, Any]], goal: str = "") -> list[str]:
    """Empty resume sections plus unmatched JD quotes. This is the optimisation: point, don't rewrite."""
    out: list[str] = []
    for section in sections:
        if section.get("empty") and section.get("ask"):
            out.append(f"{section['title']}还是空的。{section['ask']}")
    pack = build_pack(session, user_id=user_id, goal=goal)
    for row in pack.get("missing") or []:
        text = (row.get("text") or "").strip()
        if text:
            out.append(f"对照岗位还对不上这句原话：{text}")
    return out[:6]
