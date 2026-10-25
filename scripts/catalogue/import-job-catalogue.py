"""青穗集 · 岗位单主库导入：清洗 ZIP、备份、事务写入及审计；不发布或维护运行时 JSON 快照。"""
from __future__ import annotations
import argparse
import base64
import csv
from datetime import date, datetime
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("job_cleaning", ROOT / "scripts/catalogue/job-catalogue-cleaning.py")
cleaning = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(cleaning)


def bridge(node: str, database: Path, action: str, bundle: Path | None = None):
    command = [node, str(ROOT / "scripts/catalogue/catalogue-db.mjs"), action, str(database)]
    if bundle: command.append(str(bundle))
    result = subprocess.run(command, capture_output=True, encoding="utf-8", check=False,
                            creationflags=0x08000000 if os.name == "nt" else 0)
    if result.returncode:
        raise RuntimeError("Database bridge failed: " + result.stderr[-2000:])
    return json.loads(result.stdout)


def backup(database: Path, directory: Path):
    directory.mkdir(parents=True, exist_ok=False)
    target = directory / "agent-before.sqlite"
    source = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=30)
    copy = sqlite3.connect(target)
    try:
        source.backup(copy, pages=256, sleep=0.05)
        if copy.execute("PRAGMA integrity_check").fetchone()[0] != "ok": raise ValueError("backup_integrity_failed")
    finally:
        copy.close(); source.close()
    return {"file": str(target), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, default=ROOT / "agent/var/agent.sqlite")
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    parser.add_argument("--migration-snapshot", type=Path, help="仅首次迁移使用；运行时不会读取该文件。")
    parser.add_argument("--migration-report", type=Path)
    parser.add_argument("--log-dir", type=Path)
    args = parser.parse_args()
    database = args.database.resolve()
    if not database.is_file(): parser.error("主数据库不存在；先启动服务创建，再导入。")
    node = os.environ.get("NODE_BINARY") or shutil.which("node")
    if not node: parser.error("未找到 Node；请设置 NODE_BINARY。")
    stamp = datetime.now().strftime("%Y%m%dT%H%M%S%f")
    log = args.log_dir or ROOT / "logs" / ("catalogue-import-" + stamp)
    log.mkdir(parents=True, exist_ok=True)
    # 首次迁移先备份；后续无变化的重复批次不额外制造备份。
    recovery = backup(database, ROOT / "backups" / ("catalogue-import-" + stamp)) if args.migration_snapshot else None
    baseline = bridge(node, database, "export")
    review = cleaning.read_json(args.review)
    if args.migration_snapshot:
        if not args.migration_report: parser.error("首次迁移必须携带完整清洗报告。")
        snapshot = cleaning.read_json(args.migration_snapshot)
        report = cleaning.read_json(args.migration_report)
        if baseline and baseline["version"] != snapshot["version"]: raise ValueError("migration_target_not_empty")
        contents = cleaning.read_archive(args.archive)
        if report.get("version") != snapshot["version"]: raise ValueError("migration_report_version_mismatch")
    else:
        if not baseline: raise ValueError("catalogue_not_initialized_restore_master_backup_first")
        snapshot, report, contents = cleaning.build(baseline, args.archive, review, args.as_of)
        if report.get("already_merged"):
            result = {"imported": False, "version": baseline["version"], "samples": len(baseline["jobs"]), "reason": "identical_batch", "backup": recovery}
            (log / "import-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf-8")
            print(json.dumps(result, ensure_ascii=False)); return
    archive_hash = hashlib.sha256(args.archive.read_bytes()).hexdigest()
    batch = next(b for b in snapshot["batches"] if b["archive_sha256"] == archive_hash)
    if batch["review_rules_hash"] != cleaning.digest(cleaning.packed(review)): raise ValueError("review_rules_hash_mismatch")
    if review.get("archive_sha256") != archive_hash: raise ValueError("review_archive_mismatch")
    leads = list(csv.DictReader(io.StringIO(contents["leads.csv"].decode("utf-8-sig"), newline="")))
    if len(leads) != batch["leads"] or len(report["quarantine"]) != batch["quarantined_jobs"]: raise ValueError("handoff_counts_mismatch")
    materials = []
    def material(name, kind, content):
        materials.append({"key": batch["id"] + "/" + name, "batch_id": batch["id"], "kind": kind, "base64": base64.b64encode(content).decode("ascii")})
    material("original.zip", "original_zip", args.archive.read_bytes())
    material("review-rules.json", "review_rules", args.review.read_bytes())
    material("cleaning-report.json", "cleaning_report", json.dumps(report, ensure_ascii=False, sort_keys=True).encode())
    review_items = [{"id": batch["id"] + "/lead/" + str(i), "batch_id": batch["id"], "kind": "lead", "data": row} for i, row in enumerate(leads, 1)]
    review_items += [{"id": batch["id"] + "/quarantine/" + str(row["row"]), "batch_id": batch["id"], "kind": "quarantine", "data": row} for row in report["quarantine"]]
    if recovery is None: recovery = backup(database, ROOT / "backups" / ("catalogue-import-" + stamp))
    bundle = {"catalogue": snapshot, "expected_version": baseline["version"] if baseline else None, "materials": materials, "review_items": review_items}
    # 临时交换文件位于受控临时目录，结束即清理；唯一业务来源是主库。
    with tempfile.TemporaryDirectory(prefix="qingsuiji-catalogue-") as temporary:
        exchange = Path(temporary) / "import.json"
        exchange.write_text(json.dumps(bundle, ensure_ascii=False), "utf-8")
        result = bridge(node, database, "import", exchange)
    actual = bridge(node, database, "export")
    if actual != snapshot: raise ValueError("database_roundtrip_mismatch")
    result.update({"database": str(database), "backup": recovery, "roundtrip_verified": True,
                   "leads": len(leads), "quarantined": len(report["quarantine"]), "runtime_json_snapshots": False})
    (log / "import-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__": main()
