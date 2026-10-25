/**
 * 青穗集 · Agent 命令后端预检：只读检查 Windows 原生与 Docker 前提，不等同隔离实测，不安装软件、不启动容器、不调用模型、不读取凭据。
 */
import { execFile } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const logDirectory = join(root, 'logs', 'windows-native-sandbox-20261022');

function decode(value) {
  if (value == null) return '';
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  const encoding = buffer.subarray(0, 2048).includes(0) ? 'utf16le' : 'utf8';
  return buffer.toString(encoding).replace(/^\uFEFF/, '').trim().slice(0, 8192);
}

async function capture(executable, args) {
  const startedAt = Date.now();
  try {
    const result = await exec(executable, args, {
      encoding: 'buffer', timeout: 8000, maxBuffer: 65536, windowsHide: true,
    });
    return { executable, args, exitCode: 0, stdout: decode(result.stdout), stderr: decode(result.stderr), durationMs: Date.now() - startedAt };
  } catch (error) {
    return { executable, args, exitCode: error.code ?? null, signal: error.signal ?? null, timedOut: error.killed === true, stdout: decode(error.stdout), stderr: decode(error.stderr), durationMs: Date.now() - startedAt };
  }
}

async function findExecutable(name, candidates = []) {
  const lookup = await capture(process.platform === 'win32' ? 'where.exe' : 'which', [name]);
  if (lookup.exitCode === 0) {
    const first = lookup.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean);
    if (first) return { path: first, foundBy: 'PATH' };
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate, constants.F_OK);
      return { path: candidate, foundBy: 'known-location' };
    } catch { /* A missing optional runtime is a diagnostic result, not a fallback. */ }
  }
  return { path: null, foundBy: null };
}

async function main() {
  const windows = process.platform === 'win32';
  const configuredProvider = process.env.AGENT_SANDBOX_PROVIDER ?? 'auto';
  if (!['auto', 'windows-native', 'docker'].includes(configuredProvider)) throw new Error('Invalid AGENT_SANDBOX_PROVIDER');
  const selectedProvider = configuredProvider === 'auto' ? (windows ? 'windows-native' : 'docker') : configuredProvider;
  const [docker, podman, wsl, powershell] = await Promise.all([
    findExecutable(windows ? 'docker.exe' : 'docker', windows ? [
      join(process.env.ProgramFiles || 'C:/Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'),
      'D:/IDE/Docker/Docker/resources/bin/docker.exe',
      'D:/IDE/Docker/resources/bin/docker.exe',
    ] : []),
    findExecutable(windows ? 'podman.exe' : 'podman'),
    windows ? findExecutable('wsl.exe', [join(process.env.SystemRoot || 'C:/Windows', 'System32', 'wsl.exe')]) : Promise.resolve({ path: null, foundBy: null }),
    windows ? findExecutable('powershell.exe', [join(process.env.SystemRoot || 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')]) : Promise.resolve({ path: null, foundBy: null }),
  ]);
  const [dockerVersion, dockerOsType, podmanVersion, wslList] = await Promise.all([
    docker.path ? capture(docker.path, ['version', '--format', '{{.Server.Version}}']) : Promise.resolve(null),
    docker.path ? capture(docker.path, ['info', '--format', '{{.OSType}}']) : Promise.resolve(null),
    podman.path ? capture(podman.path, ['--version']) : Promise.resolve(null),
    wsl.path ? capture(wsl.path, ['--list', '--quiet']) : Promise.resolve(null),
  ]);
  let nativePackagePresent = false;
  try { await access(join(root, 'agent', 'node_modules', '@deepseek-ai', 'dsh-sandbox-windows-acl', 'package.json'), constants.F_OK); nativePackagePresent = true; } catch { /* Missing package is a prerequisite result. */ }
  const nativePrerequisitesDetected = windows && Boolean(powershell.path) && nativePackagePresent;
  const dockerPrerequisitesDetected = dockerVersion?.exitCode === 0 && dockerOsType?.exitCode === 0 && dockerOsType.stdout === 'linux';
  const report = {
    recordedAt: new Date().toISOString(),
    purpose: 'Read-only sandbox prerequisite inspection; not an agent run or isolation test.',
    node: { executable: process.execPath, version: process.version, platform: process.platform, architecture: process.arch },
    configuration: { configuredProvider, selectedProvider, source: 'Process environment or platform default; does not read agent/.env' },
    executables: { docker, podman, wsl, powershell },
    native: { package: '@deepseek-ai/dsh-sandbox-windows-acl', manifestPresent: nativePackagePresent, isolationTested: false, note: 'Prerequisites only. Use the application environment check for a real restricted-write probe.' },
    probes: { dockerVersion, dockerOsType, podmanVersion, wslList },
    readiness: {
      selectedPrerequisitesDetected: selectedProvider === 'windows-native' ? nativePrerequisitesDetected : dockerPrerequisitesDetected,
      nativePrerequisitesDetected,
      nativeIsolationValidated: false,
      dockerDaemonResponding: dockerVersion?.exitCode === 0,
      dockerLinuxModeDetected: dockerOsType?.exitCode === 0 && dockerOsType.stdout === 'linux',
      dockerEndpointLocalityVerified: false,
      podmanDaemonAssessed: false,
      containerIsolationValidated: false,
      realAgentTaskValidated: false,
    },
    boundaries: {
      installedSoftware: false, startedServices: false, createdContainers: false,
      readCredentials: false, invokedModel: false, hostExecutionFallback: false,
    },
  };
  await mkdir(logDirectory, { recursive: true });
  const stamp = report.recordedAt.replace(/[:.]/g, '-');
  const reportFile = join(logDirectory, 'preflight-' + stamp + '.json');
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  await writeFile(join(logDirectory, 'preflight-latest.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ reportFile, ...report }, null, 2));
  if (!report.readiness.selectedPrerequisitesDetected) {
    process.exitCode = 2;
  }
}

main().catch(error => {
  console.error('Preflight failed:', error.message);
  process.exitCode = 1;
});
