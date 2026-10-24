"""青穗集 · 个人主页验收：真实接口、账号隔离、版本冲突、历史引用与简历消费的一致性。"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import make_url, select

from app.agent.resume import assemble_resume
from app.api.profile import _save, _writable
from app.config import get_settings
from app.db.domain import ProfileFact, UserProfile
from app.main import create_app
from app.tools.domain import GetProfile, GetProfileArgs


@pytest.fixture(scope="session")
def settings(tmp_path_factory):
    active = get_settings()
    isolated = make_url(active.test_db_url).set(database="career_v2_personal_home_test").render_as_string(hide_password=False)
    return active.model_copy(update={
        "app_env": "test", "db_url": isolated, "test_db_url": isolated,
        "checkpoint_path": str(tmp_path_factory.mktemp("personal-home") / "checkpoints.sqlite"),
        "llm_provider": "mock", "llm_model": "mock-career-planner",
    })


@pytest.fixture
def client(settings, engine):
    with TestClient(create_app(settings)) as client:
        yield client


def account(client, name="profile-owner"):
    result = client.post("/api/v1/auth/register", json={"username": name, "password": "test-password-1"})
    assert result.status_code == 201
    body = result.json()
    return {"Authorization": f"Bearer {body['token']}"}, body["user"]["id"]


def add(client, headers, version=0, text="使用 Python 整理课程项目数据", dimension="experience"):
    return client.post("/api/v1/profile/facts", headers=headers, json={
        "expected_version": version, "dimension": dimension, "statement": text,
    })


def test_private_empty_profile_is_read_only(client, session_factory):
    assert client.get("/api/v1/profile").status_code == 401
    headers, user_id = account(client)
    body = client.get("/api/v1/profile", headers=headers).json()
    assert body["version"] == 0 and body["facts"] == [] and body["school"] == ""
    with session_factory() as session:
        assert session.get(UserProfile, user_id) is None


def test_basic_profile_persists_and_stale_form_cannot_overwrite(client):
    headers, _ = account(client)
    original = {"expected_version": 0, "school": " 测试大学 ", "major": "计算机", "graduation_year": 2027,
                "city_targets": ["广州", "广州", "深圳"], "summary": "正在探索前端方向"}
    saved = client.put("/api/v1/profile", headers=headers, json=original)
    assert saved.status_code == 200
    assert saved.json()["school"] == "测试大学"
    assert saved.json()["city_targets"] == ["广州", "深圳"]
    assert saved.json()["version"] > 0
    stale = client.put("/api/v1/profile", headers=headers, json={**original, "school": "不能覆盖"})
    assert stale.status_code == 409 and "重新读取" in stale.json()["detail"]
    reread = client.get("/api/v1/profile", headers=headers).json()
    assert reread["school"] == "测试大学" and reread["graduation_year"] == 2027
    cleared = client.put("/api/v1/profile", headers=headers, json={"expected_version": reread["version"]})
    assert cleared.status_code == 200 and cleared.json()["graduation_year"] is None


def test_experience_is_immediately_available_to_agent_and_resume(client, session_factory):
    headers, user_id = account(client)
    result = add(client, headers)
    assert result.status_code == 201
    body = result.json()
    assert len(body["facts"]) == 1 and body["facts"][0]["source"] == "user"
    with session_factory() as session:
        tool = GetProfile().execute(session, user_id=user_id, args=GetProfileArgs())
        assert tool.payload["facts"]["experience"] == ["使用 Python 整理课程项目数据"]
        resume = assemble_resume(session, user_id=user_id, project_id=None)
        experience = next(section for section in resume["sections"] if section["key"] == "experience")
        assert experience["lines"][0]["text"] == "使用 Python 整理课程项目数据"


def test_edit_keeps_old_reference_but_future_analysis_uses_new_fact(client, session_factory):
    headers, user_id = account(client)
    saved = add(client, headers).json()
    old_id = saved["facts"][0]["id"]
    updated = client.put(f"/api/v1/profile/facts/{old_id}", headers=headers, json={
        "expected_version": saved["version"], "dimension": "experience", "statement": "使用 SQL 完成课程数据库项目",
    })
    assert updated.status_code == 200
    body = updated.json()
    assert len(body["facts"]) == 1 and body["facts"][0]["id"] != old_id
    assert body["version"] > saved["version"]
    with session_factory() as session:
        old = session.get(ProfileFact, old_id)
        assert old.confirmed is False and old.statement == "使用 Python 整理课程项目数据"
        tool = GetProfile().execute(session, user_id=user_id, args=GetProfileArgs())
        assert tool.payload["facts"]["experience"] == ["使用 SQL 完成课程数据库项目"]


def test_retraction_excludes_fact_without_erasing_reference(client, session_factory):
    headers, user_id = account(client)
    saved = add(client, headers).json()
    fact_id = saved["facts"][0]["id"]
    result = client.delete(f"/api/v1/profile/facts/{fact_id}", headers=headers, params={"expected_version": saved["version"]})
    assert result.status_code == 200 and result.json()["facts"] == []
    with session_factory() as session:
        assert session.get(ProfileFact, fact_id).confirmed is False
        resume = assemble_resume(session, user_id=user_id, project_id=None)
        assert all("Python" not in line["text"] for section in resume["sections"] for line in section["lines"])
    # 本人重新确认同一句话，可以再次添加；旧引用仍保留。
    again = add(client, headers, result.json()["version"])
    assert again.status_code == 201 and len(again.json()["facts"]) == 1


def test_other_account_cannot_discover_or_change_facts(client):
    owner, _ = account(client)
    intruder, _ = account(client, "profile-other")
    saved = add(client, owner).json()
    fact_id = saved["facts"][0]["id"]
    assert client.get("/api/v1/profile", headers=intruder).json()["facts"] == []
    attempt = client.put(f"/api/v1/profile/facts/{fact_id}", headers=intruder, json={
        "expected_version": 0, "dimension": "skills", "statement": "不能修改其他账号",
    })
    missing = client.put("/api/v1/profile/facts/missing", headers=intruder, json={
        "expected_version": 0, "dimension": "skills", "statement": "不能修改其他账号",
    })
    assert attempt.status_code == 404 and attempt.json() == missing.json()
    assert client.delete(f"/api/v1/profile/facts/{fact_id}", headers=intruder, params={"expected_version": 0}).status_code == 404
    assert len(client.get("/api/v1/profile", headers=owner).json()["facts"]) == 1


def test_repeated_fact_is_not_duplicated_and_stale_writes_are_rejected(client):
    headers, _ = account(client)
    saved = add(client, headers).json()
    repeat = add(client, headers, saved["version"]).json()
    assert len(repeat["facts"]) == 1 and repeat["version"] == saved["version"]
    stale = add(client, headers, 0, "另一个页面的旧输入")
    assert stale.status_code == 409
    empty = add(client, headers, saved["version"], "   ")
    assert empty.status_code == 422
    too_long = add(client, headers, saved["version"], "字" * 501)
    assert too_long.status_code == 422
    spoof = client.put("/api/v1/profile", headers=headers, json={"expected_version": saved["version"], "user_id": 99})
    assert spoof.status_code == 422


def test_concurrent_database_write_does_not_silently_replace_newer_profile(client, session_factory):
    headers, user_id = account(client)
    saved = client.put("/api/v1/profile", headers=headers, json={"expected_version": 0, "school": "原学校"}).json()
    with session_factory() as first, session_factory() as second:
        a = _writable(first, user_id, saved["version"])
        b = _writable(second, user_id, saved["version"])
        a.school = "第一份修改"
        b.school = "过时修改"
        _save(first, a)
        with pytest.raises(HTTPException) as conflict:
            _save(second, b)
        assert conflict.value.status_code == 409
    with session_factory() as session:
        assert session.scalar(select(UserProfile.school).where(UserProfile.user_id == user_id)) == "第一份修改"
