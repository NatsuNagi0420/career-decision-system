"""青穗集 · 岗位批次合并器回归：原文保真、异常隔离、安全读取、去重及重复导入不增量。"""
from __future__ import annotations

from copy import deepcopy
from datetime import date
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("merge_jobs", ROOT / "scripts/job-catalogue-cleaning.py")
merge = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(merge)
ARCHIVE = ROOT / "docs/岗位库扩充/待导入/qing_sui_job_research_2026-10-24.zip"


class MergeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        text = "合成测试旧样本，仅用于保真回归，不是真实招聘。" * 8
        legacy = {"id": "synthetic-legacy", "title": "合成测试岗位", "company": "合成公司", "city": "北京", "description": text, "raw_description": text,
                  "source_url": "https://example.invalid/legacy", "source_job_code": "legacy", "source_platform": "zhaopin", "data_kind": "historical", "captured_at": None,
                  "work_type": "unknown", "audience_clues": [], "education": None, "experience_level": None, "salary_text": "", "content_hash": hashlib.sha256(text.encode()).hexdigest()}
        codes = ["frontend", "backend", "testing-quality", "data-analysis", "ai-application", "hardware-electronics", "industrial-engineering", "consulting-research", "legal-compliance"]
        cls.base = {"schema_version": 1, "version": "synthetic-test", "directions": [{"code": code} for code in codes], "jobs": [legacy],
                    "source_stats": {"source_rows": 1, "retained_jobs": 1, "excluded_jobs": 0, "exclusion_reasons": {}}}
        cls.rules = merge.read_json(ROOT / "docs/岗位库扩充/批次清洗规则_20261024.json")
        cls.schema = merge.read_json(ROOT / "docs/岗位库扩充/job-collection.schema.json")
        cls.hash_before = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
        cls.output, cls.report, contents = merge.build(cls.base, ARCHIVE, cls.rules, date(2026, 10, 24))
        cls.records = [json.loads(s) for s in contents["jobs.jsonl"].decode("utf-8-sig").splitlines() if s.strip()]

    def test_counts_preserve_all_input(self):
        self.assertEqual(len(self.output["jobs"]), 67)
        self.assertEqual(self.report["batch"]["retained_jobs"], 66)
        self.assertEqual(self.report["batch"]["quarantined_jobs"], 1)
        self.assertEqual(self.report["batch"]["duplicate_jobs"], 0)
        self.assertEqual(self.report["batch"]["leads"], 61)
        self.assertEqual(self.output["source_stats"]["source_rows"], 68)
        self.assertEqual(self.output["source_stats"]["excluded_jobs"], 1)

    def test_legacy_content_unchanged(self):
        merged = {j["id"]: j for j in self.output["jobs"]}
        for job in self.base["jobs"]:
            for key, value in job.items():
                self.assertEqual(merged[job["id"]][key], value)

    def test_raw_archive_and_evidence_not_changed(self):
        self.assertEqual(hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(), self.hash_before)
        original = {j["source_url"]: j for j in self.records}
        for job in self.output["jobs"]:
            if job["data_kind"] != "collected":
                continue
            raw = original[job["source_url"]]
            self.assertEqual(job["description"], raw["jd_text"])
            self.assertEqual(job["raw_description"], raw["jd_text"])
            self.assertCountEqual(job["evidence"] + job["supplemental_evidence"], raw["evidence"])
        self.assertEqual(len(self.report["adaptations"]), 30)

    def test_quarantine_preserves_original_record(self):
        item = self.report["quarantine"][0]
        self.assertEqual(item["row"], 31)
        self.assertEqual(item["raw_record"], self.records[30])
        self.assertTrue(item["reason"].startswith("direction_unresolved:"))

    def test_duplicate_import_is_idempotent(self):
        output, report, _ = merge.build(self.output, ARCHIVE, self.rules, date(2026, 10, 24))
        self.assertTrue(report["already_merged"])
        self.assertEqual(output, self.output)
        self.assertEqual(len(output["jobs"]), 67)

    def test_changed_rules_require_explicit_rebuild(self):
        rules = deepcopy(self.rules)
        rules["entries"][0]["note"] = "changed review note"
        with self.assertRaisesRegex(ValueError, "batch_rules_changed_rebuild_from_explicit_base"):
            merge.build(self.output, ARCHIVE, rules, date(2026, 10, 24))

    def test_rebuild_is_content_deterministic(self):
        rebuilt, report, _ = merge.build(self.base, ARCHIVE, self.rules, date(2026, 10, 24))
        self.assertEqual(rebuilt["version"], self.output["version"])
        self.assertEqual(report["batch"], self.report["batch"])

    def test_evidence_not_in_jd_rejected(self):
        job = deepcopy(self.records[0])
        job["evidence"][0]["quote"] = "原文不存在的虚构引文"
        with self.assertRaisesRegex(ValueError, "evidence_not_in_raw_jd"):
            merge.validate_record(job, self.schema, date(2026, 10, 24))

    def test_unknown_values_and_dates_are_not_filled(self):
        job = deepcopy(self.records[1])
        merge.validate_record(job, self.schema, date(2026, 10, 24))
        self.assertIsNone(job["published_at"])
        job["published_at"] = "2026-10-25"
        with self.assertRaisesRegex(ValueError, "future_publication_date"):
            merge.validate_record(job, self.schema, date(2026, 10, 24))

    def test_invalid_capture_timezone_and_calendar_date_rejected(self):
        job = deepcopy(self.records[0])
        job["captured_at"] = "2026-10-24T12:00:00"
        with self.assertRaisesRegex(ValueError, "invalid_capture_time"):
            merge.validate_record(job, self.schema, date(2026, 10, 24))
        job = deepcopy(self.records[0])
        job["published_at"] = "2026-02-30"
        with self.assertRaises(ValueError):
            merge.validate_record(job, self.schema, date(2026, 10, 24))

    def test_city_aliases_without_guessing(self):
        self.assertEqual(merge.normalize_locations(["China, Beijing", "北京市海淀区花园北路25号"]), ["北京"])
        self.assertEqual(merge.normalize_locations(["Shanghai, CN, 200040"]), ["上海"])
        self.assertEqual(merge.normalize_locations(["河北省"]), ["河北省"])
        self.assertEqual(merge.normalize_locations([]), [])

    def test_source_url_credentials_and_duplicate_json_keys_rejected(self):
        with self.assertRaises(ValueError):
            merge.canonical_url("https://name:secret@example.com/job/123")
        with self.assertRaisesRegex(ValueError, "duplicate_json_key"):
            json.loads('{"title":"one","title":"two"}', object_pairs_hook=merge.no_duplicate_keys)

    def test_csv_semantics_and_url_tracking(self):
        self.assertEqual(merge.canonical_url("https://EXAMPLE.com/jobs/1?utm_source=x&job=123&pcm=pc"), "https://example.com/jobs/1?job=123")
        with self.assertRaises(ValueError):
            merge.normalize_csv_row({"title": "one", None: ["extra"]})
        original = self.records[0]
        with zipfile.ZipFile(ARCHIVE) as z:
            reader = merge.csv.DictReader(io.StringIO(z.read("jobs.csv").decode("utf-8-sig"), newline=""))
            self.assertEqual(merge.normalize_csv_row(next(reader)), original)

    def test_zip_traversal_and_symlinks_are_rejected(self):
        for name, symlink in [("../escape.txt", False), ("jobs.jsonl", True)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "unsafe.zip"
                with zipfile.ZipFile(path, "w") as z:
                    info = zipfile.ZipInfo(name)
                    if symlink:
                        info.external_attr = 0o120777 << 16
                    z.writestr(info, "untrusted-data-not-executed")
                with self.assertRaises(ValueError):
                    merge.read_archive(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
