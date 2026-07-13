# 使用 mkcert 进行本地 HTTPS 调试

Web 和 Android 到后端的局域网调试必须使用 HTTPS。Agent 只在同一台电脑上被后端调用，保持 `http://127.0.0.1:8001`。

## Generate Certificates

Install and trust the mkcert local CA, then generate project-local certificates:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-https.ps1
```

For LAN debugging with `https://ip:port`, include the current private LAN IPs in the certificate:

```powershell
cd D:\Project\career-decision-system
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-https.ps1 -IncludeLanIps
```

If you want to pin a specific IP manually:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-https.ps1 -ExtraHosts '192.168.1.159'
```

Generated files are written to `.local-https/` and ignored by git:

```text
.local-https/local-cert.pem       # Vite certificate
.local-https/local-key.pem        # Vite private key
.local-https/backend-local.p12    # Spring Boot PKCS#12 bundle
.local-https/mkcert-rootCA.pem    # public local CA certificate for devices
```

The backend PKCS#12 password is `changeit`, which is mkcert's legacy default.

The generated certificate covers:

```text
localhost
127.0.0.1
::1
10.0.2.2
192.168.1.159
career.local.test
api.career.local.test
web.career.local.test
```

`192.168.1.159` 已包含在默认列表中；`-IncludeLanIps` 还会加入 Windows 当前检测到的其他私有地址。

If you use the `*.career.local.test` names, add them to your Windows hosts file:

```text
127.0.0.1 career.local.test api.career.local.test web.career.local.test
```

## Start Backend Over HTTPS

```powershell
cd D:\Project\career-decision-system\backend
$env:AGENT_SERVER_BASE_URL = 'http://127.0.0.1:8001'
$env:AGENT_INTERNAL_TOKEN = 'change-me'
mvn spring-boot:run '-Dspring-boot.run.profiles=local-https'
```

Backend HTTPS will listen on:

```text
https://127.0.0.1:8443
```

Override the port or PKCS#12 path when needed:

```powershell
$env:HTTPS_SERVER_PORT = '8443'
$env:HTTPS_KEY_STORE = 'file:../.local-https/backend-local.p12'
$env:HTTPS_KEY_STORE_PASSWORD = 'changeit'
```

For LAN Web debugging, also allow the LAN Web origin through CORS before starting the backend:

```powershell
$env:CORS_ALLOWED_ORIGINS = 'https://localhost:5173,https://127.0.0.1:5173,https://192.168.1.159:5173'
```

## Start Web Over HTTPS

```powershell
cd D:\Project\career-decision-system\web
$env:VITE_DEV_HTTPS = 'true'
$env:VITE_BACKEND_BASE_URL = 'https://127.0.0.1:8443'
.\node_modules\.bin\vite.cmd --host=127.0.0.1 --port=5173
```

The Web client will run at:

```text
https://127.0.0.1:5173
```

For LAN debugging, bind Vite to all interfaces and point the Web client at the LAN backend URL:

```powershell
cd D:\Project\career-decision-system\web
$env:VITE_DEV_HTTPS = 'true'
$env:VITE_BACKEND_BASE_URL = 'https://192.168.1.159:8443'
.\node_modules\.bin\vite.cmd --host=0.0.0.0 --port=5173
```

Then open the Web client from another device on the same network:

```text
https://192.168.1.159:5173
```

`web/vite.config.ts` reads the default cert/key from `.local-https/`. Override them only when testing a different certificate:

```powershell
$env:VITE_HTTPS_CERT_FILE = 'D:\Project\career-decision-system\.local-https\local-cert.pem'
$env:VITE_HTTPS_KEY_FILE = 'D:\Project\career-decision-system\.local-https\local-key.pem'
```

## Android Debug HTTPS

Debug builds trust the project CA bundled at `android/app/src/debug/res/raw/local_debug_ca.pem` through the Debug-only network security config. `setup-local-https.ps1` keeps that public certificate synchronized with the active mkcert root. Release builds contain neither the certificate nor the Debug network policy.

To test HTTPS from an emulator:

1. Rebuild and install the Debug APK after generating certificates.
2. Build Debug with an HTTPS backend URL:

```powershell
cd D:\Project\career-decision-system\android
.\gradlew.bat :app:assembleDebug "-Pcareer.backendDebugBaseUrl=https://10.0.2.2:8443"
```

The certificate includes `10.0.2.2`, so the emulator can reach the host backend with a hostname that matches the certificate.

To test HTTPS from a real Android device on the same LAN:

1. Generate certificates with `-IncludeLanIps` or add the phone-facing host IP with `-ExtraHosts`.
2. Rebuild and replace the installed Debug APK so it contains the current project CA.
3. Build Debug with the LAN backend URL:

```powershell
cd D:\Project\career-decision-system\android
.\gradlew.bat :app:assembleDebug "-Pcareer.backendDebugBaseUrl=https://192.168.1.159:8443"
```

The device does not need a system-installed CA. If it still cannot connect, allow inbound access for ports `5173` and `8443` in Windows Firewall and verify that the phone is not on an isolated guest network.

Keep release builds on real HTTPS domains. The release URL policy still rejects local and emulator hosts.
