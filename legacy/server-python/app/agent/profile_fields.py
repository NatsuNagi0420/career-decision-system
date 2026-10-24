"""青穗集 · 从已确认的画像句子里读出结构化字段。

画像写入走的是一句一句的事实，简历排序却读 user_profiles.graduation_year。
两边不同步时，人已经说了毕业年份，纸面上却写「还不知道你哪年毕业」。
这里只填空，不覆盖人已经订过的结构化值，也不把没说过的学校/城市补进去。
"""

from __future__ import annotations

import re
from typing import Any

YEAR_RE = re.compile(r"(19\d{2}|20[0-3]\d)\s*年(?:毕业|生)")
SCHOOL_RE = re.compile(r"([\u4e00-\u9fff]{2,20}(?:大学|学院|学校))")
MAJOR_RE = re.compile(r"(?:大学|学院|学校)\s*([\u4e00-\u9fffA-Za-z0-9]{2,20})专业")
CITY_RE = re.compile(r"(?:目标城市|意向城市|城市)[：:，,\s]*([\u4e00-\u9fff]{2,8})")

#: 求职画像默认要看的维度。get_profile 的缺省查询和覆盖率分母共用这一份，避免各写各的。
PROFILE_DIMENSIONS: tuple[str, ...] = (
    "education",
    "skills",
    "experience",
    "awards",
    "constraints",
    "interests",
    "values",
)


def graduation_year_from(text: str) -> int | None:
    match = YEAR_RE.search(text or "")
    return int(match.group(1)) if match else None


def school_from(text: str) -> str | None:
    match = SCHOOL_RE.search(text or "")
    return match.group(1) if match else None


def major_from(text: str) -> str | None:
    match = MAJOR_RE.search(text or "")
    if match:
        return match.group(1)
    school = school_from(text)
    year = YEAR_RE.search(text or "")
    if not school:
        return None
    rest = text.split(school, 1)[1]
    if year:
        rest = rest[: rest.find(year.group(0))]
    rest = re.sub(r"[，,。；;、\s]+", "", rest).replace("专业", "")
    if 2 <= len(rest) <= 30 and re.fullmatch(r"[\u4e00-\u9fffA-Za-z0-9]+", rest):
        return rest
    return None


def cities_from(text: str) -> list[str]:
    found: list[str] = []
    for match in CITY_RE.finditer(text or ""):
        city = match.group(1).rstrip("。；;，,")
        if city and city not in found:
            found.append(city)
    return found


def graduation_year_of(profile: Any, statements: list[str]) -> int | None:
    """Structured column first; otherwise the first education sentence that names a year."""
    year = getattr(profile, "graduation_year", None) if profile is not None else None
    if year:
        return int(year)
    for statement in statements:
        parsed = graduation_year_from(statement)
        if parsed:
            return parsed
    return None


def apply_statement(profile: Any, *, dimension: str, statement: str) -> dict[str, Any]:
    """Fill empty UserProfile columns from one confirmed sentence. Returns what changed."""
    changed: dict[str, Any] = {}
    if dimension in {"education", "school"}:
        if not profile.graduation_year:
            year = graduation_year_from(statement)
            if year:
                profile.graduation_year = year
                changed["graduation_year"] = year
        if not profile.school:
            school = school_from(statement)
            if school:
                profile.school = school
                changed["school"] = school
        if not profile.major:
            major = major_from(statement)
            if major:
                profile.major = major
                changed["major"] = major
    if dimension == "constraints":
        extra = cities_from(statement)
        current = list(profile.city_targets or [])
        merged = list(current)
        for city in extra:
            if city not in merged:
                merged.append(city)
        if merged != current:
            profile.city_targets = merged
            changed["city_targets"] = merged
    return changed
