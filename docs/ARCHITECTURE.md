# Architecture

## Layer Responsibilities

### Web

The web app is the full-featured client for dashboard, profile collection, assessments, reports, job exploration, learning plans, resume analysis, and admin/guidance views later.

First MVP pages:

- Login
- Career dashboard
- Comprehensive profile entry
- Assessment
- Capability profile
- Job exploration
- Path planning
- Career report
- AI career assistant
- Resume analysis

### Android

The mobile app is not a copy of the web app. It focuses on frequent, lightweight actions:

- AI consultation
- Daily tasks
- Check-ins
- Report reading
- Goal tracking
- Notifications

### Backend

The Spring Boot backend owns:

- User accounts and auth
- User profile data
- Assessment answers and results
- Job and career knowledge metadata
- Report archives
- Task plans and check-ins
- Resume file metadata
- Agent request orchestration
- Data permission checks

It should not contain direct LLM prompts or multi-step AI reasoning. Those move to `agent_server`.

### Agent Server

The FastAPI service owns:

- LLM calls
- Prompt templates
- Agent workflows
- Structured AI output validation
- Career report generation
- Job recommendation reasoning
- Skill gap analysis
- Path plan generation
- Resume analysis
- AI assistant answers

It returns structured JSON whenever the backend needs to save or render AI results.

Current agent capabilities exposed through backend:

- Career report generation
- Capability profile generation
- Chat message answer
- Resume analysis
- Path plan generation

## Request Flow

```text
User action
  -> web/android
  -> backend endpoint
  -> load user/business context
  -> call agent_server internal endpoint
  -> validate agent response
  -> persist result
  -> return response to client
```

## Client And Asset URL Rules

All Web HTTP traffic is centralized in `web/src/utils/request.js`, where `BACKEND_BASE_URL` is the only Web-side backend root exported to the app. The request module owns dev/production defaults plus optional `VITE_BACKEND_BASE_URL`, and feature modules under `web/src/api` call this shared request client instead of creating their own axios instances, `fetch` calls, hardcoded hosts, or parallel API base paths. Changing the Web backend network should mean changing this one file or the documented environment override.

All Android HTTP traffic is centralized in the Retrofit network package. `android/app/src/main/java/com/careerdecision/mobile/network/RequestConfig.kt` owns the only Android-side backend root addresses, including debug/release defaults and optional build-time overrides, and Retrofit derives the API base URL from it. Screens and view models call the shared API abstraction instead of building URLs. Changing the Android backend network should mean changing `RequestConfig.kt` or the documented Gradle override.

Image files belong under `backend/data_server/images`. Backend returns full URLs from APIs such as `GET /api/v1/assets/images/{filename}` and serves the returned `/data-server/images/{filename}` URLs through a validated image controller, not a broad static directory mapping. Those URLs are built from the current request context and forwarded headers, so Web and Android can display returned URLs without locally concatenating backend host, `/data-server`, `/images`, or resource paths.

## Agent Workflow Style

Use LangGraph for controlled workflows, not fully autonomous agents in the first milestone.

Career report graph:

```text
normalize_profile
  -> analyze_assessment
  -> recommend_careers
  -> analyze_skill_gap
  -> generate_path_plan
  -> compose_report
  -> validate_report
```

Assistant graph:

```text
classify_intent
  -> load_context
  -> select_tool
  -> generate_answer
  -> extract_actions
```

Resume graph:

```text
extract_resume_text
  -> parse_resume
  -> score_resume
  -> match_target_job
  -> generate_resume_advice
```

Path planning graph:

```text
read_target
  -> map_skill_gap
  -> create_milestones
  -> create_tasks
  -> validate_plan
```

## Previous Project Reference

Use `D:\Project\career-decision-system-web` as a reference for business scope and flow:

- MBTI assessment
- Comprehensive profile entry
- Capability profile
- Job exploration
- Path planning
- Report generation and archive
- AI assistant
- Resume parsing

Do not copy its UI style directly. New UI follows the cyan virtual mentor visual direction.
