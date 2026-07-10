# Full Chain MVP

This document records the current end-to-end development state with the imported job data available in `career_decision_system`.

## Runtime Layers

- `agent_server`: FastAPI + LangGraph agent service.
- `backend`: Spring Boot business API, MySQL persistence, agent proxy.
- `web`: Vue 3 web client.
- `android`: Kotlin Jetpack Compose mobile MVP.

## Local Services

Start order:

1. MySQL with database `career_decision_system`.
2. `agent_server` from its virtual environment.
3. `backend`.
4. `web`.
5. Android from Android Studio or `android/gradlew.bat`.

Current local URLs:

- Agent Server: `http://127.0.0.1:8001`
- Backend: `http://127.0.0.1:8080`
- Web: `http://127.0.0.1:5173`
- Android emulator backend URL: `http://10.0.2.2:8080/api/v1/`

## End-to-End Flow

The current MVP supports:

1. Register or login.
2. Store access and refresh tokens on Web/Android, with refresh-token rotation for session restore.
3. Load jobs from the MySQL job corpus.
4. Load MBTI questions from MySQL.
5. Submit MBTI answers and persist sessions for logged-in users.
6. Generate a career report through backend -> agent_server.
7. Archive generated reports in MySQL.
8. Read archived reports on Web.
9. Generate and archive resume analyses.
10. Generate and archive path plans.
11. Update archived path plan task progress.
12. Use the same backend contract from Android.

## Job Data Status

The current database `career_decision_system` contains the imported job corpus used by the backend search, recommendation, target, and favorite flows. `SQL脚本/00_init_career_decision_system.sql` still contains baseline seed data for a fresh local initialization, while the import scripts under `SQL脚本/` document the real-job schema upgrade and import path.

## Verification Status

Verified in this environment:

- Backend tests: `mvn test`
- Agent tests: `.venv/Scripts/python.exe -m pytest`
- Web check: `npm run check`
- Android build: `android/gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease`
- Full local gate: `powershell -ExecutionPolicy Bypass -File scripts/verify-all.ps1`
- API smoke: `powershell -ExecutionPolicy Bypass -File scripts/smoke-api.ps1` covers health, auth, refresh-token rotation/revocation, profile, MBTI, real jobs, target/favorite jobs, Agent report/resume/path generation, archive persistence, path task updates, and logout.
- Runtime smoke: `powershell -ExecutionPolicy Bypass -File scripts/smoke-runtime.ps1` starts or reuses Agent/backend, runs API smoke, then runs the Web browser smoke.
- Browser UI smoke: register/login, profile save, target job selection, career report generation, report archive

Android build notes:

- The emulator uses `http://10.0.2.2:8080/api/v1/` to reach the host backend.
- Android debug and release backend defaults live in `android/app/src/main/java/com/careerdecision/mobile/network/RequestConfig.kt`; release defaults and release overrides must use HTTPS and avoid local/emulator hosts.
- If Gradle reports missing SDK packages, install Android SDK Platform 35 and Android SDK Build-Tools 34.0.0 from Android Studio SDK Manager.
- The project includes a Gradle Wrapper. On this machine, SDK packages `platforms/android-35` and `build-tools/34.0.0` were added under `C:\Users\yunzh\AppData\Local\Android\Sdk`.
