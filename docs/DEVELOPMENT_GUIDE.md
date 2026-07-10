# Development Guide

## Repository Layout

```text
career-decision-system/
  web/
  android/
  backend/
  agent_server/
  docs/
```

No `deploy/` directory is needed in the current phase.

## API Rules

Use versioned APIs:

```text
/api/v1/...
```

Standard response:

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "timestamp": 1781071200000,
  "traceId": "optional-request-id"
}
```

Backend responses include `traceId` plus the `X-Trace-ID` header. Agent Server responses use `trace_id` in the JSON body and also include `X-Trace-ID`. Clients may send `X-Request-ID`; Agent proxy requests with a body `requestId` use that value as the trace ID.

Backend-to-agent endpoints use `X-Internal-Token` and forward trace context with `X-Request-ID`. Agent Server validates `X-Internal-Token` on business endpoints; health and readiness remain public.

Backend Agent connection settings should be overridden with environment variables instead of editing source config: `AGENT_SERVER_BASE_URL` for the URL, `AGENT_INTERNAL_TOKEN` or `INTERNAL_API_TOKEN` for the shared internal token, and `AGENT_SERVER_TIMEOUT_SECONDS` for backend-to-Agent connection/request timeout.

Backend CORS origins should also be overridden through environment variables instead of editing Java source. Use `CORS_ALLOWED_ORIGINS` as a comma-separated list of exact frontend origins; wildcard origins are not allowed while credentialed requests are enabled.

Backend access token lifetime should be overridden through `AUTH_TOKEN_EXPIRE_DAYS` instead of source edits. Accepted values are 1 to 90 days. Refresh token lifetime should be overridden through `AUTH_REFRESH_TOKEN_EXPIRE_DAYS`; accepted values are 1 to 180 days. Access and refresh tokens must be generated with a cryptographically secure random source and persisted only as SHA-256 hashes.

Refresh tokens are single-use. Clients call `POST /api/v1/auth/refresh` with the current refresh token, then store the returned access token and rotated refresh token. Logout revokes the current access token and all active refresh tokens for the user.

Backend login rate limiting is controlled by `AUTH_LOGIN_RATE_LIMIT_ENABLED`, `AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS`, and `AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS`. The default is 5 failed attempts per username and client IP within 300 seconds. Exceeded attempts return HTTP 429.

Every backend-to-agent proxy call writes an `agent_runs` audit row. Audit payloads and failure error messages redact sensitive fields such as raw resume text, chat messages, tokens, phone numbers, emails, authorization values, and resume rewrite fragments. Audit persistence failures are logged as warnings and must not interrupt the user-facing Agent response.

Generated Agent proxy responses include `agentRunId` when the audit row is persisted. Web and Android should pass that value to the matching archive endpoint so `reports`, `resume_analyses`, and `path_plans` can link back to the original Agent run.

Resume analysis archives store a SHA-256 hash of the submitted resume text and structured analysis output, but leave `resumes.resume_text` null. Keep raw resume persistence out of the archive flow unless the storage design explicitly adds encryption or object storage.

Current backend-to-agent proxy endpoints:

```text
POST /api/v1/career-reports/generate
POST /api/v1/profiles/generate
POST /api/v1/chat/messages
POST /api/v1/resumes/analyze
POST /api/v1/resumes/analyses/archive
GET  /api/v1/resumes/analyses
GET  /api/v1/resumes/analyses/{id}
DELETE /api/v1/resumes/analyses/{id}
POST /api/v1/path-plans/generate
POST /api/v1/path-plans/archive
GET  /api/v1/path-plans
GET  /api/v1/path-plans/{id}
PATCH /api/v1/path-plans/{planId}/tasks/{taskId}
DELETE /api/v1/path-plans/{id}
```

Current business endpoints:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/users/me
GET  /api/v1/users/me/profile
PUT  /api/v1/users/me/profile
GET  /api/v1/health
GET  /api/v1/ready
GET  /api/v1/assessments/mbti/questions
POST /api/v1/assessments/mbti/submit
GET  /api/v1/jobs
GET  /api/v1/jobs/{id}
GET  /api/v1/jobs/facets
POST /api/v1/jobs/recommendations
GET  /api/v1/jobs/favorites
POST /api/v1/jobs/favorites/{jobId}
DELETE /api/v1/jobs/favorites/{jobId}
GET  /api/v1/jobs/targets
POST /api/v1/jobs/targets/{jobId}
DELETE /api/v1/jobs/targets/{jobId}
GET  /api/v1/assets/images/{filename}
POST /api/v1/reports/archive
GET  /api/v1/reports
GET  /api/v1/reports/{id}
DELETE /api/v1/reports/{id}
```

## Python Rules

- Always work inside `agent_server/.venv`.
- Do not commit `.venv` or `.env`.
- Keep request/response models in `app/schemas`.
- Keep graph orchestration in `app/agents`.
- Keep LLM adapters in `app/services`.
- AI outputs saved by backend must be structured JSON.

## Java Rules

- Controller handles HTTP concerns only.
- Service owns business logic.
- Repository/Mapper owns persistence.
- DTOs are request objects and must carry `jakarta.validation` bounds for user-controlled values, especially text sent to Agent workflows, archive content, auth credentials, maps, lists, and paging-related inputs.
- VOs are response objects.
- Entity objects are not returned directly to frontend.
- Backend does not hold prompt-heavy AI workflows.
- Controllers must use `@Valid` for request bodies and `@Validated` plus parameter annotations for constrained query parameters.
- `GlobalExceptionHandler` owns the backend error envelope for validation failures, malformed JSON, request parameter type mismatches, business errors, and unhandled errors.

## Web Rules

- Use Vue 3 Composition API.
- Keep API clients under `src/api`.
- All Web HTTP communication must go through `src/utils/request.js`.
- The backend root addresses are configured only in `src/utils/request.js`; do not define backend hosts in pages or feature API files.
- Web production builds may use `VITE_BACKEND_BASE_URL=...` as a build-time override, but frontend feature code must still communicate only through `src/utils/request.js` and `src/api`.
- If a Web dev machine, LAN address, or production backend origin changes, update only `src/utils/request.js` or `VITE_BACKEND_BASE_URL`.
- Web production backend URLs must use `https://` and must not point to local or emulator hosts.
- Do not import `axios`, call `fetch`, or create another HTTP client outside `src/utils/request.js`; new backend communication should be wrapped as functions under `src/api`.
- Keep request error normalization in `src/utils/request.js`. Feature pages and stores should display or forward the normalized `Error.message`, not parse Axios response objects.
- Keep reusable UI under `src/components`.
- Keep pages under `src/pages`.
- Every async view needs loading, error, and empty states.
- Keep `src/App.smoke.spec.ts` current when routes, app shell navigation, or cross-page career-planning flows change.
- Run `npm run check` for Web changes; it includes Vue type checking, Vitest unit tests, and a production build.
- Follow the visual direction in `docs/VISUAL_STYLE.md`.

## Android Rules

- All Android HTTP communication must go through the Retrofit client in `network`.
- The backend root addresses are configured only in `network/RequestConfig.kt`; do not define backend hosts in screens, repositories, or DTOs.
- Temporary Android build overrides may use `-Pcareer.backendDebugBaseUrl=...` or `-Pcareer.backendReleaseBaseUrl=...`, but the app code must still read backend URLs only through `RequestConfig`.
- If an emulator, USB device, LAN address, or production backend origin changes, update only `network/RequestConfig.kt` or the Gradle backend URL override.
- Release Android backend URLs must use `https://` and must not point to local or emulator hosts.
- Do not compose absolute backend URLs in Android feature code; add endpoint methods to `CareerApi.kt` and keep the base URL in `RequestConfig.kt`.
- OkHttp timeout values are configured only in `network/RequestConfig.kt`; do not hardcode timeout values beside feature calls.
- OkHttp logging is configured only in `network/RequestConfig.kt`; debug builds may use basic request logging, but release builds must use `HttpLoggingInterceptor.Level.NONE`.
- Remote calls from screens or view models should use `runApiCatching`, which preserves coroutine cancellation and normalizes backend envelope errors, HTTP errors, timeout errors, and network errors into user-readable `ApiException.message`.
- Do not create parallel HTTP clients in screens or view models; add API definitions to the shared network layer.
- Android login session persistence must go through `SessionStore`; screens should not read or write bearer or refresh tokens directly. `SessionStore` stores session values encrypted with Android Keystore-backed AES/GCM.
- Keep reusable local validation and parsing rules in testable Kotlin helpers.
- Run `.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease` for Android changes.

## Asset Rules

- Image assets are stored under `backend/data_server/images`.
- Backend serves public images only through validated `/data-server/images/{filename}` URLs returned by backend APIs.
- Frontend and app clients should not compose image URLs locally.
- When a full image URL is needed, request it from backend, such as `GET /api/v1/assets/images/{filename}`.
- Backend must build full asset URLs from the current request context and forwarded headers, so local, LAN, emulator, reverse-proxy, and future production hosts all return the correct host and port.
- Client code may send filenames or IDs, but must not concatenate backend host, `/data-server`, `/images`, or other backend resource paths.

Quick scans before finishing client communication changes:

```text
rg -n "axios" web/src
rg -n "http://|https://|10\.0\.2\.2|127\.0\.0\.1|localhost|data_server|/images" web/src android/app/src
```

## Sensitive Data

- Do not log passwords, tokens, API keys, raw resumes, or full private assessment answers.
- Do not store raw resume text or private chat messages in `agent_runs`; use the backend audit redaction path.
- Store real model keys only in local `.env`.
- Prompt templates should avoid requesting unnecessary private information.
