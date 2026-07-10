# Local Development

This project is split into four layers:

```text
web <-> backend <-> agent_server
android <-> backend <-> agent_server
```

`deploy/` is intentionally omitted in the current phase.

## Ports

Use these defaults during local development:

```text
web           http://127.0.0.1:5173
backend       http://127.0.0.1:8080
agent_server  http://127.0.0.1:8001
```

## Start Agent Server

Always use the virtual environment under `agent_server/.venv`.

```powershell
cd D:\Project\career-decision-system\agent_server
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

Health checks:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/v1/health
Invoke-RestMethod http://127.0.0.1:8001/api/v1/ready
```

Optional real LLM mode for career reports, capability profile, resume analysis, path planning, and chat:

```powershell
cd D:\Project\career-decision-system\agent_server
@'
LLM_PROVIDER=openai_compatible
LLM_MODEL=your-model-name
LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=your-api-key
LLM_TIMEOUT_SECONDS=30
LLM_MAX_RETRIES=2
LLM_RETRY_BACKOFF_SECONDS=0.2
'@ | Set-Content .env -Encoding UTF8
```

Without these variables, Agent Server stays in deterministic `mock` mode.

Agent internal token:

```powershell
cd D:\Project\career-decision-system\agent_server
@'
INTERNAL_API_TOKEN=change-me
'@ | Set-Content .env -Encoding UTF8
```

Keep this value aligned with the backend `AGENT_INTERNAL_TOKEN` or `INTERNAL_API_TOKEN` environment variable. Local defaults are `change-me`.

Production-like readiness:

```powershell
$env:APP_ENV = 'production'
$env:INTERNAL_API_TOKEN = 'replace-with-a-long-random-token'
$env:LLM_PROVIDER = 'openai_compatible'
$env:LLM_MODEL = 'your-model-name'
$env:LLM_API_KEY = 'your-api-key'
```

When `APP_ENV` is `prod` or `production`, Agent readiness rejects the local `change-me` token, short internal tokens, `LLM_PROVIDER=mock`, unsupported providers, blank `LLM_MODEL`, and missing `LLM_API_KEY`. Keep the backend `AGENT_INTERNAL_TOKEN` set to the same value as `INTERNAL_API_TOKEN`.

## Start Backend

```powershell
cd D:\Project\career-decision-system\backend
mvn spring-boot:run
```

Backend Agent connection overrides:

```powershell
$env:AGENT_SERVER_BASE_URL = 'http://127.0.0.1:8001'
$env:AGENT_INTERNAL_TOKEN = 'change-me'
$env:AGENT_SERVER_TIMEOUT_SECONDS = '30'
```

If `AGENT_INTERNAL_TOKEN` is not set, backend falls back to `INTERNAL_API_TOKEN`, then the local default. `AGENT_SERVER_TIMEOUT_SECONDS` accepts an integer from 1 to 300 and applies to backend-to-Agent connection and request timeout.
The backend trims and rejects blank Agent internal tokens before sending `X-Internal-Token`.

Production-like backend readiness:

```powershell
$env:APP_ENV = 'production'
$env:DB_USERNAME = 'career_user'
$env:DB_PASSWORD = 'replace-with-a-strong-db-password'
$env:AGENT_INTERNAL_TOKEN = 'replace-with-a-long-random-token'
$env:CORS_ALLOWED_ORIGINS = 'https://career.example.com'
```

When `APP_ENV` is `prod` or `production`, backend `/api/v1/ready` rejects unsafe local defaults before reporting ready: Agent token `change-me`, short Agent tokens, `root/root` database credentials, and localhost-only CORS origins.

Backend CORS origin overrides:

```powershell
$env:CORS_ALLOWED_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
```

Add LAN or emulator-facing frontend origins here when testing on another device. Do not edit Java source just to allow a different client origin.

Backend auth token lifetime overrides:

```powershell
$env:AUTH_TOKEN_EXPIRE_DAYS = '7'
$env:AUTH_REFRESH_TOKEN_EXPIRE_DAYS = '30'
```

Use an integer from 1 to 90 for access tokens and 1 to 180 for refresh tokens. The backend stores only token hashes. Login returns an access token and a refresh token; refresh tokens are single-use and rotated through `/api/v1/auth/refresh`.

Existing databases initialized before refresh-token support must run the idempotent migration before restarting backend:

```text
D:\Project\career-decision-system\SQL脚本\04_add_refresh_tokens.sql
```

Backend login rate limit overrides:

```powershell
$env:AUTH_LOGIN_RATE_LIMIT_ENABLED = 'true'
$env:AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = '5'
$env:AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS = '300'
```

By default, the backend allows 5 failed login attempts per username and client IP within 300 seconds. After that, `/api/v1/auth/login` returns HTTP 429 until the window expires or a successful login clears the failure window.

Health and readiness checks:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/v1/health
Invoke-RestMethod http://127.0.0.1:8080/api/v1/ready
```

`/api/v1/ready` checks production configuration and database connectivity with `SELECT 1`, so use it before running smoke tests that depend on MySQL state.

## Start Web

```powershell
cd D:\Project\career-decision-system\web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

The Web client defaults to `http://127.0.0.1:8080` in development. For a production build, set the backend API origin with `VITE_BACKEND_BASE_URL` when the default placeholder is not your target:

```powershell
cd D:\Project\career-decision-system\web
$env:VITE_BACKEND_BASE_URL = 'https://api.your-domain.example'
npm run build
```

Production Web backend URLs must use HTTPS and must not point to local or emulator hosts. Web pages and feature APIs still read the backend only through `src/utils/request.js`.

## Optional Local HTTPS

Local HTTPS uses mkcert and is documented separately so it does not disturb the default HTTP workflow:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-https.ps1
```

Then follow `docs/LOCAL_HTTPS.md` for backend, Web, and Android debug HTTPS startup commands.

## Test Commands

Full project gate:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1
```

Full project gate plus API smoke, when `backend` and `agent_server` are already running:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeApiSmoke
```

Full project gate plus runtime smoke:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeRuntimeSmoke
```

`-IncludeRuntimeSmoke` starts missing local Agent Server/backend processes, reuses already-running ones, runs the API write-path smoke, runs the Web browser smoke, and cleans up only processes it started. It still expects the configured MySQL database to be running and initialized.

Runtime smoke without the full test/build gate:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-runtime.ps1
```

API smoke for already-running local services:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-api.ps1
```

This is a write-path smoke, not only a health check. It creates a unique `smoke_*` user and verifies auth, refresh-token rotation and reuse rejection, profile save, MBTI submit, target/favorite jobs, backend-to-Agent report/resume/path generation, report/resume/path archive persistence, path task status updates, logout, and refresh-token revocation after logout against the configured database.

The smoke script defaults to `http://127.0.0.1:8080` for backend and `http://127.0.0.1:8001` for Agent Server. Override with parameters or environment variables:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-api.ps1 `
  -BackendBaseUrl 'http://127.0.0.1:8080' `
  -AgentBaseUrl 'http://127.0.0.1:8001'
```

Restart backend after backend code changes before relying on this smoke check; it validates the running process, not just the source tree.

Web browser smoke for already-running backend:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-web.ps1
```

The Web smoke starts Vite on `http://127.0.0.1:5173` when needed, passes the selected backend URL into `VITE_BACKEND_BASE_URL`, uses local Chrome or Edge through `playwright-core`, registers a unique `websmoke_*` user, saves a profile, selects a target job, generates an AI report, and verifies archive feedback in the rendered app. Override the browser path with `BROWSER_EXECUTABLE_PATH` when Chrome/Edge is installed somewhere else.

Agent Server:

```powershell
cd D:\Project\career-decision-system\agent_server
.\.venv\Scripts\python.exe -m pytest
```

Backend:

```powershell
cd D:\Project\career-decision-system\backend
mvn test
```

Web:

```powershell
cd D:\Project\career-decision-system\web
npm run check
```

Android:

```powershell
cd D:\Project\career-decision-system\android
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease
```

Android device smoke, when an emulator or USB-debuggable device is connected:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1
```

The script resolves `adb` from `ADB_PATH`, `PATH`, `%LOCALAPPDATA%\Android\Sdk\platform-tools`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT`. It installs the debug APK, launches `com.careerdecision.mobile/.MainActivity`, checks that the app is visible, navigates the main Compose tabs with `uiautomator`, and fails on launch-time AndroidRuntime crashes. It intentionally fails when no device is connected so the missing runtime target is visible.

If no emulator or device is ready, the script prints the resolved `adb` path, the resolved Android emulator path, and the available AVD names. If no AVD names are listed, open Android Studio Device Manager and create one first.

After at least one AVD exists, the smoke script can start it automatically:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 `
  -StartEmulator `
  -EmulatorBootWaitSeconds 240
```

To start a specific AVD:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 `
  -StartEmulator `
  -AvdName 'Pixel_8_API_35' `
  -EmulatorBootWaitSeconds 240
```

The full gate can pass the same emulator-start behavior into the Android smoke:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 `
  -IncludeAndroidDeviceSmoke `
  -StartAndroidEmulator `
  -AndroidEmulatorBootWaitSeconds 240
```

If multiple devices are connected, pin the target serial shown by `adb devices`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 `
  -DeviceSerial 'emulator-5554'
```

The full gate can pass the same serial and a custom `adb` path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 `
  -IncludeAndroidDeviceSmoke `
  -AndroidDeviceSerial 'emulator-5554' `
  -AndroidAdbPath "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
```

If Android Studio has just started an emulator and it is still booting, increase the wait:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 -DeviceWaitSeconds 60
```

If the script reports `unauthorized`, unlock the device and approve the USB debugging prompt. If it reports `offline`, restart the emulator or run `adb kill-server` and rerun the smoke.

## Parallel Work Rules

- Keep `web`, `backend`, `agent_server`, and `android` changes separated unless a feature explicitly crosses layers.
- Backend owns persistence, permission checks, and API orchestration.
- Agent Server owns LLM prompts, LangGraph workflows, structured AI outputs, and AI-specific tests.
- Web owns browser UX and API client calls.
- Android follows the same backend API contract as Web. Use Android Studio SDK Manager if Gradle reports missing Android SDK Platform 35 or Build-Tools 34.0.0.
- Do not add `deploy/` until deployment work begins.
- Do not copy the old prototype UI directly. Use it only as product-flow reference.
