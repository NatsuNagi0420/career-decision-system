"""Import the v1 catalogue as v2's knowledge base.

v1's 25 career directions (with typical work, skills, growth paths and
misconceptions), 808 real job postings, 6032 verbatim requirement lines and the
direction->job links are the only domain knowledge the product has. Rewriting
them by hand would lose the knowledge and the noise that came with it.

Idempotent: rerun after changing the mapping. Reads v1 read-only; writes only
into a career_v2* database.

  python -m scripts.import_catalog [--source DATABASE] [--limit-jobs N]
"""

from __future__ import annotations

import argparse
import json
import sys

import pymysql
from sqlalchemy import make_url, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.base import assert_safe_target, build_engine, make_session_factory
from app.db.domain import CareerDirection, DirectionJobLink, Job, JobRequirementItem

DEFAULT_SOURCE = "career_decision_system"


def source_connection(database: str) -> pymysql.connections.Connection:
    parsed = make_url(get_settings().db_url)
    return pymysql.connect(
        host=parsed.host or "127.0.0.1",
        port=int(parsed.port or 3306),
        user=parsed.username or "root",
        password=parsed.password or "",
        database=database,
        cursorclass=pymysql.cursors.DictCursor,
    )


def as_list(value: object) -> list:
    if value is None:
        return []
    if isinstance(value, (list, dict)):
        return value if isinstance(value, list) else [value]
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", "replace")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return [text]
        return parsed if isinstance(parsed, list) else [parsed]
    return [value]


def fetch_all(conn: pymysql.connections.Connection, sql: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(sql)
        return list(cur.fetchall())


def import_directions(session: Session, rows: list[dict]) -> dict[str, int]:
    by_code: dict[str, int] = {}
    for row in rows:
        existing = session.scalar(select(CareerDirection).where(CareerDirection.code == row["code"]))
        entity = existing or CareerDirection(code=row["code"])
        entity.name = row["name"]
        entity.category = row.get("category")
        entity.summary = row.get("summary") or ""
        entity.typical_work = as_list(row.get("typical_work_json"))
        entity.common_skills = as_list(row.get("common_skills_json"))
        entity.growth_path = as_list(row.get("growth_path_json"))
        entity.misconceptions = as_list(row.get("misconceptions_json"))
        entity.major_tags = as_list(row.get("major_tags_json"))
        entity.industry_tags = as_list(row.get("industry_tags_json"))
        entity.work_types = as_list(row.get("work_types_json"))
        entity.status = row.get("status") or "active"
        entity.sort_order = int(row.get("sort_order") or 0)
        entity.owner_user_id = None
        session.add(entity)
        session.flush()
        by_code[str(row["code"])] = entity.id
    return by_code


def import_jobs(session: Session, rows: list[dict]) -> dict[int, int]:
    """Keyed by the v1 numeric id so the requirement/link maps can follow."""
    mapping: dict[int, int] = {}
    for row in rows:
        title = (row.get("title") or "").strip()
        if not title:
            continue
        job = Job(
            source_platform=row.get("source_platform") or "unknown",
            source_job_code=row.get("source_job_code"),
            title=title[:200],
            normalized_title=(row.get("normalized_title") or title)[:200],
            company=(row.get("company") or "")[:200] or None,
            city=(row.get("city") or "")[:64] or None,
            salary_min=row.get("salary_min"),
            salary_max=row.get("salary_max"),
            salary_text=(row.get("salary_text") or "")[:96] or None,
            salary_period=(row.get("salary_period") or "")[:16] or None,
            experience_level=(row.get("experience_level") or "")[:64] or None,
            education=(row.get("education") or "")[:64] or None,
            description=row.get("description") or "",
            source_url=(row.get("source_url") or "")[:500] or None,
            quality_score=row.get("quality_score"),
            status=row.get("status") or "active",
        )
        session.add(job)
        session.flush()
        mapping[int(row["id"])] = job.id
    return mapping


def import_requirements(session: Session, rows: list[dict], job_map: dict[int, int]) -> int:
    created = 0
    for row in rows:
        job_id = job_map.get(int(row["job_id"]))
        text = (row.get("original_text") or "").strip()
        if job_id is None or not text:
            continue
        session.add(
            JobRequirementItem(
                job_id=job_id,
                item_type=row.get("item_type") or "requirement",
                original_text=text,
                normalized_key=(row.get("normalized_key") or "")[:120] or None,
                confidence=float(row.get("confidence") or 1),
                extractor_name=row.get("extraction_method") or "import",
                extractor_version=row.get("extractor_version") or "v1",
                sort_order=int(row.get("sort_order") or 0),
            )
        )
        created += 1
    session.flush()
    return created


def import_links(
    session: Session,
    rows: list[dict],
    job_map: dict[int, int],
    code_to_id: dict[str, int],
    direction_code_by_id: dict[int, str],
) -> int:
    """v1 linked direction->job; v2 keeps the same relation with its provenance."""
    created = 0
    for row in rows:
        code = direction_code_by_id.get(int(row["direction_id"]))
        job_id = job_map.get(int(row["job_id"]))
        direction_id = code_to_id.get(code or "")
        if direction_id is None or job_id is None:
            continue
        if session.get(DirectionJobLink, (direction_id, job_id)) is not None:
            continue
        session.add(
            DirectionJobLink(
                direction_id=direction_id,
                job_id=job_id,
                match_source=row.get("match_source") or "import",
                rule_version=row.get("rule_version") or "v1",
                review_status=row.get("review_status") or "imported",
            )
        )
        created += 1
    session.flush()
    return created


def run(source_db: str, limit_jobs: int | None) -> int:
    settings = get_settings()
    assert_safe_target(settings.db_url)
    engine = build_engine(settings.db_url)
    session_factory = make_session_factory(engine)

    with source_connection(source_db) as conn:
        directions = fetch_all(conn, "SELECT * FROM career_directions")
        jobs_sql = "SELECT * FROM jobs WHERE status IN ('active','open')" + (f" LIMIT {int(limit_jobs)}" if limit_jobs else "")
        jobs = fetch_all(conn, jobs_sql)
        imported_ids = {int(row["id"]) for row in jobs}
        requirements = [row for row in fetch_all(conn, "SELECT * FROM job_requirement_items") if int(row["job_id"]) in imported_ids]
        links = [row for row in fetch_all(conn, "SELECT * FROM career_direction_job_rel") if int(row["job_id"]) in imported_ids]

    direction_code_by_id = {int(row["id"]): str(row["code"]) for row in directions}

    with session_factory() as session:
        if session.scalar(select(CareerDirection).limit(1)) is not None:
            print("catalogue already populated; truncate career_v2 catalogue tables to re-import")
            return 1
        code_to_id = import_directions(session, directions)
        job_map = import_jobs(session, jobs)
        req_count = import_requirements(session, requirements, job_map)
        link_count = import_links(session, links, job_map, code_to_id, direction_code_by_id)
        session.commit()

    print(json.dumps({
        "directions": len(code_to_id),
        "jobs": len(job_map),
        "requirement_items": req_count,
        "direction_job_links": link_count,
    }, ensure_ascii=False))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="v1 database to read the catalogue from")
    parser.add_argument("--limit-jobs", type=int, default=None, help="import only the first N jobs")
    args = parser.parse_args()
    return run(args.source, args.limit_jobs)


if __name__ == "__main__":
    sys.exit(main())
