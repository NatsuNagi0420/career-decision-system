"""青穗集 · 根据一句话判断这一轮该走哪条能力。

壳上的能力菜单对求职者是负担：人说「帮我写简历」，却还要先点对工作流。
这里只做确定性关键词路由，不调用模型。认不出时落到完善画像，而不是骨架自检。
前端传 capability_id=auto 时才走这里；测试里省略能力时仍用原来的默认能力。
"""
from __future__ import annotations

# First match wins. Resume has to beat education keywords inside a resume request.
_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("resume_build", ("简历", "cv", "求职信", "改简历")),
    ("learning_path", ("题库", "学什么", "学习路线", "缺口", "练习", "还缺什么")),
    ("profile_diagnose", ("画像", "我的经历", "补充我", "先补")),
    ("job_match", ("推荐岗位", "适合我", "岗位", "找工作", "校招", "真实岗位", "犹豫", "纠结")),
)

DEFAULT_CAPABILITY = "profile_diagnose"


def route_intent(goal: str) -> str:
    text = (goal or "").casefold()
    for capability_id, needles in _RULES:
        if any(needle.casefold() in text for needle in needles):
            return capability_id
    return DEFAULT_CAPABILITY
