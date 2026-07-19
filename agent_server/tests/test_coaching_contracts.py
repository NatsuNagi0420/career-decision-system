from collections.abc import Mapping
from typing import Any

from tests.http_client import api_post


def project_payload() -> dict[str, Any]:
    return {
        "id": 41,
        "title": "Java 后端还是数据分析",
        "question": "未来三个月优先验证哪个方向？",
        "priorities": ["成长", "岗位机会"],
        "mustHaves": ["可以产出作品"],
        "dealBreakers": ["完全没有实践机会"],
        "currentStage": "compare",
        "candidates": [
            {
                "id": 101,
                "name": "Java 后端",
                "recommendationReason": "有课程项目基础",
                "opposingFactors": "并发与部署经验不足",
                "uncertainties": "尚未验证真实开发体验",
                "validationActions": ["完成一个 Spring Boot API"],
            },
            {
                "id": 102,
                "name": "数据分析",
                "recommendationReason": "喜欢从数据中发现问题",
                "opposingFactors": "统计基础证据不足",
                "uncertainties": "尚未完成完整分析项目",
                "validationActions": ["完成一个公开数据分析"],
            },
        ],
        "evidence": [
            {
                "id": 201,
                "candidateId": 101,
                "title": "课程 API 项目",
                "detail": "独立完成登录和查询接口",
                "sourceType": "user",
                "sourceRef": "project:course-api",
                "credibility": "high",
                "stance": "support",
            }
        ],
        "jobSamples": [
            {
                "id": 301,
                "candidateId": 101,
                "jobId": 801,
                "title": "Java 后端实习生",
                "company": "测试企业",
                "city": "杭州",
            },
            {
                "id": 302,
                "candidateId": 102,
                "jobId": 802,
                "title": "数据分析实习生",
                "company": "测试企业",
                "city": "上海",
            },
        ],
        "criteria": [
            {"id": 401, "name": "已有证据", "importance": 5, "results": []},
            {"id": 402, "name": "岗位需求", "importance": 4, "results": []},
        ],
    }


def plan_payload() -> dict[str, Any]:
    return {
        "id": 51,
        "projectId": 41,
        "targetRole": "Java 后端",
        "overview": "用四周验证目标",
        "status": "active",
        "durationWeeks": 4,
        "startDate": "2026-07-06",
        "endDate": "2026-08-02",
        "weeks": [
            {
                "weekNo": 1,
                "title": "第一周",
                "goal": "校准岗位要求",
                "tasks": [
                    {
                        "id": 601,
                        "weekNo": 1,
                        "title": "分析 5 个岗位",
                        "taskType": "career_research",
                        "status": "completed",
                        "acceptanceCriteria": "整理 5 条共同要求",
                        "results": [{"description": "岗位要求表"}],
                    },
                    {
                        "id": 602,
                        "weekNo": 1,
                        "title": "整理能力缺口",
                        "taskType": "career_research",
                        "status": "todo",
                        "acceptanceCriteria": "形成三栏清单",
                        "results": [],
                    },
                ],
            },
            {"weekNo": 2, "title": "第二周", "goal": "产出项目", "tasks": []},
            {"weekNo": 3, "title": "第三周", "goal": "继续验证", "tasks": []},
            {"weekNo": 4, "title": "第四周", "goal": "复查目标", "tasks": []},
        ],
    }


def assert_common_contract(data: Mapping[str, Any]) -> None:
    assert data["generationMode"] in {"llm", "fallback"}
    assert isinstance(data["confidence"], float)
    assert 0 <= data["confidence"] <= 1
    assert isinstance(data["conclusion"], str) and data["conclusion"].strip()
    assert data["evidenceBasis"]
    assert data["counterArguments"]
    assert data["uncertainties"]
    assert data["nextActions"]
    assert all(item["title"].strip() for item in data["nextActions"])


def test_decision_coach_contract_returns_explainable_fallback() -> None:
    response = api_post(
        "/api/v1/coaching/decision",
        json={
            "requestId": "decision-contract-001",
            "userId": "1",
            "project": project_payload(),
            "availableDirections": ["产品经理", "测试开发"],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["trace_id"] == "decision-contract-001"
    data = body["data"]
    assert_common_contract(data)
    assert data["generationMode"] == "fallback"
    assert "candidateSuggestions" in data


def test_job_comparison_contract_covers_each_candidate() -> None:
    response = api_post(
        "/api/v1/coaching/job-comparison",
        json={"requestId": "comparison-contract-001", "userId": "1", "project": project_payload()},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert_common_contract(data)
    assert {item["candidateId"] for item in data["candidateAssessments"]} == {101, 102}
    assert all(item["opposingFactors"] for item in data["candidateAssessments"])
    assert all(item["uncertainty"] for item in data["candidateAssessments"])


def test_action_coach_contract_returns_confirmable_task_suggestions() -> None:
    response = api_post(
        "/api/v1/coaching/action",
        json={"requestId": "action-contract-001", "userId": "1", "plan": plan_payload()},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert_common_contract(data)
    assert data["taskSuggestions"]
    assert all(item["acceptanceCriteria"] for item in data["taskSuggestions"])
    assert all(1 <= item["weekNo"] <= 4 for item in data["taskSuggestions"])


def test_weekly_review_contract_returns_adjustments_without_applying_them() -> None:
    response = api_post(
        "/api/v1/coaching/weekly-review",
        json={
            "requestId": "review-contract-001",
            "userId": "1",
            "review": {
                "id": 71,
                "planId": 51,
                "projectId": 41,
                "weekNo": 1,
                "completedSummary": "分析了五个岗位",
                "evidenceSummary": "整理了岗位要求表",
                "difficulties": "课程作业占用了时间",
                "status": "draft",
            },
            "plan": plan_payload(),
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert_common_contract(data)
    assert data["reviewSummary"]
    assert data["adjustmentSuggestions"][0]["taskId"] == 602
    assert data["adjustmentSuggestions"][0]["status"] == "deferred"


def test_action_plan_preview_preserves_complete_rule_draft_without_external_consent() -> None:
    task = {
        "title": "核对 Java 岗位要求",
        "taskType": "career_research",
        "content": "对照两个真实岗位提取共同要求。",
        "estimatedMinutes": 90,
        "acceptanceCriteria": "形成带来源的岗位要求表。",
        "rationale": "先验证市场要求，再决定学习内容。",
        "capabilityGap": "尚未形成岗位要求清单",
        "jobRequirement": "Java、Spring Boot",
        "sourceRefs": ["job:801"],
    }
    baseline = {
        "generationMode": "fallback",
        "modelName": "rule-personalized-plan-v2",
        "confidence": 0.62,
        "overview": "用真实岗位与个人证据制定两周验证计划。",
        "evidenceBasis": [{"statement": "已保存 Java 后端岗位", "sourceRefs": ["job:801"]}],
        "uncertainties": ["岗位样本仍然有限。"],
        "weeks": [
            {"weekNo": 1, "goal": "校准岗位要求", "tasks": [task]},
            {"weekNo": 2, "goal": "产出并复查", "tasks": [{**task, "title": "产出 Java 能力样例"}]},
        ],
    }
    response = api_post(
        "/api/v1/coaching/action-plan-preview",
        json={
            "requestId": "plan-preview-contract-001",
            "userId": "1",
            "targetRole": "Java 后端",
            "durationWeeks": 2,
            "startDate": "2026-07-13",
            "decisionContext": {
                "profile": {"skills": ["Java"], "weeklyAvailableMinutes": 300},
                "personalEvidence": [],
                "project": {"id": 41},
                "target": {"id": 51, "targetName": "Java 后端"},
                "jobDetails": [{"id": 801, "requirements": ["Spring Boot"]}],
            },
            "baseline": baseline,
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["generationMode"] == "fallback"
    assert [week["weekNo"] for week in data["weeks"]] == [1, 2]
    assert all(task["sourceRefs"] for week in data["weeks"] for task in week["tasks"])
