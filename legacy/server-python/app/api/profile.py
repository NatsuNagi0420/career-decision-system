"""青穗集 · 私人档案接口：本人维护资料和已确认经历，版本校验防覆盖，撤回保留历史引用。"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.api.routes import current_user
from app.db.domain import ProfileFact, UserProfile
from app.db.models import User

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])
Text120 = Annotated[str, Field(max_length=120)]
City = Annotated[str, Field(min_length=1, max_length=64)]
CONFLICT = "资料已在其他页面更新，请先重新读取，再保存你的修改。"


class ProfileInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    expected_version: int = Field(ge=0)
    school: Text120 = ""
    major: Text120 = ""
    graduation_year: int | None = Field(default=None, ge=1950, le=2100)
    city_targets: list[City] = Field(default_factory=list, max_length=12)
    summary: str = Field(default="", max_length=2000)


class FactInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    expected_version: int = Field(ge=0)
    dimension: str = Field(min_length=1, max_length=24)
    statement: str = Field(min_length=2, max_length=500)


def _read(session: Session, user_id: int) -> dict[str, Any]:
    profile = session.get(UserProfile, user_id)
    facts = session.scalars(select(ProfileFact).where(
        ProfileFact.user_id == user_id, ProfileFact.confirmed.is_(True),
    ).order_by(ProfileFact.created_at.desc(), ProfileFact.id.desc()))
    return {
        "version": profile.version if profile else 0,
        "school": profile.school or "" if profile else "",
        "major": profile.major or "" if profile else "",
        "graduation_year": profile.graduation_year if profile else None,
        "city_targets": profile.city_targets or [] if profile else [],
        "summary": profile.summary or "" if profile else "",
        "updated_at": profile.updated_at.isoformat() if profile else None,
        "facts": [{"id": fact.id, "dimension": fact.dimension, "statement": fact.statement,
                   "source": fact.source, "created_at": fact.created_at.isoformat()} for fact in facts],
    }


def _writable(session: Session, user_id: int, expected: int) -> UserProfile:
    profile = session.get(UserProfile, user_id)
    if (profile.version if profile else 0) != expected:
        raise HTTPException(status_code=409, detail=CONFLICT)
    if profile is None:
        profile = UserProfile(user_id=user_id)
        session.add(profile)
    return profile


def _save(session: Session, profile: UserProfile) -> dict[str, Any]:
    profile.touch()
    try:
        session.commit()
    except (StaleDataError, IntegrityError) as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail=CONFLICT) from exc
    return _read(session, profile.user_id)


def _owned_fact(session: Session, user_id: int, fact_id: str) -> ProfileFact:
    fact = session.scalar(select(ProfileFact).where(
        ProfileFact.id == fact_id, ProfileFact.user_id == user_id, ProfileFact.confirmed.is_(True),
    ))
    if fact is None:
        raise HTTPException(status_code=404, detail="这条经历不存在或已经撤回。")
    return fact


@router.get("")
def get_profile(request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    with request.app.state.session_factory() as session:
        return _read(session, user.id)


@router.put("")
def update_profile(payload: ProfileInput, request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    with request.app.state.session_factory() as session:
        profile = _writable(session, user.id, payload.expected_version)
        profile.school = payload.school or None
        profile.major = payload.major or None
        profile.graduation_year = payload.graduation_year
        profile.city_targets = list(dict.fromkeys(payload.city_targets))
        profile.summary = payload.summary
        return _save(session, profile)


@router.post("/facts", status_code=201)
def add_fact(payload: FactInput, request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    with request.app.state.session_factory() as session:
        profile = _writable(session, user.id, payload.expected_version)
        duplicate = session.scalar(select(ProfileFact).where(
            ProfileFact.user_id == user.id, ProfileFact.confirmed.is_(True),
            ProfileFact.dimension == payload.dimension, ProfileFact.statement == payload.statement,
        ))
        if duplicate is not None:
            return _read(session, user.id)
        session.add(ProfileFact(user_id=user.id, dimension=payload.dimension, statement=payload.statement,
                                source="user", source_ref={"origin": "profile_page"}, confirmed=True))
        return _save(session, profile)


@router.put("/facts/{fact_id}")
def update_fact(fact_id: str, payload: FactInput, request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    with request.app.state.session_factory() as session:
        fact = _owned_fact(session, user.id, fact_id)
        profile = _writable(session, user.id, payload.expected_version)
        duplicate = session.scalar(select(ProfileFact).where(
            ProfileFact.user_id == user.id, ProfileFact.confirmed.is_(True), ProfileFact.id != fact.id,
            ProfileFact.dimension == payload.dimension, ProfileFact.statement == payload.statement,
        ))
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="已经有一条相同的经历，请修改内容或撤回重复项。")
        # 旧行继续支撑历史成果引用；后续分析只读取 confirmed=True 的新行。
        fact.confirmed = False
        session.add(ProfileFact(user_id=user.id, dimension=payload.dimension, statement=payload.statement,
                                source="user", source_ref={"origin": "profile_page", "replaces": fact.id}, confirmed=True))
        return _save(session, profile)


@router.delete("/facts/{fact_id}")
def retract_fact(fact_id: str, request: Request, expected_version: int = Query(ge=0),
                 user: User = Depends(current_user)) -> dict[str, Any]:
    with request.app.state.session_factory() as session:
        fact = _owned_fact(session, user.id, fact_id)
        profile = _writable(session, user.id, expected_version)
        fact.confirmed = False
        return _save(session, profile)
