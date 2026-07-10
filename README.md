# Career Decision System

AI-driven career planning system with four product/runtime layers:

- `web/`: Vue 3 web client.
- `android/`: Kotlin Jetpack Compose mobile client.
- `backend/`: Spring Boot business backend.
- `agent_server/`: Python FastAPI AI agent service.
- `docs/`: product, architecture, API, and development documentation.

The current implementation starts from a clean architecture and borrows feature ideas from the previous experimental project at `D:\Project\career-decision-system-web`.

## First Run Order

1. Start `agent_server` in its Python virtual environment.
2. Start `backend` and verify it can call `agent_server`.
3. Start `web` and connect it to `backend`.
4. Open `android/` in Android Studio or build it with `android/gradlew.bat`.

Deployment files are intentionally not included yet.

## Full Verification

Run the full local quality gate from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1
```

The script runs backend tests, Agent Server tests and Ruff, Web type/tests/build, Android unit tests/build, and client communication scans for the request-wrapper rules.

When local `agent_server` and `backend` are already running, include the write-path API smoke in the same gate:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeApiSmoke
```

To include the full runtime smoke, which starts or reuses Agent Server and backend, then runs API and Web browser smoke:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeRuntimeSmoke
```

When local `agent_server` and `backend` are running, run the API smoke check:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-api.ps1
```

The smoke script checks agent health/readiness, backend health, real job data, MBTI data, auth, refresh-token rotation/revocation, profile persistence, target/favorite jobs, backend -> Agent report/resume/path generation, archive persistence, path task updates, and logout. It creates a unique `smoke_*` user in the configured database.

To run the runtime smoke without the full test/build gate:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-runtime.ps1
```

It starts missing local Agent Server/backend processes, reuses already-running ones, and cleans up only processes it started.

Run the Web browser smoke when backend is running and Chrome or Edge is installed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-web.ps1
```

It starts Vite when needed and verifies registration, profile save, target job selection, report generation, and rendered archive feedback with a unique `websmoke_*` user.

Run the Android device smoke when an emulator or USB-debuggable device is connected:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1
```

It installs the debug APK, launches `com.careerdecision.mobile/.MainActivity`, checks that the app is visible, and fails if launch-time AndroidRuntime crashes appear in logcat. The script reports the resolved `adb` path, emulator path, and available AVDs when no device is ready.

After creating an AVD in Android Studio Device Manager, the script can start it for you:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1 -StartEmulator -EmulatorBootWaitSeconds 240
```

The same option is available through the full gate:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeAndroidDeviceSmoke -StartAndroidEmulator
```

When more than one device is visible in `adb devices`, pass the target serial:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-all.ps1 -IncludeAndroidDeviceSmoke -AndroidDeviceSerial emulator-5554
```

Optional local HTTPS debugging is available through mkcert:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-https.ps1
```

See `docs/LOCAL_HTTPS.md` for backend, Web, and Android HTTPS startup commands.

## Useful Docs

- `docs/TECH_STACK.md`: selected technology stack.
- `docs/ARCHITECTURE.md`: four-layer responsibility split.
- `docs/MVP.md`: first milestone scope.
- `docs/FULL_CHAIN_MVP.md`: current end-to-end Web, backend, agent, and Android MVP status.
- `docs/CODE_STANDARDS.md`: cross-layer coding and communication rules.
- `docs/PRODUCTION_READINESS.md`: 95%+ production readiness definition and roadmap.
- `docs/DATABASE_JOB_SCHEMA_REVIEW.md`: real job data schema review and import plan.
- `docs/DEVELOPMENT_GUIDE.md`: coding conventions.
- `docs/LOCAL_DEVELOPMENT.md`: local run, smoke test, and parallel workflow.
- `docs/LOCAL_HTTPS.md`: optional mkcert-based HTTPS debugging.
