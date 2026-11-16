// 安装固定发行版；校验官方 SHA256，不执行远程安装脚本，也不改写其他 Agent 的 skills。
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const version = '1.0.161';
const hashes = {
  'win32-x64': '7d0872af30e0b2aa827f4e2eb0761b8852044a1385c8579f9717db8a8b91c357',
  'win32-arm64': 'cf772e11e8c53324b415dcd72bb0eae137f1e8a8fe2776e3a38e583789a02d53',
  'linux-x64': 'ed551216f7a62c562d8d231c0416374566684fcc6163176f2ba4ad721c62900a',
  'linux-arm64': '3ff44a8f527e4805c0db7abfea8da68b2353f8b1d83e1099d7cae27fc140f95a',
};
const expected = hashes[`${process.platform}-${process.arch}`];
if (!expected) throw new Error('此安装入口目前支持 Windows / Linux 的 x64、arm64；其他系统请使用 OfficeCLI 官方安装方式。');
const windows = process.platform === 'win32';
const dir = windows ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'OfficeCLI') : join(homedir(), '.local', 'bin');
const target = join(dir, windows ? 'officecli.exe' : 'officecli');
await mkdir(dir, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let installed = false;
try { installed = digest(await readFile(target)) === expected; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!installed) {
  const asset = `officecli-${windows ? 'win' : 'linux'}-${process.arch}${windows ? '.exe' : ''}`;
  console.log(`下载 OfficeCLI ${version} (${process.platform}/${process.arch})…`);
  let bytes;
  for (const base of ['https://d.officecli.ai', 'https://github.com/iOfficeAI/OfficeCLI']) {
    try {
      const response = await fetch(`${base}/releases/download/v${version}/${asset}`, { signal: AbortSignal.timeout(90_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const downloaded = Buffer.from(await response.arrayBuffer());
      if (digest(downloaded) !== expected) throw new Error('SHA256 校验失败');
      bytes = downloaded;
      break;
    } catch (error) { console.log(`下载源未通过：${new URL(base).hostname} (${error.message})`); }
  }
  if (!bytes) throw new Error('所有官方下载源均失败，未安装。');
  const temporary = join(dir, `officecli-${randomUUID()}${windows ? '.exe' : ''}`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    if (!windows) await chmod(temporary, 0o755);
    execFileSync(temporary, ['--version'], { timeout: 15_000, windowsHide: true });
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}
if (windows) {
  const script = `$dir = $env:QSG_OFFICE_INSTALL_DIR; $current = [Environment]::GetEnvironmentVariable('Path', 'User'); if (-not (($current -split ';').TrimEnd('\\') -contains $dir.TrimEnd('\\'))) { [Environment]::SetEnvironmentVariable('Path', (($current.TrimEnd(';') + ';' + $dir).TrimStart(';')), 'User') }`;
  execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    env: { ...process.env, QSG_OFFICE_INSTALL_DIR: dir }, windowsHide: true, timeout: 15_000,
  });
}
console.log(execFileSync(target, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 15_000 }).trim());
console.log(`已安装：${target}`);
console.log(windows ? '新开的终端可直接运行 officecli；Agent 使用安装路径，无需依赖旧进程的 PATH。' : '如命令不在 PATH，请将 ~/.local/bin 加入 PATH。Docker 环境需在镜像内另行安装。');
