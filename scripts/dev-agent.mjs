/** 青穗集 · 前台开发启动器：复用当前终端，子进程仅为项目服务，不管理其他程序。 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes("--legacy")) throw new Error("旧 MySQL 启动入口已退休；请使用 npm run dev，当前唯一主库是 agent/var/agent.sqlite。");
const children = [];
function run(file, args, dir, env = process.env) {
    const child = spawn(file, args, {
        cwd: join(root, dir),
        env,
        stdio: "inherit",
        windowsHide: true,
        shell: false,
    });
    children.push(child);
    child.once("error", (error) => {
        console.error("无法启动服务：" + error.message);
        stop(1);
    });
    child.once("exit", (code) => {
        if (!closing) stop(code ?? 1);
    });
    return child;
}
let closing = false;
function stop(code = 0) {
    if (closing) return;
    closing = true;
    for (const child of children) if (!child.killed) child.kill();
    process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
run(process.execPath, ["--import", "tsx", "src/main.ts"], "agent");
    run(
        process.execPath,
        [
            "node_modules/vite/bin/vite.js",
            "--host",
            "127.0.0.1",
            "--port",
            "5173",
            "--strictPort",
        ],
        "web",
    );
    console.log(
        "新版开发界面：http://127.0.0.1:5173；本机服务：http://127.0.0.1:8110",
    );
