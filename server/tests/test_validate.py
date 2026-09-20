from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.capabilities.registry import CAPABILITIES
from app.capabilities.spec import CapabilitySpec
from scripts.validate import validate


def test_registry_passes_the_integrity_gate() -> None:
    report = validate()
    assert not report.failures, "integrity gate failed:\n" + "\n".join(report.failures)


def test_declared_proposal_without_executor_is_caught(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    """This is the v1 bug made un-shippable: eight proposal types were declared and
    two had executors, and no check could notice."""
    fake = CapabilitySpec(
        id="phantom",
        domain="test",
        name="幽灵能力",
        status="implemented",
        tools=["get_run_history"],
        artifact_type="RunDigest",
        proposal_types=["delete_everything"],
        risk_tier="R2",
        requires_approval=True,
    )
    monkeypatch.setattr("scripts.validate.CAPABILITIES", (fake,))
    report = validate()
    assert any("no executor" in line for line in report.failures), report.failures


def test_r3_cannot_carry_writes() -> None:
    with pytest.raises(ValidationError):
        CapabilitySpec(id="overreach", domain="test", name="越权", risk_tier="R3", requires_approval=True, proposal_types=["add_candidate"])


def test_r2_without_approval_is_rejected() -> None:
    with pytest.raises(ValidationError):
        CapabilitySpec(id="loose", domain="test", name="漏确认", risk_tier="R2", proposal_types=["create_note"])


def test_thin_token_budget_is_rejected() -> None:
    with pytest.raises(ValidationError):
        CapabilitySpec(id="stingy", domain="test", name="预算过低", risk_tier="R1", requires_approval=True, max_tokens=300)


def test_ten_capability_domains_are_declared() -> None:
    """Plus the system probe that exercises the plumbing, which is not a domain."""
    domains = [spec for spec in CAPABILITIES if spec.domain != "system"]
    assert len(domains) == 10
    assert len(CAPABILITIES) == 11
    assert {spec.domain for spec in domains} >= {"profile", "explore", "decide", "evidence", "act", "resume", "interview"}
