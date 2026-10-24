"""青穗集 · 一次性旧数据库退休：核对备份与现场、将只读恢复材料封入主库，仅在 --apply 时删除白名单 MySQL 库。"""
from __future__ import annotations
import argparse
from datetime import datetime
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "backups/database-consolidation-20261024"
LOG = ROOT / "logs/database-consolidation-20261024"
ALLOWED = ("career_v2", "career_decision_system", "career_db", "career_v2_test", "career_v2_eval")
spec = importlib.util.spec_from_file_location("project_backup", ROOT / "scripts/backup-project-databases.py")
backup = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(backup)
import pymysql
from dotenv import dotenv_values


def sha(data): return hashlib.sha256(data).hexdigest()
def identifier(value):
    if not value.replace("_", "").isalnum(): raise ValueError("unsafe_identifier")
    return chr(96) + value + chr(96)

def sqlite_digest(connection):
    digest = hashlib.sha256()
    for line in connection.iterdump(): digest.update(line.encode("utf-8")); digest.update(b"\n")
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="仅删除与已备份内容逐表一致且无连接/跨库引用的五个历史库。")
    args = parser.parse_args()
    manifest = json.loads((BACKUP / "manifest.json").read_text("utf-8"))
    if set(manifest["mysql"]) != set(ALLOWED): raise ValueError("incomplete_mysql_backup_set")
    current = sqlite3.connect(ROOT / "agent/var/agent.sqlite", timeout=30)
    current.execute("PRAGMA foreign_keys=ON")
    current.execute("CREATE TABLE IF NOT EXISTS legacy_database_archives(id TEXT PRIMARY KEY,engine TEXT NOT NULL,source_name TEXT NOT NULL,format TEXT NOT NULL,sha256 TEXT NOT NULL,original_bytes INTEGER NOT NULL,archived_at TEXT NOT NULL,data BLOB NOT NULL)")
    state = current.execute("SELECT version FROM catalogue_state WHERE id=1").fetchone()
    if not state or current.execute("SELECT COUNT(*) FROM catalogue_jobs").fetchone()[0] < 685: raise ValueError("catalogue_migration_not_verified")
    archive_manifest = []
    def archive(key, engine, name, kind, data):
        digest = sha(data)
        old = current.execute("SELECT sha256,data FROM legacy_database_archives WHERE id=?", (key,)).fetchone()
        if old and (old[0] != digest or sha(old[1]) != digest): raise ValueError("existing_archive_conflict:" + key)
        if not old:
            current.execute("INSERT INTO legacy_database_archives VALUES(?,?,?,?,?,?,?,?)", (key, engine, name, kind, digest, len(data), datetime.now().astimezone().isoformat(), data))
        restored = current.execute("SELECT data FROM legacy_database_archives WHERE id=?", (key,)).fetchone()[0]
        if sha(restored) != digest: raise ValueError("main_database_archive_roundtrip_failed")
        current.commit()
        archive_manifest.append({"id": key, "engine": engine, "source_name": name, "format": kind, "sha256": digest, "bytes": len(data), "main_database_roundtrip_verified": True})
    for name in ALLOWED:
        for label, kind in [("sql_backup", "mysql_sql_gzip"), ("typed_archive", "typed_json_gzip")]:
            info = manifest["mysql"][name][label]
            file = Path(info["file"]).resolve()
            if not file.is_relative_to(BACKUP.resolve()): raise ValueError("backup_path_outside_allowed_directory")
            content = file.read_bytes()
            if sha(content) != info["sha256"]: raise ValueError("backup_hash_mismatch")
            archive("mysql/" + name + "/" + kind, "mysql", name, kind, content)
    checkpoint_dir = BACKUP / "legacy-checkpoints"
    checkpoint_dir.mkdir(exist_ok=True)
    checkpoints = []
    for source in sorted((ROOT / "legacy/server-python/var").glob("*.sqlite")):
        if source.name != "checkpoints.sqlite" and not source.name.startswith("eval-checkpoints-"): continue
        compressed = checkpoint_dir / (source.name + ".gz")
        connection = sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
        try:
            connection.execute("BEGIN")
            source_digest = sqlite_digest(connection)
            if compressed.exists():
                with tempfile.TemporaryDirectory(prefix="qingsuiji-checkpoint-verify-") as temporary:
                    target = Path(temporary) / "copy.sqlite"
                    target.write_bytes(gzip.decompress(compressed.read_bytes()))
                    verify = sqlite3.connect(target)
                    try:
                        if verify.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or sqlite_digest(verify) != source_digest: raise ValueError("checkpoint_changed_since_backup")
                    finally: verify.close()
            else:
                with tempfile.TemporaryDirectory(prefix="qingsuiji-checkpoint-backup-") as temporary:
                    target = Path(temporary) / "copy.sqlite"
                    copy = sqlite3.connect(target)
                    try:
                        connection.backup(copy, pages=256, sleep=0.05)
                        if copy.execute("PRAGMA integrity_check").fetchone()[0] != "ok" or sqlite_digest(copy) != source_digest: raise ValueError("checkpoint_backup_not_exact")
                    finally: copy.close()
                    compressed.write_bytes(gzip.compress(target.read_bytes(), mtime=0))
        finally: connection.close()
        archive("sqlite/" + source.name, "sqlite", source.name, "sqlite_gzip", compressed.read_bytes())
        checkpoints.append({"source": str(source.resolve()), "backup": str(compressed.resolve()), "logical_sha256": source_digest, "backup_sha256": sha(compressed.read_bytes()), "source_files": [{"file": str(file.resolve()), "sha256": sha(file.read_bytes())} for file in [source, source.with_name(source.name + "-wal"), source.with_name(source.name + "-shm")] if file.exists()]})
    current.commit()
    if current.execute("PRAGMA integrity_check").fetchone()[0] != "ok": raise ValueError("canonical_database_integrity_failed")
    settings = {key.lower(): value for key, value in dotenv_values(ROOT / "legacy/server-python/.env").items()}
    url = urlsplit(settings.get("db_url") or "mysql+pymysql://root:root@127.0.0.1:3306/career_v2")
    connection = pymysql.connect(host=url.hostname or "127.0.0.1", port=url.port or 3306, user=unquote(url.username or "root"), password=unquote(url.password or ""), charset="utf8mb4", autocommit=True, connect_timeout=5, read_timeout=60)
    verified, removed = [], []
    try:
        with connection.cursor() as cursor:
            cursor.execute("SHOW DATABASES"); available = {row[0] for row in cursor.fetchall()}
            for name in ALLOWED:
                if name not in available: continue
                cursor.execute("SELECT ID FROM information_schema.PROCESSLIST WHERE DB=%s AND ID<>CONNECTION_ID()", (name,))
                if cursor.fetchall(): raise ValueError("old_database_has_active_connections:" + name)
                cursor.execute("SELECT TABLE_SCHEMA,TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE REFERENCED_TABLE_SCHEMA=%s AND TABLE_SCHEMA<>%s", (name, name))
                if cursor.fetchall(): raise ValueError("old_database_has_external_references:" + name)
                info = manifest["mysql"][name]
                with gzip.open(info["typed_archive"]["file"], "rt", encoding="utf-8") as file: original = json.load(file)
                cursor.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s ORDER BY TABLE_NAME", (name,))
                if [row[0] for row in cursor.fetchall()] != [table["table"] for table in original["tables"]]: raise ValueError("old_database_tables_changed:" + name)
                for table in original["tables"]:
                    qualified = identifier(name) + "." + identifier(table["table"])
                    cursor.execute("SHOW CREATE TABLE " + qualified)
                    if cursor.fetchone()[1] != table["create_sql"]: raise ValueError("old_database_schema_changed:" + name)
                    order = " ORDER BY " + ",".join(identifier(key) for key in table["primary_key"]) if table["primary_key"] else ""
                    cursor.execute("SELECT * FROM " + qualified + order)
                    if [column[0] for column in cursor.description] != table["columns"]: raise ValueError("old_database_columns_changed")
                    values = cursor.fetchall()
                    if not table["primary_key"]: values = sorted(values, key=backup.dump)
                    if len(values) != table["row_count"] or sha(backup.dump(values)) != table["rows_sha256"]: raise ValueError("old_database_rows_changed:" + name + "." + table["table"])
                verified.append({"database": name, "tables": len(original["tables"]), "rows": sum(table["row_count"] for table in original["tables"]), "live_content_matches_backup": True})
            if args.apply:
                for item in verified:
                    name = item["database"]
                    if name not in ALLOWED: raise ValueError("drop_not_allowlisted")
                    cursor.execute("SELECT ID FROM information_schema.PROCESSLIST WHERE DB=%s AND ID<>CONNECTION_ID()", (name,))
                    if cursor.fetchall(): raise ValueError("old_database_became_active:" + name)
                    # 名称来自固定白名单，不接收输入拼接；所有资料已在主库与外部备份中核对。
                    cursor.execute("DROP DATABASE " + identifier(name))
                    removed.append(name)
                    (LOG / "mysql-deleted-progress.json").write_text(json.dumps({"deleted_databases": removed}, ensure_ascii=False, indent=2), "utf-8")
    finally:
        connection.close(); current.close()
    result = {"canonical_database": str(ROOT / "agent/var/agent.sqlite"), "archives": archive_manifest, "legacy_mysql_verified": verified,
              "deleted_mysql_databases": removed, "checkpoint_backups": checkpoints, "checkpoint_source_files_deleted": False, "apply": args.apply}
    (LOG / ("retirement-result.json" if args.apply else "retirement-preview.json")).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"mysql_verified": len(verified), "deleted_mysql_databases": removed, "checkpoint_backups": len(checkpoints), "archives_in_canonical_database": len(archive_manifest), "apply": args.apply}, ensure_ascii=False))

if __name__ == "__main__": main()


