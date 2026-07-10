# Android

Jetpack Compose MVP for the career decision system.

## Run

Open this `android/` directory in Android Studio and run the `app` configuration.

You can also build from PowerShell:

```powershell
cd D:\Project\career-decision-system\android
.\gradlew.bat :app:assembleDebug
```

Device smoke from the repository root:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-android.ps1
```

Start an emulator in Android Studio or connect a device with USB debugging first. The script finds `adb`, installs the debug APK, launches the app, checks the visible window, verifies the main Compose UI text, taps the login, jobs, MBTI, and report tabs, and fails on launch-time AndroidRuntime crashes. Pass `-SkipUiFlow` only when debugging device-specific UI automation issues.

If Android Studio asks for SDK components, install Android SDK Platform 35 and Android SDK Build-Tools 34.0.0.

The emulator uses:

```text
http://10.0.2.2:8080
```

That maps to the host machine backend at `http://127.0.0.1:8080`.

For a physical phone or a different local network, edit the debug backend root address in the single Android request config file:

```text
android/app/src/main/java/com/careerdecision/mobile/network/RequestConfig.kt
```

For example:

```kotlin
private const val DEBUG_BACKEND_BASE_URL = "http://YOUR_HOST_LAN_IP:8080"
```

`BACKEND_BASE_URL` and `BACKEND_API_BASE_URL` are derived from that value. Do not define backend hosts in screens, repositories, or DTOs.

For a temporary build without source edits:

```powershell
.\gradlew.bat :app:assembleDebug "-Pcareer.backendDebugBaseUrl=http://YOUR_HOST_LAN_IP:8080"
```

Release builds use the release default in `RequestConfig.kt`, or a build-time override:

```powershell
.\gradlew.bat :app:assembleRelease "-Pcareer.backendReleaseBaseUrl=https://api.your-domain.example"
```

Release backend URLs must use HTTPS and must not point to `localhost`, `127.0.0.1`, `10.0.2.2`, or `0.0.0.0`.

## Current MVP

- Register / login
- Android Keystore-encrypted access and refresh token session restore
- Load jobs from the backend database
- Load MBTI questions from the backend database
- Submit MBTI result with the logged-in user
- Generate a career report through backend -> agent_server
- Archive generated reports, resume analyses, and generated path plans
- List, open, and delete archived reports, resume analyses, and path plans
- Toggle archived path plan task completion state
