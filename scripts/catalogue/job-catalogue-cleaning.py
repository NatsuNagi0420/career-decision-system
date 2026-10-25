"""青穗集 · 安全读取外部岗位交付包，保留原始批次、隔离异常并幂等合并离线参考库；不连接 MySQL。"""
from __future__ import annotations

from collections import Counter
import csv
from datetime import date, datetime, timedelta
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
import zipfile

ROOT = Path(__file__).resolve().parents[2]
FILES = ("jobs.jsonl", "jobs.csv", "report.md", "leads.csv")
CITY_ALIASES = {
    "北京": ("beijing",), "上海": ("shanghai",), "广州": ("guangzhou",),
    "深圳": ("shenzhen",), "南京": ("nanjing",), "杭州": ("hangzhou",),
    "天津": ("tianjin",), "苏州": ("suzhou",), "成都": ("chengdu",),
    "武汉": ("wuhan",), "长沙": ("changsha",), "合肥": ("hefei",),
    "无锡": ("wuxi",), "福州": ("fuzhou",), "中山": ("zhongshan",),
    "东莞": ("dongguan",), "惠州": ("huizhou",),
}


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def packed(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists() and path.read_text("utf-8") == text:
        return
    temporary = path.with_name(path.name + ".writing")
    temporary.write_text(text, encoding="utf-8")
    os.replace(temporary, path)


def no_duplicate_keys(pairs: list[tuple]) -> dict:
    result = {}
    for key, val in pairs:
        if key in result:
            raise ValueError("duplicate_json_key:" + key)
        result[key] = val
    return result


def canonical_url(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("unsafe_or_missing_source_url")
    _ = parsed.port  # Reject malformed ports instead of silently producing a different URL.
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"spm", "pcm", "from", "source", "ref"}]
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"), urlencode(sorted(query)), ""))


def read_archive(path: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 40 or sum(e.file_size for e in entries) > 50_000_000:
            raise ValueError("archive_too_large")
        names = set()
        for entry in entries:
            name = entry.filename.replace("\\", "/")
            parsed = PurePosixPath(name)
            if parsed.is_absolute() or ".." in parsed.parts or ":" in name or entry.flag_bits & 1:
                raise ValueError("unsafe_archive_member")
            if ((entry.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError("archive_symlink_not_allowed")
            if name in names or entry.file_size > 20_000_000:
                raise ValueError("duplicate_or_oversized_archive_member")
            names.add(name)
        if not set(FILES).issubset(names):
            raise ValueError("required_delivery_files_missing")
        # Only read the four named data files. Never extract or run archive-supplied code.
        return {name: archive.read(name) for name in FILES}


def normalize_csv_row(row: dict) -> dict:
    if None in row:
        raise ValueError("csv_extra_cells")
    result = {}
    for key, val in row.items():
        if val is None:
            raise ValueError("csv_missing_cells")
        result[key] = json.loads(val, object_pairs_hook=no_duplicate_keys) if key in {"schema_version", "locations", "evidence"} else None if val == "" else val
    return result


def normalize_locations(locations: list[str]) -> list[str]:
    result = []
    for text in locations:
        cities = [city for city, aliases in CITY_ALIASES.items()
                  if city in text or any(re.search(r"\b" + re.escape(alias) + r"\b", text, re.I) for alias in aliases)]
        # Unknown regions stay unknown; do not guess a city from employer, role title, or postal code.
        for city in cities or [text]:
            if city not in result:
                result.append(city)
    return result


def validate_record(job: dict, schema: dict, as_of: date) -> tuple[list[dict], list[dict]]:
    if not isinstance(job, dict) or set(job) != set(schema["required"]):
        raise ValueError("record_field_set_mismatch")
    for key, prop in schema["properties"].items():
        val = job[key]
        if "const" in prop and (val != prop["const"] or key == "schema_version" and type(val) is not int):
            raise ValueError("invalid_constant:" + key)
        if "enum" in prop and val not in prop["enum"]:
            raise ValueError("invalid_enum:" + key)
        if "type" in prop:
            types = prop["type"] if isinstance(prop["type"], list) else [prop["type"]]
            if not ((val is None and "null" in types) or (isinstance(val, str) and "string" in types)
                    or (isinstance(val, list) and "array" in types)):
                raise ValueError("invalid_type:" + key)
        if isinstance(val, str) and not val.strip():
            raise ValueError("empty_string:" + key)
    if not (1 <= len(job["title"]) <= 120 and len(job["company"]) <= 120 and 80 <= len(job["jd_text"]) <= 12000 and len(job["source_url"]) <= 2000):
        raise ValueError("document_limits")
    canonical_url(job["source_url"])
    locations = job["locations"]
    if any(not isinstance(x, str) or not x.strip() for x in locations) or len(set(locations)) != len(locations):
        raise ValueError("invalid_locations")
    cap = datetime.fromisoformat(job["captured_at"].replace("Z", "+00:00"))
    if cap.tzinfo is None or cap.utcoffset() is None or cap.date() > as_of:
        raise ValueError("invalid_capture_time")
    for key in ("published_at", "expires_at"):
        val = job[key]
        if val is not None and (not isinstance(val, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", val)):
            raise ValueError("invalid_date:" + key)
        if val is not None:
            date.fromisoformat(val)
    pub = date.fromisoformat(job["published_at"]) if job["published_at"] else None
    if pub and pub > cap.date():
        raise ValueError("future_publication_date")
    expected_use = "undated_reference" if not pub else "recent_sample" if pub >= cap.date() - timedelta(days=90) else "historical_reference"
    if job["record_use"] != expected_use:
        raise ValueError("record_use_not_supported_by_date")
    evidence, supplemental = [], []
    allowed = schema["properties"]["evidence"]["items"]["properties"]["field"]["enum"]
    if not isinstance(job["evidence"], list) or not job["evidence"]:
        raise ValueError("missing_evidence")
    for item in job["evidence"]:
        if not isinstance(item, dict) or set(item) != {"field", "quote"} or not isinstance(item["field"], str):
            raise ValueError("invalid_evidence_shape")
        if not isinstance(item["quote"], str) or not item["quote"] or item["quote"] not in job["jd_text"]:
            raise ValueError("evidence_not_in_raw_jd")
        (evidence if item["field"] in allowed else supplemental).append(item)
    required_evidence = {"title", "company", "direction_code"}
    required_evidence |= {key for key in ("education_text", "experience_text", "graduation_eligibility_text", "salary_text", "published_at", "expires_at") if job[key] is not None}
    if locations:
        required_evidence.add("locations")
    if job["recruitment_type"] != "unknown":
        required_evidence.add("recruitment_type")
    if job["recruitment_status"] != "unknown":
        required_evidence.add("recruitment_status")
    if required_evidence - {item["field"] for item in evidence}:
        raise ValueError("missing_field_evidence")
    return evidence, supplemental


def legacy_job(job: dict) -> dict:
    return {**job, "company_normalized": job["company"], "locations": [job["city"]] if job["city"] else [],
            "search_locations": [job["city"]] if job["city"] else [], "source_type": None,
            "source_domain": urlsplit(job["source_url"]).hostname or "", "published_at": None, "expires_at": None,
            "recruitment_status": "unknown", "record_use": "historical_reference", "graduation_eligibility_text": None,
            "collected_direction_code": None, "direction_codes": [], "direction_review_status": "unreviewed",
            "direction_basis": "legacy_title_rule", "review_flags": [], "review_notes": [],
            "evidence": [], "supplemental_evidence": [], "batch_id": None, "source_verification": "legacy_unknown"}


def cleaned_job(job: dict, evidence: list[dict], supplemental: list[dict], rule: dict | None, aliases: dict, batch_id: str) -> dict:
    locations = normalize_locations(job["locations"])
    direction_codes = rule["direction_codes"] if rule and rule["action"] == "reclassify" else [job["direction_code"]]
    clues = []
    text = job["title"] + "\n" + job["jd_text"]
    if job["recruitment_type"] == "internship" or "实习" in text:
        clues.append("internship_mentioned")
    if job["recruitment_type"] == "campus" or re.search(r"应届|校招|校园招聘|毕业生", text):
        clues.append("graduate_mentioned")
    city = "、".join(locations)
    signature = digest(packed([job["company"], job["title"], city, job["jd_text"]]))
    return {
        "id": "public-" + digest(canonical_url(job["source_url"]).encode())[:24],
        "title": job["title"], "company": job["company"], "company_normalized": aliases.get(job["company"], job["company"]),
        "city": city, "locations": job["locations"], "search_locations": locations,
        "description": job["jd_text"], "raw_description": job["jd_text"], "source_url": job["source_url"],
        "source_job_code": job["source_job_id"] or "", "source_platform": "public_web",
        "source_type": job["source_type"], "source_domain": urlsplit(job["source_url"]).hostname,
        "data_kind": "collected", "captured_at": job["captured_at"], "published_at": job["published_at"], "expires_at": job["expires_at"],
        "work_type": job["recruitment_type"], "audience_clues": clues, "education": job["education_text"],
        "experience_level": job["experience_text"], "salary_text": job["salary_text"] or "",
        "graduation_eligibility_text": job["graduation_eligibility_text"], "content_hash": signature,
        "recruitment_status": job["recruitment_status"], "record_use": job["record_use"],
        "collected_direction_code": job["direction_code"], "direction_codes": direction_codes,
        "direction_review_status": "needs_review" if rule else "unreviewed",
        "direction_basis": "local_review" if rule and rule["action"] == "reclassify" else "collector_suggestion",
        "review_flags": rule.get("flags", []) if rule else [], "review_notes": [rule["note"]] if rule else [],
        "evidence": evidence, "supplemental_evidence": supplemental,
        "batch_id": batch_id, "source_verification": "collector_reported",
    }


def duplicate_keys(job: dict) -> list[tuple]:
    keys = []
    if job["source_url"]:
        keys.append(("url", canonical_url(job["source_url"])))
    if job["source_job_code"] and job["source_domain"]:
        keys.append(("source_id", job["source_domain"], job["source_job_code"]))
    company = unicodedata.normalize("NFKC", job["company_normalized"]).casefold()
    text = re.sub(r"\s+", "", unicodedata.normalize("NFKC", job["description"])).casefold()
    keys.append(("company_content", company, digest(text.encode())))
    return keys


def build(base: dict, archive_path: Path, review: dict, as_of: date) -> tuple[dict, dict, dict[str, bytes]]:
    if base["schema_version"] not in {1, 2} or len(base["jobs"]) != base["source_stats"]["retained_jobs"]:
        raise ValueError("invalid_base_snapshot")
    archive_hash = digest(archive_path.read_bytes())
    contents = read_archive(archive_path)
    previous_batches = base.get("batches", [])
    existing = next((batch for batch in previous_batches if batch["archive_sha256"] == archive_hash), None)
    if existing:
        if existing["review_rules_hash"] != digest(packed(review)):
            raise ValueError("batch_rules_changed_rebuild_from_explicit_base")
        return base, {"already_merged": True, "version": base["version"], "retained_jobs": len(base["jobs"])}, contents
    if review.get("archive_sha256") != archive_hash or review.get("review_status") != "needs_human_review":
        raise ValueError("review_does_not_match_archive")
    schema = read_json(ROOT / "docs/岗位库扩充/job-collection.schema.json")
    csv_reader = csv.DictReader(io.StringIO(contents["jobs.csv"].decode("utf-8-sig"), newline=""))
    if len(csv_reader.fieldnames or []) != len(schema["required"]) or set(csv_reader.fieldnames or []) != set(schema["required"]):
        raise ValueError("csv_columns_mismatch")
    csv_rows = list(csv_reader)
    lines = [s for s in contents["jobs.jsonl"].decode("utf-8-sig").splitlines() if s.strip()]
    if len(csv_rows) != len(lines):
        raise ValueError("csv_jsonl_count_mismatch")
    leads = list(csv.DictReader(io.StringIO(contents["leads.csv"].decode("utf-8-sig"), newline="")))
    directions = {item["code"] for item in base["directions"]}
    rules = {canonical_url(item["source_url"]): item for item in review["entries"]}
    if len(rules) != len(review["entries"]):
        raise ValueError("duplicate_review_rule")
    jobs = [legacy_job(j) for j in base["jobs"]] if base["schema_version"] == 1 else list(base["jobs"])
    index = {key: job for job in jobs for key in duplicate_keys(job)}
    batch_id = "public-" + archive_hash[:16]
    additions, quarantine, duplicates, adaptations, changes = [], [], [], [], []
    used_rules = set()
    for row, (line, csv_row) in enumerate(zip(lines, csv_rows), 1):
        raw = None
        try:
            raw = json.loads(line, object_pairs_hook=no_duplicate_keys)
            evidence, supplemental = validate_record(raw, schema, as_of)
            if normalize_csv_row(csv_row) != raw:
                raise ValueError("csv_jsonl_record_mismatch")
            rule_key = canonical_url(raw["source_url"])
            rule = rules.get(rule_key)
            if rule:
                used_rules.add(rule_key)
                if raw["title"] != rule["expected_title"] or digest(raw["jd_text"].encode()) != rule["expected_jd_sha256"]:
                    raise ValueError("review_content_changed")
                if rule["action"] not in {"reclassify", "quarantine", "flag"}:
                    raise ValueError("invalid_review_action")
                if rule["action"] == "quarantine":
                    raise ValueError("direction_unresolved:" + rule["note"])
            if supplemental:
                adaptations.append({"row": row, "source_url": raw["source_url"], "moved_to_supplemental_evidence": supplemental})
            clean = cleaned_job(raw, evidence, supplemental, rule, review.get("company_aliases", {}), batch_id)
            if not set(clean["direction_codes"]).issubset(directions):
                raise ValueError("unknown_direction")
            match = next((index[key] for key in duplicate_keys(clean) if key in index), None)
            if match:
                if match["description"] != clean["description"]:
                    raise ValueError("source_version_conflict:" + match["id"])
                duplicates.append({"row": row, "duplicate_of": match["id"], "source_url": raw["source_url"]})
                continue
            if rule:
                changes.append({"row": row, "action": rule["action"], "id": clean["id"], "from": raw["direction_code"], "to": clean["direction_codes"], "note": rule["note"]})
            additions.append(clean)
            for key in duplicate_keys(clean):
                index[key] = clean
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            quarantine.append({"row": row, "reason": str(exc), "raw_record": raw, "raw_line": line if raw is None else None})
    if set(rules) - used_rules:
        raise ValueError("review_rules_not_matched")
    if not additions:
        raise ValueError("no_valid_additions")
    jobs.extend(additions)
    if len({j["id"] for j in jobs}) != len(jobs):
        raise ValueError("duplicate_catalogue_id")
    reason_counts = Counter(base["source_stats"]["exclusion_reasons"])
    reason_counts.update("batch_quarantine:" + q["reason"].split(":")[0] for q in quarantine)
    reason_counts.update({"batch_duplicate": len(duplicates)} if duplicates else {})
    stats = {"source_rows": base["source_stats"]["source_rows"] + len(lines), "retained_jobs": len(jobs),
             "excluded_jobs": base["source_stats"]["excluded_jobs"] + len(quarantine) + len(duplicates),
             "exclusion_reasons": dict(reason_counts)}
    if stats["source_rows"] != stats["retained_jobs"] + stats["excluded_jobs"]:
        raise ValueError("source_counts_do_not_reconcile")
    batch = {"id": batch_id, "archive_sha256": archive_hash, "source_rows": len(lines), "retained_jobs": len(additions),
             "quarantined_jobs": len(quarantine), "duplicate_jobs": len(duplicates), "leads": len(leads),
             "captured_from": min(j["captured_at"] for j in additions), "captured_to": max(j["captured_at"] for j in additions),
             "review_rules_hash": digest(packed(review)), "source_verification": "collector_reported"}
    content = {"schema_version": 2, "directions": base["directions"], "jobs": jobs, "source_stats": stats,
               "batches": [*previous_batches, batch], "legacy_version": base.get("legacy_version", base["version"])}
    version = digest(packed(content))[:16]
    snapshot = {**content, "version": version, "exported_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "notice": "离线岗位参考库，含旧历史资料与公开采集样本；采集时间为采集方报告，不保证仍在招聘。近期分类不等于当前开放；方向均未完成人工审核，数量不是市场统计。"}
    report = {"already_merged": False, "as_of": as_of.isoformat(), "version": version, "base_version": base["version"],
              "archive": str(archive_path), "archive_sha256": archive_hash, "batch": batch, "source_stats": stats,
              "new_by_direction": dict(Counter(code for j in additions for code in j["direction_codes"])),
              "new_by_record_use": dict(Counter(j["record_use"] for j in additions)),
              "known_closed_or_past_deadline": [{"id": j["id"], "title": j["title"], "expires_at": j["expires_at"], "recruitment_status": j["recruitment_status"]} for j in additions
                  if j["recruitment_status"] == "closed_explicit" or j["expires_at"] and j["expires_at"] < as_of.isoformat()],
              "reclassifications_and_flags": changes, "adaptations": adaptations, "duplicates": duplicates, "quarantine": quarantine,
              "raw_source_preserved": True, "mysql_modified": False, "source_verification": "collector_reported"}
    return snapshot, report, contents
