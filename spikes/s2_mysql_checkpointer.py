"""S2 spike: does the checkpointer hold up, for MySQL and for the SQLite fallback?

Saver is chosen with S2_SAVER=mysql|sqlite (default mysql).

Modes (interrupt phases run as separate processes so the crash test is real):

  prep          create the spike database
  tables        show what setup() creates (mysql only)
  conformance   official langgraph-checkpoint-conformance suite
  interrupt-a   run a graph to interrupt(), then hard-exit (simulated crash)
  interrupt-b   resume the SAME thread in a NEW process; assert no node re-ran
  concurrency   fan out parallel branches through the real graph, verify writes land
  cleanup       drop the spike database / delete the sqlite file
  all           prep + tables + conformance + interrupt-a + interrupt-b + concurrency

Credentials are parsed from backend/src/main/resources/application.yml and never printed.
Only the `career_v2_spike` database is ever touched.
"""

from __future__ import annotations

import asyncio
import operator
import os
import re
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, TypedDict
from urllib.parse import quote_plus

import pymysql
from langgraph.checkpoint.conformance import checkpointer_test, validate
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

ROOT = Path(__file__).resolve().parents[1]
SPIKE_DB = "career_v2_spike"
SQLITE_PATH = ROOT / "spikes" / "_s2_checkpoints.sqlite"
THREAD_FILE = ROOT / "spikes" / "_s2_thread.txt"
THREAD_ID = "s2-crash-thread"
SAVER_KIND = os.environ.get("S2_SAVER", "mysql").strip().lower()


def db_config() -> dict[str, Any]:
    text = (ROOT / "backend" / "src" / "main" / "resources" / "application.yml").read_text(encoding="utf-8")
    m = re.search(r"jdbc:mysql://([^:/\s\"]+):(\d+)/([^?\"\s]+)", text)
    if not m:
        raise SystemExit("could not parse jdbc:mysql url from application.yml")
    host, port, server_db = m.group(1), int(m.group(2)), m.group(3)

    def secret(pattern: str, env: str, fallback: str) -> str:
        if os.environ.get(env):
            return os.environ[env]
        mm = re.search(pattern, text)
        return (mm.group(1) or fallback) if mm else fallback

    user = secret(r"username:\s*\$\{DB_USERNAME:([^}]*)\}", "DB_USERNAME", "root")
    pwd = secret(r"password:\s*\$\{DB_PASSWORD:([^}]*)\}", "DB_PASSWORD", "root")
    return {"host": host, "port": port, "user": user, "password": pwd, "server_db": server_db}


def mysql_conn_string(cfg: dict[str, Any], database: str) -> str:
    if database != SPIKE_DB:
        raise SystemExit(f"refusing to connect to `{database}`")
    return (
        f"mysql+aiomysql://{quote_plus(cfg['user'])}:{quote_plus(cfg['password'])}"
        f"@{cfg['host']}:{cfg['port']}/{database}?charset=utf8mb4"
    )


@asynccontextmanager
async def open_saver(cfg: dict[str, Any], *, fresh: bool = False):
    """Yield a BaseCheckpointSaver. Same contract for both backends."""
    if SAVER_KIND == "sqlite":
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        if fresh and SQLITE_PATH.exists():
            SQLITE_PATH.unlink()
        async with AsyncSqliteSaver.from_conn_string(str(SQLITE_PATH)) as saver:
            yield saver
        return

    from langgraph.checkpoint.mysql.aio import AIOMySQLSaver

    if fresh:
        drop_spike_db(cfg)
        ensure_spike_db(cfg)
    async with AIOMySQLSaver.from_conn_string(mysql_conn_string(cfg, SPIKE_DB)) as saver:
        await saver.setup()
        yield saver


def ensure_spike_db(cfg: dict[str, Any]) -> None:
    with pymysql.connect(host=cfg["host"], port=cfg["port"], user=cfg["user"], password=cfg["password"], autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{SPIKE_DB}` CHARACTER SET utf8mb4")
    print(f"ready: database `{SPIKE_DB}`")


def drop_spike_db(cfg: dict[str, Any]) -> None:
    with pymysql.connect(host=cfg["host"], port=cfg["port"], user=cfg["user"], password=cfg["password"], autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP DATABASE IF EXISTS `{SPIKE_DB}`")
    print(f"dropped `{SPIKE_DB}`")


# --------------------------- crash / resume graph ---------------------------


class St(TypedDict):
    steps: Annotated[list[str], operator.add]
    approved: bool | None


def node_preload(s: St) -> dict[str, Any]:
    return {"steps": ["preload"]}


def node_gate(s: St) -> dict[str, Any]:
    decision = interrupt({"kind": "approval_request", "proposal_id": "prop-1"})
    approved = bool(decision.get("approved")) if isinstance(decision, dict) else bool(decision)
    return {"approved": approved, "steps": ["gate"]}


def node_finalize(s: St) -> dict[str, Any]:
    return {"steps": ["finalize" if s.get("approved") else "cancelled"]}


def build_graph(saver: Any):
    g = StateGraph(St)
    g.add_node("preload", node_preload)
    g.add_node("gate", node_gate)
    g.add_node("finalize", node_finalize)
    g.add_edge(START, "preload")
    g.add_edge("preload", "gate")
    g.add_edge("gate", "finalize")
    g.add_edge("finalize", END)
    return g.compile(checkpointer=saver)


def ck_id(tup: Any) -> str | None:
    ck = getattr(tup, "checkpoint", None)
    return ck.get("id") if isinstance(ck, dict) else None


async def run_conformance(cfg: dict[str, Any]) -> int:
    @checkpointer_test(name=f"{SAVER_KIND}-saver")
    async def saver_fixture():
        async with open_saver(cfg, fresh=True) as saver:
            yield saver

    report = await validate(saver_fixture)
    printer = getattr(report, "print_report", None)
    if callable(printer):
        printer()
    for name in sorted(dir(report)):
        if name.startswith("passed_all"):
            try:
                print(f"  {name}() -> {getattr(report, name)()}")
            except Exception as exc:  # noqa: BLE001
                print(f"  {name}() -> ERROR {type(exc).__name__}: {exc}")
    return 0


async def run_interrupt_phase_a(cfg: dict[str, Any]) -> int:
    async with open_saver(cfg, fresh=True) as saver:
        graph = build_graph(saver)
        res = await graph.ainvoke({"steps": [], "approved": None}, {"configurable": {"thread_id": THREAD_ID}})
        print("phase-a state:", {k: res.get(k) for k in ("steps", "approved")})
        print("interrupt surfaced:", "__interrupt__" in res)
        tup = await saver.aget_tuple({"configurable": {"thread_id": THREAD_ID}})
        print("checkpoint persisted:", tup is not None, "id:", ck_id(tup))
    THREAD_FILE.write_text(THREAD_ID, encoding="utf-8")
    print("hard-exiting now to simulate process death")
    sys.stdout.flush()
    os._exit(0)


async def run_interrupt_phase_b(cfg: dict[str, Any]) -> int:
    thread = THREAD_FILE.read_text(encoding="utf-8").strip()
    async with open_saver(cfg) as saver:
        graph = build_graph(saver)
        tup = await saver.aget_tuple({"configurable": {"thread_id": thread}})
        print("new process found checkpoint:", tup is not None, "id:", ck_id(tup))
        res = await graph.ainvoke(Command(resume={"approved": True}), {"configurable": {"thread_id": thread}})
        steps = res.get("steps") or []
        dupes = sorted({s for s in steps if steps.count(s) > 1})
        print("final steps:", steps, "| approved:", res.get("approved"))
        print("PASS-no-node-redo-after-restart:", (not dupes) and steps == ["preload", "gate", "finalize"], "| duplicated:", dupes)
    return 0


# ---------------------------- concurrency graph -----------------------------


class Fan(TypedDict):
    landed: Annotated[list[int], operator.add]


def fan_out(s: Fan) -> dict[str, Any]:
    return {}


def make_leaf(n: int):
    def leaf(s: Fan) -> dict[str, Any]:
        return {"landed": [n]}

    return leaf


async def run_concurrency(cfg: dict[str, Any], width: int = 24) -> int:
    g = StateGraph(Fan)
    g.add_node("start", fan_out)
    g.add_edge(START, "start")
    for i in range(width):
        g.add_node(f"leaf{i}", make_leaf(i))
        g.add_edge("start", f"leaf{i}")
        g.add_edge(f"leaf{i}", END)
    async with open_saver(cfg) as saver:
        graph = g.compile(checkpointer=saver)
        res = await graph.ainvoke({"landed": []}, {"configurable": {"thread_id": "s2-concurrency"}})
        landed = sorted(res.get("landed") or [])
        print(f"parallel branches: width={width} landed={len(landed)} unique={len(set(landed))}")
        print("PASS-concurrency:", landed == list(range(width)))
    return 0


async def run_tables(cfg: dict[str, Any]) -> int:
    if SAVER_KIND == "sqlite":
        print("n/a for sqlite saver (single file)")
        return 0
    with pymysql.connect(host=cfg["host"], port=cfg["port"], user=cfg["user"], password=cfg["password"], database=SPIKE_DB) as conn:
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES")
            names = [r[0] for r in cur.fetchall()]
            print("tables from setup():", names)
            for t in names:
                cur.execute(f"SELECT COUNT(*) FROM `{t}`")
                print(f"  {t}: {cur.fetchone()[0]} rows")
    return 0


MODES = {
    "tables": run_tables,
    "conformance": run_conformance,
    "interrupt-a": run_interrupt_phase_a,
    "interrupt-b": run_interrupt_phase_b,
    "concurrency": run_concurrency,
}
SUBPROCESS_MODES = {"interrupt-a", "interrupt-b"}
SEQUENCE = ("tables", "conformance", "interrupt-a", "interrupt-b", "concurrency")


async def orchestrate(cfg: dict[str, Any]) -> int:
    for step in SEQUENCE:
        print(f"\n===== {step} =====")
        if step in SUBPROCESS_MODES:
            rc = subprocess.run([sys.executable, str(Path(__file__)), step], check=False).returncode
            print(f"{step} child exit code: {rc} (0 expected for interrupt-a; it hard-exits)")
        else:
            await MODES[step](cfg)
    return 0


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    mode = sys.argv[1]
    cfg = db_config()
    print(f"[S2] saver={SAVER_KIND}")
    if mode == "prep":
        ensure_spike_db(cfg)
        return
    if mode == "cleanup":
        if SQLITE_PATH.exists():
            SQLITE_PATH.unlink()
            print("deleted sqlite file")
        drop_spike_db(cfg)
        return
    if mode == "all":
        raise SystemExit(asyncio.run(orchestrate(cfg)))
    if mode not in MODES:
        raise SystemExit(f"unknown mode {mode}")
    if mode == "interrupt-a":
        asyncio.run(MODES[mode](cfg))  # never returns normally; that is the point
        return
    raise SystemExit(asyncio.run(MODES[mode](cfg)))


if __name__ == "__main__":
    main()
