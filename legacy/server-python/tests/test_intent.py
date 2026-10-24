"""青穗集 · 求职意图路由：人说想做什么，就进对应能力，而不是默认骨架自检。"""
from __future__ import annotations

from app.agent.intent import DEFAULT_CAPABILITY, route_intent


def test_resume_request_beats_education_words_in_the_same_sentence() -> None:
    assert route_intent("根据我刚确认的画像帮我写一份简历，保留 2027 年毕业") == "resume_build"


def test_gap_request_beats_job_words() -> None:
    assert route_intent("对照岗位看我还缺什么、有没有题库和练习") == "learning_path"


def test_profile_request_beats_job_words() -> None:
    assert route_intent("先补我的经历，缺哪条会明说") == "profile_diagnose"


def test_indecision_routes_to_job_match() -> None:
    assert route_intent("我在数据分析和后端工程师之间犹豫，想先看看有没有可比的证据") == "job_match"


def test_unknown_falls_back_to_profile() -> None:
    assert route_intent("随便聊聊") == DEFAULT_CAPABILITY == "profile_diagnose"
