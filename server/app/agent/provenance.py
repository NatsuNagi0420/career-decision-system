"""Which generation of prompt and tooling produced this answer.

Without a fingerprint, the delta between two baselines is a story: 0.895 → 0.93 could
be the tool rendering, the wording, the model, or the weather. §34 measured a citation
jump caused by a change to what tools hand back, and nothing stored alongside the run
could say so afterwards.

The hash covers the text and shapes the model actually receives — the persona system
prompt, the per-capability synthesis prompt, the output schema it must satisfy, each
allowed tool's name/description/argument schema — plus the settings that change how the
call is made (thinking mode, the effective token ceiling). It deliberately excludes run
data: the same code gives the same fingerprint on any student's goal, which is the point.
"""

from __future__ import annotations

import hashlib
import json

from app.agent import persona
from app.agent.graph import (
    PLANNER_MIN_TOKENS,
    SYNTHESIS_MAX_TOKENS,
    DigestDraft,
    obligation_targets,
    synthesis_prompt,
)
from app.capabilities.registry import CAPABILITIES
from app.capabilities.spec import CapabilitySpec
from app.tools.base import Tool
from app.tools.domain import DOMAIN_TOOLS
from app.tools.readonly import READ_ONLY_TOOLS

LENGTH = 12

_TOOLS: dict[str, Tool] = {tool.name: tool for tool in (*READ_ONLY_TOOLS, *DOMAIN_TOOLS)}


def capability_material(capability: CapabilitySpec) -> str:
    """The pre-image, kept separate so a report can show *why* two fingerprints differ."""
    blocks = [
        f"persona\n{persona.SYSTEM_PROMPT}",
        f"system\n{persona.synthesis_system_prompt(capability.name)}",
        # Rendered with fixed placeholders: what is hashed is the instructions, not the
        # student's goal or the rows a tool happened to return this time.
        "synthesis_prompt\n"
        + synthesis_prompt(
            goal="（占位）",
            project_id=None,
            facts={},
            notes=capability.synthesis_notes,
            budget_note="",
            promise_targets=sorted(obligation_targets(capability)),
        ),
        f"output_schema\n{_json(capability.output_schema or DigestDraft.model_json_schema())}",
        "planner\n"
        + _json(
            {
                "thinking": "off",
                "max_tokens": max(PLANNER_MIN_TOKENS, capability.max_tokens),
            }
        ),
        "capability\n"
        + _json(
            {
                "id": capability.id,
                "description": capability.description,
                "tools": sorted(capability.tools),
                "required_context": sorted(capability.required_context),
                "risk_tier": capability.risk_tier,
                "evidence_required": capability.evidence_required,
                "min_data_coverage": capability.min_data_coverage,
                "next_capabilities": sorted(capability.next_capabilities),
                "thinking": capability.thinking,
                "synthesis_max_tokens": max(SYNTHESIS_MAX_TOKENS, capability.max_tokens),
            }
        ),
    ]
    for name in sorted(capability.tools):
        tool = _TOOLS.get(name)
        if tool is None:
            # A planned capability may name a tool that does not exist yet. Marking it
            # absent keeps the fingerprint defined; shipping the tool then changes it,
            # which is exactly the moment a baseline should stop being comparable.
            blocks.append(f"tool:{name}\n（尚未实现）")
            continue
        blocks.append(f"tool:{name}\n{tool.description}\n{_json(tool.args_model.model_json_schema())}")
    return "\n===\n".join(blocks)


def capability_fingerprint(capability: CapabilitySpec) -> str:
    return hashlib.sha256(capability_material(capability).encode("utf-8")).hexdigest()[:LENGTH]


def fingerprints() -> dict[str, str]:
    return {capability.id: capability_fingerprint(capability) for capability in CAPABILITIES}


def fingerprint_for(capability_id: str | None) -> str:
    """Empty for an unknown id rather than raising: this is written on the way into a
    run, and a missing stamp must not be able to destroy the answer."""
    if not capability_id:
        return ""
    capability = next((spec for spec in CAPABILITIES if spec.id == capability_id), None)
    return capability_fingerprint(capability) if capability else ""


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
