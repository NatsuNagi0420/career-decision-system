from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

RiskTier = Literal["R0", "R1", "R2", "R3"]
Thinking = Literal["on", "off"]

#: What may leave the agent process at all. R3 is never agent-executable.
RISK_SEMANTICS: dict[str, str] = {
    "R0": "read only; no artifact, no proposal",
    "R1": "writes draft artifacts only",
    "R2": "proposes business writes; requires human approval before apply",
    "R3": "terminal or destructive; may only be presented to a human, never applied by the agent",
}


class CapabilitySpec(BaseModel):
    """The contract that v1 never had: what a capability produces, what it may
    propose, whether that needs confirmation, and what it needs to be allowed
    to conclude anything. Declaring these together is what stops 'can suggest'
    and 'can write' from drifting apart again."""

    id: str
    domain: str
    name: str
    description: str = ""

    status: Literal["implemented", "planned"] = "planned"
    #: Plumbing that happens to be shaped like a capability. It stays runnable by the
    #: harness and as the default probe, but it is not offered to a student and no
    #: obligation may point at it — "骨架自检" is not a next step in anyone's career.
    internal: bool = False
    required_context: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    artifact_type: str | None = None
    proposal_types: list[str] = Field(default_factory=list)

    risk_tier: RiskTier = "R0"
    requires_approval: bool = False
    evidence_required: bool = False
    min_data_coverage: int = 40

    thinking: Thinking = "on"  # governs the judgement node; the planner always runs without thinking
    #: deepseek-flash bills reasoning tokens out of max_tokens; anything lower can
    #: return empty content and be mistaken for a silent model.
    max_tokens: int = 2000
    output_schema: dict[str, object] | None = None
    next_capabilities: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_invariants(self) -> CapabilitySpec:
        if self.risk_tier in {"R2", "R3"} and not self.requires_approval:
            raise ValueError(f"{self.id}: risk_tier {self.risk_tier} requires requires_approval=True")
        if self.proposal_types and self.risk_tier != "R2":
            raise ValueError(f"{self.id}: only R2 capabilities may declare proposal_types")
        if self.risk_tier == "R3" and self.proposal_types:
            raise ValueError(f"{self.id}: R3 capabilities must not declare proposal_types; they are not agent-executable")
        if self.risk_tier == "R0" and (self.proposal_types or self.artifact_type):
            raise ValueError(f"{self.id}: R0 capabilities must be read only")
        if self.max_tokens < 1500:
            raise ValueError(f"{self.id}: max_tokens must be >= 1500 (see §14-S1 empty-content trap)")
        if self.evidence_required and self.artifact_type is None:
            raise ValueError(f"{self.id}: evidence_required needs an artifact_type to attach quotes to")
        return self
