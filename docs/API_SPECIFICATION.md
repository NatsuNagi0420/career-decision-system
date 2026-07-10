# API Specification

## Common Response

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "timestamp": 1781071200000,
  "traceId": "optional"
}
```

Backend Java responses use `traceId`. Backend responses also include the `X-Trace-ID` header. Backend uses `X-Request-ID`, then `X-Trace-ID`, then a generated UUID; Agent proxy endpoints with a request body `requestId` echo that value as `traceId` and forward it to Agent Server as `X-Request-ID`.

Agent Server responses use the Pydantic field name `trace_id`. For Agent Server business requests, the request body's `request_id` is echoed as `trace_id` and as the `X-Trace-ID` response header. If no body `request_id` exists, Agent Server uses `X-Request-ID`, then `X-Trace-ID`, then a generated UUID. Backend and Agent validation/unhandled errors return the same envelope shape.

Backend Agent proxy calls persist an `agent_runs` audit row keyed by request ID. The audit row records agent type, optional numeric user id, status, latency, redacted input/output snapshots, and redacted failure message when applicable. Raw resume text, chat messages, tokens, phone numbers, emails, authorization values, and resume rewrite fragments are redacted before storage. When the audit row is persisted successfully, backend Agent proxy response `data` includes `agentRunId`.

## Backend Public APIs

Base URL:

```text
http://127.0.0.1:8080/api/v1
```

Backend request tracing:

```http
X-Request-ID: optional-client-trace-id
X-Trace-ID: returned-backend-trace-id
```

### Health

```text
GET /health
GET /ready
```

`GET /health` confirms the backend process is alive. `GET /ready` verifies that the backend can obtain a database connection and execute `SELECT 1`.

Ready success:

```json
{
  "status": "ready",
  "service": "backend",
  "database": "ok"
}
```

When the database readiness check fails, `GET /ready` returns HTTP 503 with code `50301` and message `Database readiness check failed.`
When backend runs with `APP_ENV=prod` or `APP_ENV=production`, `GET /ready` also rejects unsafe local defaults before reporting ready: default/short Agent internal token, `root/root` database credentials, and localhost-only CORS origins.

### Auth

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /users/me
GET  /users/me/profile
PUT  /users/me/profile
```

Register request:

```json
{
  "username": "demo_user",
  "email": "demo@example.com",
  "phone": "13800000000",
  "password": "secret123",
  "confirmPassword": "secret123"
}
```

Login returns an access bearer token, a refresh token, and the current user:

```json
{
  "token": "access-token",
  "refreshToken": "refresh-token",
  "user": {
    "id": 1,
    "username": "demo_user",
    "email": "demo@example.com",
    "phone": null
  }
}
```

Repeated failed login attempts are limited per username and client IP; when the configured threshold is exceeded, `POST /auth/login` returns HTTP 429 with code `42901`.

Refresh request:

```json
{
  "refreshToken": "current-refresh-token"
}
```

`POST /auth/refresh` returns the same shape as login. Refresh tokens are single-use and rotated; reusing an old refresh token returns HTTP 401. `POST /auth/logout` revokes the current access token and all active refresh tokens for that user. `GET /users/me` and logout require:

Existing databases created before refresh-token support must run `SQL脚本/04_add_refresh_tokens.sql` before the refreshed backend is started.

```http
Authorization: Bearer <token>
```

The current user profile endpoints also require bearer auth. `GET /users/me/profile` returns the persisted career profile or an empty profile seeded with the username. `PUT /users/me/profile` upserts the profile:

```json
{
  "displayName": "Lin",
  "identityType": "student",
  "school": "Example University",
  "major": "Computer Science",
  "degree": "Bachelor",
  "targetRole": "AI Application Engineer",
  "targetCities": ["Hangzhou", "Shanghai"],
  "expectedSalary": "15k-25k",
  "skills": ["Java", "Python", "Vue 3"],
  "certificates": ["CET-6"],
  "experiences": ["AI career planning system"],
  "values": ["growth", "technical depth"]
}
```

### MBTI Assessment

```text
GET  /assessments/mbti/questions
POST /assessments/mbti/submit
```

Submit request:

```json
{
  "answers": {
    "1": "A",
    "2": "B",
    "3": "A",
    "4": "A"
  }
}
```

### Jobs

```text
GET /jobs
GET /jobs/{id}
GET /jobs/facets
POST /jobs/recommendations
GET /jobs/favorites
POST /jobs/favorites/{jobId}
DELETE /jobs/favorites/{jobId}
```

Job list query:

```text
keyword optional
city optional
location optional
direction optional
tag optional
salaryMin optional
salaryMax optional
page default 0
size default 10
```

The list response includes:

```json
{
  "items": [],
  "page": 0,
  "size": 10,
  "totalElements": 8,
  "totalPages": 1,
  "hasNext": false,
  "hasPrevious": false
}
```

Recommendation request:

```json
{
  "profile": {
    "target_role": "Software Tester",
    "target_cities": ["Beijing", "Shanghai"],
    "skills": ["SQL", "test case design"]
  },
  "assessment": {
    "mbti_type": "INTJ"
  },
  "limit": 5
}
```

Recommendation response data is a list of matched real jobs:

```json
[
  {
    "job": {
      "id": 1256,
      "title": "Software Tester",
      "company": "Example Company",
      "location": "Tianjin-Hedong",
      "salaryRange": "150-200/day"
    },
    "matchScore": 95,
    "reasons": ["Role direction matches", "Skill keywords matched 2 items"]
  }
]
```

Favorite endpoints require `Authorization: Bearer <token>`. `GET /jobs/favorites` returns the user's persisted shortlist as `JobSummary` items. `POST /jobs/favorites/{jobId}` is idempotent and returns the refreshed shortlist. `DELETE /jobs/favorites/{jobId}` removes the job and also returns the refreshed shortlist.

Target job endpoints also require `Authorization: Bearer <token>`. They persist jobs the user has selected as active career targets separately from favorites:

```text
GET    /jobs/targets
POST   /jobs/targets/{jobId}
DELETE /jobs/targets/{jobId}
```

Target endpoints are idempotent and return refreshed `JobSummary` lists, matching the favorites response shape. Web and Android use the first persisted target job as the default goal for career report, resume analysis, and path plan generation when available.

### Career Report

```text
POST /career-reports/generate
```

Request:

```json
{
  "requestId": "uuid",
  "userId": "demo-user",
  "profile": {
    "name": "Lin Student",
    "target_role": "AI Application Engineer",
    "skills": ["Java", "Python", "Vue 3"]
  },
  "assessment": {
    "mbti_type": "INTJ",
    "strengths": ["goal clarity"]
  }
}
```

The backend first retrieves real job candidates from `jobs`, injects them as `job_candidates`, and then calls `agent_server`. The returned report data includes optional `agentRunId`; clients should pass it to `POST /reports/archive` when saving the generated report.

### Assets

```text
GET /assets/images/{filename}
```

Images are stored by backend under `backend/data_server/images`. The response returns a backend-built absolute URL, so clients do not compose asset URLs locally. Invalid filenames, unsupported image extensions, nested paths, path traversal attempts, missing files, and symlink-backed files are rejected by backend before a URL is returned.

The returned URL points to:

```text
GET /data-server/images/{filename}
```

That public image route uses the same validation as the API route and only serves supported image files from `backend/data_server/images`; the backend does not expose the whole `data_server` directory as a broad static file root.

Example response:

```json
{
  "filename": "avatar.png",
  "url": "http://127.0.0.1:8080/data-server/images/avatar.png"
}
```

### Capability Profile

```text
POST /profiles/generate
```

The request shape mirrors `POST /career-reports/generate` and returns a structured capability profile. In non-mock LLM mode, the Agent service refines a deterministic baseline with provider output and clamps score/radar ranges before returning.

This is an Agent-generated capability profile endpoint, not the persisted account profile. Persisted user profile data uses `GET/PUT /users/me/profile`.

### Chat

```text
POST /chat/messages
```

Request:

```json
{
  "requestId": "uuid",
  "userId": "demo-user",
  "page": "dashboard",
  "message": "Help me create a 3-month learning plan.",
  "context": {
    "targetRole": "AI Application Engineer"
  }
}
```

The Agent response includes `reply`, `intent`, and `actions`. Allowed action values are `go:resume`, `go:path-planning`, `go:career-report`, `go:jobs`, and `go:profile`; clients should ignore unknown action values defensively.

### Resume

```text
POST /resumes/analyze
POST /resumes/analyses/archive
GET  /resumes/analyses
GET  /resumes/analyses/{id}
DELETE /resumes/analyses/{id}
```

Request:

```json
{
  "requestId": "uuid",
  "userId": "demo-user",
  "targetRole": "AI Application Engineer",
  "resumeText": "Project: built an AI career planning dashboard with Java and Vue."
}
```

`POST /resumes/analyze` calls the Agent service. Authenticated clients can persist the returned analysis:

```json
{
  "targetRole": "AI Application Engineer",
  "resumeText": "Project summary text",
  "agentRunId": 1201,
  "analysis": {
    "score": 86,
    "atsScore": 82,
    "keywordMatch": 78,
    "issues": ["Evidence needs clearer metrics"],
    "suggestions": ["Rewrite projects with STAR structure"],
    "improvedFragments": ["Built an AI report module and improved generation efficiency."]
  }
}
```

Archive/list/detail/delete endpoints require `Authorization: Bearer <token>`. The backend stores a SHA-256 hash for the resume text and does not store raw resume text in this archive flow. `agentRunId` is optional; when present, backend verifies it belongs to the current user and the `resume` Agent type before linking it to `resume_analyses.agent_run_id`.

### Path Plan

```text
POST /path-plans/generate
POST /path-plans/archive
GET  /path-plans
GET  /path-plans/{id}
PATCH /path-plans/{planId}/tasks/{taskId}
DELETE /path-plans/{id}
```

Request:

```json
{
  "requestId": "uuid",
  "userId": "demo-user",
  "targetRole": "AI Application Engineer",
  "profile": {
    "skills": ["Java", "Python", "Vue 3"]
  }
}
```

`POST /path-plans/generate` calls the Agent service and returns a structured generated plan. In non-mock LLM mode, the Agent service refines a deterministic baseline with provider output and falls back to the baseline when validation fails. Authenticated clients can then persist the generated result:

```json
{
  "targetRole": "AI Application Engineer",
  "overview": "12-week preparation plan",
  "agentRunId": 1301,
  "milestones": [
    {
      "title": "Position validation",
      "duration": "2 weeks",
      "tasks": ["Collect 10 job descriptions"],
      "acceptance": ["Skill gap list is created"]
    }
  ],
  "checkpoints": ["Week 2 review"]
}
```

The archive/list/detail/delete endpoints require `Authorization: Bearer <token>`. `agentRunId` is optional; when present, backend verifies it belongs to the current user and the `path_plan` Agent type before linking it to `path_plans.agent_run_id`.

Archived path plan detail responses include progress analytics and task objects:

```json
{
  "id": 9,
  "agentRunId": 1301,
  "targetRole": "AI Application Engineer",
  "taskCount": 4,
  "completedTaskCount": 1,
  "progressPercent": 25,
  "milestones": [
    {
      "id": 31,
      "title": "Position validation",
      "tasks": [
        {
          "id": 101,
          "content": "Collect 10 job descriptions",
          "status": "done",
          "completedAt": "2026-06-11T01:00:00"
        }
      ]
    }
  ]
}
```

Path plan list snapshots also return `agentRunId`, `taskCount`, `completedTaskCount`, and `progressPercent`, so clients can render archive progress without loading every milestone.

Task status update request:

```json
{
  "status": "done"
}
```

Allowed statuses are `todo` and `done`; `completedAt` is set by backend when status becomes `done`.

### Report Archive

```text
POST   /reports/archive
GET    /reports
GET    /reports/{id}
DELETE /reports/{id}
```

All report archive endpoints require:

```http
Authorization: Bearer <token>
```

The backend always uses the token user as the report owner. Clients must not send `userId` to create, list, read, or delete report archives.

Archive request:

```json
{
  "type": "career_report",
  "title": "AI Application Engineer Career Report",
  "summary": "Best matched with AI application engineering.",
  "content": "{\"targetRole\":\"AI Application Engineer\"}",
  "agentRunId": 1101
}
```

`agentRunId` is optional; when present, backend verifies it belongs to the current user and matches the report `type` before linking it to `reports.agent_run_id`. Report list/detail responses include `agentRunId`.

List query:

```text
type optional
page default 0
size default 20, max 50
```

## Agent Internal APIs

Base URL:

```text
http://127.0.0.1:8001/api/v1
```

### Health

```text
GET /health
GET /ready
```

Health and readiness endpoints are public for local checks. All other Agent internal APIs require:

```http
X-Internal-Token: <agent internal token>
```

The backend sends this header from `career.agent-server.internal-token`, which can be overridden with `AGENT_INTERNAL_TOKEN` or `INTERNAL_API_TOKEN`. Backend-to-Agent timeout is controlled by `AGENT_SERVER_TIMEOUT_SECONDS`, defaulting to 30 seconds. Agent Server compares the token with `INTERNAL_API_TOKEN`. Missing or invalid tokens return:

```json
{
  "code": 401,
  "message": "Unauthorized agent request",
  "data": null,
  "timestamp": 1781071200000,
  "trace_id": "request-trace-id"
}
```

When Agent Server runs with `APP_ENV=prod` or `APP_ENV=production`, `GET /ready` returns HTTP 503 with code `50301` if `INTERNAL_API_TOKEN` is blank, still `change-me`, or shorter than the production minimum. It also rejects `LLM_PROVIDER=mock`, unsupported providers, blank `LLM_MODEL`, and missing `LLM_API_KEY`. Local development keeps the default mock ready behavior so smoke scripts can run without secret setup.

### Career Report

```text
POST /career-reports/generate
```

### Capability Profile

```text
POST /profiles/generate
```

### Chat

```text
POST /chat/messages
```

### Resume

```text
POST /resumes/analyze
```

### Path Plan

```text
POST /path-plans/generate
```

The agent service returns structured JSON only. Persistence is handled by `backend`.

Backend stores operational Agent call audits in `agent_runs`; saved user-facing reports, resume analyses, and path plans are stored by the corresponding archive endpoints.

Agent request tracing:

```http
X-Request-ID: optional-client-trace-id
X-Trace-ID: returned-agent-trace-id
```

When an Agent request body includes `request_id`, that value wins over incoming trace headers for the response body and `X-Trace-ID` header.
