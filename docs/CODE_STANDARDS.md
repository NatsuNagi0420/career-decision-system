# Code Standards

This project follows the same rules across Web, Android, backend, and Agent layers.

## General

- Keep code in UTF-8 with LF line endings. See `.editorconfig`.
- User-facing text, docs, production SQL scripts, and smoke assertions must not contain mojibake or replacement characters; `scripts/verify-all.ps1` scans common corrupted UTF-8/GBK fragments before layer tests.
- Keep business logic out of controllers and UI components.
- Use structured request/response models. Do not pass untyped blobs across layers unless the boundary is intentionally dynamic.
- Add or update tests when behavior changes.
- Do not hardcode backend URLs outside the approved request configuration files.
- Do not let frontend or app clients compose backend asset URLs. Backend returns full asset URLs.
- PowerShell automation scripts under `scripts/` must remain parseable by `System.Management.Automation.Language.Parser.ParseFile`; `scripts/verify-all.ps1` checks this before layer tests.
- Local mkcert certificates live only under `.local-https/`, are ignored by git, and must never be copied into source-controlled app resources. Use `scripts/setup-local-https.ps1` to regenerate them.

## Client Communication Contract

- Web HTTP requests must go through `web/src/utils/request.ts`; feature APIs should call the typed wrappers in `web/src/api`.
- Web backend root addresses are configured only in `web/src/utils/request.ts`; `BACKEND_BASE_URL` selects the dev or production default, applies optional `VITE_BACKEND_BASE_URL`, and `API_BASE_URL` is derived from it.
- When the Web backend network changes, update only `web/src/utils/request.ts` or the documented `VITE_BACKEND_BASE_URL` override. Do not scatter host edits through pages, stores, or API modules.
- Web pages, components, stores, and feature API modules must not import `axios`, call `fetch`, create another HTTP client, or define another backend base URL.
- Web request-client tests may import `axios` only to verify the centralized request client behavior.
- Web access-token retry behavior belongs in `web/src/utils/request.ts`; protected requests that receive 401 may refresh once with the stored refresh token, retry once, and sync session state through the auth store event bridge.
- Android HTTP requests must go through the Retrofit client in `android/app/src/main/java/com/careerdecision/mobile/network`.
- Android backend root addresses are configured only in `android/app/src/main/java/com/careerdecision/mobile/network/RequestConfig.kt`; `BACKEND_BASE_URL` selects the debug or release default, applies optional Gradle overrides, and `BACKEND_API_BASE_URL` is derived from it.
- When the Android backend network changes, update only `RequestConfig.kt` or the documented Gradle backend URL override. Do not edit screens, view models, repositories, or DTOs for host changes.
- Android screens, view models, repositories, and DTOs must not hardcode backend hosts, compose backend paths with hosts, or create parallel HTTP clients.
- Client code may pass an asset filename, ID, or business request to backend, but must not concatenate `/data-server`, `/images`, host, port, or backend paths locally.
- Backend APIs build absolute asset URLs from the current request context and return them to Web and Android, so LAN, emulator, localhost, and future production environments do not require client URL rewriting.

## Web

- All HTTP calls go through `web/src/utils/request.ts`.
- Backend base URL is configured only in `web/src/utils/request.ts`; production builds may override it with `VITE_BACKEND_BASE_URL`, but feature code must still read only the shared request client.
- Web production backend defaults and `VITE_BACKEND_BASE_URL` production overrides must use `https://` and must not point to `localhost`, `127.0.0.1`, `10.0.2.2`, or `0.0.0.0`.
- Backend envelope errors, timeout errors, network errors, auth expiry, rate limits, and 5xx failures are normalized in `web/src/utils/request.ts`; pages and stores should surface `Error.message` instead of parsing Axios errors directly.
- Expired Web access tokens are refreshed centrally in `web/src/utils/request.ts`; auth store state is synchronized from the request-layer session events instead of each page handling 401 responses.
- API function modules live in `web/src/api`.
- Pages live in `web/src/pages`; reusable components live in `web/src/components`.
- Every remote view must handle loading, error, empty, and success states.
- Web validation or interaction changes should update Vitest coverage under `web/src/**/*.spec.ts`.
- Web route, navigation shell, or cross-page flow changes must update `web/e2e/first-version-flow.spec.ts` for both 1440px and 360px projects.
- Styling uses a neutral work surface with restrained teal, blue, and status accents; no single-hue or dominant purple theme.

## Android

- All HTTP calls go through Retrofit under `android/app/src/main/java/com/careerdecision/mobile/network`.
- Backend API URL is configured only in `RequestConfig.kt`; Gradle may pass `career.backendDebugBaseUrl` or `career.backendReleaseBaseUrl` as build-time overrides, but feature code must still read only `RequestConfig.BACKEND_BASE_URL`.
- OkHttp backend timeout values are configured only in `RequestConfig.kt`.
- OkHttp logging level is configured only in `RequestConfig.kt`; release builds must use `HttpLoggingInterceptor.Level.NONE`.
- Android Debug and Release manifests must both set `android:usesCleartextTraffic="false"`; Gradle backend URL overrides must use HTTPS.
- Android Debug builds may trust only the system store and the project CA bundled in the Debug source set; they must not trust arbitrary user-installed CAs. Release builds must not contain or trust the local project CA.
- Android release backend defaults and release build overrides must use `https://` and must not point to `localhost`, `127.0.0.1`, `10.0.2.2`, or `0.0.0.0`.
- Backend envelope errors, HTTP errors, timeout errors, and network errors are normalized in `NetworkErrors.kt`; screens and view models should use `runApiCatching` and surface `Error.message`.
- Network DTOs stay in the `network` package.
- Bearer token and current user persistence goes through `SessionStore`, backed by Android Keystore encryption; Composables must not access token storage directly.
- ViewModels depend on `CareerRepositoryGateway`; the Repository coordinates the small remote data source, Keystore session, Room cache, and WorkManager scheduler.
- UI state is represented by immutable state data classes.
- Nullable backend fields must be nullable in Kotlin models.
- Local validation and parsing rules should live in testable helpers instead of being buried in Composables.
- Android validation, offline queue, token refresh, or main-flow changes should update `CareerRepositoryTest` and `AppViewModelTest`.

## Backend

- Controller handles HTTP only.
- Service owns business rules.
- Mapper owns SQL.
- Production migrations and seed scripts must be UTF-8 clean and importable. `SQL脚本/career_db.sql` and `SQL脚本/career_decision_system.sql` are reference/test snapshots and are excluded from the text scan; new schema changes must not be appended to those snapshots.
- Response objects are explicit DTO/VO records or classes. Do not return persistence records directly.
- Request DTOs and query parameters must define reasonable validation bounds for user-controlled strings, maps, lists, IDs, paging, and generated-content payloads.
- Validation failures, malformed JSON, and request parameter type mismatches must return the standard `ApiResponse` envelope instead of framework-default error bodies.
- Protected controller methods receive the authenticated user through `@CurrentUser`; do not trust client-supplied `userId` for persisted user-owned data.
- Static assets are stored under `backend/data_server`.
- Image assets are stored under `backend/data_server/images`.
- Client-visible image URLs must be generated by backend, not by Web or Android string concatenation.
- Public image files must be served through the validated `/data-server/images/{filename}` controller path; do not reintroduce a broad static resource handler for the whole `data_server` directory.
- Backend asset URL generation must use the current HTTP request context and forwarded headers, so clients can learn the reachable backend origin from the backend response.
- Backend static asset controllers must reject path traversal, nested paths, and symlink-backed files before returning public URLs.
- Backend readiness endpoints must verify runtime dependencies such as the database, not only that the HTTP process is alive.
- Backend production readiness must reject unsafe local defaults, including the Agent internal token default, weak Agent internal tokens, `root/root` database credentials, and localhost-only CORS origins.
- API responses use the standard `ApiResponse` envelope.
- API responses must include `traceId` and `X-Trace-ID`; Agent proxy endpoints should use request `requestId` as the trace value when present.
- Backend-to-Agent HTTP calls must forward trace context with `X-Request-ID`.
- Backend-to-Agent URL, internal token, and timeout must be configurable through environment variables; do not require source edits for network, secret, or latency changes.
- Backend-to-Agent internal token must be nonblank after trimming; do not send empty `X-Internal-Token` values.
- Backend CORS allowed origins must be configurable through `CORS_ALLOWED_ORIGINS`; do not hardcode new frontend origins in Java config.
- Backend bearer token lifetime must be configurable through `AUTH_TOKEN_EXPIRE_DAYS`, refresh-token lifetime must be configurable through `AUTH_REFRESH_TOKEN_EXPIRE_DAYS`, and raw tokens must never be persisted.
- Refresh tokens must be single-use rotated through `POST /api/v1/auth/refresh`; logout must revoke the current access token and all active refresh tokens for that user.
- Backend login failure rate limiting must stay configurable through `AUTH_LOGIN_RATE_LIMIT_ENABLED`, `AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS`, and `AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS`; do not hardcode per-environment limits in Java logic.
- Resume analysis archives must store only the resume content hash plus structured analysis output; do not persist raw resume text unless an explicit encrypted/object-storage design is added.
- Backend-to-Agent proxy calls must persist redacted audit rows in `agent_runs`; input snapshots, output snapshots, and failure error messages must not contain raw resumes, chat messages, tokens, phone numbers, emails, passwords, or authorization values. Audit persistence failures should be logged and must not break the user-facing response.
- Generated Agent results should carry `agentRunId` into matching archive requests; backend must verify ownership and Agent type before writing `agent_run_id`.

## Agent Server

- Work inside `agent_server/.venv`.
- Request and response schemas live in `app/schemas`.
- LangGraph orchestration lives in `app/agents`.
- LLM adapters live in `app/services`.
- Agent outputs must be structured Pydantic models.
- Agent business endpoints must validate `X-Internal-Token`; only health, readiness, and local docs can be public.
- Agent production readiness must reject the local default `INTERNAL_API_TOKEN=change-me` and short internal tokens when `APP_ENV` is `prod` or `production`.
- Agent production readiness must reject `LLM_PROVIDER=mock`, unsupported LLM providers, blank `LLM_MODEL`, and missing `LLM_API_KEY`.
- Real LLM HTTP calls must use configurable timeout and bounded retry settings; retry only transient provider failures such as 429, 5xx, timeout, or transport errors.
- Do not log raw resumes, tokens, or private assessment content.
- LLM enhancement fallback must be logged through the shared fallback logger with workflow, trace ID, and error type only; do not log prompts, raw resumes, chat messages, tokens, or provider secrets.

## Verification Gates

Run the relevant gates before considering a change complete:

```text
all layers:          powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1
all + API smoke:     powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeApiSmoke
all + Web smoke:     powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeWebSmoke
all + runtime smoke: powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeRuntimeSmoke
all + Android smoke: powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeAndroidDeviceSmoke
all + Android AVD:   powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeAndroidDeviceSmoke -StartAndroidEmulator
Android by serial:   powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeAndroidDeviceSmoke -AndroidDeviceSerial emulator-5554
runtime smoke only:   powershell -ExecutionPolicy Bypass -File .\scripts\smoke-runtime.ps1
api smoke only:      powershell -ExecutionPolicy Bypass -File .\scripts\smoke-api.ps1
web smoke only:      powershell -ExecutionPolicy Bypass -File .\scripts\smoke-web.ps1
android smoke only:  powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1
android AVD only:    powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 -StartEmulator
backend:             mvn test
agent_server:        .venv\Scripts\python.exe -m pytest
agent_server:        .venv\Scripts\python.exe -m ruff check .
web:                 npm run check
android:             .\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease
```

The base `verify-all.ps1` gate also parses every PowerShell script under `scripts/` before running layer checks, scans for common text encoding corruption in source/docs/production SQL scripts, checks Web production backend URL policy, checks that Web smoke passes the selected backend URL into Vite, builds the Android debug and release APKs, verifies the merged release Android manifest rejects cleartext traffic, and checks the Android release backend URL policy, so optional smoke scripts and release-only client policy cannot silently rot. The old `SQL脚本/career_db.sql` dump is excluded from this production SQL scan because it is reference-only. `-IncludeApiSmoke` requires local backend and Agent Server processes to already be running against the intended database. `-IncludeWebSmoke` also requires backend and a local Chrome or Edge executable; it starts Vite when port 5173 is free. `-IncludeRuntimeSmoke` and `smoke-runtime.ps1` start missing local Agent Server/backend processes, reuse existing ones, run API and Web smoke, and clean up only processes they started. `-IncludeAndroidDeviceSmoke` and `smoke-android.ps1` require an Android emulator or USB-debuggable device connected through `adb`; they install and launch the debug APK and fail on launch-time crashes. Use `-StartAndroidEmulator`, `-AndroidAvdName`, `-AndroidDeviceSerial`, and `-AndroidAdbPath` only together with `-IncludeAndroidDeviceSmoke`; otherwise the gate fails fast instead of silently ignoring Android smoke options. Restart backend after backend code or SQL shape changes before trusting smoke results against an already-running service.
