# Production Readiness Roadmap

Target: Web, Android, backend, and Agent layers reach production usability with 95%+ feature completeness.

## Current State

- Architecture: four-layer structure is established.
- Database: real job corpus is imported into `career_decision_system`.
- Backend: core APIs, user profile persistence, job search, recommendations, job favorites, target jobs, MBTI, report archive, resume analysis archive, path plan archive, asset URL resolution, and Agent proxy are working. Protected archive/profile/favorite/target endpoints use token-scoped user context, report/resume/path archive tests cover cross-user read/delete/update isolation, saved profile/favorite/target tests cover cross-user data isolation, access and refresh tokens are securely generated and hash-persisted, refresh tokens are single-use rotated, logout revokes active access and refresh tokens, login failures are rate-limited by username and client IP, Agent connection URL/token/timeout, auth token lifetimes, login rate limit, and CORS origins are environment-configurable, blank Agent internal tokens are rejected before proxy calls, production readiness rejects unsafe local defaults, Agent proxy calls are audited in `agent_runs` with sensitive fields redacted, generated archives link back to Agent runs, responses include trace IDs, request bodies and user-controlled query parameters including archive pagination have validation bounds with envelope errors for malformed input, backend-generated asset URLs are validated against the current request context and reject symlink-backed files, database readiness is exposed through `/api/v1/ready`, and path plan archives expose task progress analytics. Local smoke scripts check running backend and Agent health/readiness plus the write-path flow for auth, refresh-token rotation/revocation, profile, real jobs, MBTI, target/favorite jobs, report/resume/path generation, archive persistence, path task updates, logout, and Web browser rendering. The runtime smoke can start or reuse local Agent Server/backend processes.
- Agent Server: deterministic LangGraph workflows are working as fallbacks; career report generation, capability profile, resume analysis, path planning, and chat can use a real OpenAI-compatible LLM provider with structured JSON validation, configurable timeout, and bounded retry for transient provider failures. LLM enhancement fallback is observable through sanitized workflow/trace/error-type logs that avoid raw resumes, prompts, chat text, tokens, and provider secrets. Agent business endpoints validate `X-Internal-Token`, production readiness rejects the local default or short internal tokens plus unsafe LLM configuration, and Agent responses include request trace IDs while validation/auth errors use the common envelope.
- Web: main career planning pages are usable and styled in the approved cyan/mint direction; job favorites, target jobs, user profile, resume analyses, generated path plans, and path task completion state are persisted. Dashboard metrics use real job/profile/report state instead of local demo report counts, the AI report page starts in a neutral waiting state instead of showing a local demo report as if it were generated, resume/path editing starts empty unless the user explicitly loads a sample, and runtime navigation config no longer carries unused demo report/profile fixtures. Dashboard profile, auth with refresh-token rotation, request-layer 401 refresh/retry, resume/path, role filtering, and report generation flows have validation, field-level feedback, clear save or submit states, centralized request error normalization, and production backend URL policy. Vitest coverage protects auth validation, auth store session-event synchronization, request error normalization, request-layer token refresh retry, request base URL derivation, resume/path validation, explicit sample loading, report archive interactions, resume analysis archive opening, path plan archive opening, archived path task toggling, authenticated job favorite/target actions, and an App-level routed smoke flow across dashboard, role exploration, MBTI, report generation, and resume/path validation. Persisted target jobs are used as default goals for report and path generation.
- Android: debug build works with login, Android Keystore-encrypted access/refresh token session restore, restored-session refresh-token rotation, jobs, persisted job favorites/targets, lightweight profile editing, MBTI, report generation, report/resume/path archive list/open/delete, and path task completion state. Auth, profile, MBTI, resume inputs, report/resume/path archive actions, network logging policy, release cleartext-traffic policy, release backend URL policy, and session serialization have shared local validation or verification coverage, resume editing starts empty unless the user explicitly loads a sample, persisted target jobs are used as default report/path goals, and the adb smoke now verifies visible Compose UI plus login/jobs/MBTI/report tab navigation.
- Local HTTPS: mkcert is installed locally, project HTTPS certificates are generated under `.local-https/`, Vite can opt into HTTPS with `VITE_DEV_HTTPS=true`, backend can opt into the `local-https` Spring profile, and Android debug can trust user-installed CAs without changing release trust policy.

## 95%+ Completion Definition

### Backend

- Authentication and token lifecycle are production-safe, including hashed access/refresh tokens, single-use refresh-token rotation, logout revocation, and configurable login failure rate limiting.
- User profile, assessment, resume, report, favorites, plan records, and path task progress are persisted.
- User-owned records are isolated by authenticated token user; tests cover cross-user access and mutation attempts for private archives, saved profiles, favorite jobs, target jobs, and saved career data.
- Job search supports realistic filters, paging, sorting, and deduplication.
- File and image assets are served from `data_server` with safe path handling and backend-generated absolute URLs.
- APIs have validation, error envelopes, trace IDs, tests, and documentation.
- Runtime readiness checks cover production configuration and database availability through `GET /api/v1/ready`.
- Backend-to-Agent calls have bounded configurable timeout behavior and failure audit rows.
- CORS origins are configured by environment per deployment environment.

### Agent Server

- Real LLM provider works through `app/services/llm_client.py`.
- Real LLM calls use bounded, configurable timeout/retry behavior.
- Business endpoints require the backend internal token; health and readiness remain public.
- Production readiness rejects the local default internal token and short internal tokens.
- Production readiness rejects mock or incomplete LLM configuration.
- Prompt inputs and outputs are schema-validated.
- Agent runs are traceable by request ID through response `trace_id`, `X-Trace-ID`, and backend `agent_runs` audit rows.
- Resume and report workflows avoid logging private raw content.
- Fallback behavior exists when LLM provider fails, and fallback events are logged without private prompt content.

### Web

- All backend communication goes through `src/utils/request.js`.
- Backend and network errors are normalized in `src/utils/request.js`.
- Key flows are complete: auth, profile, MBTI, jobs, recommendations, resume analysis, report archive, path plan.
- Every remote view has loading/error/empty states.
- High-impact forms provide validation, field-level errors, and save-state feedback.
- App-level routed smoke coverage protects the main shell, route transitions, and highest-risk cross-page remote flows.
- Web checks include Vue type checking, Vitest unit tests, production build through `npm run check`, and an optional Chrome/Edge browser smoke that exercises registration, profile save, target job selection, and report generation against the running backend.
- Production Web builds reject local or non-HTTPS backend URLs while development keeps the local backend default.
- Layout is responsive and visually consistent with `VISUAL_STYLE.md`.

### Android

- All backend communication uses the network package and `RequestConfig.kt`.
- Main flows mirror the Web MVP.
- Nullable API data is handled safely.
- High-impact actions validate input locally through testable helpers and expose clear loading/message states.
- The ViewModel main flow is covered by JVM unit tests with fake API/session dependencies, including auth, restored-session refresh, profile, MBTI, job target/favorite, report/resume/path generation/archive/open/delete, path task status, and logout behavior.
- A device smoke script installs the debug APK on an adb-connected emulator/device, launches the app, checks the visible window, verifies key Compose UI text, taps the login, jobs, MBTI, and report tabs, and fails on launch-time AndroidRuntime crashes.
- Debug unit tests and debug build are stable; release signing/config can be added later.
- Release build is generated by the standard gate. The merged release manifest must reject cleartext traffic, and the release backend URL default or override must use HTTPS and avoid local/emulator hosts while debug keeps local HTTP available for emulator development.

## Near-Term Priority

1. Run Android device UI smoke on a stable emulator/device during release checks and add deeper authenticated UI flows after emulator networking is fixed for the local backend.
2. Keep expanding protected endpoint coverage and consider Redis-backed distributed rate limits when multi-node deployment begins.

## Required Gates

```text
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeApiSmoke
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeRuntimeSmoke
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeAndroidDeviceSmoke -StartAndroidEmulator
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-runtime.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-api.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-web.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 -StartEmulator

mvn test
.venv\Scripts\python.exe -m pytest
.venv\Scripts\python.exe -m ruff check .
npm run check
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease
```

The full script also enforces text encoding, client communication scans, and Web/Android release policy: user-facing text, docs, and production SQL scripts must not contain common mojibake fragments, Web `axios` usage must remain centralized in `web/src/utils/request.js`, Web smoke must pass the selected backend URL into Vite, client-side backend hosts or asset paths must remain in the approved request configuration files only, production Web backend URLs must be HTTPS and non-local, the merged release Android manifest must disable cleartext traffic, and the release Android backend URL must be HTTPS and non-local. `SQL脚本/career_db.sql` is reference-only and excluded from the production SQL scan. Use `-IncludeApiSmoke` when local backend and Agent Server are already running and the current database should be validated through the write-path smoke. Use `-IncludeRuntimeSmoke` to start or reuse local Agent Server/backend, then run API and Web browser smoke on top. Use `-IncludeAndroidDeviceSmoke` when an emulator or USB-debuggable device is connected through `adb`; when an AVD already exists, add `-StartAndroidEmulator` on `verify-all.ps1` or `-StartEmulator` on `smoke-android.ps1` to let the script start it.
