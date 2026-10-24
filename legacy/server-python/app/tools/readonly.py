from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Artifact, Run
from app.tools.base import Tool, ToolResult


class RunHistoryArgs(BaseModel):
    limit: int = Field(default=5, ge=1, le=20, description="返回条数上限")
    status: str | None = Field(default=None, description="可选：按 run 状态过滤")


class GetRunHistory(Tool):
    name: ClassVar[str] = "get_run_history"
    description: ClassVar[str] = "读取该用户最近的 Agent run 摘要，用于判断是否已有相关结论可复用。只读。"
    args_model: ClassVar[type[BaseModel]] = RunHistoryArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: RunHistoryArgs = args  # type: ignore[assignment]
        stmt = select(Run).where(Run.user_id == user_id).order_by(Run.created_at.desc()).limit(typed.limit)
        if typed.status:
            stmt = stmt.where(Run.status == typed.status)
        runs = list(session.scalars(stmt))
        return ToolResult(
            payload={
                "count": len(runs),
                "runs": [
                    {
                        "run_id": run.id,
                        "goal": run.goal[:160],
                        "status": run.status,
                        "capability_id": run.capability_id,
                        "created_at": run.created_at.isoformat(),
                    }
                    for run in runs
                ],
            },
            source_refs=[{"table": "agent_runs", "id": run.id} for run in runs],
        )


class ArtifactArgs(BaseModel):
    artifact_id: str = Field(description="要展开的成果物 id")


class GetArtifact(Tool):
    name: ClassVar[str] = "get_artifact"
    description: ClassVar[str] = "按 id 读取一个已存在的成果物内容。只能读自己的。只读。"
    args_model: ClassVar[type[BaseModel]] = ArtifactArgs
    max_output_chars: ClassVar[int] = 4000

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: ArtifactArgs = args  # type: ignore[assignment]
        artifact = session.get(Artifact, typed.artifact_id)
        if artifact is None or artifact.user_id != user_id:
            return ToolResult(error=f"artifact not found: {typed.artifact_id}")
        content: dict[str, Any] = artifact.content or {}
        return ToolResult(
            payload={
                "artifact_id": artifact.id,
                "artifact_type": artifact.artifact_type,
                "title": artifact.title,
                "status": artifact.status,
                "version": artifact.version,
                "data_coverage": artifact.data_coverage,
                "is_provisional": artifact.is_provisional,
                "content": content,
            },
            source_refs=[{"table": "artifacts", "id": artifact.id, "version": artifact.version}],
        )


READ_ONLY_TOOLS: tuple[Tool, ...] = (GetRunHistory(), GetArtifact())
