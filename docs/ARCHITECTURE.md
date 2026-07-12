# Architecture

## Layer Responsibilities

### Web

The Web app owns the complete decision workflow and all complex editing.

First MVP pages:

- Login and five-minute onboarding
- Workbench with one primary next action
- Career directions and real-job exploration
- Five-stage decision project workspace
- Action-plan and weekly-review workspace
- Decision snapshots and legacy history
- Page-context AI mentor

### Android

The mobile app is not a copy of the web app. It focuses on frequent, lightweight actions:

- Today tasks
- Current goal and progress
- Action-coach consultation
- Complete, defer, or skip tasks
- Result descriptions and links
- Fast weekly-review submission and target-confidence feedback
- Offline cache and queued synchronization

It uses Repository/ViewModel boundaries, Room for recent goal/tasks/pending operations, WorkManager for reconnect sync, and Android Keystore for the session. Queue entries keep stable request IDs; task mutations also retain the task version seen by the user. Complex decision editing and batch plan changes open the Web app.

### Backend

The Spring Boot backend owns:

- User accounts and auth
- User profile data
- Career directions, real jobs, and personal evidence
- Decision projects, candidates, comparison evidence, and confirmed targets
- Action plans, task results, change history, and weekly reviews
- Decision report snapshots and legacy archives
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
- Decision coaching and job comparison
- Action coaching and weekly-review coaching
- Legacy career report, profile, path, resume, and chat workflows

It returns structured JSON whenever the backend needs to save or render AI results.

Every coaching response contains a conclusion, evidence basis, counterarguments, uncertainties, next actions, confidence, and `generationMode`. Invalid model output falls back to deterministic rules.

## Request Flow

```text
User action
  -> Web / Android
  -> HTTPS backend endpoint
  -> authenticate and load user-owned business context
  -> optional Agent call over loopback + internal token
  -> validate structured Agent response
  -> require user confirmation for suggested writes
  -> persist in one backend transaction
  -> return response and refresh client cache
```

Profiles, the decision-project aggregate, and action tasks use optimistic locking. Web and Android send `expectedVersion`; project mutations reserve and increment one aggregate version, while task reorder validates every task version in one transaction. A stale write returns `409`, is never silently merged, and prompts a fresh read before the user retries. Android removes non-retryable conflicting queue entries after surfacing the conflict so WorkManager does not loop forever. Additive writes use stable `requestId` keys instead.

Conversational AI context follows a server-owned context pattern. The client sends only route metadata and selected resource IDs. `AssistantContextService` verifies ownership and relationships, then loads the authenticated user's profile, dashboard, project, candidates, targets, plan, review, and job records. Client-supplied role names, evidence, scores, or serialized business objects are not trusted as Agent context.

`ChatConversationService` owns conversational continuity. It stores user and assistant messages in backend `chat_sessions/chat_messages`, binds retries to a stable `requestId`, and forwards at most the latest 12 truncated messages from the authenticated session. The returned `sessionId` is an opaque continuation key, not proof of ownership; every read is still scoped by the token user. Agent Server receives the selected history for one request and does not own conversation persistence.

Conversation text is user business data, separate from operational `agent_runs` audits. Audit snapshots remain redacted; saved chat text is never treated as a convenient logging payload. External model forwarding still requires the profile's explicit AI consent.

## Client And Asset URL Rules

All Web HTTP traffic is centralized in `web/src/utils/request.ts`, where `BACKEND_BASE_URL` is the only Web-side backend root exported to the app. The request module owns dev/production defaults plus optional `VITE_BACKEND_BASE_URL`, and feature modules under `web/src/api` call this shared request client instead of creating their own axios instances, `fetch` calls, hardcoded hosts, or parallel API base paths. Changing the Web backend network should mean changing this one file or the documented environment override.

All Android HTTP traffic is centralized in the Retrofit network package. `android/app/src/main/java/com/careerdecision/mobile/network/RequestConfig.kt` owns the Android backend and Web roots. Both Debug and Release reject cleartext backend overrides. Screens call `CareerRepositoryGateway` instead of building URLs or invoking Retrofit directly.

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

Coaching graphs use a rule baseline followed by optional model enhancement:

```text
build structured fallback
  -> verify the user granted external-AI consent
  -> call OpenAI-compatible model when configured and consented
  -> parse and validate JSON
  -> normalize missing evidence fields
  -> return generationMode=llm
  -> on timeout/invalid output return generationMode=fallback
```

Agent suggestions never call mutation APIs. Web and Android present them as drafts, and the backend remains the only writer of business data.

External-model use is deny-by-default. `user_profiles.external_ai_consent` must be true before personal decision or action context may leave the local backend/Agent boundary. Without consent, coaching returns the deterministic fallback contract. Tokens, passwords, internal service credentials, and unrelated profile fields are never model context and are redacted from Agent audit logs.
