"""Tool layer.

Structure follows OpenManus (name / description / JSON-Schema / execute + a
collection that dispatches and answers unknown names with an error the model can
read), and discipline follows MyOfferAgent (clip output so a fat row cannot
become a token bomb, and let truncation be *visible* to the model rather than
silently truncating mid-object).

Schemas are generated from Pydantic argument models, because §14-S1 measured
that `deepseek-flash` rejects `response_format: json_schema` outright — the only
machine-checkable structure available is `tools`, so every tool must be
described there rather than hoped for in a prompt.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session


@dataclass
class ToolResult:
    payload: dict[str, Any] = field(default_factory=dict)
    source_refs: list[dict[str, Any]] = field(default_factory=list)
    truncated: bool = False
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None

    def content(self, max_chars: int) -> str:
        body = {"ok": self.ok, **({"error": self.error} if self.error else {"data": self.payload})}
        text = json.dumps(body, ensure_ascii=False, default=str)
        if len(text) <= max_chars:
            return text
        clipped: dict[str, Any] = {
            "ok": True,
            "truncated": True,
            "note": "结果超出预算已被裁剪；改用更小的 limit 或更粗的工具，不要假设这就是全部数据。",
            "preview": text[: max_chars - 200],
        }
        return json.dumps(clipped, ensure_ascii=False)


class Tool(ABC):
    name: ClassVar[str]
    description: ClassVar[str]
    args_model: ClassVar[type[BaseModel]]
    max_output_chars: ClassVar[int] = 6000
    #: R0 tools only read. Anything else must go through Proposal + approval.
    read_only: ClassVar[bool] = True

    @abstractmethod
    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult: ...

    def call(self, session: Session, *, user_id: int, arguments: dict[str, Any]) -> ToolResult:
        try:
            parsed = self.args_model.model_validate(arguments)
        except ValidationError as exc:
            return ToolResult(error=f"invalid arguments for {self.name}: {exc.errors(include_url=False)}")
        return self.execute(session, user_id=user_id, args=parsed)

    def openai_schema(self) -> dict[str, Any]:
        schema = self.args_model.model_json_schema()
        schema.pop("$defs", None)
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": schema,
            },
        }


class ToolRegistry:
    def __init__(self, tools: list[Tool]) -> None:
        self._by_name: dict[str, Tool] = {}
        for tool in tools:
            if tool.name in self._by_name:
                raise ValueError(f"duplicate tool name: {tool.name}")
            self._by_name[tool.name] = tool

    @property
    def names(self) -> set[str]:
        return set(self._by_name)

    def get(self, name: str) -> Tool | None:
        return self._by_name.get(name)

    def subset(self, allowed: set[str]) -> ToolRegistry:
        return ToolRegistry([t for name, t in self._by_name.items() if name in allowed])

    def schemas(self, allowed: set[str] | None = None) -> list[dict[str, Any]]:
        names = self._by_name if allowed is None else {n: t for n, t in self._by_name.items() if n in allowed}
        return [tool.openai_schema() for tool in names.values()]

    def execute(self, session: Session, *, user_id: int, name: str, arguments: dict[str, Any]) -> ToolResult:
        tool = self._by_name.get(name)
        if tool is None:
            return ToolResult(error=f"Unknown tool: {name}. Available: {sorted(self._by_name)}")
        return tool.call(session, user_id=user_id, arguments=arguments)
